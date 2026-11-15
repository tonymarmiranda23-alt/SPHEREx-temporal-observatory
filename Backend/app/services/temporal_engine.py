import logging
import math
from typing import Any, Dict, List, Optional, Tuple

from astropy.stats import sigma_clipped_stats
from astropy.time import Time
import astropy.units as u
from astropy.wcs import WCS
import numpy as np
from photutils.detection import DAOStarFinder
from scipy.spatial.distance import cdist

logger = logging.getLogger("SPHEREx-TemporalEngine")


class TemporalEngine:
  """Motor científico para comparación temporal, cálculo de mapa Z(x,y),

  detección de fuentes con DAOStarFinder, seguimiento de movimiento y
  puntuación experimental de candidatos. Cero dependencias de FastAPI.
  """

  # Pesos para puntuación experimental C = w1*S + w2*T + w3*Q + w4*R (suman 1.0)
  WEIGHTS = {
      "S": 0.40,  # Significancia estadística (Z-score)
      "T": 0.30,  # Consistencia temporal / desplazamiento
      "Q": 0.15,  # Calidad de datos / píxeles válidos
      "R": 0.15,  # Reproducibilidad / asociación cruzada
  }

  @staticmethod
  def _safe_float(val: Any, default: float = 0.0) -> float:
    """Convierte escalares NumPy/Astropy a float nativo y elimina NaN/Inf."""
    try:
      f = float(val)
      return default if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
      return default

  @classmethod
  def compute_normalized_difference(
      cls,
      image_t1: np.ndarray,
      image_t2: np.ndarray,
      variance_t1: np.ndarray,
      variance_t2: np.ndarray,
  ) -> Tuple[np.ndarray, np.ndarray, Dict[str, float]]:
    """Calcula el mapa de diferencias D(x,y) y la diferencia normalizada Z(x,y)

    propagando las varianzas reales de ambas exposiciones de SPHEREx:
    Z(x,y) = (I_t2 - I_t1) / sqrt(VAR_t1 + VAR_t2)
    """
    diff_map = image_t2 - image_t1
    total_variance = variance_t1 + variance_t2

    # Evitar división por cero o raíces negativas en píxeles enmascarados
    valid_var = np.where(total_variance > 0.0, total_variance, np.nan)
    sigma_d = np.sqrt(valid_var)

    z_map = diff_map / sigma_d

    # Estadísticas globales sanitizadas para JSON
    finite_z = z_map[np.isfinite(z_map)]
    peak_z = (
        cls._safe_float(np.max(np.abs(finite_z))) if finite_z.size > 0 else 0.0
    )
    rms_z = cls._safe_float(np.std(finite_z)) if finite_z.size > 0 else 0.0
    valid_pixel_ratio = cls._safe_float(
        np.sum(np.isfinite(z_map)) / max(1, z_map.size)
    )

    stats = {
        "peak_z_score": peak_z,
        "rms_z_score": rms_z,
        "valid_pixel_ratio": valid_pixel_ratio,
        "significant_pixels_5sigma": int(np.sum(np.abs(finite_z) >= 5.0)),
    }

    return diff_map, z_map, stats

  @classmethod
  def detect_sources_in_epoch(
      cls,
      image: np.ndarray,
      wcs: WCS,
      fwhm_px: float = 2.5,
      threshold_sigma: float = 5.0,
  ) -> List[Dict[str, Any]]:
    """Detecta fuentes luminosas puntuales en una época utilizando DAOStarFinder

    y proyecta sus centroides a coordenadas celestes ICRS (RA, Dec).
    """
    finite_vals = image[np.isfinite(image)]
    if finite_vals.size < 10:
      return []

    mean, median, std = sigma_clipped_stats(finite_vals, sigma=3.0)
    if std <= 0.0 or not np.isfinite(std):
      return []

    # Reemplazar NaNs por la mediana solo para la detección de picos, pero filtrar luego
    clean_for_detection = np.nan_to_num(image, nan=median)

    daofind = DAOStarFinder(fwhm=fwhm_px, threshold=threshold_sigma * std)
    sources_table = daofind(clean_for_detection - median)

    if sources_table is None or len(sources_table) == 0:
      return []

    detected: List[Dict[str, Any]] = []
    ny, nx = image.shape

    for row in sources_table:
      x_cen = cls._safe_float(row["xcentroid"])
      y_cen = cls._safe_float(row["ycentroid"])
      ix, iy = int(round(x_cen)), int(round(y_cen))

      # Descartar detecciones que caigan sobre píxeles originalmente enmascarados (NaN)
      if not (0 <= ix < nx and 0 <= iy < ny) or not np.isfinite(image[iy, ix]):
        continue

      sky_coord = wcs.pixel_to_world(x_cen, y_cen)
      detected.append({
          "x": x_cen,
          "y": y_cen,
          "ra": cls._safe_float(sky_coord.ra.deg),
          "dec": cls._safe_float(sky_coord.dec.deg),
          "flux": cls._safe_float(row["flux"]),
          "peak": cls._safe_float(row["peak"]),
          "sharpness": cls._safe_float(row["sharpness"]),
          "roundness": cls._safe_float(row["roundness1"]),
      })

    return detected

  @classmethod
  def track_and_classify_candidates(
      cls,
      sources_t1: List[Dict[str, Any]],
      sources_t2: List[Dict[str, Any]],
      z_map: np.ndarray,
      date_obs_t1: str,
      date_obs_t2: str,
      quality_ratio: float,
      max_match_radius_px: float = 12.0,
      stationary_tol_px: float = 1.5,
  ) -> List[Dict[str, Any]]:
    """Asocia fuentes entre t1 y t2, estima velocidad angular mu = delta_theta / delta_t,

    clasifica preliminarmente y calcula la puntuación de priorización C.
    """
    # Calcular intervalo temporal delta_t en días
    try:
      t1 = Time(date_obs_t1)
      t2 = Time(date_obs_t2)
      delta_t_days = abs((t2 - t1).to(u.day).value)
    except Exception:
      delta_t_days = 180.0  # Cadencia nominal SPHEREx (~6 meses) si falta header

    delta_t_days = max(delta_t_days, 1e-4)

    candidates: List[Dict[str, Any]] = []
    ny, nx = z_map.shape

    # Caso 1: Ambas épocas tienen fuentes detectadas -> asociar pares
    if sources_t1 and sources_t2:
      coords_1 = np.array([[s["x"], s["y"]] for s in sources_t1])
      coords_2 = np.array([[s["x"], s["y"]] for s in sources_t2])
      dist_matrix = cdist(coords_1, coords_2)

      matched_t2_indices = set()

      for i, s1 in enumerate(sources_t1):
        j = int(np.argmin(dist_matrix[i]))
        dist_px = cls._safe_float(dist_matrix[i, j])

        if dist_px <= max_match_radius_px:
          matched_t2_indices.add(j)
          s2 = sources_t2[j]

          # Evaluar significancia local en el mapa Z(x,y) alrededor de s2
          ix, iy = int(round(s2["x"])), int(round(s2["y"]))
          patch = z_map[max(0, iy - 2) : min(ny, iy + 3), max(0, ix - 2) : min(nx, ix + 3)]
          finite_patch = patch[np.isfinite(patch)]
          local_z = (
              cls._safe_float(np.max(np.abs(finite_patch)))
              if finite_patch.size > 0
              else 0.0
          )

          # Desplazamiento angular en arcsec (escala nominal SPHEREx ~6.2 arcsec/px)
          delta_ra = (s2["ra"] - s1["ra"]) * math.cos(
              math.radians(s2["dec"])
          )
          delta_dec = s2["dec"] - s1["dec"]
          delta_theta_arcsec = math.hypot(delta_ra, delta_dec) * 3600.0
          mu_arcsec_per_day = delta_theta_arcsec / delta_t_days

          # Clasificación preliminar
          if dist_px > stationary_tol_px and local_z >= 4.0:
            category = "Objeto móvil"
          elif dist_px <= stationary_tol_px and local_z >= 5.0:
            category = "Fuente variable"
          else:
            continue  # Fuente persistente estable, no es candidato de cambio

          score_c = cls._compute_priority_score(
              local_z=local_z,
              is_temporally_consistent=(dist_px > stationary_tol_px),
              quality_ratio=quality_ratio,
              sharpness=s2["sharpness"],
          )

          candidates.append({
              "candidate_id": f"SPX-CAND-{len(candidates) + 1:04d}",
              "ra": s2["ra"],
              "dec": s2["dec"],
              "ra_t1": s1["ra"],
              "dec_t1": s1["dec"],
              "category": category,
              "peak_z_score": local_z,
              "displacement_arcsec": cls._safe_float(delta_theta_arcsec),
              "angular_velocity_mu": cls._safe_float(mu_arcsec_per_day),
              "delta_t_days": cls._safe_float(delta_t_days),
              "confidence_score_c": score_c,
          })

      # Fuentes nuevas en t2 sin contraparte cercana en t1 (posibles transitorios o móviles rápidos)
      for j, s2 in enumerate(sources_t2):
        if j not in matched_t2_indices:
          ix, iy = int(round(s2["x"])), int(round(s2["y"]))
          patch = z_map[max(0, iy - 2) : min(ny, iy + 3), max(0, ix - 2) : min(nx, ix + 3)]
          finite_patch = patch[np.isfinite(patch)]
          local_z = (
              cls._safe_float(np.max(np.abs(finite_patch)))
              if finite_patch.size > 0
              else 0.0
          )

          if local_z >= 5.0:
            # Verificar morfología para descartar rayos cósmicos agudos
            is_artifact = s2["sharpness"] > 1.2 or s2["sharpness"] < 0.2
            category = (
                "Posible artefacto" if is_artifact else "Candidato desconocido"
            )
            score_c = cls._compute_priority_score(
                local_z=local_z,
                is_temporally_consistent=False,
                quality_ratio=quality_ratio,
                sharpness=s2["sharpness"],
            )
            candidates.append({
                "candidate_id": f"SPX-CAND-{len(candidates) + 1:04d}",
                "ra": s2["ra"],
                "dec": s2["dec"],
                "ra_t1": None,
                "dec_t1": None,
                "category": category,
                "peak_z_score": local_z,
                "displacement_arcsec": None,
                "angular_velocity_mu": None,
                "delta_t_days": cls._safe_float(delta_t_days),
                "confidence_score_c": score_c,
            })

    # Ordenar candidatos de mayor a menor puntuación C
    candidates.sort(key=lambda c: c["confidence_score_c"], reverse=True)
    return candidates

  @classmethod
  def _compute_priority_score(
      cls,
      local_z: float,
      is_temporally_consistent: bool,
      quality_ratio: float,
      sharpness: float,
  ) -> float:
    """Calcula la puntuación experimental C = w1*S + w2*T + w3*Q + w4*R en [0, 1]."""
    s_norm = min(1.0, max(0.0, local_z / 15.0))
    t_norm = 1.0 if is_temporally_consistent else 0.4
    q_norm = min(1.0, max(0.0, quality_ratio))
    # Sharpness ideal de PSF puntual ronda ~0.5 - 0.8
    r_norm = 1.0 if (0.25 <= sharpness <= 1.1) else 0.3

    score = (
        cls.WEIGHTS["S"] * s_norm
        + cls.WEIGHTS["T"] * t_norm
        + cls.WEIGHTS["Q"] * q_norm
        + cls.WEIGHTS["R"] * r_norm
    )
    return round(cls._safe_float(score), 4)