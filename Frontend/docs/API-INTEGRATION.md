# Contrato de integración Frontend–Backend

El API está montado bajo `/api/v1` por FastAPI. Las respuestas y errores siguientes reflejan las rutas y servicios que existen en este repositorio. Salvo los schemas Pydantic declarados, las rutas actuales no tienen `response_model` explícito; los tipos de respuesta documentados describen sus diccionarios/listas retornados.

## Inventario de endpoints

| Método y ruta completa | Entrada | Respuesta esperada | Códigos/errores | Servicio interno y consumidor |
|---|---|---|---|---|
| `GET /health` | Sin parámetros | `200 {"status":"online","release":string}` | El endpoint no declara errores de aplicación. | Comprobación ligera definida en `main.py`; el Frontend no la usa para no confundir disponibilidad HTTP con disponibilidad de los servicios científicos. |
| `GET /api/v1/sky/regions/featured` | Sin parámetros | `200` lista de `{region_id,name,ra,dec,fov_deg,description,recommended_epochs[]}` | Fallos no controlados llegarían al handler global como `500`. | Regiones precargadas en `sky.py`; Sky Explorer. No son resultados de consulta dinámica. |
| `GET /api/v1/sky/observations` | Query requerida `ra` 0–360, `dec` −90–90; `fov_deg` opcional 0.01–0.5 (default 0.08) | `200 {status,ra,dec,fov_deg,total_found,observations[]}`. Cada observación expone `plane_id`, `obs_id`, `collection`, `t_min`, `t_max`, límites de longitud de onda (µm) y `base_uri`. | `422` parámetros inválidos; `502` fallo de consulta TAP/IRSA. | Cache Redis/memoria e `IRSAClient.query_spherex_observations`; Sky Explorer y selección de épocas para Temporal Vision/Object Detection. |
| `POST /api/v1/temporal/compare` | JSON `SkyQueryRequest`: `ra`, `dec`, `fov_deg` (default 0.08), `band_index` (default 0, rango 0–101), `epoch_t1`, `epoch_t2` | `200 TemporalAnalysisResponse`: estado, coordenadas, tres URLs PNG, candidatos tipados y métricas. | `422` payload inválido; el wrapper convierte fallos del pipeline a `400`. | `execute_temporal_pipeline`: consulta IRSA, descarga FITS, limpia FLAGS, alinea WCS y varianzas, calcula diferencia Z, detecta y persiste candidatos, renderiza PNG. No lo consume el Frontend; usa el endpoint asíncrono equivalente para evitar bloquear HTTP. |
| `POST /api/v1/jobs/temporal` | El mismo `SkyQueryRequest` | `200 {"job_id":string,"status":"queued"}` | `422` payload inválido; errores del trabajo se devuelven en el estado del job. | Encola `execute_temporal_pipeline` en `BackgroundTasks`; Temporal Vision y Object Detection. |
| `GET /api/v1/jobs/{job_id}` | Path `job_id` UUID como texto | `200 {job_id,status,step,result,error}`; estado `queued`, `processing`, `completed` o `failed`; `result` contiene `TemporalAnalysisResponse` al completar. | `404` job inexistente (incluye reinicio del proceso); un job fallido responde `200` con `status="failed"` y `error`. | `JOBS_STORE` en memoria; polling del servicio temporal del Frontend. |
| `GET /api/v1/spectral/profile` | Query requerida `ra` 0–360, `dec` −90–90; `fov_deg` opcional 0.01–0.2 (default 0.05) | `200 {status,ra,dec,total_channels_measured,measurement_type,spectrum[],failed_observations[]}`. Cada punto conserva `wavelength_um`, `flux_mjy_sr`, `flux_error_mjy_sr`, `flag`, `obs_id`, `t_min`; `status` es `partial` si alguna observación no se descarga o extrae, y el elemento fallido solo expone `obs_id` y `reason`. | `422` query inválida; `404` sin exposiciones; `500` error general de consulta/descarga. El extractor descarta canales inválidos; fallos por observación se registran y devuelven en `failed_observations`. | `IRSAClient` descarga FITS y `FITSProcessor.extract_spectral_profile_from_mef` usa WCS espectral; Spectral Analysis. |
| `GET /api/v1/detection/discoveries` | Query `limit` opcional, default 50 | `200` lista de candidatos con código, coordenadas, categoría, `peak_z_score`, épocas, métricas y fecha. | `422` para tipos incompatibles; fallos de base de datos no controlados llegan como `500`. | Consulta SQLAlchemy ordenada por `peak_z_score`; Object Detection y Discovery Catalog. Los registros los crea el pipeline temporal. |
| `GET /api/v1/detection/discoveries/{candidate_code}` | Path `candidate_code` | `200` evidencia del candidato: coordenadas, categoría, `peak_z_score`, épocas, resumen y `is_verified`. | `404` código no encontrado; errores de base de datos pueden resultar en `500`. | Consulta SQLAlchemy; Discovery Catalog. No existe endpoint de revisión/validación persistente. |
| `GET /api/v1/data/fits?module=&validation_status=&limit=&offset=` | Filtros opcionales; `module` debe ser uno de los cinco consumidores; `limit` 1–500; `offset` ≥0 | `200 {dataset_root,generated_at,total,files[]}` con hash, ruta relativa, consumidores, HDUs, metadatos de observación y compatibilidad declarada. | `422` filtro inválido; `503` raíz local no disponible; errores del manifiesto se reportan como `500`. | Manifiesto local `FitsInventory`; cada registro se devuelve una vez y una lista `consumers[]` lo puede asociar a varios módulos. Todos los módulos consultan el inventario filtrado por su propio nombre. |
| `GET /api/v1/data/fits/{file_id}` | Path `file_id` | `200` metadatos detallados por HDU: tipo, forma, unidades, CHECKSUM/DATASUM, WCS y tarjetas de cabecera. | `404` ID no registrado/archivo ausente; `409` hash obsoleto. | `FitsInventory.find`; panel de inventario de los módulos conectados. No se cargan arrays científicos en JSON. |
| `GET /api/v1/data/fits/{file_id}/preview?hdu=` | Path `file_id`, HDU opcional | `200 image/png`, derivado de una imagen 2D validada y rotulado como previsualización, no como FITS original. | `404` archivo no encontrado; `409` hash obsoleto; `422` checksum/HDU no compatible. | Renderizador del backend. La visualización no altera ni reemplaza el archivo original. |
| `GET /api/v1/data/fits/{file_id}/download` | Path `file_id` | `200 application/fits` con bytes originales y encabezado `X-Content-SHA256`. | `404` archivo no registrado/disponible; `409` si el hash cambió desde que se construyó el manifiesto. | Entrega binaria original desde el inventario. |
| `GET /api/v1/data/fits/{file_id}/spectral-profile?ra=&dec=` | `ra` 0–360, `dec` −90–90 | `200` una muestra directa: coordenadas, longitud de onda, flujo, incertidumbre, unidad y bandera. | `404` archivo no disponible; `409` hash obsoleto; `422` faltan extensiones/WCS, posición fuera de imagen o bandera inválida. | `FITSProcessor.extract_spectral_profile_from_mef`, sin interpolar ni combinar canales. Spectral Analysis para productos locales compatibles. |
| `POST /api/v1/jobs/temporal/local` | JSON `{file_id_t1,file_id_t2,ra,dec}` | `200 {job_id,status}`; luego se usa el `GET /api/v1/jobs/{job_id}` existente. | `422` payload inválido; un trabajo fallido queda `status="failed"` con error en el sondeo. | Procesa dos archivos del inventario local y persiste candidatos con IDs fuente. Sólo acepta la misma release DR1/QR3, banda, BUNIT, nivel/versión de calibración, unidad de varianza, PSF compatible y grilla WCS idéntica. |

El endpoint asíncrono remoto declara `band_index`, pero el pipeline actual no aplica ese campo al selector de exposiciones; el Frontend envía el índice según el schema, sin prometer procesamiento de banda por ese valor. La comparación FITS local no acepta ni aplica `band_index` ni `fov_deg`: cada archivo ya es un producto de banda y el servicio corta 150 píxeles alrededor de la coordenada solicitada. Los identificadores de época remotos se seleccionan de la respuesta observacional real.

## Matriz de correspondencia visual

| Módulo de Frontend | Estado |
|---|---|
| Sky Explorer | Conectado a regiones/observaciones IRSA y a los FITS asignados: previsualización, inspección de HDUs/cabeceras y descarga binaria. El mapa celeste y las imágenes de referencia preexistentes siguen siendo ilustrativos; no existe un endpoint de imagen remota con WCS. |
| Temporal Vision | Conectado al job remoto y a comparaciones locales de pares FITS compatibles. El panel muestra PNGs derivados, métricas y candidatos; otros modos de comparación siguen siendo ilustrativos. |
| Spectral Analysis | Conectado a muestras de perfiles remotos en MJy/sr y muestras FITS locales en su unidad BUNIT original; no interpola canales. El cubo/otros visores siguen siendo esquemáticos. |
| Object Detection | No hay ruta separada. Usa el pipeline temporal remoto/local que efectivamente detecta y persiste candidatos; el panel distingue el score experimental C. No soporta controles UI de threshold/sensitivity. |
| Discovery Catalog | Conectado al listado/evidencia de candidatos y al inventario local asignado. La API no expone cambios persistentes de estado de revisión. La lista ilustrativa permanece diferenciada. |

## Inventario FITS local

Coloca los originales una sola vez bajo `Backend/data/raw/spherex/` (puedes conservar subdirectorios por origen/release). El backend inspecciona FITS, MEF, HDUs de imágenes/tablas, checksums declarados, WCS y cabeceras; calcula SHA-256 y marca duplicados byte a byte. El manifiesto conserva rutas relativas. No se deduce la asignación de módulos a partir de carpetas: copia `Backend/fits-consumers.example.json` como `Backend/fits-consumers.json` y asigna una ruta relativa a una lista de consumidores. Un mismo registro puede atender varios módulos; no copies el archivo en carpetas separadas.

Desde `Backend/`, después de copiar/actualizar los FITS, regenera el manifiesto con:

```powershell
python -m app.scripts.build_fits_inventory
```

La API también genera el manifiesto al consultarlo por primera vez si no existe. No vuelve a escanear automáticamente un manifiesto existente: vuelve a ejecutar el comando después de cambiar archivos o asignaciones. Los FITS originales no se modifican. Las previsualizaciones son PNG derivados; la descarga mantiene el FITS binario y sus HDUs/cabeceras.

La comparación local no remuestrea la imagen ni la varianza: sólo procesa pares con el mismo WCS y dimensión, misma banda declarada y metadatos compatibles. Rechaza combinaciones QR2/DR1 o QR2/QR3 (el pipeline admite DR1 y QR3, pero no combina releases), y no iguala PSF. También exige que `VARIANCE.BUNIT` sea dimensionalmente el cuadrado de `IMAGE.BUNIT`. En esta ruta el tamaño del recorte es 150 píxeles; `fov_deg` y `band_index` no se aplican. El inventario puede encontrar archivos que no sean de esta estructura MEF; quedan listados pero no se ofrecen como temporal/spectralmente compatibles. La compatibilidad del inventario es preliminar, y la validación del par vuelve a comprobar los campos antes de procesar.

El perfil local muestra los valores en el `BUNIT` original. El endpoint espectral de IRSA conserva el contrato existente `MJy/sr` y sólo convierte unidades compatibles tras verificar dimensionalmente IMAGE y VARIANCE; incertidumbres con unidades incompatibles se rechazan.

No se encontraron archivos FITS reales ni fixtures en `Backend/data/raw/spherex/` al implementar esta ruta. Las pruebas nuevas generan FITS sintéticos temporales y no deben interpretarse como resultados científicos ni como validación de datos de una release.

## Transporte, errores y despliegue

- `VITE_API_URL` contiene solo el origen público del backend, no secretos. El cliente Fetch aplica timeout, abort, validación de respuesta, deduplicación de GET concurrentes y errores tipados.
- `CORS_ORIGINS` es una lista separada por comas de orígenes exactos. Por defecto incluye `http://localhost:8443` y los puertos anteriores de desarrollo (`5173`, `3000`). No usa regex wildcard.
- Los resultados temporales devuelven PNGs derivados desde `/static`. Para los archivos del inventario existe una ruta de descarga binaria; sus bytes originales no se convierten a JSON.
- La conexión IRSA/Gaia requiere disponibilidad de servicios externos y archivos compatibles. El Backend no debe sustituir esos errores por datos presentados como observaciones reales.
