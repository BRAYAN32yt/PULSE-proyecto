import { t } from '../i18n';
import { FILTER_CATEGORIES, categoryMeta } from '../news/categories';
import type { NewsItem } from '../types';
import { clear, h } from '../utils/dom';
import { selectFiltered, type AppState } from '../state/app-state';
import { createNewsCard } from './news-card';
import type { AppActions, Component } from './types';

/** Left panel: live feed with category filters and the recent news list. */
export class SidePanel implements Component {
  readonly el: HTMLElement;
  private readonly filtersEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly countEl: HTMLElement;
  private lastLocale = '';

  constructor(private readonly actions: AppActions) {
    this.filtersEl = h('div', { class: 'filters', attrs: { role: 'group' } });
    this.listEl = h('div', { class: 'feed', attrs: { role: 'list' } });
    this.countEl = h('span', { class: 'panel__count' });

    this.el = h('aside', { class: 'panel panel--left', attrs: { 'aria-label': t('panel.recent') } }, [
      h('div', { class: 'panel__head' }, [
        h('span', { class: 'live-dot', attrs: { 'aria-hidden': 'true' } }),
        h('h2', { class: 'panel__title', text: t('panel.live') }),
        this.countEl,
      ]),
      h('div', { class: 'panel__section' }, [
        h('h3', { class: 'panel__subtitle', text: t('panel.filters') }),
        this.filtersEl,
      ]),
      this.listEl,
    ]);
    this.renderFilters('all');
  }

  private renderFilters(active: AppState['category']): void {
    clear(this.filtersEl);
    const chips: Array<{ id: AppState['category']; label: string; color: string; icon: string }> = [
      { id: 'all', label: t('panel.all'), color: '#9aa7bd', icon: '🌐' },
      ...FILTER_CATEGORIES.map((id) => {
        const meta = categoryMeta(id);
        return { id, label: t(meta.labelKey), color: meta.color, icon: meta.icon };
      }),
    ];
    for (const chip of chips) {
      const button = h('button', {
        class: `filter-chip${chip.id === active ? ' is-active' : ''}`,
        attrs: { type: 'button', 'aria-pressed': String(chip.id === active) },
        style: { '--chip': chip.color } as Partial<CSSStyleDeclaration>,
        on: { click: () => this.actions.setCategory(chip.id) },
      }, [
        h('span', { attrs: { 'aria-hidden': 'true' }, text: chip.icon }),
        h('span', { text: chip.label }),
      ]);
      this.filtersEl.appendChild(button);
    }
  }

  update(state: AppState): void {
    if (this.lastLocale !== state.locale) {
      this.lastLocale = state.locale;
      this.el.setAttribute('aria-label', t('panel.recent'));
      const title = this.el.querySelector('.panel__title');
      if (title) title.textContent = t('panel.live');
      const subtitle = this.el.querySelector('.panel__subtitle');
      if (subtitle) subtitle.textContent = t('panel.filters');
      this.renderFilters(state.category);
    } else {
      this.renderFilters(state.category);
    }

    const items = selectFiltered(state);
    this.countEl.textContent = items.length === 1 ? t('panel.story') : t('panel.stories', { count: items.length });

    clear(this.listEl);
    if (!items.length) {
      this.listEl.appendChild(h('p', { class: 'empty', text: t('panel.empty') }));
      return;
    }
    for (const item of items.slice(0, 120)) this.listEl.appendChild(createNewsCard(item, (id) => this.actions.openNews(id)));
  }

  highlight(item: NewsItem | null): void {
    for (const node of this.listEl.querySelectorAll('.news-card')) node.classList.remove('is-selected');
    if (!item) return;
    const target = this.listEl.querySelector<HTMLElement>(`.news-card[data-id="${CSS.escape(item.id)}"]`);
    target?.classList.add('is-selected');
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
