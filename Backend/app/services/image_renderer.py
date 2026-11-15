import logging
import os
from typing import Dict

from astropy.visualization import AsinhStretch, ImageNormalize, PercentileInterval
import matplotlib
import numpy as np
from PIL import Image

from app.core.config import settings

# Backend sin interfaz gráfica para servidores Linux (Render/Railway)
matplotlib.use("Agg")

logger = logging.getLogger("SPHEREx-ImageRenderer")


class ImageRenderer:
  """Convierte arreglos científicos FITS (float64) en imágenes PNG optimizadas

  para visualización web en Vercel, servidas desde /static.
  """

  def __init__(self, output_dir: str = settings.SPHEREX_PROCESSED_DIR):
    self.output_dir = output_dir
    os.makedirs(self.output_dir, exist_ok=True)

  @staticmethod
  def _array_to_stretched_png(
      data: np.ndarray, filepath: str, cmap_name: str = "inferno"
  ) -> None:
    """Aplica estiramiento astronómico AsinhStretch + PercentileInterval(99.5)

    y guarda un PNG con transparencia en píxeles enmascarados (NaN).
    """
    nan_mask = ~np.isfinite(data)
    clean_data = np.nan_to_num(
        data, nan=np.nanmedian(data) if np.any(~nan_mask) else 0.0
    )

    if np.all(nan_mask) or np.ptp(clean_data) == 0:
      norm_data = np.zeros_like(clean_data, dtype=np.float64)
    else:
      norm = ImageNormalize(
          clean_data,
          interval=PercentileInterval(99.5),
          stretch=AsinhStretch(a=0.1),
      )
      norm_data = np.clip(norm(clean_data), 0.0, 1.0)

    colormap = matplotlib.colormaps.get_cmap(cmap_name)
    rgba = (colormap(norm_data) * 255).astype(np.uint8)

    # Hacer transparentes los píxeles inválidos (FLAGS)
    rgba[nan_mask, 3] = 0

    # Invertir eje Y para que el Norte astronómico quede arriba según convención FITS
    rgba_flipped = np.flipud(rgba)
    Image.fromarray(rgba_flipped).save(filepath, format="PNG")

  @staticmethod
  def _zmap_to_divergent_png(
      z_map: np.ndarray, filepath: str, z_clip: float = 8.0
  ) -> None:
    """Renderiza el mapa de diferencias normalizado Z(x,y) usando una escala

    divergente simétrica (-z_clip a +z_clip) para destacar desplazamientos.
    """
    nan_mask = ~np.isfinite(z_map)
    clean_z = np.nan_to_num(z_map, nan=0.0)

    # Normalizar rango [-z_clip, +z_clip] -> [0.0, 1.0] con centro en 0.5
    scaled = np.clip((clean_z + z_clip) / (2.0 * z_clip), 0.0, 1.0)

    colormap = matplotlib.colormaps.get_cmap("RdBu_r")
    rgba = (colormap(scaled) * 255).astype(np.uint8)
    rgba[nan_mask, 3] = 0

    rgba_flipped = np.flipud(rgba)
    Image.fromarray(rgba_flipped).save(filepath, format="PNG")

  def render_temporal_comparison_set(
      self,
      job_prefix: str,
      image_t1: np.ndarray,
      image_t2: np.ndarray,
      z_map: np.ndarray,
  ) -> Dict[str, str]:
    """Genera el trío de imágenes PNG (t1, t2, diff_z) en data/processed/

    y retorna sus rutas públicas relativas bajo /static/.
    """
    file_t1 = f"{job_prefix}_t1.png"
    file_t2 = f"{job_prefix}_t2.png"
    file_diff = f"{job_prefix}_diff_z.png"

    path_t1 = os.path.join(self.output_dir, file_t1)
    path_t2 = os.path.join(self.output_dir, file_t2)
    path_diff = os.path.join(self.output_dir, file_diff)

    self._array_to_stretched_png(image_t1, path_t1, cmap_name="magma")
    self._array_to_stretched_png(image_t2, path_t2, cmap_name="magma")
    self._zmap_to_divergent_png(z_map, path_diff, z_clip=8.0)

    logger.info(f"Imágenes PNG renderizadas en /static para {job_prefix}")

    return {
        "t1_image_url": f"/static/spherex/{file_t1}",
        "t2_image_url": f"/static/spherex/{file_t2}",
        "diff_z_image_url": f"/static/spherex/{file_diff}",
    }