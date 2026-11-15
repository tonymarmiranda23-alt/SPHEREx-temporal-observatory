from typing import Any, Dict
import logging
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.endpoints.temporal import (
    execute_local_temporal_pipeline,
    execute_temporal_pipeline,
)
from app.core.database import SessionLocal
from app.schemas.observation import LocalTemporalRequest, SkyQueryRequest
from app.services.fits_inventory import fits_inventory

router = APIRouter()
logger = logging.getLogger("SPHEREx-Jobs")

# Almacén en memoria de estado de tareas en ejecución
JOBS_STORE: Dict[str, Dict[str, Any]] = {}


def _run_background_comparison(job_id: str, payload: SkyQueryRequest):
  JOBS_STORE[job_id]["status"] = "processing"
  JOBS_STORE[job_id][
      "step"
  ] = "Descargando cutouts de IRSA y alineando WCS..."
  db = SessionLocal()
  try:
    result = execute_temporal_pipeline(payload, db)
    JOBS_STORE[job_id]["status"] = "completed"
    JOBS_STORE[job_id]["step"] = "Análisis completado."
    JOBS_STORE[job_id]["result"] = result.model_dump()
  except Exception as e:
    logger.exception("Error ejecutando el trabajo temporal %s.", job_id)
    JOBS_STORE[job_id]["status"] = "failed"
    JOBS_STORE[job_id]["error"] = str(e)
  finally:
    db.close()


def _run_local_background_comparison(job_id: str, payload: LocalTemporalRequest):
  JOBS_STORE[job_id]["status"] = "processing"
  JOBS_STORE[job_id]["step"] = "Validando releases, WCS, PSF y calibración de archivos locales..."
  db = SessionLocal()
  try:
    result = execute_local_temporal_pipeline(payload, db)
    JOBS_STORE[job_id]["status"] = "completed"
    JOBS_STORE[job_id]["step"] = "Comparación de FITS locales completada."
    JOBS_STORE[job_id]["result"] = result.model_dump()
  except Exception as e:
    logger.exception("Error ejecutando el trabajo local %s.", job_id)
    safe_error = str(e)
    for file_id in (payload.file_id_t1, payload.file_id_t2):
      try:
        entry = fits_inventory.find(file_id)
        path = str((fits_inventory.root / entry["relative_path"]).resolve())
        safe_error = safe_error.replace(path, entry.get("filename", "archivo FITS"))
      except (KeyError, OSError, ValueError):
        continue
    JOBS_STORE[job_id]["status"] = "failed"
    JOBS_STORE[job_id]["error"] = safe_error
  finally:
    db.close()


@router.post("/temporal", tags=["Async Jobs"])
def enqueue_temporal_job(
    payload: SkyQueryRequest, background_tasks: BackgroundTasks
) -> Dict[str, str]:
  """Encola una comparación temporal pesada y retorna un job_id inmediato

  para evitar timeouts HTTP en Render/Railway.
  """
  job_id = str(uuid.uuid4())
  JOBS_STORE[job_id] = {
      "job_id": job_id,
      "status": "queued",
      "step": "En cola de procesamiento...",
      "result": None,
      "error": None,
  }
  background_tasks.add_task(_run_background_comparison, job_id, payload)
  return {"job_id": job_id, "status": "queued"}


@router.post("/temporal/local", tags=["Async Jobs"])
def enqueue_local_temporal_job(
    payload: LocalTemporalRequest, background_tasks: BackgroundTasks
) -> Dict[str, str]:
  job_id = str(uuid.uuid4())
  JOBS_STORE[job_id] = {
      "job_id": job_id,
      "status": "queued",
      "step": "Comparación local en cola...",
      "result": None,
      "error": None,
  }
  background_tasks.add_task(_run_local_background_comparison, job_id, payload)
  return {"job_id": job_id, "status": "queued"}


@router.get("/{job_id}", tags=["Async Jobs"])
def get_job_status(job_id: str) -> Dict[str, Any]:
  """Endpoint de polling ligero para consultar el avance y resultado del trabajo."""
  if job_id not in JOBS_STORE:
    raise HTTPException(status_code=404, detail="Job ID no encontrado.")
  return JOBS_STORE[job_id]