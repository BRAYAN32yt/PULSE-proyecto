import type { NewsItem } from '../types';
import { categoryMeta } from '../news/categories';
import { h } from '../utils/dom';
import { flagEmoji, relativeTime } from '../utils/format';
import { i18n } from '../i18n';

/** A compact, clickable news row used in the side panel and lists. */
export function createNewsCard(item: NewsItem, onOpen: (id: string) => void): HTMLElement {
  const meta = categoryMeta(item.category);
  const place = item.location.city
    || item.location.administrativeLevel1Name
    || item.location.countryName
    || '';

  const card = h('button', {
    class: 'news-card',
    attrs: {
      type: 'button',
      'aria-label': `${i18n.t(meta.labelKey)}: ${item.title}`,
    },
    dataset: { id: item.id, category: item.category },
    on: { click: () => onOpen(item.id) },
  }, [
    h('span', {
      class: 'news-card__badge',
      style: { background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}55` },
      attrs: { 'aria-hidden': 'true' },
      text: meta.icon,
    }),
    h('span', { class: 'news-card__body' }, [
      h('span', { class: 'news-card__title', text: item.title }),
      h('span', { class: 'news-card__meta' }, [
        item.location.country ? h('span', { class: 'news-card__flag', text: flagEmoji(item.location.country) }) : null,
        place ? h('span', { class: 'news-card__place', text: place }) : null,
        h('span', { class: 'news-card__dot', text: '·' }),
        h('span', { class: 'news-card__source', text: item.source }),
        h('span', { class: 'news-card__dot', text: '·' }),
        h('span', { class: 'news-card__time', text: relativeTime(item.publishedAt, i18n.current) }),
      ]),
    ]),
    item.origin === 'demo'
      ? h('span', { class: 'badge badge--demo', text: i18n.t('panel.demoBadge') })
      : null,
  ]);
  return card;
}

/** Colour swatch + icon + label so category is never conveyed by colour alone. */
export function categoryChip(category: string): HTMLElement {
  const meta = categoryMeta(category);
  return h('span', {
    class: 'category-chip',
    style: { color: meta.color, borderColor: `${meta.color}66` },
  }, [
    h('span', { attrs: { 'aria-hidden': 'true' }, text: meta.icon }),
    h('span', { text: i18n.t(meta.labelKey) }),
  ]);
}
