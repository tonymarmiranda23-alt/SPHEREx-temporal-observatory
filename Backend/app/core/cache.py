import logging
import time
from typing import Dict, Optional, Tuple
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger("SPHEREx-Cache")


class CacheManager:
  """Cliente Redis asíncrono (Upstash/Local) con fallback automático a diccionario en memoria."""

  def __init__(self):
    self.client: Optional[aioredis.Redis] = None
    self._memory_fallback: Dict[str, Tuple[str, float]] = {}

  async def connect(self):
    try:
      if settings.REDIS_URL:
        self.client = aioredis.from_url(
            settings.REDIS_URL, decode_responses=True
        )
      else:
        self.client = aioredis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=settings.REDIS_DB,
            decode_responses=True,
        )
      await self.client.ping()
      logger.info("Conexión exitosa con Redis.")
    except Exception as e:
      logger.warning(
          f"Redis no disponible ({e}). Usando caché en memoria RAM como"
          " fallback."
      )
      self.client = None

  async def close(self):
    if self.client:
      await self.client.close()

  async def get(self, key: str) -> Optional[str]:
    if self.client:
      try:
        return await self.client.get(key)
      except Exception:
        pass

    # Fallback en memoria
    item = self._memory_fallback.get(key)
    if item:
      val, expires_at = item
      if time.time() < expires_at:
        return val
      del self._memory_fallback[key]
    return None

  async def set(self, key: str, value: str, expire_seconds: int = 3600):
    if self.client:
      try:
        await self.client.set(key, value, ex=expire_seconds)
        return
      except Exception:
        pass

    self._memory_fallback[key] = (value, time.time() + expire_seconds)


redis_cache = CacheManager()