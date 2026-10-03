# WorldPulse 3D — Architecture notes

This document goes a level deeper than the README: how data flows, how the
globe stays fast, and where to extend things.

## 1. Request / data flow

```
                 ┌───────────────────────────────────────────────┐
                 │                  Backend                      │
                 │                                               │
  providers ──▶  normalize ──▶ dedupe ──▶ classify ──▶ geolocate │
  (live/demo)     (Zod)        (eventId)  (category)   (locator)  │
                 │        │                                      │
                 │        ▼                                      │
                 │   TTL cache ──▶ NewsService ──▶ RealtimeHub   │
                 └───────────────┬───────────────────┬──────────┘
                                 │ REST              │ SSE
                                 ▼                   ▼
                 ┌───────────────────────────────────────────────┐
                 │                  Frontend                     │
                 │  api/client ──▶ app store ──▶ components      │
                 │  api/realtime ─┘        │                     │
                 │                         ▼                     │
                 │              Globe (markers, clusters,        │
                 │              borders, regions)                │
                 └───────────────────────────────────────────────┘
```

Key files:

| Stage | File |
| --- | --- |
| Fetch | `backend/src/providers/*` |
| Normalise | `backend/src/news/news-service.ts` |
| Dedupe / event grouping | `backend/src/news/dedupe.ts` |
| Classify | `backend/src/news/classify.ts` |
| Geolocate | `backend/src/geolocation/locator.ts` + `geo-index.ts` |
| Cache | `backend/src/cache/ttl-cache.ts` |
| Push | `backend/src/api/realtime.ts` |

## 2. Location model

Precision is explicit and never faked:

- `city` — we have coordinates and/or a resolved city.
- `admin1` — only the region is known; the story is shown at region level.
- `country` — only the country is known; shown at country level.
- `unknown` — no location; shown in the global dashboard only.

The `locator` resolves free text / provider hints against the geo index
(country names & aliases → admin-1 names → city names) using stable IDs
(`MX`, `MX-TAM`, …).

## 3. Globe performance

- **LOD by distance**: `borders-low` (110m) when zoomed out, `borders-mid`
  (50m) when closer; admin-1 polygons load per country on selection.
- **Texture tiers**: 1k / 2k / 4k chosen from the device performance tier.
- **Clustering in a Web Worker** (`frontend/src/workers/cluster.worker.ts`),
  re-run (debounced) as the camera moves; recent items pulse.
- **Marker instancing** and frustum culling keep draw calls low.
- **Code splitting**: Three.js is its own chunk; geo data is fetched, never
  bundled.

### Device tiers (`frontend/src/utils/perf.ts`)

The tier is estimated from hardware concurrency, device memory, renderer string
and a short frame-time probe. It controls texture size, star count, border
detail and post effects. Slow devices degrade gracefully instead of stuttering.

## 4. Realtime strategy

SSE is the primary channel. If `EventSource` cannot open within a timeout, or
the host cannot hold long-lived connections, the client switches to polling
`/api/news/latest?since=…`. Both transports emit the same normalised items, so
the UI code does not care which is active.

## 5. Error handling

- A provider throwing is caught per-provider; others continue.
- If all live providers fail, the service flags `degraded: true` and the UI
  shows a non-blocking banner.
- A missing image or unknown category falls back to a safe default.
- `unknown`-location stories appear only in the global dashboard.

## 6. Extension seams

| To add… | Touch |
| --- | --- |
| A news source | `backend/src/providers/` + `providers/index.ts` |
| A translation service | `backend/src/services/translation.ts` |
| A language | `frontend/src/i18n/locales/` + `i18n/index.ts` |
| Geographic levels | `scripts/build-geo.mjs` + `frontend/src/maps/geo-data.ts` |
| A category | `backend/src/types/domain.ts` + `frontend/src/news/categories.ts` |
