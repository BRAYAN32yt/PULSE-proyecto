import { api } from '../api/client';
import { i18n, t } from '../i18n';
import { categoryMeta } from '../news/categories';
import type { NewsEvent, NewsItem } from '../types';
import { clear, h } from '../utils/dom';
import { flagEmoji, formatDateTime, relativeTime } from '../utils/format';
import type { AppActions, Component } from './types';
import type { AppState } from '../state/app-state';

/**
 * News detail modal. Shows only the summary/snippet provided by the source and
 * always links out to the original article — full articles are never copied.
 */
export class NewsModal implements Component {
  readonly el: HTMLElement;
  private readonly dialog: HTMLElement;
  private readonly content: HTMLElement;
  private lastFocused: HTMLElement | null = null;
  private current: NewsItem | null = null;
  private event: NewsEvent | null = null;
  private translated: string | null = null;

  constructor(private readonly actions: AppActions) {
    this.content = h('div', { class: 'modal__content', attrs: { id: 'news-detail' } });
    this.dialog = h('div', {
      class: 'modal__dialog',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('panel.summary'), tabindex: '-1' },
    }, [
      h('button', {
        class: 'modal__close control control--icon',
        attrs: { type: 'button', 'aria-label': t('panel.close') },
        text: '✕',
        on: { click: () => this.actions.closeNews() },
      }),
      this.content,
    ]);
    this.el = h('div', {
      class: 'modal',
      attrs: { hidden: 'true' },
      on: { click: (e) => { if (e.target === this.el) this.actions.closeNews(); } },
    }, [this.dialog]);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.hasAttribute('hidden')) this.actions.closeNews();
    });
  }

  update(state: AppState): void {
    const item = state.selectedNewsId ? state.items.find((i) => i.id === state.selectedNewsId) ?? null : null;
    if (!item) {
      this.el.setAttribute('hidden', 'true');
      this.current = null;
      return;
    }
    if (this.current?.id === item.id) return; // already shown
    this.current = item;
    this.translated = null;
    this.event = null;
    this.lastFocused = document.activeElement as HTMLElement | null;
    this.el.removeAttribute('hidden');
    this.render();
    this.dialog.focus();

    if (item.eventId) {
      api.getEvent(item.eventId)
        .then((res) => { if (this.current?.id === item.id) { this.event = res.event; this.render(); } })
        .catch(() => { /* event grouping is optional */ });
    }
  }

  private render(): void {
    const item = this.current;
    if (!item) return;
    clear(this.content);
    const meta = categoryMeta(item.category);

    this.content.appendChild(h('div', { class: 'modal__header' }, [
      h('span', {
        class: 'modal__category',
        style: { color: meta.color, borderColor: `${meta.color}66` },
      }, [h('span', { attrs: { 'aria-hidden': 'true' }, text: meta.icon }), h('span', { text: t(meta.labelKey) })]),
      item.origin === 'demo' ? h('span', { class: 'badge badge--demo', text: t('panel.demoBadge') }) : null,
      h('span', { class: `badge badge--status status--${item.status}`, text: t(`status.${item.status}`) }),
    ]));

    this.content.appendChild(h('h2', { class: 'modal__title', text: item.title }));

    if (item.image) {
      this.content.appendChild(h('img', {
        class: 'modal__image',
        attrs: { src: item.image, alt: item.title, loading: 'lazy', referrerpolicy: 'no-referrer' },
      }));
    }

    const summary = this.translated ?? item.description;
    if (summary) {
      this.content.appendChild(h('p', { class: 'modal__summary', text: summary }));
    }

    const translationRow = this.translationRow(item);
    if (translationRow) this.content.appendChild(translationRow);

    this.content.appendChild(h('dl', { class: 'modal__facts' }, [
      this.fact(t('panel.source'), item.source),
      this.fact(t('panel.published'), `${formatDateTime(item.publishedAt, i18n.current)} (${relativeTime(item.publishedAt, i18n.current)})`),
      item.location.countryName ? this.fact(t('panel.country'), `${flagEmoji(item.location.country)} ${item.location.countryName}`) : null,
      item.location.administrativeLevel1Name ? this.fact(t('panel.region'), item.location.administrativeLevel1Name) : null,
      item.location.city ? this.fact(t('panel.city'), item.location.city) : null,
    ].filter(Boolean) as HTMLElement[]));

    if (this.event && this.event.sources.length > 1) {
      this.content.appendChild(this.sourcesSection(this.event));
    }

    this.content.appendChild(h('a', {
      class: 'button button--primary',
      attrs: { href: item.url, target: '_blank', rel: 'noopener noreferrer' },
      text: t('panel.readOriginal'),
    }));
  }

  private translationRow(item: NewsItem): HTMLElement | null {
    const target = i18n.current;
    if (item.language.startsWith(target)) return null;
    const status = h('span', { class: 'modal__translation-status', text: t('lang.original', { lang: item.language }) });
    const button = h('button', {
      class: 'link-button',
      attrs: { type: 'button' },
      text: t('lang.translate'),
      on: {
        click: async () => {
          button.disabled = true;
          status.textContent = t('lang.translating');
          try {
            const res = await api.translate(item.description || item.title, target, item.language);
            this.translated = res.translatedText;
            this.render();
          } catch {
            status.textContent = t('lang.unavailable');
            button.disabled = false;
          }
        },
      },
    });
    return h('div', { class: 'modal__translation' }, [button, status]);
  }

  private sourcesSection(event: NewsEvent): HTMLElement {
    return h('section', { class: 'modal__sources' }, [
      h('h3', { text: t('panel.relatedSources', { count: event.sources.length }) }),
      h('ul', {}, event.sources.slice(0, 12).map((source) => h('li', {}, [
        h('a', {
          attrs: { href: source.url, target: '_blank', rel: 'noopener noreferrer' },
          text: source.source,
        }),
        h('span', { class: 'modal__source-time', text: relativeTime(source.publishedAt, i18n.current) }),
      ]))),
    ]);
  }

  private fact(label: string, value: string): HTMLElement {
    return h('div', { class: 'modal__fact' }, [
      h('dt', { text: label }),
      h('dd', { text: value }),
    ]);
  }

  destroy(): void {
    this.lastFocused?.focus?.();
  }
}
