import { coalesce, retry, withTimeout } from '../utils/store';
import type {
  CountryRecord, NewsEvent, NewsItem, RegionRecord, SearchResponse, Stats, StatusResponse,
} from '../types';

/**
 * REST client. Base URL is same-origin by default (dev proxy / production
 * reverse proxy). Override with VITE_API_BASE_URL when the API lives on a
 * different host.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await withTimeout(
    fetch(`${BASE}${path}`, { signal, headers: { accept: 'application/json' } }),
    15_000,
    path,
  );
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface NewsQueryParams {
  country?: string;
  region?: string;
  city?: string;
  category?: string;
  since?: string;
  q?: string;
  limit?: number;
  origin?: string;
}

function toQuery(params: NewsQueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  getNews: coalesce((params: NewsQueryParams = {}, signal?: AbortSignal) =>
    getJson<{ total: number; count: number; items: NewsItem[] }>(`/api/news${toQuery(params)}`, signal), 120),

  getLatest: coalesce((limit: number = 60, since?: string, signal?: AbortSignal) =>
    getJson<{ total: number; count: number; lastUpdated: string; items: NewsItem[] }>(
      `/api/news/latest${toQuery({ limit, since })}`, signal), 150),

  getEvents: (params: NewsQueryParams = {}) =>
    getJson<{ total: number; count: number; events: NewsEvent[] }>(`/api/events${toQuery(params)}`),

  getEvent: (id: string) => getJson<{ event: NewsEvent; items: NewsItem[] }>(`/api/events/${encodeURIComponent(id)}`),

  getCountries: () => getJson<{ count: number; countries: CountryRecord[] }>('/api/countries'),

  getRegions: (country: string) =>
    getJson<{ country: string; count: number; regions: RegionRecord[] }>(`/api/regions/${encodeURIComponent(country)}`),

  search: coalesce((q: string, signal?: AbortSignal) =>
    getJson<SearchResponse>(`/api/search${toQuery({ q })}`, signal), 220),

  getStats: () => getJson<Stats>('/api/stats'),

  getStatus: () => retry(() => getJson<StatusResponse>('/api/status'), 2, 400),

  translate: (text: string, target: string, source?: string) =>
    fetch(`${BASE}/api/translate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, target, source }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`translate -> HTTP ${res.status}`);
      return (await res.json()) as { translatedText: string; provider: string };
    }),
};

export const apiBase = BASE;
