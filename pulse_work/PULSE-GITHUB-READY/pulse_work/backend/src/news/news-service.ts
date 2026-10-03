import { EventEmitter } from 'node:events';
import { config } from '../config';
import { createProviders } from '../providers';
import type { NewsProvider, RawNewsItem } from '../providers/types';
import type { DataOrigin, NewsEvent, NewsItem, NewsQuery, RealtimeEvent } from '../types/domain';
import { classify } from '../news/classify';
import { canonicalUrl, deduplicateAndGroup } from '../news/dedupe';
import { getLocator, Locator } from '../geolocation/locator';
import { TtlCache } from '../cache/ttl-cache';
import { normalizeText } from '../utils/geo';

/**
 * NewsService — the aggregation pipeline.
 *
 *   providers -> normalize -> classify -> geolocate -> dedupe/group -> cache
 *            -> store (bounded) -> emit realtime events
 *
 * Providers run in isolation; one failing source never breaks the others, and
 * if every live source fails the service keeps serving its last good snapshot.
 */
export class NewsService extends EventEmitter {
  private readonly providers: NewsProvider[] = createProviders();
  private readonly locator: Locator = getLocator();
  private readonly cache = new TtlCache<unknown>(30_000);
  private items: NewsItem[] = [];
  private events: NewsEvent[] = [];
  private byId = new Map<string, NewsItem>();
  private lastUpdated = new Date(0);
  private lastError: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private refreshing = false;

  get providerInfo(): Array<{ id: string; name: string; origin: DataOrigin; enabled: boolean }> {
    return this.providers.map((p) => ({ id: p.id, name: p.name, origin: p.origin, enabled: p.isEnabled() }));
  }
  get usingDemo(): boolean { return this.items.some((i) => i.origin === 'demo'); }
  get lastUpdate(): Date { return this.lastUpdated; }
  get lastFailure(): string | null { return this.lastError; }

  async start(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => {
      this.refresh().catch((err) => console.warn('[news] refresh failed:', err?.message));
    }, config.refreshIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Fetch from every enabled provider and fold results into the store. */
  async refresh(): Promise<{ added: number; total: number }> {
    if (this.refreshing) return { added: 0, total: this.items.length };
    this.refreshing = true;
    try {
      const since = this.lastUpdated.getTime() > 0
        ? new Date(Date.now() - config.refreshIntervalMs * 2)
        : undefined;

      const settled = await Promise.allSettled(
        this.providers.map(async (provider) => ({ provider, items: await provider.fetchLatest(since) })),
      );

      const raw: RawNewsItem[] = [];
      let failures = 0;
      for (const result of settled) {
        if (result.status === 'fulfilled') raw.push(...result.value.items);
        else failures++;
      }
      this.lastError = failures === settled.length && settled.length > 0
        ? 'All news providers failed'
        : null;

      const existingUrls = new Set(this.items.map((i) => canonicalUrl(i.url)));
      const incoming: NewsItem[] = [];
      for (const item of raw) {
        const normalized = this.normalize(item);
        if (!normalized) continue;
        if (existingUrls.has(canonicalUrl(normalized.url))) continue;
        existingUrls.add(canonicalUrl(normalized.url));
        incoming.push(normalized);
      }

      if (incoming.length) {
        this.items = this.merge(this.items, incoming);
        this.rebuild();
        for (const item of incoming) {
          const event = this.events.find((e) => e.itemIds.includes(item.id));
          this.emit('realtime', {
            type: 'news', at: new Date().toISOString(),
            payload: { item, event: event ?? null },
          } satisfies RealtimeEvent);
        }
      }
      this.lastUpdated = new Date();
      this.cache.clear();
      this.emit('realtime', {
        type: 'status', at: new Date().toISOString(),
        payload: { lastUpdated: this.lastUpdated.toISOString(), total: this.items.length, demo: this.usingDemo, degraded: this.lastError !== null },
      } satisfies RealtimeEvent);

      console.log(`[news] refresh: +${incoming.length} (total ${this.items.length})` +
        (this.lastError ? ` — ${this.lastError}` : ''));
      return { added: incoming.length, total: this.items.length };
    } finally {
      this.refreshing = false;
    }
  }

  private normalize(raw: RawNewsItem): NewsItem | null {
    if (!raw.title || !raw.url) return null;
    const publishedAt = Number.isNaN(new Date(raw.publishedAt).getTime())
      ? new Date().toISOString() : raw.publishedAt;

    const location = this.locator.locate({
      country: raw.country,
      administrativeLevel1: raw.region,
      city: raw.city,
      latitude: raw.latitude,
      longitude: raw.longitude,
      text: raw.locationText,
    });

    const category = classify(raw.title, raw.description, raw.categoryHint ?? undefined);
    const origin: DataOrigin = raw.origin ?? 'live';
    const status = origin === 'demo' ? 'source-available'
      : location.precision === 'city' || location.precision === 'admin1' ? 'source-available'
        : location.precision === 'unknown' ? 'imprecise-location' : 'source-available';

    return {
      id: hashId(`${raw.sourceId}|${canonicalUrl(raw.url)}`),
      title: raw.title.slice(0, 300),
      description: (raw.description || '').slice(0, 800),
      url: raw.url,
      source: raw.source,
      sourceId: raw.sourceId,
      publishedAt,
      image: raw.image ?? null,
      language: (raw.language || 'en').slice(0, 8),
      originalLanguage: (raw.language || 'en').slice(0, 8),
      category,
      location,
      status,
      origin,
      eventId: '',
    };
  }

  /** Merge new items, dedupe by canonical URL and drop anything too old. */
  private merge(existing: NewsItem[], incoming: NewsItem[]): NewsItem[] {
    const cutoff = Date.now() - config.retentionHours * 3600_000;
    const byUrl = new Map<string, NewsItem>();
    for (const item of [...existing, ...incoming]) {
      const key = canonicalUrl(item.url);
      const current = byUrl.get(key);
      if (!current || new Date(item.publishedAt) > new Date(current.publishedAt)) byUrl.set(key, item);
    }
    return [...byUrl.values()]
      .filter((i) => new Date(i.publishedAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }

  private rebuild(): void {
    this.events = deduplicateAndGroup(this.items);
    this.byId = new Map(this.items.map((i) => [i.id, i]));
  }

  // --- Query API -----------------------------------------------------------

  queryNews(query: NewsQuery = {}): { items: NewsItem[]; total: number } {
    const filtered = this.filter(query);
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 1000);
    return { items: filtered.slice(0, limit), total: filtered.length };
  }

  queryEvents(query: NewsQuery = {}): { events: NewsEvent[]; total: number } {
    const itemIds = new Set(this.filter(query).map((i) => i.id));
    const events = this.events
      .filter((e) => e.itemIds.some((id) => itemIds.has(id)))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 1000);
    return { events: events.slice(0, limit), total: events.length };
  }

  getItem(id: string): NewsItem | undefined { return this.byId.get(id); }

  getEvent(id: string): NewsEvent | undefined { return this.events.find((e) => e.id === id); }

  stats(): {
    total: number; last24h: number; demo: boolean; lastUpdated: string;
    countries: Array<{ id: string; name: string; count: number }>;
    regions: Array<{ id: string; name: string; country: string; count: number }>;
    categories: Array<{ category: string; count: number }>;
    sources: Array<{ source: string; count: number }>;
  } {
    const since = Date.now() - 24 * 3600_000;
    const recent = this.items.filter((i) => new Date(i.publishedAt).getTime() >= since);
    const countries = tally(recent, (i) => i.location.country, (i) => i.location.countryName);
    const regionTally = tally(recent, (i) => i.location.administrativeLevel1, (i) => i.location.administrativeLevel1Name);
    const regions = regionTally.map((r) => ({
      id: r.id, name: r.name,
      country: this.items.find((i) => i.location.administrativeLevel1 === r.id)?.location.country ?? '',
      count: r.count,
    }));
    const categories = tally(recent, (i) => i.category, (i) => i.category)
      .map((c) => ({ category: c.id, count: c.count }));
    const sources = tally(recent, (i) => i.source, (i) => i.source)
      .map((s) => ({ source: s.id, count: s.count }));
    return {
      total: this.items.length,
      last24h: recent.length,
      demo: this.usingDemo,
      lastUpdated: this.lastUpdated.toISOString(),
      countries: countries.sort((a, b) => b.count - a.count).slice(0, 40),
      regions: regions.sort((a, b) => b.count - a.count).slice(0, 40),
      categories: categories.sort((a, b) => b.count - a.count),
      sources: sources.sort((a, b) => b.count - a.count).slice(0, 30),
    };
  }

  private filter(query: NewsQuery): NewsItem[] {
    let result = this.items;
    if (query.country) {
      const cc = query.country.toUpperCase();
      result = result.filter((i) => i.location.country === cc);
    }
    if (query.region) {
      const rid = query.region.toUpperCase();
      result = result.filter((i) => i.location.administrativeLevel1?.toUpperCase() === rid);
    }
    if (query.city) {
      const city = normalizeText(query.city);
      result = result.filter((i) => normalizeText(i.location.city || '') === city);
    }
    if (query.category) result = result.filter((i) => i.category === query.category);
    if (query.origin) result = result.filter((i) => i.origin === query.origin);
    if (query.since) {
      const since = new Date(query.since).getTime();
      if (Number.isFinite(since)) result = result.filter((i) => new Date(i.publishedAt).getTime() >= since);
    }
    if (query.q) {
      const q = normalizeText(query.q);
      if (q) {
        const terms = q.split(' ').filter(Boolean);
        result = result.filter((i) => {
          const hay = normalizeText(`${i.title} ${i.description} ${i.location.countryName || ''} ${i.location.administrativeLevel1Name || ''} ${i.location.city || ''} ${i.category} ${i.source}`);
          return terms.every((t) => hay.includes(t));
        });
      }
    }
    return result;
  }
}

function tally<T>(items: T[], keyFn: (item: T) => string | null, nameFn: (item: T) => string | null): Array<{ id: string; name: string; count: number }> {
  const map = new Map<string, { id: string; name: string; count: number }>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const entry = map.get(key) ?? { id: key, name: nameFn(item) || key, count: 0 };
    entry.count++;
    map.set(key, entry);
  }
  return [...map.values()];
}

/** Stable, dependency-free 64-bit-ish hash for ids. */
function hashId(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

let singleton: NewsService | null = null;
export function getNewsService(): NewsService {
  if (!singleton) singleton = new NewsService();
  return singleton;
}
