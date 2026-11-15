import hashlib
import logging
import math
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.database_models import DetectionCandidateModel
from app.schemas.observation import (
    CandidateEvidenceSchema,
    LocalTemporalRequest,
    SkyQueryRequest,
    TemporalAnalysisResponse,
)
from app.services.fits_processor import FITSProcessor
from app.services.fits_inventory import fits_inventory
from app.services.image_renderer import ImageRenderer
from app.services.irsa_client import IRSAClient
from app.services.temporal_engine import TemporalEngine

router = APIRouter()
logger = logging.getLogger("SPHEREx-TemporalAPI")

irsa_client = IRSAClient()
image_renderer = ImageRenderer()


def execute_temporal_pipeline(
    payload: SkyQueryRequest, db: Session
) -> TemporalAnalysisResponse:
  """Función pura de orquestación científica reutilizable tanto por llamadas

  síncronas como por tareas en segundo plano (jobs.py).
  """
  # 1. Consultar observaciones en IRSA para obtener las URIs de ambas épocas
  obs_list = irsa_client.query_spherex_observations(
      ra=payload.ra, dec=payload.dec, fov_deg=payload.fov_deg, limit=30
  )

  obs_map = {obs["obs_id"]: obs for obs in obs_list}
  if payload.epoch_t1 not in obs_map or payload.epoch_t2 not in obs_map:
    if len(obs_list) >= 2:
      # Fallback inteligente a las dos épocas más separadas temporalmente si los IDs exactos no coinciden
      obs_t1, obs_t2 = obs_list[0], obs_list[-1]
    else:
      raise ValueError(
          "No se encontraron suficientes épocas compatibles en DR1/QR3 para"
          " esta región."
      )
  else:
    obs_t1, obs_t2 = obs_map[payload.epoch_t1], obs_map[payload.epoch_t2]

  release_t1 = str(obs_t1.get("collection", "")).strip().upper()
  release_t2 = str(obs_t2.get("collection", "")).strip().upper()
  if release_t1 not in ("DR1", "QR3") or release_t1 != release_t2:
    raise ValueError(
        "La comparación requiere dos observaciones de la misma release identificada DR1 o QR3."
    )

  # 2. Descarga paralela de cutouts FITS (?center=...&size=...)
  downloaded_paths = irsa_client.download_cutouts_parallel(
      observations=[obs_t1, obs_t2],
      ra=payload.ra,
      dec=payload.dec,
      fov_deg=payload.fov_deg,
  )

  if (
      obs_t1["obs_id"] not in downloaded_paths
      or obs_t2["obs_id"] not in downloaded_paths
  ):
    raise RuntimeError(
        "Error descargando uno o ambos recortes FITS desde NASA IRSA."
    )

  path_t1 = downloaded_paths[obs_t1["obs_id"]]
  path_t2 = downloaded_paths[obs_t2["obs_id"]]

  # 3. Limpieza FLAGS, reproyección WCS y Cutout2D homogéneo (150x150)
  aligned_data = FITSProcessor.align_and_cutout_pair(
      filepath_t1=path_t1,
      filepath_t2=path_t2,
      ra=payload.ra,
      dec=payload.dec,
      cutout_size_px=150,
      subtract_background=True,
  )

  # 4. Cálculo del mapa de diferencias normalizado Z(x,y) propagando varianza real
  _, z_map, z_stats = TemporalEngine.compute_normalized_difference(
      image_t1=aligned_data["image_t1"],
      image_t2=aligned_data["image_t2"],
      variance_t1=aligned_data["variance_t1"],
      variance_t2=aligned_data["variance_t2"],
  )

  # 5. Detección de fuentes en ambas épocas y seguimiento temporal
  sources_t1 = TemporalEngine.detect_sources_in_epoch(
      aligned_data["image_t1"], aligned_data["wcs"]
  )
  sources_t2 = TemporalEngine.detect_sources_in_epoch(
      aligned_data["image_t2"], aligned_data["wcs"]
  )

  raw_candidates = TemporalEngine.track_and_classify_candidates(
      sources_t1=sources_t1,
      sources_t2=sources_t2,
      z_map=z_map,
      date_obs_t1=aligned_data["meta_t1"].get("date_obs", ""),
      date_obs_t2=aligned_data["meta_t2"].get("date_obs", ""),
      quality_ratio=z_stats["valid_pixel_ratio"],
  )

  # 6. Cruce externo con Gaia DR3 y generación de enlaces WiseView
  gaia_sources = irsa_client.query_gaia_dr3_crossmatch(
      ra=payload.ra, dec=payload.dec, radius_arcsec=payload.fov_deg * 1800.0
  )

  enriched_candidates = []
  for cand in raw_candidates:
    # Buscar contraparte en Gaia DR3 dentro de 3 segundos de arco
    matched_gaia = None
    for g in gaia_sources:
      sep_arcsec = (
          math.hypot(
              (g["ra"] - cand["ra"]) * math.cos(math.radians(cand["dec"])),
              g["dec"] - cand["dec"],
          )
          * 3600.0
      )
      if sep_arcsec <= 3.0:
        matched_gaia = g
        break

    wiseview_link = irsa_client.build_wiseview_url(
        ra=cand["ra"], dec=cand["dec"]
    )
    cand_schema = CandidateEvidenceSchema(
        candidate_id=cand["candidate_id"],
        ra=cand["ra"],
        dec=cand["dec"],
        peak_z_score=cand["peak_z_score"],
        angular_velocity_mu=cand["angular_velocity_mu"],
        confidence_score_c=cand["confidence_score_c"],
        gaia_match=matched_gaia,
        wiseview_url=wiseview_link,
    )
    enriched_candidates.append(cand_schema)

    # Persistir candidato en base de datos si no existe
    unique_code = f"{cand['candidate_id']}_{round(cand['ra'], 4)}_{round(cand['dec'], 4)}"
    existing = (
        db.query(DetectionCandidateModel)
        .filter_by(candidate_code=unique_code)
        .first()
    )
    if not existing:
      db_cand = DetectionCandidateModel(
          candidate_code=unique_code,
          ra=cand["ra"],
          dec=cand["dec"],
          category=cand["category"],
          peak_z_score=cand["peak_z_score"],
          epochs_involved=[obs_t1["obs_id"], obs_t2["obs_id"]],
          metrics_summary={
              "displacement_arcsec": cand["displacement_arcsec"],
              "angular_velocity_mu": cand["angular_velocity_mu"],
              "confidence_score_c": cand["confidence_score_c"],
              "gaia_match": matched_gaia,
              "wiseview_url": wiseview_link,
          },
      )
      db.add(db_cand)
  db.commit()

  # 7. Renderizado de PNGs astronómicos en /static
  job_hash = hashlib.md5(
      f"{payload.ra}_{payload.dec}_{obs_t1['obs_id']}_{obs_t2['obs_id']}".encode()
  ).hexdigest()[:10]
  image_urls = image_renderer.render_temporal_comparison_set(
      job_prefix=job_hash,
      image_t1=aligned_data["image_t1"],
      image_t2=aligned_data["image_t2"],
      z_map=z_map,
  )

  return TemporalAnalysisResponse(
      status="success",
      ra=payload.ra,
      dec=payload.dec,
      t1_image_url=image_urls["t1_image_url"],
      t2_image_url=image_urls["t2_image_url"],
      diff_z_image_url=image_urls["diff_z_image_url"],
      candidates=enriched_candidates,
      metrics={
          **z_stats,
          "sources_detected_t1": len(sources_t1),
          "sources_detected_t2": len(sources_t2),
          "gaia_stars_in_field": len(gaia_sources),
          "epoch_t1_date": aligned_data["meta_t1"].get("date_obs"),
          "epoch_t2_date": aligned_data["meta_t2"].get("date_obs"),
      },
  )


def execute_local_temporal_pipeline(
    payload: LocalTemporalRequest, db: Session
) -> TemporalAnalysisResponse:
  if payload.file_id_t1 == payload.file_id_t2:
    raise ValueError("Selecciona dos archivos FITS distintos.")
  try:
    entry_t1 = fits_inventory.find(payload.file_id_t1)
    entry_t2 = fits_inventory.find(payload.file_id_t2)
    path_t1 = fits_inventory.get_path(entry_t1)
    path_t2 = fits_inventory.get_path(entry_t2)
  except KeyError as exc:
    raise ValueError("Uno de los archivos no existe en el inventario FITS local.") from exc
  except FileNotFoundError as exc:
    raise ValueError("Uno de los archivos del inventario ya no está disponible.") from exc

  for entry in (entry_t1, entry_t2):
    if entry.get("validation_status") not in ("valid", "valid_with_warnings"):
      raise ValueError(f"{entry['filename']} no es un FITS legible y validado.")
    if not entry.get("compatibility", {}).get("temporal_comparison", {}).get("compatible"):
      raise ValueError(f"{entry['filename']} no cumple los metadatos mínimos del procesamiento temporal.")

  aligned_data = FITSProcessor.align_and_cutout_pair(
      filepath_t1=str(path_t1),
      filepath_t2=str(path_t2),
      ra=payload.ra,
      dec=payload.dec,
      cutout_size_px=150,
      subtract_background=True,
  )
  _, z_map, z_stats = TemporalEngine.compute_normalized_difference(
      image_t1=aligned_data["image_t1"],
      image_t2=aligned_data["image_t2"],
      variance_t1=aligned_data["variance_t1"],
      variance_t2=aligned_data["variance_t2"],
  )
  sources_t1 = TemporalEngine.detect_sources_in_epoch(
      aligned_data["image_t1"], aligned_data["wcs"]
  )
  sources_t2 = TemporalEngine.detect_sources_in_epoch(
      aligned_data["image_t2"], aligned_data["wcs"]
  )
  raw_candidates = TemporalEngine.track_and_classify_candidates(
      sources_t1=sources_t1,
      sources_t2=sources_t2,
      z_map=z_map,
      date_obs_t1=aligned_data["meta_t1"]["date_obs"],
      date_obs_t2=aligned_data["meta_t2"]["date_obs"],
      quality_ratio=z_stats["valid_pixel_ratio"],
  )
  candidates = []
  for item in raw_candidates:
    evidence = CandidateEvidenceSchema(
        candidate_id=item["candidate_id"],
        ra=item["ra"],
        dec=item["dec"],
        peak_z_score=item["peak_z_score"],
        angular_velocity_mu=item["angular_velocity_mu"],
        confidence_score_c=item["confidence_score_c"],
        gaia_match=None,
        wiseview_url=IRSAClient.build_wiseview_url(ra=item["ra"], dec=item["dec"]),
    )
    candidates.append(evidence)
    unique_code = (
        f"{payload.file_id_t1[:10]}_{payload.file_id_t2[:10]}_"
        f"{round(item['ra'], 5)}_{round(item['dec'], 5)}"
    )
    if not db.query(DetectionCandidateModel).filter_by(candidate_code=unique_code).first():
      db.add(DetectionCandidateModel(
          candidate_code=unique_code,
          ra=item["ra"],
          dec=item["dec"],
          category=item["category"],
          peak_z_score=item["peak_z_score"],
          epochs_involved=[payload.file_id_t1, payload.file_id_t2],
          metrics_summary={
              "candidate_id": item["candidate_id"],
              "angular_velocity_mu": item["angular_velocity_mu"],
              "confidence_score_c": item["confidence_score_c"],
              "source_file_ids": [payload.file_id_t1, payload.file_id_t2],
              "source_filenames": [entry_t1["filename"], entry_t2["filename"]],
              "release": aligned_data["meta_t1"]["release"],
              "calibration_level": aligned_data["meta_t1"]["calibration_level"],
              "calibration_version": aligned_data["meta_t1"]["calibration_version"],
          },
      ))
  db.commit()

  job_hash = hashlib.sha256(
      f"{payload.file_id_t1}_{payload.file_id_t2}_{payload.ra}_{payload.dec}".encode()
  ).hexdigest()[:12]
  image_urls = image_renderer.render_temporal_comparison_set(
      job_prefix=job_hash,
      image_t1=aligned_data["image_t1"],
      image_t2=aligned_data["image_t2"],
      z_map=z_map,
  )
  return TemporalAnalysisResponse(
      status="success",
      ra=payload.ra,
      dec=payload.dec,
      t1_image_url=image_urls["t1_image_url"],
      t2_image_url=image_urls["t2_image_url"],
      diff_z_image_url=image_urls["diff_z_image_url"],
      candidates=candidates,
      metrics={
          **z_stats,
          "sources_detected_t1": len(sources_t1),
          "sources_detected_t2": len(sources_t2),
          "epoch_t1_date": aligned_data["meta_t1"]["date_obs"],
          "epoch_t2_date": aligned_data["meta_t2"]["date_obs"],
          "source_file_ids": [payload.file_id_t1, payload.file_id_t2],
          "source_filenames": [entry_t1["filename"], entry_t2["filename"]],
          "release": aligned_data["meta_t1"]["release"],
          "calibration_level": aligned_data["meta_t1"]["calibration_level"],
          "calibration_version": aligned_data["meta_t1"]["calibration_version"],
          "psf_fwhm": aligned_data["meta_t1"]["psf_fwhm"],
          "bunit": aligned_data["meta_t1"]["bunit"],
          "wcs_resampling": "not required; exact compatible input grids",
      },
  )


@router.post(
    "/compare", response_model=TemporalAnalysisResponse, tags=["Temporal Engine"]
)
def compare_epochs_sync(
    payload: SkyQueryRequest, db: Session = Depends(get_db)
):
  """Ejecuta de forma directa la comparación temporal entre dos épocas de SPHEREx."""
  try:
    return execute_temporal_pipeline(payload, db)
  except Exception as e:
    logger.exception("Error ejecutando comparación temporal.")
    raise HTTPException(status_code=400, detail=str(e))