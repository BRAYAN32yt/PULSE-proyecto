import type { NewsEvent, NewsItem } from '../types/domain';
import { haversineKm, normalizeText } from '../utils/geo';

/**
 * Event grouping. Different outlets report the same happening; we cluster
 * items by (time window + location + title similarity) into a NewsEvent while
 * preserving every original source.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'with',
  'is', 'are', 'was', 'were', 'be', 'by', 'from', 'as', 'after', 'over', 'new',
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'y', 'o', 'con',
  'por', 'para', 'que', 'se', 'su', 'al', 'lo', 'tras', 'sobre',
]);

export function tokenize(text: string): Set<string> {
  return new Set(
    normalizeText(text).split(' ').filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Stable-ish event key from the dominant location and time bucket. */
export function eventKey(item: NewsItem, windowHours = 6): string {
  const loc = item.location;
  const anchor = loc.city || loc.administrativeLevel1 || loc.country || 'unknown';
  const bucket = Math.floor(new Date(item.publishedAt).getTime() / (windowHours * 3600_000));
  return `${normalizeText(anchor).replace(/ /g, '_')}@${bucket}`;
}

export interface GroupOptions {
  /** Max hours between two items to be considered the same event. */
  timeWindowHours?: number;
  /** Max km between two items to be considered the same event. */
  distanceKm?: number;
  /** Minimum title similarity to merge. */
  minSimilarity?: number;
}

/**
 * Group items into events. Items with no precise location are only grouped by
 * title/time, never by fabricated coordinates.
 */
export function groupEvents(items: NewsItem[], options: GroupOptions = {}): NewsEvent[] {
  const timeWindow = (options.timeWindowHours ?? 12) * 3600_000;
  const distanceKm = options.distanceKm ?? 150;
  const minSimilarity = options.minSimilarity ?? 0.34;

  const clusters: Array<{ items: NewsItem[]; tokens: Set<string> }> = [];

  for (const item of items) {
    const itemTokens = tokenize(`${item.title} ${item.description}`);
    const itemTime = new Date(item.publishedAt).getTime();
    let placed = false;

    for (const cluster of clusters) {
      const head = cluster.items[0];
      const sameOrigin = head.origin === item.origin;
      const sameCategory = head.category === item.category;
      if (!sameOrigin || !sameCategory) continue;

      const headTime = new Date(head.publishedAt).getTime();
      if (Math.abs(headTime - itemTime) > timeWindow) continue;

      const sameCountry = head.location.country && head.location.country === item.location.country;
      if (!sameCountry) continue;

      const headLat = head.location.latitude, headLng = head.location.longitude;
      const itemLat = item.location.latitude, itemLng = item.location.longitude;
      if (headLat != null && itemLat != null) {
        if (haversineKm(headLat, headLng as number, itemLat, itemLng as number) > distanceKm) continue;
      }

      const similarity = jaccard(cluster.tokens, itemTokens);
      if (similarity < minSimilarity) continue;

      cluster.items.push(item);
      for (const t of itemTokens) cluster.tokens.add(t);
      placed = true;
      break;
    }

    if (!placed) clusters.push({ items: [item], tokens: itemTokens });
  }

  return clusters.map(toEvent).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function toEvent(cluster: { items: NewsItem[] }): NewsEvent {
  const items = [...cluster.items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
  const lead = items[0];
  return {
    id: lead.eventId,
    title: lead.title,
    description: lead.description,
    category: lead.category,
    location: lead.location,
    publishedAt: items[items.length - 1].publishedAt,
    updatedAt: lead.publishedAt,
    sources: items.map((i) => ({
      source: i.source, sourceId: i.sourceId, url: i.url,
      publishedAt: i.publishedAt, language: i.language,
    })),
    itemIds: items.map((i) => i.id),
    origin: lead.origin,
  };
}

/**
 * Assign a shared eventId to items in the same cluster and drop exact
 * duplicate URLs across providers (keeping the first-seen source).
 */
export function deduplicateAndGroup(items: NewsItem[]): NewsEvent[] {
  const byUrl = new Map<string, NewsItem>();
  for (const item of items) {
    const key = canonicalUrl(item.url);
    const existing = byUrl.get(key);
    if (!existing || new Date(item.publishedAt) < new Date(existing.publishedAt)) {
      byUrl.set(key, item);
    }
  }
  const unique = [...byUrl.values()];
  const events = groupEvents(unique);
  for (const event of events) {
    for (const item of unique) if (event.itemIds.includes(item.id)) item.eventId = event.id;
  }
  return events;
}

export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    const drop = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid'];
    for (const p of drop) u.searchParams.delete(p);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname}${u.search}`.toLowerCase().replace(/\/$/, '');
  } catch {
    return url.trim().toLowerCase();
  }
}
