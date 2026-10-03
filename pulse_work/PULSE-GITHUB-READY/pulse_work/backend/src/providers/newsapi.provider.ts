import type { NewsProvider, RawNewsItem } from './types';

/**
 * NewsAPI-compatible provider (https://newsapi.org).
 *
 * The API key is read from the environment on the server and never exposed to
 * the browser. Requires a commercial plan for production use; the free tier is
 * development-only. Disabled automatically when no key is configured.
 */
export class NewsApiProvider implements NewsProvider {
  readonly id = 'newsapi';
  readonly name = 'NewsAPI';
  readonly origin = 'live' as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://newsapi.org/v2',
  ) {}

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async fetchLatest(since?: Date): Promise<RawNewsItem[]> {
    const params = new URLSearchParams({
      language: 'en',
      sortBy: 'publishedAt',
      pageSize: '100',
    });
    if (since) params.set('from', since.toISOString());
    const url = `${this.baseUrl}/top-headlines?${params.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'X-Api-Key': this.apiKey, accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { articles?: NewsApiArticle[] };
      return (body.articles ?? []).map((article) => this.normalize(article));
    } finally {
      clearTimeout(timer);
    }
  }

  private normalize(article: NewsApiArticle): RawNewsItem {
    return {
      title: article.title || 'Untitled',
      description: article.description || '',
      url: article.url,
      source: article.source?.name || 'NewsAPI',
      sourceId: this.id,
      publishedAt: article.publishedAt || new Date().toISOString(),
      image: article.urlToImage || null,
      language: 'en',
      country: null,
      locationText: `${article.title || ''} ${article.description || ''}`,
      origin: 'live',
    };
  }
}

interface NewsApiArticle {
  source?: { id?: string | null; name?: string | null };
  title?: string | null;
  description?: string | null;
  url: string;
  urlToImage?: string | null;
  publishedAt?: string | null;
  content?: string | null;
}
