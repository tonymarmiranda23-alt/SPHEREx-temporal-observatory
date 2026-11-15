
import json
import logging
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query

from app.core.cache import redis_cache
from app.services.irsa_client import IRSAClient

router = APIRouter()
logger = logging.getLogger("SPHEREx-SkyAPI")
irsa_client = IRSAClient()


@router.get("/regions/featured", tags=["Sky Explorer"])
async def get_featured_regions() -> List[Dict[str, Any]]:
    """
    Retorna regiones astronómicas precargadas con observaciones
    verificadas en DR1/QR3 para navegación inmediata.
    """
    return [
        {
            "region_id": "ecliptic_pole_north",
            "name": "North Ecliptic Pole (Deep Field)",
            "ra": 270.0,
            "dec": 66.56,
            "fov_deg": 0.08,
            "description": (
                "Zona de máxima cadencia temporal de SPHEREx, ideal "
                "para detectar objetos móviles y transitorios."
            ),
            "recommended_epochs": ["obs_dr1_ep1", "obs_dr1_ep2"],
        },
        {
            "region_id": "cosmos_field",
            "name": "COSMOS Extragalactic Field",
            "ra": 150.119,
            "dec": 2.2058,
            "fov_deg": 0.08,
            "description": (
                "Campo profundo con múltiples épocas infrarrojas "
                "y cobertura espectral completa."
            ),
            "recommended_epochs": ["obs_qr3_ep1", "obs_qr3_ep2"],
        },
    ]


@router.get("/observations", tags=["Sky Explorer"])
async def search_observations(
    ra: float = Query(
        ..., ge=0.0, le=360.0,
        description="Right Ascension (deg)"
    ),
    dec: float = Query(
        ..., ge=-90.0, le=90.0,
        description="Declination (deg)"
    ),
    fov_deg: float = Query(
        default=0.08,
        ge=0.01,
        le=0.5,
        description="Radio/FOV en grados",
    ),
) -> Dict[str, Any]:
    """
    Consulta las exposiciones disponibles en IRSA (DR1 y QR3),
    utilizando caché Redis/memoria para evitar consultas redundantes.
    """
    cache_key = (
        f"irsa_obs:{round(ra, 4)}:"
        f"{round(dec, 4)}:{round(fov_deg, 3)}"
    )

    cached_data = await redis_cache.get(cache_key)

    if cached_data:
        logger.info(f"Observaciones recuperadas de caché: {cache_key}")
        return json.loads(cached_data)

    try:
        observations = irsa_client.query_spherex_observations(
            ra=ra,
            dec=dec,
            fov_deg=fov_deg,
        )

        response_payload = {
            "status": "success",
            "ra": ra,
            "dec": dec,
            "fov_deg": fov_deg,
            "total_found": len(observations),
            "observations": observations,
        }

        await redis_cache.set(
            cache_key,
            json.dumps(response_payload),
            expire_seconds=3600,
        )

        return response_payload

    except Exception as e:
        logger.exception(
            f"Error consultando observaciones en IRSA: {e}"
        )
        raise HTTPException(
            status_code=502,
            detail="Error consultando observaciones en IRSA",
        ) from e
