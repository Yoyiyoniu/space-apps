<!-- intent-skills:start -->
## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:
- Run `bunx --no-install --package @tanstack/intent intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `bunx --no-install --package @tanstack/intent intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->

## Propósito

Visualizador de datos del Valle de Mexicali para el reto NASA Space Apps 2026 «Dancing with the SARs». Muestra, sobre un mapa isométrico, mediciones NISAR ya procesadas de cómo se mueve el suelo. El caso central es el hundimiento alrededor de la geotérmica Cerro Prieto. La nave, el zoom y la línea de tiempo son la forma de recorrer esas mediciones.

No es un explorador ni un juego. No añadas misiones, catálogos ni una narrativa de viaje. El directorio `src/features/explorer/` conserva ese nombre en el código; al hablar del producto di visualizador.

La app no procesa radar. Lee assets estáticos. Cada lectura que se muestra se declara una sola vez, en el módulo puro que la posee, y la interfaz solo la pinta. No se inventan cifras, unidades ni causas.

## Invariantes de la escena

- Con cobertura de suelo cargada, los modelos de cultivo, casa y edificio permanecen puestos. No hay interruptor para apagarlos.
- La máscara verde de suelo de cultivo permanece sobre el terreno (`agriMask` → `uAgriOn` en `Terrain.tsx`).
- El relieve del DEM está exagerado ×3 (`DEFAULT_EXAGGERATION` en `scene/terrainGeometry.ts`). El hundimiento 3D está fijo en ×2000 (`DEFORM_FACTOR` en `store.ts`). Son dos números distintos.
- El tamaño de dibujo de los modelos del mapa es ×1.25 (`MAP_DRAW_SCALE` en `scene/MapModels.tsx`).
- Las lecturas viven en la barra Medición, Capas, Punto, Cultivos, Eventos, Método, Procedencia, Escena. No añadas catálogos ni paneles flotantes al lado.
- Cultivos del menú solo existen en la región `mexicali`. La clase Cultivos (valor 5) es cobertura de 2021: no identifica el cultivo de cada parcela. Las variantes de `CROP_VARIANTS` son pesos ilustrativos, no una medición.
- Las zonas agrícolas (`lib/agriculture.ts`) no son las zonas de hundimiento (`lib/impact.ts`).

## Cómo se declara

Abre el archivo de la fila. No recorras el resto.

| Qué se añade | Dónde se declara | Qué no hacer |
|---|---|---|
| Capa, unidad, escala, sin dato, fechas, fuente, crédito | `pipeline/regions.yaml`, luego el contrato en `pipeline/src/nisar_pipeline/manifest.py` y el espejo `src/features/explorer/manifest.ts` (schema v2). El fixture común es `pipeline/tests/fixtures/manifest.sample.json`. | No editar a mano `public/data/**`. No escribir la cifra en un componente. |
| Texto científico de una lectura ya existente | El record puro en `src/features/explorer/lib/science.ts` y su test `science.test.ts`. El menú en `ui/ScienceMenus.tsx` solo pinta esos campos. | No calcular la lectura dentro de JSX ni en `Explorer.tsx`. |
| Vista nueva del mapa | `MapView` en `store.ts` y la fila en `lib/catalog.ts`. Una vista a la vez. | No crear otro panel de capas. Capas ya es un menú. |
| Modelo sobre la grilla | Posición en `lib/mapModels.ts` (sin Three). Geometría y escala en `scene/MapModels.tsx`. | No mezclar colocación y dibujo. |
| Copia de método o aviso de dato | `ui/Overlays.tsx` (`METHOD_SECTIONS`, `DataNotice`). Método la muestra. | No abrir un diálogo de contexto. |
| Fetch de un asset | `data/queries.ts`. Los binarios son Int16 LE; el tamaño se valida ahí. | No hacer `fetch` desde la escena ni desde un menú. |

Una frase que el usuario lee y que no sale de un record de `science.ts`, de `AGRI_COPY` o de `Overlays.tsx` está en el archivo equivocado.

## Dónde está cada cosa

App

- `src/routes/index.tsx` — ruta `/`. WebGL solo en cliente (`ssr: false`).
- `src/features/explorer/Explorer.tsx` — carga, conecta y compone. No es el lugar de una fórmula.

Datos

- `public/data/manifest.json` — contrato ya generado. Regiones, capas, pois, overlays.
- `public/data/mexicali/` — `terrain.bin`, `*/cube.bin`, `roads.json`, `canals.json`, `rivers.json`, `ejidos.json`, `events.json`.
- `pipeline/README.md` — regenerar. `cd pipeline && uv run pytest`. `uv run nisar-pipeline` (NISAR real) o `--synthetic`.
- `pipeline/src/nisar_pipeline/build.py` — orquesta. `export.py` escribe assets. `extras.py` capas de apoyo. `events.py` eventos. `grid.py` grilla.

Lecturas puras, con test al lado

- `lib/catalog.ts` — temas y vistas a partir del manifiesto.
- `lib/probe.ts` — serie de una celda.
- `lib/stats.ts` — tasa, campo de velocidad, relleno para pintar.
- `lib/impact.ts` — zonas de movimiento y su contexto.
- `lib/agriculture.ts` — zonas de cultivo, humedad, vía de agua, textos `AGRI_COPY`.
- `lib/science.ts` — fichas de los ocho menús.
- `lib/grid.ts` — columna/fila ↔ longitud/latitud.
- `lib/infrastructure.ts` — vías y tramos afectados.
- `lib/water.ts` — máscara de agua.
- `lib/ejidos.ts` — ejidos.
- `lib/friendly.ts` — fechas y tendencias en lenguaje corto.
- `lib/colormap.ts` — rampas. `lib/pick.ts` — toque al terreno.

Estado

- `store.ts` — vista, fecha, sonda, overlays, opacidad, deformación ×2000. Acciones en el mismo archivo.
- `scene/flight.ts` — pose de la nave, mutable y fuera de React. `ProbePublisher` en `Scene.tsx` la publica ~10 Hz.

Escena, solo dibujo

- `scene/Scene.tsx` — qué se monta.
- `scene/Terrain.tsx` y `scene/layerMaterial.ts` — color de capa, agua, máscara verde, ciudad.
- `scene/terrainGeometry.ts` — relieve ×3, `MAP_SCALE`, paso de malla.
- `scene/IsoCamera.tsx` — zoom. `scene/Ship.tsx` — nave. `controls/useKeyboard.ts` — WASD.
- `scene/Infrastructure.tsx` — caminos, canales, ríos. `scene/MotionArrows.tsx` — este-oeste.
- `scene/EjidoOutlines.tsx`, `scene/EjidoMarkers.tsx` — ejidos. `scene/AgriculturalOutline.tsx` — contorno de la zona elegida. `scene/ZoneMarkers.tsx`, `scene/PoiMarkers.tsx` — marcadores.

Interfaz que sí está montada

- `ui/ScienceMenuBar.tsx` — la barra y qué menú está abierto.
- `ui/ScienceMenus.tsx` — cuerpo de cada menú. `ui/ScienceDisclosure.tsx` — filas.
- `ui/TopBar.tsx` — título. `ui/Timeline.tsx` — fecha.
- `ui/EventsList.tsx` — dentro de Eventos.
- `ui/PoiLabels.tsx`, `ui/EjidoLabels.tsx`, `ui/ZoneLabels.tsx` — etiquetas sobre el mapa, no menús.

## No reabrir

Estos archivos no están montados. No los vuelvas a colgar junto a la barra: `ui/LayerPanel.tsx` (salvo `Legend`, `VIEW_HELP` y `Segmented`, que los menús importan), `ModelsPanel.tsx`, `AgriculturePanel.tsx`, `SettingsDialog.tsx`, `MobileDock.tsx`, `ShipStatus.tsx`, `Inspector.tsx`, `PoiList.tsx`, `ParkedModelView.tsx`. `src/features/explorer/story/` no está conectado a la ruta.

`openspec/changes/` es planificación. Si contradice este archivo o el código montado, manda el código.

## Comandos

`bun run dev` (puerto 3000), `bun run test`, `bun run check`.
