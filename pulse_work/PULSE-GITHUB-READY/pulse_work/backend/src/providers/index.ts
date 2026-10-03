import { config } from '../config';
import type { NewsProvider } from './types';
import { DemoProvider } from './demo.provider';
import { RssProvider } from './rss.provider';
import { NewsApiProvider } from './newsapi.provider';

/**
 * Builds the active provider list from configuration.
 *
 * Order matters: real providers first, DEMO last (and only when there is no
 * live source, or when DEMO_MODE is explicitly on). Each provider is isolated:
 * a failing provider never prevents the others from running.
 */
export function createProviders(): NewsProvider[] {
  const providers: NewsProvider[] = [];

  if (config.providers.newsApiKey) {
    providers.push(new NewsApiProvider(config.providers.newsApiKey));
  }

  if (config.providers.rssFeeds.length) {
    providers.push(new RssProvider(
      config.providers.rssFeeds.map((url) => ({
        url,
        name: hostLabel(url),
        language: guessLanguage(url),
      })),
    ));
  }

  const hasLive = providers.some((p) => p.isEnabled());
  if (config.demoMode || !hasLive) {
    providers.push(new DemoProvider());
  }

  return providers.filter((p) => p.isEnabled());
}

function hostLabel(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'RSS'; }
}

function guessLanguage(url: string): string | undefined {
  if (/\.(es|mx|ar|cl|co|pe)\./.test(url) || /\/(es|spa)\//.test(url)) return 'es';
  if (/\.(fr)\./.test(url)) return 'fr';
  if (/\.(pt|br)\./.test(url)) return 'pt';
  return undefined;
}
