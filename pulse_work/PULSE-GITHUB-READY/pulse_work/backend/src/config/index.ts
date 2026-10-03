import 'dotenv/config';

/**
 * Central runtime configuration, read from environment variables.
 * Secrets (API keys) live ONLY here on the server; they are never sent to the
 * browser. See backend/.env.example for the full list.
 */

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function list(value: string | undefined): string[] {
  return (value || '').split(',').map((s) => s.trim()).filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV || 'development';

export const config = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: int(process.env.PORT, 8787),
  host: process.env.HOST || '0.0.0.0',

  /** Comma-separated list of allowed origins, or "*" in dev. */
  corsOrigins: list(process.env.CORS_ORIGINS).length ? list(process.env.CORS_ORIGINS) : ['*'],

  /** Force demo data regardless of provider availability. */
  demoMode: bool(process.env.DEMO_MODE, true),

  /** Polling cadence for the aggregator (ms). Provider-dependent; see docs. */
  refreshIntervalMs: int(process.env.REFRESH_INTERVAL_MS, 90_000),

  /** How long to keep normalized items in memory. */
  retentionHours: int(process.env.RETENTION_HOURS, 24 * 8),

  providers: {
    /** Optional NewsAPI-compatible key. https://newsapi.org */
    newsApiKey: process.env.NEWS_API_KEY || '',
    /** Optional GDELT toggle (keyless public dataset). */
    gdelt: bool(process.env.ENABLE_GDELT, false),
    /** RSS feeds, pipe-separated: "https://a/rss|https://b/rss". */
    rssFeeds: (process.env.RSS_FEEDS || '').split('|').map((s) => s.trim()).filter(Boolean),
    /** Optional translation provider endpoint/key (see TranslationProvider). */
    translationUrl: process.env.TRANSLATION_API_URL || '',
    translationKey: process.env.TRANSLATION_API_KEY || '',
  },

  paths: {
    geo: process.env.GEO_DATA_DIR || '../data',
  },
} as const;

export type AppConfig = typeof config;
