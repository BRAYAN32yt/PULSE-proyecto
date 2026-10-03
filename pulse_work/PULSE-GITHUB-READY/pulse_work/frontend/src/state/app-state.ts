import { Store } from '../utils/store';
import type { CityRecord, CountryRecord, NewsCategory, NewsItem, RegionRecord, StatusResponse } from '../types';
import type { LocaleCode } from '../i18n';

export type TimeRange = 'live' | '5m' | '15m' | '30m' | '1h' | '3h' | '6h' | '12h' | '24h' | '7d';
export type AppView = 'globe' | 'dashboard';

export const TIME_RANGES: Array<{ id: TimeRange; minutes: number | null; labelKey: string }> = [
  { id: 'live', minutes: null, labelKey: 'timeline.live' },
  { id: '5m', minutes: 5, labelKey: 'timeline.5m' },
  { id: '15m', minutes: 15, labelKey: 'timeline.15m' },
  { id: '30m', minutes: 30, labelKey: 'timeline.30m' },
  { id: '1h', minutes: 60, labelKey: 'timeline.1h' },
  { id: '3h', minutes: 180, labelKey: 'timeline.3h' },
  { id: '6h', minutes: 360, labelKey: 'timeline.6h' },
  { id: '12h', minutes: 720, labelKey: 'timeline.12h' },
  { id: '24h', minutes: 1440, labelKey: 'timeline.24h' },
  { id: '7d', minutes: 10080, labelKey: 'timeline.7d' },
];

export interface Selection {
  country: string | null;
  region: string | null;
  city: string | null;
}

export interface AppState {
  ready: boolean;
  webglOk: boolean;
  view: AppView;
  items: NewsItem[];
  selection: Selection;
  category: NewsCategory | 'all';
  timeRange: TimeRange;
  query: string;
  locale: LocaleCode;
  reduceMotion: boolean;
  status: StatusResponse | null;
  offline: boolean;
  degraded: boolean;
  newCount: number;
  lastUpdated: string;
  selectedNewsId: string | null;
  /** Geo metadata maps, populated once the indexes load. */
  countryInfo: Map<string, CountryRecord> | null;
  regionInfo: Map<string, RegionRecord> | null;
  regionsByCountry: Map<string, RegionRecord[]> | null;
  cityInfo: Map<string, CityRecord> | null;
}

export const appStore = new Store<AppState>({
  ready: false,
  webglOk: true,
  view: 'globe',
  items: [],
  selection: { country: null, region: null, city: null },
  category: 'all',
  timeRange: 'live',
  query: '',
  locale: 'es',
  reduceMotion: false,
  status: null,
  offline: false,
  degraded: false,
  newCount: 0,
  lastUpdated: new Date().toISOString(),
  selectedNewsId: null,
  countryInfo: null,
  regionInfo: null,
  regionsByCountry: null,
  cityInfo: null,
});

/** Items matching the current category, time range and location selection. */
export function selectFiltered(state: AppState): NewsItem[] {
  const range = TIME_RANGES.find((r) => r.id === state.timeRange);
  const since = range?.minutes ? Date.now() - range.minutes * 60_000 : 0;
  const query = state.query.trim().toLowerCase();

  return state.items.filter((item) => {
    if (state.category !== 'all' && item.category !== state.category) return false;
    if (since && new Date(item.publishedAt).getTime() < since) return false;
    if (state.selection.country && item.location.country !== state.selection.country) return false;
    if (state.selection.region && item.location.administrativeLevel1 !== state.selection.region) return false;
    if (state.selection.city && item.location.city !== state.selection.city) return false;
    if (query) {
      const haystack = `${item.title} ${item.description} ${item.location.city ?? ''} ${item.location.administrativeLevel1Name ?? ''} ${item.location.countryName ?? ''} ${item.source}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** Items that can be placed on the globe (have real coordinates). */
export function selectMappable(items: NewsItem[]): NewsItem[] {
  return items.filter((item) => item.location.latitude != null && item.location.longitude != null);
}
