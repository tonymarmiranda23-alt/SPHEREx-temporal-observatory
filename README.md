# SPHEREx Temporal Observatory

Plataforma de exploración astronómica con un frontend React/Vite y un backend FastAPI. El proyecto se organiza en dos aplicaciones independientes para facilitar su instalación, ejecución y despliegue.

## 1. Estructura del proyecto

```text
SPHEREx-temporal-observatory/
├── Frontend/
│   ├── public/                 # Recursos estáticos
│   ├── src/
│   │   ├── App.tsx              # Interfaz principal
│   │   ├── fits.ts              # Lectura/decodificación FITS en frontend
│   │   ├── index.css            # Estilos globales
│   │   └── main.tsx             # Punto de entrada React
│   ├── .figma/                  # Configuración utilizada por Figma Make
│   ├── index.html
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   └── vite.config.ts
├── Backend/
│   ├── app/
│   │   ├── api/v1/endpoints/    # Rutas HTTP
│   │   ├── core/                # Configuración, caché y base de datos
│   │   ├── models/              # Modelos SQLAlchemy
│   │   ├── schemas/             # Esquemas Pydantic
│   │   ├── services/            # IRSA, FITS, renderizado y análisis
│   │   └── main.py              # Aplicación FastAPI y ciclo de vida
│   ├── data/
│   │   ├── raw/spherex/        # FITS originales (excluidos de Git)
│   │   └── processed/spherex/  # Manifiesto y productos derivados
│   ├── tests/                  # Pruebas sobre FITS sintéticos temporales
│   ├── fits-consumers.example.json
│   ├── .env.example
│   └── requirements.txt
├── .gitignore
└── README.md
```

Se eliminaron del paquete de entrega las carpetas `node_modules`, bytecode de Python, cachés y archivos de instalación duplicados. Se conservaron los archivos fuente, recursos públicos, configuración de Figma Make y el lockfile de pnpm.

## 2. Requisitos previos

- **Node.js:** 22.12.0 o posterior.
- **pnpm:** 10.34.3 (declarado en `Frontend/package.json`).
- **Python:** 3.11 recomendado.
- **PostgreSQL:** opcional. Si no está disponible, el backend intenta utilizar SQLite local.
- **Redis:** opcional. Si no está disponible, la caché utiliza memoria local.

Las versiones de Python están fijadas en `Backend/requirements.txt`. Se recomienda Python 3.11 para mantener compatibilidad con las versiones fijadas de NumPy, SciPy y Astropy.

## 3. Orden de ejecución

El backend y el frontend se ejecutan en terminales separadas.

### Paso 1 — Instalar y arrancar el backend

Desde la carpeta raíz del proyecto:

**Windows (PowerShell):**

```powershell
cd Backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Linux / macOS:**

```bash
cd Backend
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

La API queda disponible en:

- API: `http://localhost:8000`
- Documentación interactiva: `http://localhost:8000/docs`
- Estado: `http://localhost:8000/health`

El backend crea automáticamente los directorios `data/raw` y `data/processed`. No es necesario crearlos manualmente.

**Importante:** ejecutar Uvicorn desde `Backend/` mantiene consistentes las rutas relativas de `.env`, `data/raw` y `data/processed`.

#### Añadir archivos FITS locales

Coloca los originales una sola vez en `Backend/data/raw/spherex/`, en subcarpetas si lo necesitas. Copia `Backend/fits-consumers.example.json` como `Backend/fits-consumers.json`: cada ruta es relativa a `data/raw/spherex` y puede enumerar varios consumidores. Desde `Backend/`, después de copiar FITS o cambiar las asignaciones, actualiza el manifiesto con:

```powershell
python -m app.scripts.build_fits_inventory
```

El inventario conserva un único registro por archivo físico, su SHA-256, metadatos de HDU/WCS/checksum y sus consumidores. Los originales están excluidos de Git; el backend puede entregar sus bytes originales por HTTP. Las previsualizaciones PNG son productos derivados y no sustituyen los FITS.

### Paso 2 — Instalar y arrancar el frontend

Abre una segunda terminal desde la raíz del proyecto:

```bash
cd Frontend
pnpm install --frozen-lockfile
pnpm dev
```

Vite utiliza el puerto **8443** según la configuración actual del proyecto. Abre:

`http://localhost:8443`

El backend ya permite solicitudes CORS desde ese origen local.
Configura `Frontend/.env` a partir de `.env.example` antes de iniciar Vite; en local puede usarse el valor por defecto.

### Paso 3 — Compilar para producción

Desde `Frontend/`:

```bash
pnpm typecheck
pnpm build
pnpm preview
```

Los archivos compilados se generan en `Frontend/dist/`.

## 4. Variables de entorno del backend

Copia `Backend/.env.example` como `Backend/.env`. Las variables de PostgreSQL y Redis son opcionales.

- `DATABASE_URL`: conexión PostgreSQL completa.
- `POSTGRES_SERVER`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`: alternativa por campos.
- `REDIS_URL`: URL de Redis.
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`: alternativa por campos.
- `PUBLIC_BASE_URL`: URL pública del backend.
- `CORS_ORIGINS`: orígenes frontend exactos, separados por comas; el valor de ejemplo permite `http://localhost:8443`.
- `DATA_RAW_DIR`: carpeta de archivos FITS descargados.
- `DATA_PROCESSED_DIR`: carpeta de imágenes procesadas.
- `SPHEREX_RAW_DIR`, `SPHEREX_PROCESSED_DIR`, `SPHEREX_MANIFEST_PATH`, `SPHEREX_CONSUMERS_PATH`: rutas del inventario y los datos SPHEREx locales.

No agregues credenciales reales al repositorio.

## 5. Flujo de ejecución del backend

1. `app.main` carga la configuración y prepara las carpetas de datos.
2. FastAPI inicia su ciclo de vida: registra los modelos, crea las tablas, prepara índices y conecta Redis (o activa el fallback en memoria).
3. `app.api.v1.router` registra los grupos de endpoints.
4. Los endpoints delegan las operaciones en los servicios de IRSA, FITS, análisis temporal y renderizado.
5. Los resultados gráficos procesados se guardan en `data/processed` y se sirven mediante `/static`.

## 6. Comprobaciones realizadas y alcance

- Se reorganizaron las carpetas para evitar rutas anidadas de exportación.
- Se unificó la instalación del backend en un único `requirements.txt` UTF-8.
- Se conservaron las dependencias del frontend y su `pnpm-lock.yaml`.
- Se añadieron marcadores `__init__.py` para hacer explícitos los paquetes Python.
- Se añadió el puerto local 8443 a los orígenes CORS, ya que es el puerto configurado en Vite.
- Se actualizaron llamadas de Matplotlib/Pillow para evitar APIs obsoletas.
- Se añadieron instrucciones de instalación, ejecución y compilación.

**Datos de desarrollo:** `app/services/irsa_service.py` contiene una ruta explícitamente sintética de generación FITS para desarrollo. No se sustituyó ni se presenta como descarga real de NASA/IRSA.

## 7. Integración Frontend–Backend

El cliente HTTP centralizado en `Frontend/src/api/` usa Fetch nativo, tipa y valida las formas de respuesta esperadas, aplica límites de espera y unifica errores HTTP, conexión y JSON. Las solicitudes de vistas se pueden cancelar al cambiar de contexto; lecturas idénticas simultáneas sin cancelación comparten la misma promesa.

Configura `Frontend/.env` a partir de `Frontend/.env.example`:

```env
VITE_API_URL=http://localhost:8000
```

`VITE_API_URL` es pública por diseño. Nunca pongas credenciales ni secretos en variables `VITE_`. En despliegue configura la URL pública del API para Vite y agrega el origen exacto del sitio a `CORS_ORIGINS` en `Backend/.env`; separa varios orígenes mediante comas. No se permiten comodines ni regex para previews.

### Matriz de módulos y rutas existentes

| Módulo | Endpoint(s) consumidos | Correspondencia |
|---|---|---|
| Sky Explorer | `GET /api/v1/sky/regions/featured`; `GET /api/v1/sky/observations?ra=&dec=&fov_deg=` | Regiones precargadas y metadatos de observaciones consultadas en IRSA. |
| Temporal Vision | `POST /api/v1/jobs/temporal`; `GET /api/v1/jobs/{job_id}` | Ejecuta el pipeline WCS/FITS/diferencias Z y presenta imágenes PNG derivadas, candidatos y métricas. |
| Spectral Analysis | `GET /api/v1/spectral/profile?ra=&dec=&fov_deg=` | Presenta las muestras extraídas, longitudes de onda, flujo, incertidumbre y observación. |
| Object Detection | `POST /api/v1/jobs/temporal`; `GET /api/v1/jobs/{job_id}` | El pipeline temporal incluye detección; no existe un endpoint independiente de detección. |
| Discovery Catalog | `GET /api/v1/detection/discoveries?limit=`; `GET /api/v1/detection/discoveries/{candidate_code}` | Lista y consulta evidencia de candidatos persistidos por el pipeline. |

`GET /health` existe, pero el estado de conexión de la interfaz se comprueba llamando a un servicio real (`/sky/regions/featured`). No existe endpoint de transferencia FITS al navegador: el backend descarga y procesa los MEF FITS y entrega PNGs renderizados como vistas previas. Los FITS originales no se convierten indiscriminadamente a JSON.

Las pantallas/controladores previos se conservan y mantienen rotulación ilustrativa. Los paneles identificados como **Datos del Backend** muestran solo respuestas reales; el score C del pipeline es experimental, no una probabilidad calibrada. El Backend no ofrece validación persistente de candidatos, imágenes calibradas para Sky Explorer ni un endpoint independiente de detección.

El inventario detallado de métodos, parámetros, respuesta, errores, servicio interno y estado por módulo está en [Frontend/docs/API-INTEGRATION.md](./Frontend/docs/API-INTEGRATION.md).

### Ejecutar y verificar

1. Inicia el Backend desde `Backend/` en `http://localhost:8000` según el paso 1.
2. Crea `Frontend/.env`, instala con `pnpm install --frozen-lockfile` y ejecuta `pnpm typecheck`, `pnpm build` y `pnpm dev` desde `Frontend/`.
3. Abre `http://localhost:8443`. En Sky Explorer consulta las observaciones para las coordenadas actuales o selecciona una región del Backend. Temporal Vision necesita dos observaciones consultables; Spectral Analysis acepta FOV de `0.01°` a `0.2°`.
4. Comprueba **Backend connected** y los estados de carga/error/vacío en cada módulo. El acceso a NASA/IPAC es externo y se requiere para disponer de observaciones y completar el procesamiento.

Los jobs se guardan en memoria y se pierden al reiniciar el Backend. Los candidatos dependen de la base de datos configurada y no representan descubrimientos validados.

La comparación local exige productos compatibles DR1/QR3, una misma banda, unidades, calibración y PSF compatible y una grilla WCS idéntica. No remuestrea la imagen ni la varianza; genera un recorte de 150 píxeles. En esa operación local no se aplican los parámetros `fov_deg` ni `band_index`. La extracción espectral local devuelve una muestra sin interpolación y mantiene el `BUNIT` original; sólo los endpoints espectrales actuales, cuyo contrato expresa MJy/sr, convierten a esa unidad después de validar la unidad de varianza.

Para ejecutar pruebas FITS sintéticas y aisladas, desde `Backend/` instala `pip install -r requirements-test.txt` con Python 3.11 y ejecuta `python -m pytest`. No hay actualmente archivos FITS reales en el workspace; esas pruebas no validan productos de vuelo ni una release científica.
