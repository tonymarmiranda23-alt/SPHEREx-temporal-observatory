from typing import Any, Dict, Tuple

from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.nddata import Cutout2D
import astropy.units as u
from astropy.wcs import WCS
import numpy as np
import sep
from astropy.time import Time
from app.services.fits_inventory import release_from_hdul

class FITSProcessor:
  """Procesador científico de archivos Multi-Extension FITS (MEF) de SPHEREx Level 2.

  Implementa máscaras de calidad FLAGS, validación astrométrica WCS,
  recortes Cutout2D y extracción espectral segura.
  """

  # Bits válidos según documentación oficial SPHEREx Level 2:
  # 0 = limpio, 2 = bit 1 válido, 2097152 = bit 21 (SOURCE)
  VALID_FLAG_VALUES = (0, 2, 2097152)

  @classmethod
  def load_and_clean_mef(
      cls, filepath: str
  ) -> Tuple[np.ndarray, np.ndarray, WCS, Dict[str, Any]]:
    """Abre un archivo MEF de SPHEREx leyendo explícitamente las extensiones

    'IMAGE', 'VARIANCE' y 'FLAGS' (nunca HDU[0]).
    Enmascara artefactos y rayos cósmicos asignando np.nan.
    """
    with fits.open(filepath, memmap=False) as hdul:
      required_exts = {"IMAGE", "VARIANCE", "FLAGS"}
      available_exts = {hdu.name.upper() for hdu in hdul}

      if not required_exts.issubset(available_exts):
        missing = required_exts - available_exts
        raise ValueError(
            f"El archivo FITS {filepath} no contiene las extensiones requeridas"
            f" de SPHEREx: {missing}"
        )

      image_hdu = hdul["IMAGE"]
      variance_hdu = hdul["VARIANCE"]
      flags_hdu = hdul["FLAGS"]
      if image_hdu.data is None or variance_hdu.data is None or flags_hdu.data is None:
        raise ValueError("IMAGE, VARIANCE y FLAGS deben contener arrays de datos.")
      if image_hdu.data.ndim != 2 or variance_hdu.data.shape != image_hdu.data.shape or flags_hdu.data.shape != image_hdu.data.shape:
        raise ValueError("IMAGE, VARIANCE y FLAGS deben ser matrices 2D de dimensiones idénticas.")
      if image_hdu.header.get("BUNIT") is None:
        raise ValueError("IMAGE no declara BUNIT; no se puede verificar la unidad de flujo.")
      variance_bunit = variance_hdu.header.get("BUNIT")
      if variance_bunit is None:
        raise ValueError("VARIANCE no declara BUNIT; no se puede interpretar la incertidumbre.")
      try:
        image_unit = u.Unit(image_hdu.header["BUNIT"], format="fits")
        variance_unit = u.Unit(variance_bunit, format="fits")
      except ValueError as exc:
        raise ValueError("BUNIT de IMAGE o VARIANCE no se puede interpretar.") from exc
      if not variance_unit.is_equivalent(image_unit ** 2):
        raise ValueError("BUNIT de VARIANCE no corresponde al cuadrado de BUNIT de IMAGE.")
      if not np.issubdtype(image_hdu.data.dtype, np.number) or not np.issubdtype(variance_hdu.data.dtype, np.number):
        raise ValueError("IMAGE y VARIANCE deben contener datos numéricos.")

      # Preserve native IMAGE values while requiring a dimensionally valid variance map.
      raw_image = image_hdu.data.astype(np.float64)
      raw_variance = variance_hdu.data.astype(np.float64)
      flags = flags_hdu.data.astype(np.int64)

      # Aplicar máscara de calidad SPHEREx (FLAGS)
      valid_mask = (flags == 2097152) | (flags == 2) | (flags == 0)

      # También descartar valores negativos o inválidos en la varianza
      valid_mask = (
          valid_mask & np.isfinite(raw_variance) & (raw_variance > 0.0)
      )

      clean_image = np.where(valid_mask, raw_image, np.nan)
      clean_variance = np.where(valid_mask, raw_variance, np.nan)

      wcs = WCS(image_hdu.header)
      if not wcs.has_celestial:
        raise ValueError("La extensión IMAGE no contiene WCS celeste utilizable.")
      header_meta = {
          "date_obs": image_hdu.header.get("DATE-OBS", ""),
          "exptime": float(image_hdu.header.get("EXPTIME", 0.0)),
          "bunit": image_hdu.header["BUNIT"],
          "band": image_hdu.header.get("BAND", image_hdu.header.get("FILTER", "UNKNOWN")),
          "release": release_from_hdul(hdul),
          "psf_fwhm": image_hdu.header.get("PSF_FWHM", image_hdu.header.get("FWHM")),
          "calibration_level": image_hdu.header.get("CALLEVEL"),
          "calibration_version": image_hdu.header.get("CAL_VER", image_hdu.header.get("CALVERS")),
          "variance_bunit": variance_hdu.header.get("BUNIT"),
      }
      if not header_meta["band"] or str(header_meta["band"]).strip().upper() == "UNKNOWN":
        raise ValueError("IMAGE no declara BAND; no se puede verificar la compatibilidad espectral.")
      if not header_meta["date_obs"]:
        raise ValueError("IMAGE no declara DATE-OBS; no se puede comprobar la separación temporal.")
      if header_meta["psf_fwhm"] is None:
        raise ValueError("IMAGE no declara PSF_FWHM/FWHM; la compatibilidad de PSF no puede comprobarse.")
      header_meta["psf_fwhm"] = float(header_meta["psf_fwhm"])
      if not np.isfinite(header_meta["psf_fwhm"]) or header_meta["psf_fwhm"] <= 0:
        raise ValueError("PSF_FWHM/FWHM debe ser un valor finito positivo.")

      return clean_image, clean_variance, wcs, header_meta

  @staticmethod
  def subtract_sky_background(image_data: np.ndarray) -> np.ndarray:
    """Resta el fondo difuso infrarrojo utilizando SEP (Source Extractor).

    Aplica conversión explícita de byte-order nativo para evitar fallos en Cython/SEP.
    """
    # Convertir a byte-order nativo ('=') requerido por sep.Background
    native_img = np.ascontiguousarray(
        image_data.astype(image_data.dtype.newbyteorder("="))
    )

    # SEP requiere máscara booleana donde True indica píxel inválido/enmascarado
    nan_mask = ~np.isfinite(native_img)
    filled_img = np.nan_to_num(native_img, nan=0.0)

    bkg = sep.Background(filled_img, mask=nan_mask, bw=32, bh=32, fw=3, fh=3)
    bkg_sub = filled_img - bkg.back()

    # Restaurar np.nan en píxeles que estaban enmascarados originalmente
    return np.where(nan_mask, np.nan, bkg_sub)

  @classmethod
  def align_and_cutout_pair(
      cls,
      filepath_t1: str,
      filepath_t2: str,
      ra: float,
      dec: float,
      cutout_size_px: int = 150,
      subtract_background: bool = True,
  ) -> Dict[str, Any]:
    """Pipeline astrométrico completo para preparar dos épocas (t1 y t2):

    1. Lee y limpia MEFs con máscara FLAGS.
    2. Comprueba que WCS y resolución coincidan exactamente para evitar
    interpolar imagen o varianza.
    3. Aplica Cutout2D en ambas épocas garantizando matrices idénticas
    (150x150).
    """
    img_t1, var_t1, wcs_t1, meta_t1 = cls.load_and_clean_mef(filepath_t1)
    img_t2, var_t2, wcs_t2, meta_t2 = cls.load_and_clean_mef(filepath_t2)
    cls.validate_temporal_pair(
        wcs_t1, wcs_t2, img_t1.shape, img_t2.shape, meta_t1, meta_t2
    )
    date_t1 = Time(meta_t1["date_obs"])
    date_t2 = Time(meta_t2["date_obs"])
    if not date_t1.isscalar or not date_t2.isscalar or date_t1 == date_t2:
      raise ValueError("DATE-OBS debe definir dos épocas escalares distintas.")
    if str(meta_t1["bunit"]).strip() != str(meta_t2["bunit"]).strip():
      raise ValueError("Las imágenes tienen unidades BUNIT diferentes.")
    if not np.isclose(float(meta_t1["psf_fwhm"]), float(meta_t2["psf_fwhm"]), rtol=0.01, atol=0.0):
      raise ValueError("Las FWHM de PSF difieren más de 1%; el pipeline no realiza igualación de PSF.")
    if meta_t1["release"] is None or meta_t2["release"] is None:
      raise ValueError("No se puede determinar la release de ambos productos FITS.")
    if str(meta_t1["release"]).strip().upper() != str(meta_t2["release"]).strip().upper():
      raise ValueError("No se comparan releases distintas (p. ej., DR1 y QR3) sin una validación de calibración.")
    if str(meta_t1["release"]).strip().upper() not in ("DR1", "QR3"):
      raise ValueError("Este pipeline solo admite releases identificadas DR1 o QR3.")
    if not meta_t1["calibration_level"] or not meta_t2["calibration_level"]:
      raise ValueError("Falta CALLEVEL; no se puede verificar la compatibilidad de calibración.")
    if meta_t1["calibration_level"] != meta_t2["calibration_level"]:
      raise ValueError("Los niveles de calibración de ambas épocas son diferentes.")
    if not meta_t1["calibration_version"] or not meta_t2["calibration_version"]:
      raise ValueError("Falta CAL_VER/CALVERS; no se puede verificar la versión de calibración.")
    if meta_t1["calibration_version"] != meta_t2["calibration_version"]:
      raise ValueError("Las versiones de calibración de ambas épocas son diferentes.")
    if str(meta_t1["band"]).strip().upper() != str(meta_t2["band"]).strip().upper():
      raise ValueError("Las imágenes corresponden a bandas distintas.")
    if not meta_t1["variance_bunit"] or not meta_t2["variance_bunit"]:
      raise ValueError("VARIANCE debe declarar BUNIT en ambas exposiciones.")
    if str(meta_t1["variance_bunit"]).strip() != str(meta_t2["variance_bunit"]).strip():
      raise ValueError("Las unidades BUNIT de VARIANCE difieren.")

    if subtract_background:
      img_t1 = cls.subtract_sky_background(img_t1)
      img_t2 = cls.subtract_sky_background(img_t2)

    img_t1_aligned = img_t1
    var_t1_aligned = var_t1

    # Recorte espacial exacto (Cutout2D) centrado en (RA, Dec) sobre la grilla común wcs_t2
    center_coord = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame="icrs")
    box_size = (cutout_size_px, cutout_size_px)

    cut_img_t1 = Cutout2D(
        img_t1_aligned, center_coord, size=box_size, wcs=wcs_t2, mode="partial"
    )
    cut_var_t1 = Cutout2D(
        var_t1_aligned, center_coord, size=box_size, wcs=wcs_t2, mode="partial"
    )
    cut_img_t2 = Cutout2D(
        img_t2, center_coord, size=box_size, wcs=wcs_t2, mode="partial"
    )
    cut_var_t2 = Cutout2D(
        var_t2, center_coord, size=box_size, wcs=wcs_t2, mode="partial"
    )

    return {
        "image_t1": cut_img_t1.data,
        "variance_t1": cut_var_t1.data,
        "image_t2": cut_img_t2.data,
        "variance_t2": cut_var_t2.data,
        "wcs": cut_img_t2.wcs,
        "meta_t1": meta_t1,
        "meta_t2": meta_t2,
    }

  @staticmethod
  def validate_temporal_pair(
        wcs_t1: WCS,
        wcs_t2: WCS,
        shape_t1: Tuple[int, ...],
        shape_t2: Tuple[int, ...],
        meta_t1: Dict[str, Any],
        meta_t2: Dict[str, Any],
  ) -> None:
    if shape_t1 != shape_t2:
        raise ValueError("Las imágenes tienen distinta resolución/dimensión de píxel.")
    for attribute in ("ctype", "cunit"):
        values_t1 = getattr(wcs_t1.wcs, attribute)
        values_t2 = getattr(wcs_t2.wcs, attribute)
        if list(values_t1) != list(values_t2):
          raise ValueError(f"Las grillas WCS difieren en {attribute}; el pipeline no remuestrea la varianza.")
    for attribute in ("crpix", "crval"):
        values_t1 = getattr(wcs_t1.wcs, attribute)
        values_t2 = getattr(wcs_t2.wcs, attribute)
        if len(values_t1) != len(values_t2) or not np.allclose(values_t1, values_t2, rtol=0.0, atol=1e-10):
          raise ValueError(f"Las grillas WCS difieren en {attribute}; el pipeline no remuestrea la varianza.")
    if not np.allclose(wcs_t1.pixel_scale_matrix, wcs_t2.pixel_scale_matrix, rtol=0.0, atol=1e-12):
        raise ValueError("La escala/resolución WCS difiere entre épocas; el pipeline no iguala la PSF.")
    if wcs_t1.celestial.pixel_n_dim != 2 or wcs_t2.celestial.pixel_n_dim != 2:
        raise ValueError("Se requiere una grilla WCS celeste bidimensional.")
    ny, nx = shape_t1[-2:]
    probe_pixels = np.array([
        [0.0, 0.0],
        [nx - 1.0, 0.0],
        [0.0, ny - 1.0],
        [nx - 1.0, ny - 1.0],
        [(nx - 1.0) / 2.0, (ny - 1.0) / 2.0],
    ])
    world_t1 = wcs_t1.celestial.all_pix2world(probe_pixels, 0)
    world_t2 = wcs_t2.celestial.all_pix2world(probe_pixels, 0)
    delta_ra = (world_t1[:, 0] - world_t2[:, 0] + 180.0) % 360.0 - 180.0
    if not np.allclose(delta_ra, 0.0, rtol=0.0, atol=1e-10) or not np.allclose(
        world_t1[:, 1], world_t2[:, 1], rtol=0.0, atol=1e-10
    ):
        raise ValueError("Las transformaciones WCS difieren; el pipeline no remuestrea la imagen ni la varianza.")
    for label, meta in (("T1", meta_t1), ("T2", meta_t2)):
        release = str(meta.get("release") or "").strip().upper()
        if release not in ("DR1", "QR3"):
          raise ValueError(f"No se puede identificar una release compatible DR1/QR3 para {label}.")

  @staticmethod
  def extract_spectral_profile_from_mef(
      filepath: str, ra: float, dec: float
  ) -> Dict[str, Any]:
    """Extrae la longitud de onda exacta (0.75 - 5.0 µm) en la coordenada (RA, Dec)

    utilizando el WCS espectral alternativo (key='W') con distorsión SIP desactivada.
    """
    with fits.open(filepath, memmap=False) as hdul:
      image_hdu = hdul["IMAGE"]
      variance_hdu = hdul["VARIANCE"]
      flags_hdu = hdul["FLAGS"]
      try:
        image_unit = u.Unit(image_hdu.header["BUNIT"], format="fits")
        variance_unit = u.Unit(variance_hdu.header["BUNIT"], format="fits")
      except (KeyError, ValueError) as exc:
        raise ValueError("BUNIT de IMAGE/VARIANCE falta o no se puede interpretar.") from exc
      output_unit = u.MJy / u.sr
      if not image_unit.is_equivalent(output_unit) or not variance_unit.is_equivalent(output_unit ** 2):
        raise ValueError("El perfil espectral requiere unidades compatibles con MJy/sr y (MJy/sr)^2.")

      spatial_wcs = WCS(image_hdu.header)
      coord = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame="icrs")
      x_px, y_px = spatial_wcs.world_to_pixel(coord)

      ix, iy = int(round(float(x_px))), int(round(float(y_px)))
      ny, nx = image_hdu.data.shape

      if not (0 <= ix < nx and 0 <= iy < ny):
        raise ValueError(
            "Coordenadas fuera de los límites del detector en esta exposición."
        )

      # Leer WCS espectral alternativo (key="W") y desactivar distorsión SIP obligatoriamente
      spectral_wcs = WCS(image_hdu.header, fobj=hdul, key="W")
      spectral_wcs.sip = None

      # Transformar coordenadas de píxel a longitud de onda física
      spectral_world = spectral_wcs.pixel_to_world(x_px, y_px)

      # Extraer longitud de onda en micrómetros (si el eje devuelve Quantity con unidades)
      if hasattr(spectral_world, "to"):
        wavelength_um = float(spectral_world.to(u.um).value)
      elif isinstance(spectral_world, (list, tuple)):
        # Buscar el componente espectral en la tupla de coordenadas
        wl_quantity = [w for w in spectral_world if hasattr(w, "to")]
        wavelength_um = (
            float(wl_quantity[0].to(u.um).value) if wl_quantity else 0.0
        )
      else:
        wavelength_um = float(spectral_world)

      flag_val = int(flags_hdu.data[iy, ix])
      raw_flux = float(image_hdu.data[iy, ix])
      variance = float(variance_hdu.data[iy, ix])
      is_valid = (
          flag_val in (0, 2, 2097152)
          and np.isfinite(raw_flux)
          and np.isfinite(variance)
          and variance > 0
          and np.isfinite(wavelength_um)
          and wavelength_um > 0
      )

      flux = raw_flux if is_valid else 0.0
      variance = variance if is_valid else 0.0
      flux_err = (
          float(np.sqrt(variance))
          if is_valid
          else 0.0
      )
      flux_mjy_sr = float((flux * image_unit).to_value(output_unit))
      flux_error_mjy_sr = float(
          np.sqrt((max(variance, 0.0) * variance_unit).to_value(output_unit ** 2))
      )

      return {
          "wavelength_um": wavelength_um,
          "flux": flux,
          "flux_error": flux_err,
          "unit": str(image_hdu.header["BUNIT"]),
          "uncertainty_unit": str(variance_unit ** 0.5),
          "flux_mjy_sr": flux_mjy_sr,
          "flux_error_mjy_sr": flux_error_mjy_sr,
          "flag": flag_val,
          "is_valid_measurement": is_valid,
      }