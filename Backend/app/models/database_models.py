from datetime import datetime
from app.core.database import Base
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, JSON, String, Text


class ObservationModel(Base):
  """Registra metadatos de las observaciones FITS de SPHEREx consultadas desde IRSA."""

  __tablename__ = "observations"

  id = Column(Integer, primary_key=True, index=True)
  epoch_id = Column(String(100), unique=True, index=True, nullable=False)
  ra = Column(Float, nullable=False, index=True)
  dec = Column(Float, nullable=False, index=True)
  band_index = Column(Integer, nullable=False, index=True)
  file_path = Column(String(500), nullable=False)
  survey_version = Column(String(50), default="DR1/QR3")
  created_at = Column(DateTime, default=datetime.utcnow)


class DetectionCandidateModel(Base):
  """Almacena los candidatos a objetos móviles o variables detectados."""

  __tablename__ = "detection_candidates"

  id = Column(Integer, primary_key=True, index=True)
  candidate_code = Column(String(50), unique=True, index=True, nullable=False)
  ra = Column(Float, nullable=False)
  dec = Column(Float, nullable=False)
  category = Column(String(100), nullable=False)
  peak_z_score = Column(Float, nullable=False)
  epochs_involved = Column(JSON, nullable=False)
  metrics_summary = Column(JSON, nullable=True)
  is_verified = Column(Boolean, default=False)
  notes = Column(Text, nullable=True)
  created_at = Column(DateTime, default=datetime.utcnow)