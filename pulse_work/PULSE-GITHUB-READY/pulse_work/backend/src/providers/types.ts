import type { DataOrigin, NewsCategory } from '../types/domain';

/**
 * A raw, provider-specific news record before normalization/geolocation.
 * Providers only need to fill what they actually know; the pipeline resolves
 * category and location afterwards.
 */
export interface RawNewsItem {
  title: string;
  description: string;
  url: string;
  source: string;
  sourceId: string;
  publishedAt: string;
  image?: string | null;
  language?: string;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  categoryHint?: NewsCategory | null;
  origin?: DataOrigin;
  /** Free text used for location mining when structured fields are missing. */
  locationText?: string | null;
}

/**
 * Every news source implements this interface. Adding a new source means
 * implementing `fetchLatest` and registering it — nothing else changes.
 */
export interface NewsProvider {
  readonly id: string;
  readonly name: string;
  readonly origin: DataOrigin;
  /** Whether the provider is configured and should run. */
  isEnabled(): boolean;
  fetchLatest(since?: Date): Promise<RawNewsItem[]>;
}
