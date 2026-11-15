import logging
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException, Query
from app.services.fits_processor import FITSProcessor
from app.services.irsa_client import IRSAClient

router = APIRouter()
logger = logging.getLogger("SPHEREx-SpectralAPI")
irsa_client = IRSAClient()


@router.get("/profile", tags=["Spectral Lab"])
def get_spectral_profile(
    ra: float = Query(..., ge=0.0, le=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    fov_deg: float = Query(default=0.05, ge=0.01, le=0.2),
) -> Dict[str, Any]:
  """Extrae la curva espectral S(lambda) medida directamente en las exposiciones

  de SPHEREx (0.75 - 5.0 µm) ordenadas por longitud de onda.
  """
  try:
    observations = irsa_client.query_spherex_observations(
        ra=ra, dec=dec, fov_deg=fov_deg, limit=25
    )
    if not observations:
      raise HTTPException(
          status_code=404,
          detail="No hay exposiciones espectrales en esta coordenada.",
      )

    downloaded = irsa_client.download_cutouts_parallel(
        observations=observations, ra=ra, dec=dec, fov_deg=fov_deg
    )

    spectral_points: List[Dict[str, Any]] = []
    failed_observations: List[Dict[str, str]] = []
    for obs in observations:
      obs_id = obs["obs_id"]
      if obs_id not in downloaded:
        failed_observations.append(
            {"obs_id": obs_id, "reason": "download_failed"}
        )
        continue
      try:
        point = FITSProcessor.extract_spectral_profile_from_mef(
            filepath=downloaded[obs_id], ra=ra, dec=dec
        )
        if point["is_valid_measurement"] and point["wavelength_um"] > 0:
          point["obs_id"] = obs_id
          point["t_min"] = obs["t_min"]
          spectral_points.append(point)
      except Exception:
        logger.exception("Error extrayendo observación espectral %s", obs_id)
        failed_observations.append(
            {"obs_id": obs_id, "reason": "extraction_failed"}
        )

    # Ordenar ascendentemente por longitud de onda (0.75 -> 5.0 micrómetros)
    spectral_points.sort(key=lambda x: x["wavelength_um"])

    return {
        "status": "partial" if failed_observations else "success",
        "ra": ra,
        "dec": dec,
        "total_channels_measured": len(spectral_points),
        "measurement_type": "Direct MEF WCS-W Extraction (Non-interpolated)",
        "spectrum": spectral_points,
        "failed_observations": failed_observations,
    }
  except HTTPException:
    raise
  except Exception as e:
    logger.error(f"Error extrayendo perfil espectral: {e}")
    raise HTTPException(status_code=500, detail=str(e))