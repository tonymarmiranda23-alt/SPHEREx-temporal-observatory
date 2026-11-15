from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.cache import redis_cache
from app.core.config import settings
from app.core.database import Base, engine
from app.models import database_models  # Asegura que SQLAlchemy registre los modelos antes de crear tablas
from app.models.spatial_indexes import init_spatial_indexes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SPHEREx-Backend")

# Asegurar que existan los directorios de datos antes de montar StaticFiles
os.makedirs(settings.DATA_RAW_DIR, exist_ok=True)
os.makedirs(settings.DATA_PROCESSED_DIR, exist_ok=True)
os.makedirs(settings.SPHEREX_RAW_DIR, exist_ok=True)
os.makedirs(settings.SPHEREX_PROCESSED_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
  """Gestiona el ciclo de vida del servidor: inicializa tablas e índices en BD

  y conecta la caché al arrancar, liberando conexiones al apagar.
  """
  logger.info("Inicializando tablas e índices en base de datos...")
  Base.metadata.create_all(bind=engine)
  init_spatial_indexes()
  await redis_cache.connect()
  yield
  await redis_cache.close()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

# CORS explícito: agrega aquí los orígenes frontend exactos del entorno de despliegue.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

# 2. Montaje de archivos estáticos para servir t1.png, t2.png y diff_z.png al navegador
app.mount(
    "/static",
    StaticFiles(directory=settings.DATA_PROCESSED_DIR),
    name="static",
)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
  logger.error(f"Error crítico no controlado: {str(exc)}")
  return JSONResponse(
      status_code=500,
      content={
          "error": "Internal Scientific Processing Error",
          "detail": str(exc),
      },
  )


@app.get("/health", tags=["System"])
async def health_check():
  """Endpoint ligero para mantener activo el contenedor en Render/Railway."""
  return {"status": "online", "release": "SPHEREx DR1/QR3"}


app.include_router(api_router, prefix=settings.API_V1_STR)