from pathlib import Path
from typing import Any, Dict, Optional

from astropy.io import fits
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
import numpy as np

from app.core.config import settings
from app.services.fits_inventory import InventoryStaleError, MODULE_NAMES, fits_inventory
from app.services.image_renderer import ImageRenderer
from app.services.fits_processor import FITSProcessor

router = APIRouter()
image_renderer = ImageRenderer(output_dir=settings.SPHEREX_PROCESSED_DIR)


@router.get("/fits")
def list_local_fits(
    module: Optional[str] = Query(default=None),
    validation_status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> Dict[str, Any]:
    if module and module not in MODULE_NAMES:
        raise HTTPException(status_code=422, detail="Módulo consumidor no reconocido.")
    try:
        manifest = fits_inventory.load()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail="El directorio de datos FITS local no está disponible.") from exc
    files = manifest.get("files", [])
    if module:
        files = [entry for entry in files if module in entry.get("consumers", [])]
    if validation_status:
        files = [entry for entry in files if entry.get("validation_status") == validation_status]
    total = len(files)
    summary_fields = {
        "file_id", "relative_path", "filename", "size_bytes", "sha256", "consumers",
        "product_type", "source", "downloaded_at", "ingested_at", "duplicate_of",
        "validation_status", "validation_warnings", "hdu_count", "observation",
        "release", "release_metadata_present", "has_celestial_wcs", "has_spectral_wcs",
        "has_table_data", "spherex_mef_extensions", "compatibility", "metadata_presence",
    }
    return {
        "dataset_root": manifest.get("dataset_root"),
        "generated_at": manifest.get("generated_at"),
        "total": total,
        "files": [
            {key: value for key, value in entry.items() if key in summary_fields}
            for entry in files[offset:offset + limit]
        ],
    }


@router.get("/fits/{file_id}/download")
def download_local_fits(file_id: str) -> FileResponse:
    try:
        entry = fits_inventory.find(file_id)
        path = fits_inventory.get_path(entry)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Archivo FITS no encontrado en el inventario.") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InventoryStaleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return FileResponse(
        path,
        media_type="application/fits",
        filename=Path(entry["filename"]).name,
        headers={"X-Content-SHA256": entry["sha256"] or ""},
    )


@router.get("/fits/{file_id}/preview")
def preview_local_fits(
    file_id: str,
    hdu: Optional[int] = Query(default=None, ge=0),
) -> FileResponse:
    try:
        entry = fits_inventory.find(file_id)
        path = fits_inventory.get_path(entry)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Archivo FITS no encontrado en el inventario.") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InventoryStaleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if not entry.get("compatibility", {}).get("sky_preview", {}).get("compatible"):
        raise HTTPException(status_code=422, detail="El archivo no supera la validación para generar una previsualización.")
    image_exts = [
        item["index"]
        for item in entry.get("extensions", [])
        if item.get("shape") is not None and len(item["shape"]) == 2
    ]
    selected_hdu = hdu if hdu is not None else next(
        (item["index"] for item in entry.get("extensions", []) if item.get("name") == "IMAGE" and item["index"] in image_exts),
        image_exts[0] if image_exts else None,
    )
    if selected_hdu is None or selected_hdu not in image_exts:
        raise HTTPException(status_code=422, detail="El HDU solicitado no contiene una imagen 2D compatible.")
    filename = f"{file_id}_hdu{selected_hdu}.png"
    output = Path(settings.SPHEREX_PROCESSED_DIR).resolve() / filename
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with fits.open(path, mode="readonly", memmap=True) as hdul:
            data = hdul[selected_hdu].data
            if data is None or data.ndim != 2 or not np.issubdtype(data.dtype, np.number):
                raise ValueError("El HDU seleccionado no es una imagen numérica 2D.")
            image_renderer._array_to_stretched_png(data.astype(np.float64), str(output))
    except (OSError, ValueError, IndexError) as exc:
        safe_error = str(exc).replace(str(path), entry["filename"])
        raise HTTPException(status_code=422, detail=f"No se pudo renderizar este HDU: {safe_error}") from exc
    return FileResponse(
        output,
        media_type="image/png",
        headers={"X-FITS-File-ID": file_id, "X-FITS-HDU": str(selected_hdu)},
    )


@router.get("/fits/{file_id}")
def get_local_fits_metadata(file_id: str) -> Dict[str, Any]:
    try:
        entry = fits_inventory.find(file_id)
        fits_inventory.get_path(entry)
        return entry
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Archivo FITS no encontrado en el inventario.") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InventoryStaleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/fits/{file_id}/spectral-profile")
def get_local_fits_spectral_profile(
    file_id: str,
    ra: float = Query(..., ge=0.0, le=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
) -> Dict[str, Any]:
    try:
        entry = fits_inventory.find(file_id)
        path = fits_inventory.get_path(entry)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Archivo FITS no encontrado en el inventario.") from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InventoryStaleError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not entry.get("compatibility", {}).get("spectral_profile", {}).get("compatible"):
        raise HTTPException(status_code=422, detail="El archivo no declara las extensiones y WCS espectral necesarios.")
    try:
        point = FITSProcessor.extract_spectral_profile_from_mef(str(path), ra=ra, dec=dec)
    except (OSError, KeyError, ValueError, IndexError) as exc:
        safe_error = str(exc).replace(str(path), entry["filename"])
        raise HTTPException(status_code=422, detail=f"No se pudo extraer un perfil válido: {safe_error}") from exc
    if not point.get("is_valid_measurement"):
        raise HTTPException(status_code=422, detail="El píxel está marcado como inválido por FLAGS.")
    return {
        "file_id": file_id,
        "filename": entry["filename"],
        "relative_path": entry["relative_path"],
        "release": entry.get("release"),
        "ra": ra,
        "dec": dec,
        "measurement_type": "Direct MEF WCS-W Extraction (Non-interpolated)",
        **point,
    }
