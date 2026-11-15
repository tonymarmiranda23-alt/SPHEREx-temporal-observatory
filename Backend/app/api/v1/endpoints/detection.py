from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.database_models import DetectionCandidateModel

router = APIRouter()


@router.get("/discoveries", tags=["Discovery Center"])
def list_discovery_candidates(
    limit: int = 50, db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
  """Lista los candidatos detectados ordenados por fecha o significancia."""
  records = (
      db.query(DetectionCandidateModel)
      .order_by(DetectionCandidateModel.peak_z_score.desc())
      .limit(limit)
      .all()
  )
  return [
      {
          "id": r.id,
          "candidate_code": r.candidate_code,
          "ra": r.ra,
          "dec": r.dec,
          "category": r.category,
          "peak_z_score": r.peak_z_score,
          "epochs_involved": r.epochs_involved,
          "metrics_summary": r.metrics_summary,
          "created_at": r.created_at.isoformat() if r.created_at else None,
      }
      for r in records
  ]


@router.get("/discoveries/{candidate_code}", tags=["Discovery Center"])
def get_candidate_evidence(
    candidate_code: str, db: Session = Depends(get_db)
) -> Dict[str, Any]:
  """Retorna la ficha técnica completa de evidencia científica de un candidato."""
  record = (
      db.query(DetectionCandidateModel)
      .filter_by(candidate_code=candidate_code)
      .first()
  )
  if not record:
    raise HTTPException(status_code=404, detail="Candidato no encontrado.")
  return {
      "candidate_code": record.candidate_code,
      "ra": record.ra,
      "dec": record.dec,
      "category": record.category,
      "peak_z_score": record.peak_z_score,
      "epochs_involved": record.epochs_involved,
      "metrics_summary": record.metrics_summary,
      "is_verified": record.is_verified,
  }