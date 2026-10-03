/** Shared frontend domain types (mirror of the backend contract). */

export type NewsCategory =
  | 'politics' | 'conflict' | 'science' | 'technology' | 'environment'
  | 'economy' | 'sports' | 'weather' | 'culture' | 'internet' | 'emergency' | 'general';

export type LocationPrecision = 'city' | 'admin1' | 'country' | 'unknown';
export type VerificationStatus = 'verified' | 'source-available' | 'imprecise-location' | 'unverified';
export type DataOrigin = 'live' | 'demo';

export interface GeoLocation {
  country: string | null;
  countryName: string | null;
  administrativeLevel1: string | null;
  administrativeLevel1Name: string | null;
  administrativeLevel2: string | null;
  administrativeLevel2Name: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  precision: LocationPrecision;
}

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  sourceId: string;
  publishedAt: string;
  image: string | null;
  language: string;
  category: NewsCategory;
  location: GeoLocation;
  status: VerificationStatus;
  origin: DataOrigin;
  eventId: string;
  originalLanguage: string;
}

export interface NewsEvent {
  id: string;
  title: string;
  description: string;
  category: NewsCategory;
  location: GeoLocation;
  publishedAt: string;
  updatedAt: string;
  sources: Array<{ source: string; sourceId: string; url: string; publishedAt: string; language: string }>;
  itemIds: string[];
  origin: DataOrigin;
}

export interface CountryRecord {
  id: string; iso3: string; name: string; names: Record<string, string>;
  continent: string; subregion: string; centroid: [number, number];
  bbox: number[]; pop: number; regionCount: number; cityCount: number; newsCount: number;
}

export interface RegionRecord {
  id: string; country: string; name: string; names: Record<string, string>;
  type: string; lat: number; lng: number; newsCount: number;
}

export interface CityRecord {
  id: string; country: string; regionId: string | null; name: string;
  names: Record<string, string>; lat: number; lng: number; pop: number; capital: boolean;
}

export interface SearchPlace {
  type: 'country' | 'region' | 'city';
  id: string;
  name: string;
  country: string | null;
  countryName: string | null;
  administrativeLevel1: string | null;
  lat: number;
  lng: number;
  typeLabel?: string;
  pop?: number;
}

export interface SearchResponse {
  query: string;
  places: SearchPlace[];
  news: Array<Pick<NewsItem, 'id' | 'title' | 'source' | 'publishedAt' | 'category' | 'location' | 'url' | 'origin'>>;
}

export interface Stats {
  total: number;
  last24h: number;
  demo: boolean;
  lastUpdated: string;
  countries: Array<{ id: string; name: string; count: number }>;
  regions: Array<{ id: string; name: string; country: string; count: number }>;
  categories: Array<{ category: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
}

export interface StatusResponse {
  demo: boolean;
  degraded: boolean;
  lastError: string | null;
  lastUpdated: string;
  refreshIntervalMs: number;
  providers: Array<{ id: string; name: string; origin: DataOrigin; enabled: boolean }>;
  realtimeClients: number;
}

export type RealtimeEvent =
  | { type: 'news'; at: string; payload: { item: NewsItem; event: NewsEvent | null } }
  | { type: 'status'; at: string; payload: { lastUpdated: string; total: number; demo: boolean; degraded: boolean } };
