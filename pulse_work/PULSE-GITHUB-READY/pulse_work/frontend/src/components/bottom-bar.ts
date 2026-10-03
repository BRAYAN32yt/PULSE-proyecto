import { t } from '../i18n';
import { TIME_RANGES, type AppState } from '../state/app-state';
import { clear, h } from '../utils/dom';
import { relativeTime } from '../utils/format';
import type { AppActions, Component } from './types';

/** Bottom bar: timeline range selector, new-item counter and last-update time. */
export class BottomBar implements Component {
  readonly el: HTMLElement;
  private readonly rangesEl: HTMLElement;
  private readonly newEl: HTMLElement;
  private readonly updatedEl: HTMLElement;
  private readonly dashboardButton: HTMLButtonElement;
  private lastLocale = '';

  constructor(private readonly actions: AppActions) {
    this.rangesEl = h('div', { class: 'timeline__ranges', attrs: { role: 'radiogroup', 'aria-label': t('timeline.label') } });
    this.newEl = h('button', {
      class: 'live-new',
      attrs: { type: 'button', hidden: 'true' },
      on: { click: () => this.actions.markNewSeen() },
    });
    this.updatedEl = h('span', { class: 'bottom-bar__updated' });
    this.dashboardButton = h('button', {
      class: 'control control--pill',
      attrs: { type: 'button' },
      text: t('panel.viewDashboard'),
      on: { click: () => this.actions.setView('dashboard') },
    });

    this.el = h('footer', { class: 'bottom-bar' }, [
      h('div', { class: 'bottom-bar__live' }, [
        h('span', { class: 'live-dot', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'bottom-bar__live-label', text: t('panel.live') }),
        this.newEl,
      ]),
      this.rangesEl,
      h('div', { class: 'bottom-bar__right' }, [
        this.updatedEl,
        this.dashboardButton,
      ]),
    ]);
  }

  private renderRanges(state: AppState): void {
    clear(this.rangesEl);
    for (const range of TIME_RANGES) {
      const active = state.timeRange === range.id;
      this.rangesEl.appendChild(h('button', {
        class: `timeline__range${active ? ' is-active' : ''}${range.id === 'live' ? ' is-live' : ''}`,
        attrs: { type: 'button', role: 'radio', 'aria-checked': String(active) },
        text: t(range.labelKey),
        on: { click: () => this.actions.setTimeRange(range.id) },
      }));
    }
  }

  update(state: AppState): void {
    if (this.lastLocale !== state.locale) {
      this.lastLocale = state.locale;
      this.dashboardButton.textContent = state.view === 'dashboard' ? t('panel.viewGlobe') : t('panel.viewDashboard');
      const label = this.el.querySelector('.bottom-bar__live-label');
      if (label) label.textContent = t('panel.live');
    }
    this.renderRanges(state);
    this.dashboardButton.textContent = state.view === 'dashboard' ? t('panel.viewGlobe') : t('panel.viewDashboard');
    this.dashboardButton.onclick = () => this.actions.setView(state.view === 'dashboard' ? 'globe' : 'dashboard');

    if (state.newCount > 0) {
      this.newEl.removeAttribute('hidden');
      this.newEl.textContent = `+${state.newCount} ${t('panel.newItems')}`;
    } else {
      this.newEl.setAttribute('hidden', 'true');
    }
    this.updatedEl.textContent = `${t('panel.lastUpdate')}: ${relativeTime(state.lastUpdated, state.locale)}`;
  }
}
