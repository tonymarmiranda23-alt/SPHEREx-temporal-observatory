import logging
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

logger = logging.getLogger("SPHEREx-Database")


def _build_engine():
  db_uri = settings.SQLALCHEMY_DATABASE_URI
  try:
    pg_engine = create_engine(
        db_uri,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
        connect_args={"connect_timeout": 5},
    )
    # Probar conexión real a PostgreSQL al arrancar
    with pg_engine.connect():
      logger.info("Conexión exitosa a PostgreSQL.")
    return pg_engine
  except Exception as e:
    logger.warning(
        f"PostgreSQL no disponible ({e}). Activando fallback automático a"
        " SQLite local."
    )
    os.makedirs("./data", exist_ok=True)
    sqlite_uri = "sqlite:///./data/observatory.db"
    return create_engine(sqlite_uri, connect_args={"check_same_thread": False})


engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
  db = SessionLocal()
  try:
    yield db
  finally:
    db.close()