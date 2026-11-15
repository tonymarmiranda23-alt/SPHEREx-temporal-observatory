import logging
from app.core.database import engine
from sqlalchemy import text

logger = logging.getLogger("SPHEREx-SpatialIndexes")


def init_spatial_indexes():
  """Crea índices compuestos sobre RA y Dec para acelerar consultas por región celeste."""
  try:
    with engine.connect() as connection:
      connection.execute(
          text(
              "CREATE INDEX IF NOT EXISTS idx_observations_ra_dec ON"
              " observations (ra, dec);"
          )
      )
      connection.execute(
          text(
              "CREATE INDEX IF NOT EXISTS idx_candidates_ra_dec ON"
              " detection_candidates (ra, dec);"
          )
      )
      connection.commit()
      logger.info("Índices espaciales verificados con éxito.")
  except Exception as e:
    logger.error(f"Error al inicializar índices de base de datos: {e}")