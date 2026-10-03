# Adding news providers

WorldPulse ships with three providers. This guide shows how to add another
without touching the rest of the pipeline.

## 1. The contract

```ts
// backend/src/providers/types.ts
export interface NewsProvider {
  readonly id: string;                 // stable key, e.g. "reuters"
  readonly name: string;               // human-readable
  readonly origin: 'live' | 'demo';
  isEnabled(): boolean;
  fetchLatest(since?: string): Promise<RawNewsItem[]>;
}
```

`RawNewsItem` is intentionally loose — the shared pipeline normalises,
validates, deduplicates, classifies and geolocates whatever you return.

## 2. Implement

```ts
// backend/src/providers/example.provider.ts
import { config } from '../config';
import type { NewsProvider, RawNewsItem } from './types';

export class ExampleProvider implements NewsProvider {
  readonly id = 'example';
  readonly name = 'Example News';
  readonly origin = 'live' as const;

  constructor(private readonly apiKey: string) {}

  isEnabled(): boolean { return this.apiKey.length > 0; }

  async fetchLatest(since?: string): Promise<RawNewsItem[]> {
    const url = new URL('https://api.example.com/v1/articles');
    if (since) url.searchParams.set('from', since);
    const res = await fetch(url, { headers: { authorization: `Bearer ${this.apiKey}` } });
    if (!res.ok) throw new Error(`example -> HTTP ${res.status}`);
    const data = await res.json();
    return data.articles.map((a: any) => ({
      externalId: a.id,
      title: a.headline,
      description: a.summary,
      url: a.link,
      source: 'Example News',
      sourceId: this.id,
      publishedAt: a.published,
      language: a.lang,
      image: a.image ?? null,
      // Optional location hints — the locator resolves/validates them.
      country: a.country ?? null,
      city: a.city ?? null,
      latitude: a.lat ?? null,
      longitude: a.lon ?? null,
    }));
  }
}
```

## 3. Register

```ts
// backend/src/providers/index.ts
import { ExampleProvider } from './example.provider';

export function createProviders(): NewsProvider[] {
  const providers: NewsProvider[] = [];

  if (config.providers.exampleKey) {
    providers.push(new ExampleProvider(config.providers.exampleKey));
  }
  // …existing providers…

  const hasLive = providers.some((p) => p.isEnabled());
  if (config.demoMode || !hasLive) providers.push(new DemoProvider());
  return providers.filter((p) => p.isEnabled());
}
```

Add the key to `config` and `backend/.env.example` (never hard-code it).

## 4. Guidelines

- **Never** invent coordinates. If you only know the country, leave city/lat/lng
  empty — the locator will place the story at country level.
- Keep the original language in `language`; translation is a separate layer.
- Throwing on failure is fine: the provider is isolated and other sources keep
  working.
- Respect the source's licence and rate limits; do not copy full articles.
