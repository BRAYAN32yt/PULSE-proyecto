import { api } from '../api/client';
import { i18n, t } from '../i18n';
import { categoryMeta } from '../news/categories';
import type { Stats } from '../types';
import { clear, h } from '../utils/dom';
import { flagEmoji, formatNumber } from '../utils/format';
import type { AppActions, Component } from './types';
import type { AppState } from '../state/app-state';

/**
 * Global dashboard — an alternative, neutral view of aggregate figures for the
 * last 24 hours. It presents counts only: no rankings, no "best/worst" claims.
 */
export class Dashboard implements Component {
  readonly el: HTMLElement;
  private readonly grid: HTMLElement;
  private stats: Stats | null = null;
  private loading = false;
  private lastLocale = '';

  constructor(private readonly actions: AppActions) {
    this.grid = h('div', { class: 'dashboard__grid' });
    this.el = h('section', { class: 'dashboard', attrs: { 'aria-label': t('dashboard.title'), hidden: 'true' } }, [
      h('div', { class: 'dashboard__head' }, [
        h('h2', { text: t('dashboard.title') }),
        h('button', {
          class: 'control control--pill',
          attrs: { type: 'button' },
          text: t('panel.viewGlobe'),
          on: { click: () => this.actions.setView('globe') },
        }),
      ]),
      this.grid,
      h('p', { class: 'dashboard__note', text: t('dashboard.note') }),
    ]);
  }

  update(state: AppState): void {
    if (state.view !== 'dashboard') { this.el.setAttribute('hidden', 'true'); return; }
    this.el.removeAttribute('hidden');
    if (!this.stats && !this.loading) this.refresh();
    if (this.lastLocale !== state.locale) {
      this.lastLocale = state.locale;
      const title = this.el.querySelector('.dashboard__head h2');
      if (title) title.textContent = t('dashboard.title');
      const note = this.el.querySelector('.dashboard__note');
      if (note) note.textContent = t('dashboard.note');
      if (this.stats) this.render();
    }
  }

  private refresh(): void {
    this.loading = true;
    api.getStats()
      .then((stats) => { this.stats = stats; this.render(); })
      .catch(() => { clear(this.grid); this.grid.appendChild(h('p', { class: 'empty', text: t('panel.degraded') })); })
      .finally(() => { this.loading = false; });
  }

  private render(): void {
    const stats = this.stats;
    if (!stats) return;
    clear(this.grid);

    this.grid.appendChild(this.kpi(t('dashboard.last24h'), formatNumber(stats.last24h, i18n.current), '🛰️'));
    this.grid.appendChild(this.kpi(t('dashboard.countries'), formatNumber(stats.countries.length, i18n.current), '🌍'));
    this.grid.appendChild(this.kpi(t('dashboard.regions'), formatNumber(stats.regions.length, i18n.current), '📍'));
    this.grid.appendChild(this.kpi(t('dashboard.sources'), formatNumber(stats.sources.length, i18n.current), '📡'));

    this.grid.appendChild(this.listCard(t('dashboard.categories'), stats.categories.map((c) => {
      const meta = categoryMeta(c.category);
      return { label: t(meta.labelKey), value: c.count, icon: meta.icon, color: meta.color };
    })));

    this.grid.appendChild(this.listCard(t('dashboard.countries'), stats.countries.slice(0, 12).map((c) => ({
      label: `${flagEmoji(c.id)} ${c.name}`, value: c.count,
    }))));

    this.grid.appendChild(this.listCard(t('dashboard.regions'), stats.regions.slice(0, 12).map((r) => ({
      label: r.name, value: r.count,
    }))));

    this.grid.appendChild(this.listCard(t('dashboard.sources'), stats.sources.slice(0, 12).map((s) => ({
      label: s.source, value: s.count,
    }))));
  }

  private kpi(label: string, value: string, icon: string): HTMLElement {
    return h('div', { class: 'kpi' }, [
      h('span', { class: 'kpi__icon', attrs: { 'aria-hidden': 'true' }, text: icon }),
      h('span', { class: 'kpi__value', text: value }),
      h('span', { class: 'kpi__label', text: label }),
    ]);
  }

  private listCard(title: string, rows: Array<{ label: string; value: number; icon?: string; color?: string }>): HTMLElement {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return h('div', { class: 'dashboard__card' }, [
      h('h3', { text: title }),
      h('ul', {}, rows.map((row) => h('li', { class: 'bar-row' }, [
        h('span', { class: 'bar-row__label' }, [
          row.icon ? h('span', { attrs: { 'aria-hidden': 'true' }, text: row.icon }) : null,
          h('span', { text: row.label }),
        ]),
        h('span', { class: 'bar-row__bar' }, [
          h('span', {
            class: 'bar-row__fill',
            style: { width: `${Math.round((row.value / max) * 100)}%`, background: row.color ?? 'var(--accent)' },
          }),
        ]),
        h('span', { class: 'bar-row__value', text: formatNumber(row.value, i18n.current) }),
      ]))),
    ]);
  }
}
