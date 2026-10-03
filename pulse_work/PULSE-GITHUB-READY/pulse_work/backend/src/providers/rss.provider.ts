import { XMLParser } from 'fast-xml-parser';
import type { NewsProvider, RawNewsItem } from './types';

/**
 * RSS / Atom provider.
 *
 * Feed freshness is entirely up to the publisher: most news feeds update
 * every few minutes, so we poll on the aggregator cadence (REFRESH_INTERVAL_MS)
 * and rely on the TTL cache to avoid unnecessary requests. This is "near
 * real-time", not a push feed — the UI states the real cadence.
 */

interface FeedMeta { url: string; name: string; language?: string; country?: string }

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  textNodeName: '#text',
});

export class RssProvider implements NewsProvider {
  readonly id = 'rss';
  readonly name = 'RSS feeds';
  readonly origin = 'live' as const;

  constructor(private readonly feeds: FeedMeta[]) {}

  isEnabled(): boolean {
    return this.feeds.length > 0;
  }

  async fetchLatest(since?: Date): Promise<RawNewsItem[]> {
    const results = await Promise.allSettled(this.feeds.map((feed) => this.fetchFeed(feed)));
    const items: RawNewsItem[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') items.push(...result.value);
      else console.warn(`[rss] feed failed (${this.feeds[index].url}):`, result.reason?.message || result.reason);
    });
    const sinceMs = since ? since.getTime() : 0;
    return items.filter((i) => new Date(i.publishedAt).getTime() >= sinceMs);
  }

  private async fetchFeed(meta: FeedMeta): Promise<RawNewsItem[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(meta.url, {
        signal: controller.signal,
        headers: { 'user-agent': 'WorldPulse3D/1.0 (+https://github.com/)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      return this.parse(xml, meta);
    } finally {
      clearTimeout(timer);
    }
  }

  private parse(xml: string, meta: FeedMeta): RawNewsItem[] {
    const doc = parser.parse(xml);
    const channel = doc?.rss?.channel ?? doc?.feed;
    if (!channel) return [];
    const rawEntries = asArray(channel.item ?? channel.entry);
    const feedLanguage = channel.language || channel['@_xml:lang'] || meta.language || 'en';
    return rawEntries.map((entry) => {
      const title = text(entry.title) || 'Untitled';
      const description = stripHtml(text(entry.description) || text(entry.summary) || text(entry['content:encoded']) || text(entry.content) || '');
      const url = linkOf(entry);
      const publishedAt = parseDate(entry.pubDate || entry.published || entry.updated || entry['dc:date']);
      const image = imageOf(entry);
      const geo = geoOf(entry);
      return {
        title: stripHtml(title),
        description: description.slice(0, 600),
        url,
        source: meta.name || hostOf(meta.url),
        sourceId: this.id,
        publishedAt,
        image,
        language: feedLanguage,
        country: meta.country ?? null,
        latitude: geo?.lat ?? null,
        longitude: geo?.lng ?? null,
        locationText: `${title} ${description}`,
        origin: 'live' as const,
      };
    }).filter((item) => item.url);
  }
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function linkOf(entry: Record<string, unknown>): string {
  const link = entry.link;
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) {
    const alt = link.find((l) => (l as Record<string, string>)['@_rel'] === 'alternate') || link[0];
    return hrefOf(alt);
  }
  if (link && typeof link === 'object') return hrefOf(link);
  return text(entry.guid) || '';
}

function hrefOf(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'object') {
    const rec = node as Record<string, string>;
    return rec['@_href'] || rec['#text'] || '';
  }
  return '';
}

function imageOf(entry: Record<string, unknown>): string | null {
  const media = entry['media:content'] || entry['media:thumbnail'] || entry.enclosure;
  const first = asArray(media)[0] as Record<string, string> | undefined;
  if (first && typeof first === 'object') {
    const url = first['@_url'];
    if (url) return url;
  }
  const encoded = text(entry['content:encoded'] || entry.description);
  const match = encoded.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function geoOf(entry: Record<string, unknown>): { lat: number; lng: number } | null {
  const lat = Number(entry['geo:lat'] ?? (entry['georss:point'] ? String(entry['georss:point']).split(' ')[0] : NaN));
  const lng = Number(entry['geo:long'] ?? (entry['georss:point'] ? String(entry['georss:point']).split(' ')[1] : NaN));
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

function parseDate(value: unknown): string {
  const raw = text(value) || (typeof value === 'string' ? value : '');
  const date = raw ? new Date(raw) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'rss'; }
}
