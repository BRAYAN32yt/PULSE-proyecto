/**
 * Domain types shared across the backend.
 *
 * The location model is intentionally generic: not every country has "states",
 * so we expose administrative_level_1 / administrative_level_2 / city instead
 * of country-specific terminology.
 */

export type NewsCategory =
  | 'politics'
  | 'conflict'
  | 'science'
  | 'technology'
  | 'environment'
  | 'economy'
  | 'sports'
  | 'weather'
  | 'culture'
  | 'internet'
  | 'emergency'
  | 'general';

export const NEWS_CATEGORIES: NewsCategory[] = [
  'politics', 'conflict', 'science', 'technology', 'environment', 'economy',
  'sports', 'weather', 'culture', 'internet', 'emergency', 'general',
];

/** How precise the location is. We never fake precision the data lacks. */
export type LocationPrecision = 'city' | 'admin1' | 'country' | 'unknown';

/** Editorial/verification status shown to the user. */
export type VerificationStatus =
  | 'verified'          // VERIFICADA POR FUENTE
  | 'source-available'  // FUENTE DISPONIBLE
  | 'imprecise-location'// SIN UBICACIÓN PRECISA
  | 'unverified';       // NO VERIFICADA

export type DataOrigin = 'live' | 'demo';

export interface GeoLocation {
  country: string | null;             // ISO 3166-1 alpha-2, e.g. "MX"
  countryName: string | null;
  administrativeLevel1: string | null;// region id, e.g. "MX-TAM"
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
  source: string;             // human-readable source name
  sourceId: string;           // provider/source key
  publishedAt: string;        // ISO 8601
  image: string | null;
  language: string;           // BCP-47, e.g. "en", "es"
  category: NewsCategory;
  location: GeoLocation;
  status: VerificationStatus;
  origin: DataOrigin;
  /** Event grouping: items describing the same happening share an eventId. */
  eventId: string;
  /** Original language text, preserved; translation is a separate layer. */
  originalLanguage: string;
}

/** A group of NewsItems believed to describe the same event. */
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

export interface NewsQuery {
  country?: string;
  region?: string;
  city?: string;
  category?: NewsCategory;
  /** Only items published at or after this ISO timestamp. */
  since?: string;
  /** Free text query over title/description/location. */
  q?: string;
  limit?: number;
  origin?: DataOrigin;
}

export interface RealtimeEvent {
  type: 'news' | 'event' | 'status';
  payload: unknown;
  at: string;
}
