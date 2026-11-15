# Design

## Context

See proposal.md for why and `specs/grounded-measurement-chat/spec.md` for the required behavior. The visualizer already formats every reading in `lib/science.ts` (`layerScience`, `cellScience`, `measurementScience`, `agriZoneScience`), copies method text in `METHOD_SECTIONS` (`ui/Overlays.tsx`), and copies crop limits in `AGRI_COPY` (`lib/agriculture.ts`). `Explorer.tsx` holds those values for the active region, date, and probe, and paints them in the eight menus. The HUD is a column: title and menus on top, a flexible gap, then the timeline at the bottom. The route `/` is client-only (`ssr: false`). There is no model call today. `useKeyboard` already ignores keys while an `input` or `textarea` has focus. The displacement cube in the current manifest is `source: synthetic`, and `events.json` repeats that source on its own figures. `src/env.ts` validates `import.meta.env` and is not imported yet; a non-`VITE_` secret placed there would not be a server-only key.

## Goals / Non-Goals

**Goals:**

- One packet, built from the strings the menus already show, sent with the question.
- A server function that calls an OpenAI-compatible chat model and returns only text that a pure checker accepted.
- A bar above the timeline that does not take WASD, the date, or the layer.

**Non-Goals:**

- Re-decoding `.bin` cubes on the server, or trusting a second fetch path.
- Letting the model pick a layer, a date, or a camera target.
- Choosing a vendor-locked SDK feature that only one host implements. The endpoint stays configurable.

## Decisions

### 1. The packet is the same strings the menus already render

Add `lib/readingPacket.ts`, a pure function. `Explorer` passes in the records it already computed: layer fichas, the probe's `measurementScience`, one `cellScience` per loaded layer at that cell, `METHOD_SECTIONS`, `AGRI_COPY`, the selected agricultural zone if any, events, and place descriptions. Each record is `{ id, kind, text }`. `kind` is `measurement`, `method`, `hypothesis`, `illustrative`, `event`, or `place`.

The function does not read files and does not format a new number. Empty probe, loading, failure, and no-data stay the sentences `science.ts` already returns. Cap the packet at the records of one region, not the grid.

Alternative: the server reads `public/data` and samples the cube. Rejected. It would duplicate `queries.ts` and could disagree with the cell the person is looking at.

### 2. The checker rejects the draft before the person sees it

Add `lib/answerCheck.ts`. It sees the packet and the draft, never the model.

- Every signed number, decimal, and `YYYY-MM-DD` date in the draft must occur as text in some record.
- If the draft names a crop variant from `CROP_VARIANTS`, it must also contain the coverage sentence in `AGRI_COPY`.
- If the draft uses the Cerro Prieto cause (the hypothesis body), it must contain the word «Hipótesis».
- If the draft states a number from a record whose layer or event source is synthetic, it must contain `SYNTHETIC_NOTE`.
- Otherwise the draft is dropped. The client shows `ASSISTANT_COPY.unverified`, a fixed sentence declared in `science.ts` next to `NO_DATA_NOTE` and `SYNTHETIC_NOTE`. The same file holds `ASSISTANT_COPY.outside`, `unavailable`, and `failed`. The chat component only prints those fields or a checked answer.

Prior turns are dialogue, not records. The checker never treats an earlier answer as a source, so a number invented once cannot authorize itself later.

Alternative: trust the model's citations. Rejected. A citation can name a record and still invent the figure.

### 3. The model is Mistral Large 3 on Amazon Bedrock

Add `server/ask.ts` with `createServerFn({ method: 'POST' }).validator(...).handler(...)` from `@tanstack/react-start`. The validator is a Zod object: the question (trimmed, max 500 characters), the packet (max 80 records, each text max 2 000 characters), and up to 6 prior turns.

The handler calls Amazon Bedrock Runtime `Converse` through `@aws-sdk/client-bedrock-runtime`. The model id is fixed: `mistral.mistral-large-3-675b-instruct`. That model has no geo or global inference profile, so the id is the in-region id and the client region is `AWS_REGION` or `AWS_DEFAULT_REGION`. `maxTokens` is 1024 and temperature is 0. Credentials stay on the default AWS chain, including `AWS_BEARER_TOKEN_BEDROCK`. The chat component does not read them and there is no `VITE_` variable.

The system prompt is Spanish and says: use only the records, cite `id`, repeat a hypothesis or an illustrative weight with its label, and if the fact is missing reply with `ASSISTANT_COPY.outside` and no figure. Ask for JSON `{ answer, citations }`. Run `answerCheck` on `answer`. Return `{ status: 'answer', text, citations }` or `{ status: 'unverified' | 'unavailable' | 'failed', text }` where `text` is the fixed sentence.

No region returns `unavailable` and does not call the network. A credentials error from the SDK does the same. Any other thrown request returns `failed`.

Alternative: an OpenAI-compatible proxy. Rejected. The call is the Bedrock Converse API, which is the unified interface for this model. Alternative: call Bedrock from the browser. Rejected. The credentials would ship in the bundle.

### 4. The bar sits above the timeline and holds no map state

Add `ui/MeasurementChat.tsx` and mount it in the bottom column of `Explorer.tsx`, above `DateTitle` / `Timeline`. Collapsed it is one row: a text field and a send button. Expanded, the thread grows upward with `max-h` about 40dvh and scrolls inside itself, so the timeline stays on screen. The field is an `input` or `textarea`, which the existing `isTyping` guard already excludes from flight.

Messages live in component state. Submit does not call `store.actions`. While a request is in flight, ignore a second submit.

Alternative: a ninth science menu. Rejected. A conversation is not a ficha, and the spec keeps the eight menus in place.

## Risks / Trade-offs

- [A modified client can send a fake packet whose numbers the checker will accept] → The guarantee is for the app as shipped. The server still refuses numbers that are not in the packet it received, and it never reads a secret from the client. Re-parsing cubes on the server is the rejected alternative in decision 1.
- [A short token such as `cm` or `2021` appears in more than one record, so the checker cannot prove which record a number belongs to] → The prompt requires the unit and the record id beside the value. The checker still blocks any number the packet does not contain, which is the failure the spec names.
- [The model paraphrases a cause without the hypothesis wording, and the word list misses it] → The cause rule covers the hypothesis body that is already declared. A new cause with a new number fails the number check. A new cause with no number is the remaining gap; the prompt forbids it, and the fixed refusal replaces a draft that fails a rule we can test.
- [Provider outage or an empty key] → The person sees `failed` or `unavailable`, never a composed measurement.
- [The packet omits a layer that is still loading] → The record uses the loading sentence from `cellScience`. The checker will not accept a centimeter for that layer until the sentence is a real reading.

## Migration Plan

1. Add `@aws-sdk/client-bedrock-runtime`. On the server set `AWS_REGION` to a region where Mistral Large 3 is in-region (`us-east-1`, `us-east-2`, `us-west-2`, `ap-northeast-1`, `ap-south-1`, `ap-southeast-2`, or `sa-east-1`) and give the process the default AWS credential chain or `AWS_BEARER_TOKEN_BEDROCK`.
2. Ship the packet, the checker, and the bar behind the same change. With no region or no credentials, the bar still renders and answers `unavailable`.
3. Rollback is removing the bar and the server function. No manifest, cube, or store field changes.

## Open Questions

None. The model id stays in `MODEL_NAME` so this design does not freeze a vendor model.
