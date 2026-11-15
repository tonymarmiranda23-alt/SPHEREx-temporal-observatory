import math
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class SkyQueryRequest(BaseModel):
  ra: float = Field(..., ge=0.0, le=360.0, description="Right Ascension (deg)")
  dec: float = Field(..., ge=-90.0, le=90.0, description="Declination (deg)")
  fov_deg: float = Field(
      default=0.08,
      ge=0.01,
      le=0.5,
      description="Campo de visión (FOV) en grados para cutout URL de IRSA",
  )
  band_index: int = Field(default=0, ge=0, lt=102)
  epoch_t1: str = Field(..., description="Identificador exposición t1")
  epoch_t2: str = Field(..., description="Identificador exposición t2")


class LocalTemporalRequest(BaseModel):
  file_id_t1: str = Field(..., description="Identificador de archivo del inventario FITS local")
  file_id_t2: str = Field(..., description="Identificador de archivo del inventario FITS local")
  ra: float = Field(..., ge=0.0, le=360.0)
  dec: float = Field(..., ge=-90.0, le=90.0)


class CandidateEvidenceSchema(BaseModel):
  candidate_id: str
  ra: float
  dec: float
  peak_z_score: float
  angular_velocity_mu: Optional[float] = None
  confidence_score_c: float
  gaia_match: Optional[Dict[str, Any]] = Field(
      default=None,
      description="Coincidencia en gaiadr3.gaia_source (pmra, pmdec, parallax)",
  )
  wiseview_url: str = Field(
      ...,
      description="Enlace directo a WiseView para verificación histórica IR",
  )

  @field_validator(
      "ra", "dec", "peak_z_score", "confidence_score_c", mode="before"
  )
  @classmethod
  def sanitize_floats(cls, v: Any) -> float:
    """Convierte escalares NumPy a float nativo y reemplaza NaN/Inf por 0.0."""
    val = float(v)
    if math.isnan(val) or math.isinf(val):
      return 0.0
    return val


class TemporalAnalysisResponse(BaseModel):
  status: str
  ra: float
  dec: float
  t1_image_url: str
  t2_image_url: str
  diff_z_image_url: str
  candidates: List[CandidateEvidenceSchema]
  metrics: Dict[str, Any]