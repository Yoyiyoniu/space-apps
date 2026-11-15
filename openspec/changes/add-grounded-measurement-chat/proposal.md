# Proposal

## Why

Las fichas de la barra dicen la medición, la unidad y la fuente, pero solo si la persona abre el menú correcto y ya sabe qué preguntar. Un chat al pie del visualizador deja preguntar en lenguaje natural sobre el Valle de Mexicali y recibir la misma lectura, con la cita, sin inventar un centímetro ni una causa que el dato publicado no trae.

## What Changes

- Un chat plegable al pie del visualizador, encima de la línea de tiempo cuando está abierto y reducido a una barra cuando está cerrado. Los ocho menús (Medición, Capas, Punto, Cultivos, Eventos, Método, Procedencia, Escena), la línea de tiempo y la nave siguen donde están. No es un noveno menú, ni un panel al lado, ni una ruta aparte.
- Cada respuesta sale de un paquete armado con lo que la app ya declara para la región, la fecha y el punto activos: manifiesto (capa, unidad, escala, sin dato, fechas, `source`, créditos), fichas de `science.ts`, textos de método y de cultivos, lectura de la sonda, eventos y textos de los puntos de interés. No consulta APIs de la NASA en vivo ni papers que no estén ya copiados en ese paquete.
- Toda cifra, unidad, fecha y causa de la respuesta tiene que aparecer en el paquete y llevar la fuente. Si el paquete no la tiene, la respuesta lo dice y no la completa con conocimiento general.
- La fuente que se nombra es la del manifiesto. Hoy el cubo `subsidence` está marcado `synthetic` («Datos sintéticos de desarrollo. No son mediciones NISAR.»). El chat no puede llamar a esa lectura una medición NISAR. Cuando el pipeline publique `source: nisar` o `sentinel-1`, la cita cambia con el manifiesto, sin otro texto.
- La hipótesis de Cerro Prieto, las variantes de cultivo y la exageración del relieve (×3) y del hundimiento (×2000) se repiten solo con la etiqueta que ya tienen: hipótesis, peso ilustrativo o dibujo. No se presentan como la medición de la celda.
- El modelo corre en el servidor. La clave no llega al navegador. Sin clave, el chat dice que no puede responder y no improvisa una lectura.
- **Fuera de alcance:** descargas nuevas, capas nuevas, cambiar el esquema del manifiesto, misiones, catálogos, narrativa de viaje, y apagar cultivos, la máscara verde o la deformación fija.

## Capabilities

### New Capabilities

- `grounded-measurement-chat`: chat al pie del visualizador que responde solo con el paquete de lecturas ya declaradas, cita la fuente real y se niega a inventar lo que ese paquete no contiene.

### Modified Capabilities

- Ninguna. `openspec list --specs` no tiene capacidades archivadas. Los changes en curso no cambian de requisito por este chat.

## Impact

- Interfaz: un componente nuevo montado desde `Explorer.tsx`, en la columna inferior del HUD, sin tocar la escena WebGL.
- Lecturas: un módulo puro que arma el paquete y otro que rechaza una respuesta cuyas cifras no están en ese paquete. Los textos siguen declarándose en `science.ts`, `AGRI_COPY` y `Overlays.tsx`; el chat no calcula una lectura en el JSX.
- Servidor: una función de TanStack Start que llama al modelo. Nueva variable de entorno en `src/env.ts`, solo de servidor.
- Pruebas: el paquete y el verificador, incluidos el caso sintético, el sin dato y la pregunta que el paquete no cubre.
- Sin cambio en `public/data/**`, en el pipeline ni en `schemaVersion`.
