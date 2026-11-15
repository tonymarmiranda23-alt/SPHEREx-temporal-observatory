from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path, PurePosixPath
import re
import warnings
from typing import Any, Dict, Iterable, List, Optional
import uuid

from astropy.io import fits
from astropy.wcs import WCS

from app.core.config import settings

logger = logging.getLogger("SPHEREx-FITSInventory")

SUPPORTED_SUFFIXES = (
    ".fits", ".fit", ".fts",
    ".fits.gz", ".fit.gz", ".fts.gz",
    ".fits.fz", ".fit.fz", ".fts.fz", ".fz",
    ".fits.bz2", ".fit.bz2", ".fts.bz2",
)
MODULE_NAMES = {
    "sky_explorer",
    "temporal_vision",
    "spectral_analysis",
    "object_detection",
    "discovery_catalog",
}
RELEASE_KEYS = ("OBSCOLL", "OBS_COLL", "COLLECT", "COLLECTION", "RELEASE", "DATAREL", "DR")


class InventoryStaleError(ValueError):
    """A raw file no longer matches the digest recorded in the manifest."""


def _json_value(value: Any) -> Any:
    if isinstance(value, str):
        if (
            re.match(r"^(?:[a-zA-Z]:[\\/]|\\\\)", value)
            or re.match(r"^file:(?://)?(?:/|[a-zA-Z]:)", value, re.IGNORECASE)
            or Path(value).is_absolute()
        ):
            return "[absolute path omitted]"
        return value
    if value is None or isinstance(value, (int, float, bool)):
        return value
    if hasattr(value, "item"):
        return _json_value(value.item())
    return str(value)


def _release_from_header(header: fits.Header) -> Optional[str]:
    for key in RELEASE_KEYS:
        value = header.get(key)
        if value is None:
            continue
        token = str(value).strip().lower()
        match = re.search(r"(?<![a-z0-9])(dr1|qr2|qr3)(?![a-z0-9])", token)
        if match:
            return match.group(1).upper()
    return None


def release_from_hdul(hdul: fits.HDUList) -> Optional[str]:
    releases = {
        release
        for release in (_release_from_header(hdu.header) for hdu in hdul)
        if release is not None
    }
    return next(iter(releases)) if len(releases) == 1 else None


def _find_extension(hdul: fits.HDUList, names: Iterable[str]) -> Optional[int]:
    wanted = {name.upper() for name in names}
    for index, hdu in enumerate(hdul):
        if str(hdu.header.get("EXTNAME", "")).strip().upper() in wanted:
            return index
    return None


def _has_alternate_wcs(header: fits.Header, key: str) -> bool:
    return any(
        re.match(r"^(?:CTYPE|CUNIT|CRPIX|CRVAL|CDELT)\d+" + re.escape(key) + r"$", keyword)
        or re.match(r"^(?:CD|PC)\d+_\d+" + re.escape(key) + r"$", keyword)
        for keyword in header
    )


def _has_spectral_axis(wcs: WCS) -> bool:
    physical_types = wcs.world_axis_physical_types or []
    return any(
        axis.lower().startswith(("em.", "freq", "wave", "velo"))
        for axis in physical_types
        if axis
    )


def inspect_fits(path: Path) -> Dict[str, Any]:
    """Inspect one FITS file without changing it or retaining its arrays in memory."""
    messages: List[str] = []
    try:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            with fits.open(path, mode="readonly", memmap=True, lazy_load_hdus=False) as hdul:
                # Access the data to validate readability while keeping each HDU's use scoped.
                extensions: List[Dict[str, Any]] = []
                release: Optional[str] = None
                observation: Dict[str, Any] = {}
                celestial_wcs = False
                spectral_wcs = False
                wcs_uninterpretable = False
                for index, hdu in enumerate(hdul):
                    data = hdu.data
                    shape = list(data.shape) if data is not None else None
                    dtype = str(data.dtype) if data is not None else None
                    header = hdu.header
                    hdu_celestial_wcs = False
                    hdu_spectral_wcs = False
                    for key in ("DATE-OBS", "MJD-OBS", "OBS_ID", "OBSID", "OBJECT", "TELESCOP", "INSTRUME"):
                        if key in header and key not in observation:
                            observation[key] = _json_value(header[key])
                    try:
                        wcs = WCS(header, fobj=hdul, relax=True)
                        if wcs.has_celestial:
                            hdu_celestial_wcs = True
                            celestial_wcs = True
                        if _has_spectral_axis(wcs):
                            hdu_spectral_wcs = True
                            spectral_wcs = True
                    except Exception:
                        wcs_uninterpretable = True
                        messages.append(f"HDU {index}: WCS no interpretable.")
                    if _has_alternate_wcs(header, "W"):
                        try:
                            alternate_wcs = WCS(header, fobj=hdul, relax=True, key="W")
                            if alternate_wcs.has_celestial:
                                hdu_celestial_wcs = True
                                celestial_wcs = True
                            if _has_spectral_axis(alternate_wcs):
                                hdu_spectral_wcs = True
                                spectral_wcs = True
                        except Exception:
                            wcs_uninterpretable = True
                            messages.append(f"HDU {index}: WCS alternativo W no interpretable.")
                    checksum_result = hdu.verify_checksum() if "CHECKSUM" in header else None
                    datasum_result = hdu.verify_datasum() if "DATASUM" in header else None
                    extensions.append({
                        "index": index,
                        "name": _json_value(header.get("EXTNAME")),
                        "version": _json_value(header.get("EXTVER")),
                        "type": type(hdu).__name__,
                        "shape": shape,
                        "dtype": dtype,
                        "has_celestial_wcs": hdu_celestial_wcs,
                        "has_spectral_wcs": hdu_spectral_wcs,
                        "unit": _json_value(header.get("BUNIT")),
                        "checksum_present": "CHECKSUM" in header,
                        "checksum_valid": True if checksum_result == 1 else False if checksum_result == 0 else None,
                        "datasum_present": "DATASUM" in header,
                        "datasum_valid": True if datasum_result == 1 else False if datasum_result == 0 else None,
                        "date_obs": _json_value(header.get("DATE-OBS")),
                        "mjd_obs": _json_value(header.get("MJD-OBS")),
                        "ra": _json_value(header.get("CRVAL1")),
                        "dec": _json_value(header.get("CRVAL2")),
                        "coordinate_system": _json_value(header.get("RADESYS") or header.get("RADECSYS")),
                        "band": _json_value(header.get("BAND") or header.get("FILTER")),
                        "wavelength": _json_value(header.get("WAVELNTH") or header.get("WAVELENGTH")),
                        "psf_fwhm": _json_value(header.get("PSF_FWHM") or header.get("FWHM")),
                        "calibration": {
                            key: _json_value(header[key])
                            for key in ("CALLEVEL", "CAL_VER", "CALVERS", "BUNIT", "BAND", "FILTER", "PHOTMJSR", "FLUXCONV")
                            if key in header
                        },
                        "header_cards": [
                            {
                                "keyword": card.keyword,
                                "value": _json_value(card.value),
                                "comment": _json_value(card.comment),
                            }
                            for card in header.cards
                        ],
                    })
                messages.extend(
                    str(item.message).replace(str(path.resolve()), "[local file]").replace(str(path), "[local file]")
                    for item in caught
                )
                checksums_ok = all(
                    ext["checksum_valid"] is not False and ext["datasum_valid"] is not False
                    for ext in extensions
                )
                checksum_failure = not checksums_ok
                if not checksums_ok:
                    messages.append("Uno o más CHECKSUM/DATASUM presentes no son válidos.")
                mef_indices = {
                    "image": _find_extension(hdul, ("IMAGE",)),
                    "variance": _find_extension(hdul, ("VARIANCE",)),
                    "flags": _find_extension(hdul, ("FLAGS",)),
                }
                has_tabular_data = any(isinstance(hdu, (fits.BinTableHDU, fits.TableHDU)) for hdu in hdul)
                has_2d_image = any(
                    ext["shape"] is not None and len(ext["shape"]) == 2
                    for ext in extensions
                )
                mef_complete = all(index is not None for index in mef_indices.values())
                image_extension = (
                    extensions[mef_indices["image"]]
                    if mef_indices["image"] is not None
                    else {}
                )
                image_celestial_wcs = image_extension.get("has_celestial_wcs", False)
                image_spectral_wcs = image_extension.get("has_spectral_wcs", False)
                image_shape = image_extension.get("shape")
                mef_shapes_match = bool(
                    image_shape is not None
                    and len(image_shape) == 2
                    and all(
                        extensions[index].get("shape") == image_shape
                        for index in mef_indices.values()
                        if index is not None
                    )
                )
                image_date_obs = image_extension.get("date_obs")
                image_mjd_obs = image_extension.get("mjd_obs")
                release_values = {
                    item
                    for item in (_release_from_header(hdu.header) for hdu in hdul)
                    if item is not None
                }
                if len(release_values) > 1:
                    messages.append(f"Cabeceras con releases en conflicto: {', '.join(sorted(release_values))}")
                    release = None
                elif len(release_values) == 1:
                    release = next(iter(release_values))
                else:
                    release = None
                    messages.append("No se identificó release de publicación en las cabeceras.")
                compatibility = {
                    "sky_preview": {
                        "compatible": has_2d_image and not checksum_failure,
                        "reason": None if has_2d_image and not checksum_failure else "No contiene una imagen 2D o los checksums no son válidos.",
                    },
                    "temporal_comparison": {
                        "compatible": bool(
                            mef_complete
                            and mef_shapes_match
                            and image_celestial_wcs
                            and bool(image_date_obs)
                            and release in ("DR1", "QR3")
                            and not checksum_failure
                        ),
                        "reason": None if (
                            mef_complete and mef_shapes_match and image_celestial_wcs and bool(image_date_obs)
                            and release in ("DR1", "QR3") and not checksum_failure
                        ) else "Faltan IMAGE/VARIANCE/FLAGS, WCS celeste, DATE-OBS o release DR1/QR3, o los checksums no son válidos; PSF/calibración requiere verificar el par.",
                    },
                    "spectral_profile": {
                        "compatible": bool(mef_complete and mef_shapes_match and image_celestial_wcs and image_spectral_wcs and not checksum_failure),
                        "reason": None if mef_complete and mef_shapes_match and image_celestial_wcs and image_spectral_wcs and not checksum_failure else "Faltan extensiones MEF compatibles o WCS espectral/espacial en IMAGE, o los checksums no son válidos.",
                    },
                    "source_detection": {
                        "compatible": bool(image_shape is not None and len(image_shape) == 2 and image_celestial_wcs and not checksum_failure),
                        "reason": None if image_shape is not None and len(image_shape) == 2 and image_celestial_wcs and not checksum_failure else "Faltan IMAGE 2D o WCS celeste en IMAGE, o los checksums no son válidos.",
                    },
                }
                metadata_presence = {
                    "release": "present" if release is not None else "absent_or_conflicting",
                    "date_obs": "present" if bool(image_date_obs) else "absent",
                    "mjd_obs": "present" if image_mjd_obs is not None else "absent",
                    "celestial_wcs": "present" if image_celestial_wcs else "uninterpretable" if wcs_uninterpretable else "absent",
                    "spectral_wcs": "present" if image_spectral_wcs else "uninterpretable" if wcs_uninterpretable else "absent",
                    "calibration": "present" if any(
                        key in image_extension.get("calibration", {})
                        for key in ("CALLEVEL", "CAL_VER", "CALVERS", "PHOTMJSR", "FLUXCONV")
                    ) else "absent",
                    "uncertainty": "present" if (
                        mef_indices["variance"] is not None
                        and extensions[mef_indices["variance"]].get("shape") is not None
                    ) else "absent",
                    "quality_mask": "present" if (
                        mef_indices["flags"] is not None
                        and extensions[mef_indices["flags"]].get("shape") is not None
                    ) else "absent",
                    "checksums": "present" if any(
                        ext["checksum_present"] or ext["datasum_present"] for ext in extensions
                    ) else "absent",
                }
                status = (
                    "corrupt_or_unreadable"
                    if checksum_failure
                    else "valid_with_warnings"
                    if messages
                    else "valid"
                )
                if not extensions or all(ext["shape"] is None for ext in extensions) and not has_tabular_data:
                    status = "incomplete"
                    messages.append("El FITS no contiene imágenes ni tablas con datos.")
                return {
                    "validation_status": status,
                    "validation_warnings": list(dict.fromkeys(messages)),
                    "hdu_count": len(extensions),
                    "extensions": extensions,
                    "observation": observation,
                    "release": release,
                    "metadata_presence": metadata_presence,
                    "release_metadata_present": release is not None,
                    "has_celestial_wcs": celestial_wcs,
                    "has_spectral_wcs": spectral_wcs,
                    "has_table_data": has_tabular_data,
                    "spherex_mef_extensions": mef_indices,
                    "compatibility": compatibility,
                }
    except Exception as exc:
        logger.warning("No se pudo inspeccionar el FITS %s.", path.name, exc_info=True)
        return {
            "validation_status": "corrupt_or_unreadable",
            "validation_warnings": [f"{type(exc).__name__}: no se pudo leer o validar el archivo."],
            "hdu_count": 0,
            "extensions": [],
            "observation": {},
            "release": None,
            "metadata_presence": {},
            "release_metadata_present": False,
            "has_celestial_wcs": False,
            "has_spectral_wcs": False,
            "has_table_data": False,
            "spherex_mef_extensions": {},
            "compatibility": {},
        }


class FitsInventory:
    """Local manifest-backed inventory; each raw FITS is stored once."""

    def __init__(
        self,
        root: Optional[str] = None,
        manifest_path: Optional[str] = None,
        consumers_path: Optional[str] = None,
    ) -> None:
        self.root = Path(root or settings.SPHEREX_RAW_DIR).resolve()
        self.manifest_path = Path(manifest_path or settings.SPHEREX_MANIFEST_PATH).resolve()
        self.consumers_path = Path(consumers_path or settings.SPHEREX_CONSUMERS_PATH).resolve()

    def _consumer_map(self) -> Dict[str, Dict[str, Any]]:
        if not self.consumers_path.is_file():
            return {}
        with self.consumers_path.open(encoding="utf-8") as file:
            data = json.load(file)
        if not isinstance(data, dict):
            raise ValueError("El archivo de consumidores debe ser un objeto JSON.")
        mapping: Dict[str, Dict[str, Any]] = {}
        for relative_path, modules in data.items():
            if not isinstance(relative_path, str):
                raise ValueError("Cada clave de consumidores debe ser una ruta relativa.")
            if isinstance(modules, list):
                metadata = {"consumers": modules}
            elif isinstance(modules, dict) and isinstance(modules.get("consumers"), list):
                metadata = modules
            else:
                raise ValueError(f"La ruta {relative_path} debe asociarse a una lista de módulos o a un objeto con consumers.")
            if any(not isinstance(module, str) or module not in MODULE_NAMES for module in metadata["consumers"]):
                raise ValueError(f"Módulo consumidor no reconocido para {relative_path}.")
            for field in ("product_type", "source", "downloaded_at"):
                if field in metadata and metadata[field] is not None and not isinstance(metadata[field], str):
                    raise ValueError(f"{field} debe ser texto o null para {relative_path}.")
            relative = PurePosixPath(relative_path.replace("\\", "/"))
            if (
                relative.is_absolute()
                or re.match(r"^[a-zA-Z]:/", relative.as_posix())
                or not relative.parts
                or any(part in ("", ".", "..") for part in relative.parts)
            ):
                raise ValueError(f"La ruta de consumidores debe ser relativa y segura: {relative_path}.")
            mapping[relative.as_posix()] = {
                **metadata,
                "consumers": sorted(set(metadata["consumers"])),
            }
        return mapping

    @staticmethod
    def _sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as file:
            for block in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(block)
        return digest.hexdigest()

    def build(self) -> Dict[str, Any]:
        if not self.root.is_dir():
            raise FileNotFoundError(f"No existe el directorio de datos SPHEREx: {self.root}")
        consumers = self._consumer_map()
        existing: Dict[str, Dict[str, Any]] = {}
        if self.manifest_path.is_file():
            try:
                old_manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
                existing = {item["relative_path"]: item for item in old_manifest.get("files", [])}
            except (OSError, ValueError, KeyError, TypeError):
                logger.warning("Manifiesto anterior ilegible; será regenerado.")

        entries: List[Dict[str, Any]] = []
        seen_hashes: Dict[str, str] = {}
        for path in sorted(p for p in self.root.rglob("*") if p.is_file() and not p.is_symlink() and p.name.lower().endswith(SUPPORTED_SUFFIXES)):
            relative = path.relative_to(self.root).as_posix()
            old = existing.get(relative, {})
            try:
                stat = path.stat()
                checksum = self._sha256(path)
                metadata = inspect_fits(path)
                if checksum in seen_hashes:
                    duplicate_of = seen_hashes[checksum]
                else:
                    duplicate_of = None
                    seen_hashes[checksum] = relative
                config = consumers.get(relative, {})
                consumers_for_file = config.get(
                    "consumers",
                    [] if self.consumers_path.is_file() else old.get("consumers", []),
                )
                entry = {
                    "file_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{relative}:{checksum}")),
                    "relative_path": relative,
                    "filename": path.name,
                    "size_bytes": stat.st_size,
                    "sha256": checksum,
                    "consumers": consumers_for_file,
                    "product_type": _json_value(config.get("product_type", old.get("product_type"))),
                    "source": _json_value(config.get("source", old.get("source"))),
                    "downloaded_at": _json_value(config.get("downloaded_at", old.get("downloaded_at"))),
                    "ingested_at": old.get("ingested_at") or datetime.now(timezone.utc).isoformat(),
                    "duplicate_of": duplicate_of,
                    **metadata,
                }
            except OSError:
                logger.warning("No se pudo leer el archivo FITS %s.", path.name, exc_info=True)
                entry = {
                    "file_id": str(uuid.uuid5(uuid.NAMESPACE_URL, relative)),
                    "relative_path": relative,
                    "filename": path.name,
                    "size_bytes": None,
                    "sha256": None,
                    "consumers": consumers.get(relative, {}).get("consumers", old.get("consumers", [])),
                    "product_type": old.get("product_type"),
                    "source": old.get("source"),
                    "downloaded_at": old.get("downloaded_at"),
                    "ingested_at": old.get("ingested_at") or datetime.now(timezone.utc).isoformat(),
                    "duplicate_of": None,
                    "validation_status": "corrupt_or_unreadable",
                    "validation_warnings": ["OSError: no se pudo leer el archivo."],
                    "hdu_count": 0,
                    "extensions": [],
                    "observation": {},
                    "release": None,
                    "metadata_presence": {},
                    "release_metadata_present": False,
                    "has_celestial_wcs": False,
                    "has_spectral_wcs": False,
                    "has_table_data": False,
                    "spherex_mef_extensions": {},
                }
            entries.append(entry)

        self.manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest = {
            "schema_version": 1,
            "dataset_root": ".",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "file_count": len(entries),
            "total_size_bytes": sum(item["size_bytes"] or 0 for item in entries),
            "files": entries,
        }
        temporary = self.manifest_path.with_suffix(self.manifest_path.suffix + ".tmp")
        temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary, self.manifest_path)
        return manifest

    def load(self) -> Dict[str, Any]:
        if not self.manifest_path.is_file():
            return self.build()
        return json.loads(self.manifest_path.read_text(encoding="utf-8"))

    def find(self, file_id: str) -> Dict[str, Any]:
        for entry in self.load().get("files", []):
            if entry.get("file_id") == file_id:
                return entry
        raise KeyError(file_id)

    def get_path(self, entry: Dict[str, Any]) -> Path:
        path = (self.root / entry["relative_path"]).resolve()
        if not path.is_relative_to(self.root) or not path.is_file():
            raise FileNotFoundError("El archivo FITS registrado no está disponible.")
        expected_hash = entry.get("sha256")
        if expected_hash and self._sha256(path) != expected_hash:
            raise InventoryStaleError(
                "El archivo FITS cambió desde que se generó el manifiesto; vuelve a generarlo."
            )
        return path


fits_inventory = FitsInventory()
