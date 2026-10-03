import { describe, expect, it } from 'vitest';
import { classify } from './classify';
import {
  canonicalUrl, deduplicateAndGroup, eventKey, groupEvents, jaccard, tokenize,
} from './dedupe';
import type { NewsItem } from '../types/domain';

function item(partial: Partial<NewsItem> & Pick<NewsItem, 'id' | 'title'>): NewsItem {
  return {
    description: '',
    url: `https://example.com/${partial.id}`,
    source: 'Example',
    sourceId: 'example',
    publishedAt: '2026-01-01T10:00:00.000Z',
    image: null,
    language: 'en',
    category: 'general',
    status: 'source-available',
    origin: 'live',
    eventId: partial.id,
    originalLanguage: 'en',
    location: {
      country: 'MX', countryName: 'Mexico',
      administrativeLevel1: null, administrativeLevel1Name: null,
      administrativeLevel2: null, administrativeLevel2Name: null,
      city: null, latitude: null, longitude: null, precision: 'country',
    },
    ...partial,
  };
}

describe('classify', () => {
  it('honours an explicit hint', () => {
    expect(classify('anything', '', 'sports')).toBe('sports');
  });

  it('matches keywords and accents', () => {
    expect(classify('Strong earthquake hits the coast')).toBe('weather');
    expect(classify('Terremoto azota la costa')).toBe('weather');
    expect(classify('Parliament debates new privacy law')).toBe('politics');
  });

  it('falls back to general', () => {
    expect(classify('A quiet morning in the village')).toBe('general');
  });
});

describe('canonicalUrl', () => {
  it('strips tracking params, www and trailing slash', () => {
    expect(canonicalUrl('https://www.example.com/news/story/?utm_source=x&id=1'))
      .toBe('example.com/news/story/?id=1');
  });

  it('returns a lowered trimmed string for invalid urls', () => {
    expect(canonicalUrl('  Not A URL  ')).toBe('not a url');
  });
});

describe('tokenize / jaccard', () => {
  it('drops stopwords and short tokens', () => {
    const tokens = tokenize('The quick brown fox is in the garden');
    expect(tokens.has('the')).toBe(false);
    expect(tokens.has('in')).toBe(false);
    expect(tokens.has('quick')).toBe(true);
  });

  it('computes symmetric similarity', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    expect(jaccard(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(0);
    expect(jaccard(new Set(), new Set(['a']))).toBe(0);
  });
});

describe('eventKey', () => {
  it('is stable within the same time bucket', () => {
    const a = item({ id: 'a', title: 'One' });
    const b = item({ id: 'b', title: 'Two', publishedAt: '2026-01-01T11:00:00.000Z' });
    expect(eventKey(a)).toBe(eventKey(b));
  });
});

describe('groupEvents / deduplicateAndGroup', () => {
  it('groups similar stories from the same country/category/time', () => {
    const a = item({ id: 'a', title: 'Major earthquake strikes coastal region' });
    const b = item({ id: 'b', title: 'Coastal region hit by major earthquake' });
    const events = groupEvents([a, b]);
    expect(events).toHaveLength(1);
    expect(events[0].sources).toHaveLength(2);
  });

  it('keeps unrelated stories apart', () => {
    const a = item({ id: 'a', title: 'Major earthquake strikes coastal region' });
    const b = item({ id: 'b', title: 'Parliament passes annual budget', category: 'politics' });
    expect(groupEvents([a, b])).toHaveLength(2);
  });

  it('drops exact duplicate urls across providers', () => {
    const a = item({ id: 'a', title: 'Same story', url: 'https://a.com/x?utm_source=1' });
    const b = item({ id: 'b', title: 'Same story', url: 'https://a.com/x/' });
    const events = deduplicateAndGroup([a, b]);
    const totalSources = events.reduce((n, e) => n + e.sources.length, 0);
    expect(totalSources).toBe(1);
  });

  it('assigns a shared eventId to grouped items', () => {
    const a = item({ id: 'a', title: 'Flood warnings issued for the valley' });
    const b = item({ id: 'b', title: 'Valley under flood warnings' });
    const events = deduplicateAndGroup([a, b]);
    expect(a.eventId).toBe(b.eventId);
    expect(events[0].id).toBe(a.eventId);
  });
});
