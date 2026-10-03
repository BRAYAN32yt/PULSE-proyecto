# AGENTS.md

Repo-specific guidance for agents working on **WorldPulse 3D**.

## What this is

An interactive 3D Earth (Three.js) that visualises geolocated news down to
administrative divisions and cities. npm workspaces monorepo:

- `frontend/` — Vite + TypeScript + Three.js (vanilla, no UI framework).
- `backend/` — Express + TypeScript (CommonJS), REST + SSE.
- `data/` — generated Natural Earth geo datasets (checked in, served statically).
- `scripts/` — `build-geo.mjs` generates `data/` from Natural Earth sources.

## Commands (run from repo root)

```bash
npm install                 # install all workspaces
npm run geo:build           # regenerate data/ from Natural Earth (needs network + mapshaper/sharp)
npm run dev                 # backend (:8787) + frontend (:5173) together
npm run build               # typecheck+build both workspaces
npm run build:frontend      # vite build only
npm run typecheck           # tsc both workspaces, no emit
npm test                    # vitest (backend has real tests; frontend passes with none)
```

Backend env lives in `backend/.env` (copy from `backend/.env.example`).
`DEMO_MODE=true` serves clearly-labelled DEMO DATA; no API keys required.

## Conventions

- TypeScript strict; `noUnusedLocals`/`noUnusedParameters` are on. Keep it clean.
- Frontend DOM is built with the `h()` helper (`src/utils/dom.ts`). **Never use
  `innerHTML`** for external content — the codebase is deliberately free of it.
- All user-facing strings go through i18n (`t('key')`). Every key must exist in
  `en.ts`, `es.ts`, `fr.ts`, `pt.ts` (all four are at full parity — keep it that
  way; a quick parity check is a regex scan of `src/i18n/locales/*.ts`).
- Dynamic i18n keys (e.g. `status.${x}`) must be backed by explicit key maps,
  not naive string interpolation (see `PLACE_GROUP_KEYS` in `top-bar.ts`).
- Comments only where intent is non-obvious. No dead code, no duplicated helpers.
- API keys never reach the browser; backend reads them from env.

## Architecture notes

- **Geo data**: `data/countries/index.json`, `data/regions/index.json`,
  `data/cities/index.json` are the in-memory metadata indexes the backend loads.
  Polygon geometry is NOT bundled in JS — the frontend lazy-loads
  `/geo/countries/borders-<detail>.json` and `/geo/regions/<ISO2>.json` on demand.
- **Location model** is generic: `country → administrative_level_1 →
  administrative_level_2 → city → coordinates`, with `precision` recorded so the
  UI never fakes accuracy.
- **News pipeline** (backend): provider → normalize → dedupe/group (`dedupe.ts`)
  → classify (`classify.ts`) → geolocate (`geolocation/locator.ts`) → cache →
  SSE stream. Providers implement one interface (`backend/src/providers/`).
- **Realtime**: SSE at `/api/stream`; the frontend client uses `apiBase`
  (`VITE_API_BASE_URL`) so cross-origin deployments work.
- **Perf**: perf-tier detection downgrades texture/particle/border detail on weak
  devices; markers are clustered in a Web Worker; `reduceMotion` disables
  auto-rotation, pulsing and camera easing.

## Testing

- Backend tests: `backend/src/**/*.test.ts` (pure logic — geo utils, dedupe,
  classify). Run with `npm test`. Vitest config lives in `backend/`.
- Frontend has no tests; `npm test --workspace frontend` is
  `vitest run --passWithNoTests`. The vite geo plugin is disabled in `test` mode
  (guarded by `apply`) so it doesn't write stray folders during tests.

## Gotchas

- `frontend/vite.config.ts` copies `data/` into `dist/geo` on build; that plugin
  is skipped in test mode.
- Vite dev proxies `/api` → `http://localhost:8787` to avoid CORS in dev.
- Production: frontend is static (Vercel/Netlify/CF Pages); backend needs a real
  Node host — a static host cannot run the API. See README "Deployment".
