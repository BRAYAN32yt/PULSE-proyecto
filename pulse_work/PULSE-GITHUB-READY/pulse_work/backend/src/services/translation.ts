import { config } from '../config';

/**
 * TranslationProvider layer.
 *
 * We never call a translation service that isn't explicitly configured. When
 * no provider is set, the original text is returned untouched and the UI shows
 * the item in its original language. A real provider (LibreTranslate, DeepL,
 * a self-hosted model...) can be plugged in by implementing this interface.
 */
export interface TranslationProvider {
  readonly id: string;
  isEnabled(): boolean;
  translate(text: string, target: string, source?: string): Promise<string>;
}

/** Default provider: returns the original text unchanged. */
export class PassthroughTranslationProvider implements TranslationProvider {
  readonly id = 'none';
  isEnabled(): boolean { return false; }
  async translate(text: string): Promise<string> { return text; }
}

/**
 * Generic HTTP provider compatible with LibreTranslate-style APIs:
 *   POST {url}  { q, source, target, format, api_key? } -> { translatedText }
 * Adapt the body/response mapping to your chosen service.
 */
export class HttpTranslationProvider implements TranslationProvider {
  readonly id = 'http';
  constructor(private readonly url: string, private readonly apiKey: string) {}

  isEnabled(): boolean { return Boolean(this.url); }

  async translate(text: string, target: string, source = 'auto'): Promise<string> {
    if (!text) return text;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: text, source, target, format: 'text', api_key: this.apiKey || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { translatedText?: string; translation?: string };
      return body.translatedText ?? body.translation ?? text;
    } catch (err) {
      console.warn('[translation] failed:', (err as Error).message);
      return text; // graceful: fall back to the original language
    } finally {
      clearTimeout(timer);
    }
  }
}

let singleton: TranslationProvider | null = null;
export function getTranslationProvider(): TranslationProvider {
  if (!singleton) {
    singleton = config.providers.translationUrl
      ? new HttpTranslationProvider(config.providers.translationUrl, config.providers.translationKey)
      : new PassthroughTranslationProvider();
  }
  return singleton;
}
