import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config';
import type { NewsService } from '../news/news-service';
import type { RealtimeHub } from './realtime';
import { getGeoIndex } from '../geolocation/geo-index';
import { getTranslationProvider } from '../services/translation';
import { NEWS_CATEGORIES, type NewsCategory, type NewsQuery } from '../types/domain';

const querySchema = z.object({
  country: z.string().min(2).max(3).optional(),
  region: z.string().min(2).max(24).optional(),
  city: z.string().min(2).max(120).optional(),
  category: z.enum(NEWS_CATEGORIES as [NewsCategory, ...NewsCategory[]]).optional(),
  since: z.string().optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  origin: z.enum(['live', 'demo']).optional(),
});

function parseQuery(req: Request): NewsQuery {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return {};
  return parsed.data as NewsQuery;
}

/**
 * REST API. All endpoints are read-only and safe to expose.
 *   GET /api/news            filtered list of news items
 *   GET /api/news/latest     newest items (polling fallback for SSE)
 *   GET /api/events          grouped events (duplicate stories collapsed)
 *   GET /api/events/:id      one event with all its sources
 *   GET /api/news/:id        a single item
 *   GET /api/countries       country metadata + live counts
 *   GET /api/regions/:cc     regions of a country + live counts
 *   GET /api/regions/:cc/:id cities + counts for a region
 *   GET /api/search?q=       countries/regions/cities/news
 *   GET /api/stats           global dashboard figures
 *   GET /api/status          provider + freshness status
 *   GET /api/stream          SSE realtime channel
 *   POST /api/translate      optional translation (only if provider configured)
 */
export function createApiRouter(service: NewsService, hub: RealtimeHub): Router {
  const router = Router();
  const geo = getGeoIndex();

  router.get('/news', (req, res) => {
    const query = parseQuery(req);
    const { items, total } = service.queryNews(query);
    res.json({ total, count: items.length, items });
  });

  router.get('/news/latest', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const sinceParam = typeof req.query.since === 'string' ? req.query.since : undefined;
    const query: NewsQuery = { limit, since: sinceParam, origin: req.query.origin === 'live' || req.query.origin === 'demo' ? req.query.origin : undefined };
    const { items, total } = service.queryNews(query);
    res.json({ total, count: items.length, lastUpdated: service.lastUpdate.toISOString(), items });
  });

  router.get('/events', (req, res) => {
    const query = parseQuery(req);
    const { events, total } = service.queryEvents(query);
    res.json({ total, count: events.length, events });
  });

  router.get('/events/:id', (req, res) => {
    const event = service.getEvent(req.params.id);
    if (!event) { res.status(404).json({ error: 'event_not_found' }); return; }
    const items = event.itemIds.map((id) => service.getItem(id)).filter(Boolean);
    res.json({ event, items });
  });

  router.get('/news/:id', (req, res) => {
    const item = service.getItem(req.params.id);
    if (!item) { res.status(404).json({ error: 'news_not_found' }); return; }
    res.json({ item });
  });

  router.get('/countries', (_req, res) => {
    const stats = service.stats();
    const counts = new Map(stats.countries.map((c) => [c.id, c.count]));
    const countries = geo.countries.items.map((c) => ({
      id: c.id, iso3: c.iso3, name: c.name, names: c.names,
      continent: c.continent, subregion: c.subregion,
      centroid: c.centroid, bbox: c.bbox, pop: c.pop,
      regionCount: c.regionCount, cityCount: c.cityCount,
      newsCount: counts.get(c.id) ?? 0,
    }));
    res.json({ count: countries.length, countries });
  });

  router.get('/regions/:country', (req, res) => {
    const country = req.params.country.toUpperCase();
    if (!geo.getCountry(country)) { res.status(404).json({ error: 'country_not_found' }); return; }
    const stats = service.stats();
    const counts = new Map(stats.regions.map((r) => [r.id, r.count]));
    const regions = geo.regionsOf(country).map((r) => ({
      id: r.id, country: r.country, name: r.name, names: r.names, type: r.type,
      lat: r.lat, lng: r.lng, newsCount: counts.get(r.id) ?? 0,
    }));
    res.json({ country, count: regions.length, regions });
  });

  router.get('/regions/:country/:region', (req, res) => {
    const region = req.params.region.toUpperCase();
    const record = geo.getRegion(region);
    if (!record) { res.status(404).json({ error: 'region_not_found' }); return; }
    const cities = geo.citiesOfRegion(region).slice(0, 100);
    res.json({ region: { id: record.id, name: record.name, country: record.country, type: record.type }, cities });
  });

  router.get('/search', (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) { res.json({ query: q, places: [], news: [] }); return; }
    const places = geo.search(q, 12);
    const { items } = service.queryNews({ q, limit: 12 });
    res.json({
      query: q,
      places,
      news: items.map((i) => ({
        id: i.id, title: i.title, source: i.source, publishedAt: i.publishedAt,
        category: i.category, location: i.location, url: i.url, origin: i.origin,
      })),
    });
  });

  router.get('/stats', (_req, res) => {
    res.json(service.stats());
  });

  router.get('/status', (_req, res) => {
    res.json({
      demo: service.usingDemo,
      degraded: service.lastFailure !== null,
      lastError: service.lastFailure,
      lastUpdated: service.lastUpdate.toISOString(),
      refreshIntervalMs: config.refreshIntervalMs,
      providers: service.providerInfo,
      realtimeClients: hub.clientCount,
    });
  });

  router.get('/stream', (req, res) => hub.handle(req, res));

  router.post('/translate', async (req: Request, res: Response) => {
    const body = z.object({
      text: z.string().max(5000),
      target: z.string().min(2).max(8),
      source: z.string().min(2).max(8).optional(),
    }).safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: 'invalid_request' }); return; }
    const provider = getTranslationProvider();
    if (!provider.isEnabled()) {
      res.status(501).json({ error: 'translation_not_configured', translatedText: body.data.text });
      return;
    }
    const translatedText = await provider.translate(body.data.text, body.data.target, body.data.source);
    res.json({ translatedText, provider: provider.id });
  });

  return router;
}
