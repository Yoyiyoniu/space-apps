# Tasks

## 1. Paquete de lecturas

- [x] 1.1 Declarar en `src/features/explorer/lib/science.ts` las frases fijas `ASSISTANT_COPY` (`outside`, `unverified`, `unavailable`, `failed`) junto a `NO_DATA_NOTE` y `SYNTHETIC_NOTE`. Verificar con `bun run test src/features/explorer/lib/science.test.ts` que esas cuatro frases existen y que el test de fichas sigue pasando
- [x] 1.2 Agregar `src/features/explorer/lib/readingPacket.ts`, función pura que arma `{ id, kind, text }` solo con las cadenas que ya devuelven `science.ts`, `METHOD_SECTIONS`, `AGRI_COPY`, la zona agrícola elegida, los eventos y los puntos. No lee archivos ni formatea un número nuevo. Verificar con Vitest: con sonda y fuente `synthetic` el registro de desplazamiento incluye el valor ya formateado y `SYNTHETIC_NOTE`; sin sonda no hay cifra de celda; una celda sin dato usa `NO_DATA_NOTE` y no un cero; la sección de Cerro Prieto queda `kind: hypothesis`; las variantes de cultivo quedan `kind: illustrative` y el paquete incluye `AGRI_COPY.coverage`

## 2. Verificador

- [x] 2.1 Agregar `src/features/explorer/lib/answerCheck.ts`. Acepta un borrador solo si cada número con signo, decimal y fecha `YYYY-MM-DD` aparece en algún registro. Verificar con Vitest que un desplazamiento copiado del paquete pasa y que un centímetro ausente se rechaza
- [x] 2.2 Cubrir las etiquetas en el mismo test: un número de un registro `synthetic` sin `SYNTHETIC_NOTE` se rechaza; un nombre de `CROP_VARIANTS` sin `AGRI_COPY.coverage` se rechaza; el cuerpo de la hipótesis de Cerro Prieto sin la palabra «Hipótesis» se rechaza; el texto de una respuesta anterior no cuenta como registro. Verificar con `bun run test src/features/explorer/lib/answerCheck.test.ts`

## 3. Llamada al modelo

- [x] 3.1 Añadir `@aws-sdk/client-bedrock-runtime`. Verificar que `bun install` termina y que `package.json` lo lista
- [x] 3.2 Extraer la decisión de la llamada (sin `AWS_REGION` ni `AWS_DEFAULT_REGION` → `unavailable` y sin red; error de credenciales → `unavailable`; borrador rechazado → `unverified`; otra excepción → `failed`; borrador aceptado → `answer` con las citas). El modelo es `mistral.mistral-large-3-675b-instruct` con `maxTokens` 1024. Verificar con Vitest esos estados y que el texto de los fallos es la frase de `ASSISTANT_COPY`, no el borrador
- [x] 3.3 Envolver esa función en `createServerFn({ method: 'POST' })` con validador Zod (pregunta de hasta 500 caracteres, hasta 80 registros de 2 000, hasta 6 turnos previos). Llamar a Bedrock Converse solo dentro del handler, con la región del entorno y la cadena de credenciales por defecto. Verificar con `rg` que `ui/` y `Explorer.tsx` no mencionan `AWS_BEARER_TOKEN_BEDROCK`, `AWS_SECRET_ACCESS_KEY` ni `VITE_`, y que el validador rechaza una pregunta vacía o un paquete más grande que el tope

## 4. Barra del chat

- [x] 4.1 Extraer el estado del hilo (plegado, turno en curso, respuesta aceptada, rechazada, sin clave, error) a una función pura. Verificar con Vitest que un envío mientras hay una petición en curso se ignora, que la respuesta no llama acciones del mapa y que cada estado muestra o la respuesta chequeada o la frase fija, nunca el borrador rechazado
- [x] 4.2 Montar `ui/MeasurementChat.tsx` en la columna inferior de `Explorer.tsx`, encima de `DateTitle` y `Timeline`. Plegado es una sola fila con `input` o `textarea` y enviar; abierto, el hilo crece hacia arriba con tope cercano a 40dvh y scroll propio. Verificar en el navegador, en `/`, que la barra sale plegada, que al abrirla la línea de tiempo y los ocho menús siguen usándose, que escribir no mueve la nave, y que sin clave la respuesta visible es `ASSISTANT_COPY.unavailable`

## 5. Integración

- [ ] 5.1 Correr `bun run test` y `bun run check` y verificar que ambos terminan sin errores
