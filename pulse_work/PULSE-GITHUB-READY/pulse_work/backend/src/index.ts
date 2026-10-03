import http from 'node:http';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import { config } from './config';
import { createApiRouter } from './api/routes';
import { RealtimeHub } from './api/realtime';
import { getNewsService } from './news/news-service';
import { getGeoIndex } from './geolocation/geo-index';

/**
 * WorldPulse 3D backend entrypoint.
 *
 * Responsibilities: aggregate news, normalize, deduplicate, classify,
 * geolocate, cache and push realtime updates. API keys stay server-side.
 */
async function main(): Promise<void> {
  // Warm the geo index (loads metadata only; polygon data stays client-side).
  getGeoIndex();

  const service = getNewsService();
  const hub = new RealtimeHub(service);
  await service.start();

  const app = express();
  app.disable('x-powered-by');
  app.use(compression());
  app.use(cors({
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
  }));
  app.use(express.json({ limit: '64kb' }));

  // Minimal, dependency-free security headers.
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', demo: service.usingDemo, lastUpdated: service.lastUpdate.toISOString() });
  });

  app.use('/api', createApiRouter(service, hub));

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

  // Central error handler: never crash on a bad request or provider hiccup.
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[http] unhandled error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
  });

  const server = http.createServer(app);
  server.listen(config.port, config.host, () => {
    console.log(`\n  WorldPulse 3D API`);
    console.log(`  → http://localhost:${config.port}`);
    console.log(`  mode: ${config.demoMode ? 'DEMO (clearly-labelled sample data)' : 'LIVE'}`);
    console.log(`  providers: ${service.providerInfo.map((p) => `${p.id}${p.origin === 'demo' ? '*' : ''}`).join(', ')}`);
    console.log(`  refresh: every ${config.refreshIntervalMs / 1000}s (provider-dependent)\n`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n[server] ${signal} received, shutting down`);
    service.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] fatal startup error:', err);
  process.exit(1);
});
