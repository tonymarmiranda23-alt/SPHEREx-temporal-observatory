# Frontend

Aplicación React 19 + TypeScript + Vite.

Desde esta carpeta:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

El servidor de desarrollo utiliza el puerto 8443 definido en `vite.config.ts`.

Comprobaciones:

```bash
pnpm typecheck
pnpm build
pnpm preview
```

La configuración `.figma/` se conserva porque `vite.config.ts` la importa durante el arranque y la compilación.

## Comunicación con el Backend

Crea `.env` desde `.env.example` antes de iniciar Vite:

```env
VITE_API_URL=http://localhost:8000
```

La capa Fetch centralizada y los servicios por dominio viven en `src/api/`. Los paneles **Datos del Backend** de los módulos informan carga, errores y ausencia de resultados. La aplicación consume:

- Sky: `GET /api/v1/sky/regions/featured` y `GET /api/v1/sky/observations`.
- Temporal Vision: `POST /api/v1/jobs/temporal`, seguido de polling `GET /api/v1/jobs/{job_id}`.
- Spectral Analysis: `GET /api/v1/spectral/profile`.
- Object Detection: el pipeline temporal; no existe ruta independiente de detección.
- Discovery Catalog: `GET /api/v1/detection/discoveries` y `GET /api/v1/detection/discoveries/{candidate_code}`.

Los PNG temporales son vistas renderizadas del procesamiento FITS del Backend. No existe una ruta API para transmitir los MEF FITS originales al navegador. Los datos previos del prototipo permanecen identificados como ilustrativos; el score experimental C no es una probabilidad calibrada. Consulta el README raíz para CORS, límites de FOV e instrucciones de ejecución.
