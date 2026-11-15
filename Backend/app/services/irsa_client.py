from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
from io import BytesIO
import logging
import os
from typing import Any, Dict, List
from urllib.parse import urlencode

from astropy.table import Table
from astropy.utils.data import conf as astropy_data_conf
from astroquery.gaia import Gaia
import requests
from numpy.ma import is_masked

from app.core.config import settings

logger = logging.getLogger("SPHEREx-IRSAClient")

# Configuración de timeouts para consultas astronómicas pesadas
astropy_data_conf.remote_timeout = 120
Gaia.ROW_LIMIT = 500


class IRSAClient:
  """Cliente científico para interactuar con NASA IPAC IRSA (SPHEREx DR1/QR3),

  el catálogo Gaia DR3 y generar enlaces de inspección en WiseView.
  Cero dependencias de FastAPI.
  """

  IRSA_TAP_URL = "https://irsa.ipac.caltech.edu/TAP/sync"

  def __init__(self, raw_dir: str = settings.DATA_RAW_DIR):
    self.raw_dir = raw_dir
    os.makedirs(self.raw_dir, exist_ok=True)

  def query_spherex_observations(
      self, ra: float, dec: float, fov_deg: float = 0.08, limit: int = 20
  ) -> List[Dict[str, Any]]:
    """Consulta metadatos de exposiciones en spherex.artifact JOIN spherex.plane

    filtrando exclusivamente por colecciones oficiales 'dr1' o 'qr3' (nunca 'qr2').
    """
    adql_query = f"""
        SELECT TOP {limit}
            p.plane_id,
            p.obs_id,
            p.obs_collection,
            p.t_min,
            p.t_max,
            p.energy_bounds_lower,
            p.energy_bounds_upper,
            a.uri
        FROM spherex.plane AS p
        JOIN spherex.artifact AS a ON p.plane_id = a.plane_id
        WHERE CONTAINS(
            POINT('ICRS', p.s_ra, p.s_dec),
            CIRCLE('ICRS', {ra}, {dec}, {fov_deg})
        ) = 1
        AND LOWER(p.obs_collection) IN ('dr1', 'qr3')
        AND a.product_type = 'science'
        ORDER BY p.t_min ASC
        """

    try:
      logger.info(
          f"Consultando TAP IRSA (dr1/qr3) en RA={ra}, Dec={dec},"
          f" FOV={fov_deg} deg"
      )
      response = requests.get(
          self.IRSA_TAP_URL,
          params={"QUERY": adql_query, "FORMAT": "VOTABLE"},
          timeout=120,
      )
      response.raise_for_status()
      table = Table.read(BytesIO(response.content), format="votable")

      observations = []
      for row in table:
        wavelength_min = row["energy_bounds_lower"]
        wavelength_max = row["energy_bounds_upper"]
        access_url = str(row["uri"])
        observations.append({
            "plane_id": str(row["plane_id"]),
            "obs_id": str(row["obs_id"]),
            "collection": str(row["obs_collection"]),
            "t_min": float(row["t_min"]),
            "t_max": float(row["t_max"]),
            "wavelength_min_um": (
                float(wavelength_min) * 1e6
                if not is_masked(wavelength_min)
                else None
            ),
            "wavelength_max_um": (
                float(wavelength_max) * 1e6
                if not is_masked(wavelength_max)
                else None
            ),
            "access_url": access_url,
            "base_uri": access_url,
        })
      return observations

    except Exception as e:
      logger.error(f"Error en consulta TAP a NASA IRSA: {e}")
      raise RuntimeError(f"Fallo al consultar catálogo SPHEREx en IRSA: {e}")

  def _download_single_cutout(
      self, base_uri: str, ra: float, dec: float, fov_deg: float, obs_id: str
  ) -> str:
    """Descarga únicamente el recorte FITS solicitado desde el servidor IRSA

    anexando ?center={ra},{dec}d&size={fov_deg} a la URI para evitar bajar 300 MB.
    """
    separator = "&" if "?" in base_uri else "?"
    cutout_url = f"{base_uri}{separator}center={ra},{dec}d&size={fov_deg}"

    # Hash único para caché local en disco
    cache_key = hashlib.md5(f"{obs_id}_{ra}_{dec}_{fov_deg}".encode()).hexdigest()[
        :12
    ]
    local_filename = f"spx_{obs_id}_{cache_key}.fits"
    local_filepath = os.path.join(self.raw_dir, local_filename)

    if os.path.exists(local_filepath) and os.path.getsize(local_filepath) > 0:
      logger.info(f"Cutout FITS recuperado de caché local: {local_filename}")
      return local_filepath

    logger.info(f"Descargando cutout SPHEREx desde IRSA: {cutout_url}")
    response = requests.get(cutout_url, timeout=120, stream=True)
    response.raise_for_status()

    temporary_filepath = f"{local_filepath}.tmp"
    try:
      with open(temporary_filepath, "wb") as f:
        for chunk in response.iter_content(chunk_size=65536):
          if chunk:
            f.write(chunk)
      os.replace(temporary_filepath, local_filepath)
    finally:
      if os.path.exists(temporary_filepath):
        os.remove(temporary_filepath)

    return local_filepath

  def download_cutouts_parallel(
      self,
      observations: List[Dict[str, Any]],
      ra: float,
      dec: float,
      fov_deg: float = 0.08,
  ) -> Dict[str, str]:
    """Descarga múltiples cutouts FITS en paralelo usando ThreadPoolExecutor(max_workers=8).

    Retorna un diccionario {obs_id: local_filepath}.
    """
    results: Dict[str, str] = {}

    with ThreadPoolExecutor(max_workers=8) as executor:
      future_to_obs = {
          executor.submit(
              self._download_single_cutout,
              obs.get("access_url") or obs["base_uri"],
              ra,
              dec,
              fov_deg,
              obs["obs_id"],
          ): obs["obs_id"]
          for obs in observations
      }

      for future in as_completed(future_to_obs):
        obs_id = future_to_obs[future]
        try:
          filepath = future.result()
          results[obs_id] = filepath
        except Exception as exc:
          logger.error(f"Error descargando cutout para obs_id={obs_id}: {exc}")

    return results

  def query_gaia_dr3_crossmatch(
      self, ra: float, dec: float, radius_arcsec: float = 15.0
  ) -> List[Dict[str, Any]]:
    """Ejecuta un cone search ADQL en gaiadr3.gaia_source (TOP 500)

    para identificar estrellas conocidas con movimiento propio (pmra, pmdec) y paralaje.
    """
    radius_deg = radius_arcsec / 3600.0
    adql_gaia = f"""
        SELECT TOP 500
            source_id,
            ra,
            dec,
            pmra,
            pmdec,
            parallax,
            phot_g_mean_mag
        FROM gaiadr3.gaia_source
        WHERE CONTAINS(
            POINT('ICRS', ra, dec),
            CIRCLE('ICRS', {ra}, {dec}, {radius_deg})
        ) = 1
        ORDER BY phot_g_mean_mag ASC
        """

    try:
      job = Gaia.launch_job(adql_gaia)
      table = job.get_results()

      matches = []
      for row in table:
        matches.append({
            "source_id": str(row["source_id"]),
            "ra": float(row["ra"]),
            "dec": float(row["dec"]),
            "pmra_mas_yr": (
                float(row["pmra"])
                if row["pmra"] is not None and not getattr(row["pmra"], "mask", False)
                else 0.0
            ),
            "pmdec_mas_yr": (
                float(row["pmdec"])
                if row["pmdec"] is not None
                and not getattr(row["pmdec"], "mask", False)
                else 0.0
            ),
            "parallax_mas": (
                float(row["parallax"])
                if row["parallax"] is not None
                and not getattr(row["parallax"], "mask", False)
                else 0.0
            ),
            "g_mag": (
                float(row["phot_g_mean_mag"])
                if row["phot_g_mean_mag"] is not None
                and not getattr(row["phot_g_mean_mag"], "mask", False)
                else None
            ),
        })
      return matches

    except Exception as e:
      logger.warning(f"No se pudo completar cruce con Gaia DR3: {e}")
      return []

  @staticmethod
  def build_wiseview_url(ra: float, dec: float, size_arcsec: int = 60) -> str:
    """Genera el enlace parametrizado a WiseView para inspección visual

    del historial infrarrojo (2010-2024).
    """
    params = {
        "ra": round(ra, 6),
        "dec": round(dec, 6),
        "size": size_arcsec,
        "band": 3,
        "speed": 125,
    }
    return f"http://byw.tools/wiseview#{urlencode(params)}"