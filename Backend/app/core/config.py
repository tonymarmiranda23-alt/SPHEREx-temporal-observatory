from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  PROJECT_NAME: str = "SPHEREx Temporal Observatory API"
  VERSION: str = "1.0.0"
  API_V1_STR: str = "/api/v1"

  # URL pública del backend desplegado (ej. https://spherex-api.onrender.com)
  PUBLIC_BASE_URL: str = "http://localhost:8000"
  CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://localhost:8443"

  @property
  def cors_origins_list(self) -> list[str]:
    return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

  # PostgreSQL (soporta URL directa de Supabase/Render o variables individuales)
  DATABASE_URL: Optional[str] = None
  POSTGRES_SERVER: str = "localhost"
  POSTGRES_USER: str = "postgres"
  POSTGRES_PASSWORD: str = "postgres"
  POSTGRES_DB: str = "spherex_db"
  POSTGRES_PORT: int = 5432

  @property
  def SQLALCHEMY_DATABASE_URI(self) -> str:
    if self.DATABASE_URL:
      # SQLAlchemy 2.0 exige 'postgresql://' en lugar de 'postgres://'
      return self.DATABASE_URL.replace("postgres://", "postgresql://", 1)
    return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

  # Redis (soporta URL directa de Upstash o host/puerto)
  REDIS_URL: Optional[str] = None
  REDIS_HOST: str = "localhost"
  REDIS_PORT: int = 6379
  REDIS_DB: int = 0

  # Directorios locales para FITS y PNGs estáticos
  DATA_RAW_DIR: str = "./data/raw"
  DATA_PROCESSED_DIR: str = "./data/processed"
  SPHEREX_RAW_DIR: str = "./data/raw/spherex"
  SPHEREX_PROCESSED_DIR: str = "./data/processed/spherex"
  SPHEREX_MANIFEST_PATH: str = "./data/processed/spherex/fits-manifest.json"
  SPHEREX_CONSUMERS_PATH: str = "./fits-consumers.json"

  model_config = SettingsConfigDict(
      case_sensitive=True, env_file=".env", extra="ignore"
  )


settings = Settings()