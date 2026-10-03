import type { NewsCategory } from '../types';

/**
 * Category presentation. Colour is never the only signal: every category also
 * carries an icon glyph and a text label (i18n key) for accessibility.
 */
export interface CategoryMeta {
  id: NewsCategory;
  color: string;
  icon: string;
  labelKey: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'politics', color: '#ff4d6d', icon: '🏛️', labelKey: 'category.politics' },
  { id: 'conflict', color: '#ff8a3d', icon: '⚔️', labelKey: 'category.conflict' },
  { id: 'science', color: '#4da3ff', icon: '🔬', labelKey: 'category.science' },
  { id: 'technology', color: '#a06bff', icon: '🛠️', labelKey: 'category.technology' },
  { id: 'environment', color: '#3ddc84', icon: '🌿', labelKey: 'category.environment' },
  { id: 'economy', color: '#ffd23d', icon: '📈', labelKey: 'category.economy' },
  { id: 'sports', color: '#00d1b2', icon: '⚽', labelKey: 'category.sports' },
  { id: 'weather', color: '#ff6fae', icon: '🌪️', labelKey: 'category.weather' },
  { id: 'culture', color: '#c9a227', icon: '🎭', labelKey: 'category.culture' },
  { id: 'internet', color: '#5ce1e6', icon: '📱', labelKey: 'category.internet' },
  { id: 'emergency', color: '#ff2d2d', icon: '🚨', labelKey: 'category.emergency' },
  { id: 'general', color: '#9aa7bd', icon: '📰', labelKey: 'category.general' },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoryMeta(id: NewsCategory | string): CategoryMeta {
  return BY_ID.get(id as NewsCategory) ?? BY_ID.get('general')!;
}

export function categoryColor(id: NewsCategory | string): string {
  return categoryMeta(id).color;
}

/** Filters shown in the side panel (subset, in a sensible order). */
export const FILTER_CATEGORIES: NewsCategory[] = [
  'politics', 'conflict', 'science', 'technology', 'economy', 'weather', 'sports', 'culture',
];
