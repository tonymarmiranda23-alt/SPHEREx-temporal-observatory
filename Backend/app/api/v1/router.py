from fastapi import APIRouter
from app.api.v1.endpoints import data, detection, jobs, sky, spectral, temporal

api_router = APIRouter()

api_router.include_router(sky.router, prefix="/sky")
api_router.include_router(temporal.router, prefix="/temporal")
api_router.include_router(spectral.router, prefix="/spectral")
api_router.include_router(detection.router, prefix="/detection")
api_router.include_router(jobs.router, prefix="/jobs")
api_router.include_router(data.router, prefix="/data")