import { t } from '../i18n';
import { h } from '../utils/dom';
import type { AppState } from '../state/app-state';
import type { Component } from './types';

/** Full-screen loading veil shown until the globe and first data are ready. */
export class LoadingVeil implements Component {
  readonly el: HTMLElement;

  constructor() {
    this.el = h('div', { class: 'veil', attrs: { role: 'status', 'aria-live': 'polite' } }, [
      h('div', { class: 'veil__planet', attrs: { 'aria-hidden': 'true' } }),
      h('p', { class: 'veil__text', text: t('app.loading') }),
    ]);
  }

  update(state: AppState): void {
    if (state.ready) this.el.classList.add('is-hidden');
    else this.el.classList.remove('is-hidden');
  }
}

/** Non-blocking banner for degraded / offline / WebGL-unavailable states. */
export class StatusBanner implements Component {
  readonly el: HTMLElement;
  private lastLocale = '';

  constructor() {
    this.el = h('div', { class: 'status-banner', attrs: { role: 'alert', hidden: 'true' } });
  }

  update(state: AppState): void {
    const messages: string[] = [];
    if (!state.webglOk) messages.push(t('app.webglUnsupported'));
    else if (state.offline) messages.push(t('panel.offline'));
    else if (state.degraded) messages.push(t('panel.degraded'));

    if (!messages.length) { this.el.setAttribute('hidden', 'true'); return; }
    this.el.removeAttribute('hidden');
    if (this.lastLocale === state.locale && this.el.textContent === messages.join(' ')) return;
    this.lastLocale = state.locale;
    this.el.textContent = messages.join(' ');
  }
}
