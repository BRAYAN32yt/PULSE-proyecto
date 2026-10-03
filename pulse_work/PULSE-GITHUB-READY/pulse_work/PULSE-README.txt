PULSE — complete project

This archive contains the complete PULSE workspace: frontend, backend, geographic data, textures, demo news pipeline, realtime SSE/polling fallback, administrative drill-down, cities, 3D globe, performance tiering, i18n, PWA shell and deployment configuration.

Quick start (Node 20+):
  npm ci
  npm run dev

Frontend: http://localhost:5173
Backend:  http://localhost:8787

Demo mode is enabled by default. Real news providers are configured server-side through backend/.env; never put API keys in frontend code.

Production:
  npm run build

The static frontend can be deployed to Netlify/Vercel/Cloudflare Pages. The Node backend must run on a Node-capable host.
