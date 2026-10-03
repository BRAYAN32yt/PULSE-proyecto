import { api } from '../api/client';
import { i18n, AVAILABLE_LOCALES, t } from '../i18n';
import type { SearchResponse } from '../types';
import { clear, h } from '../utils/dom';
import { debounce, flagEmoji } from '../utils/format';
import type { AppActions, Component } from './types';
import type { AppState } from '../state/app-state';

/** i18n keys for place-type headings (naive pluralisation would produce "citys"). */
const PLACE_GROUP_LABEL: Record<string, string> = {
  country: 'search.countries',
  region: 'search.regions',
  city: 'search.cities',
};

/** Top bar: brand, search box with grouped results, language and motion toggles. */
export class TopBar implements Component {
  readonly el: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly results: HTMLElement;
  private searchResults: SearchResponse | null = null;
  private open = false;

  constructor(private readonly actions: AppActions) {
    this.input = h('input', {
      class: 'search__input',
      attrs: {
        type: 'search',
        placeholder: t('search.placeholder'),
        'aria-label': t('search.label'),
        autocomplete: 'off',
        role: 'combobox',
        'aria-expanded': 'false',
        'aria-controls': 'search-results',
      },
      on: {
        input: () => this.onInput(),
        keydown: (e) => this.onKeydown(e),
        focus: () => { if (this.searchResults) this.showResults(); },
      },
    });

    this.results = h('div', {
      class: 'search__results',
      id: 'search-results',
      attrs: { role: 'listbox', hidden: 'true' },
    });

    const search = h('div', { class: 'search', attrs: { role: 'search' } }, [
      h('span', { class: 'search__icon', attrs: { 'aria-hidden': 'true' }, text: '⌕' }),
      this.input,
      this.results,
    ]);

    this.el = h('header', { class: 'topbar' }, [
      h('div', { class: 'topbar__brand' }, [
        h('span', { class: 'topbar__logo', attrs: { 'aria-hidden': 'true' } }),
        h('div', {}, [
          h('h1', { class: 'topbar__title', text: t('app.title') }),
          h('p', { class: 'topbar__subtitle', text: t('app.subtitle') }),
        ]),
      ]),
      search,
      h('div', { class: 'topbar__controls' }, [
        this.languageSelect(),
        this.motionToggle(),
      ]),
    ]);

    document.addEventListener('click', (e) => {
      if (this.open && !this.el.contains(e.target as Node)) this.hideResults();
    });
  }

  private languageSelect(): HTMLElement {
    const select = h('select', {
      class: 'control control--select',
      attrs: { 'aria-label': t('a11y.language'), title: t('a11y.language') },
      on: { change: () => this.actions.setLocale(select.value as AppState['locale']) },
    }, AVAILABLE_LOCALES.map((locale) => h('option', { attrs: { value: locale.code }, text: `${locale.flag} ${locale.label}` })));
    select.value = i18n.current;
    return select;
  }

  private motionToggle(): HTMLElement {
    const button = h('button', {
      class: 'control control--icon',
      attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': t('a11y.reduceMotion'), title: t('a11y.reduceMotion') },
      text: '⏸',
    });
    button.addEventListener('click', () => {
      const pressed = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', String(!pressed));
      this.actions.setReduceMotion(!pressed);
    });
    return button;
  }

  private onInput(): void {
    this.actions.setQuery(this.input.value);
    this.debouncedSearch(this.input.value);
  }

  private readonly debouncedSearch = debounce((value: string) => {
    const q = value.trim();
    if (q.length < 2) { this.searchResults = null; this.hideResults(); return; }
    api.search(q)
      .then((res) => { this.searchResults = res; this.showResults(); })
      .catch(() => { this.searchResults = null; this.hideResults(); });
  }, 220);

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { this.hideResults(); this.input.blur(); }
    if (event.key === 'Enter' && this.searchResults?.places[0]) {
      event.preventDefault();
      this.pickPlace(this.searchResults.places[0]);
    }
  }

  private showResults(): void {
    if (!this.searchResults) return;
    const res = this.searchResults;
    clear(this.results);
    const places = res.places ?? [];
    const news = res.news ?? [];

    if (!places.length && !news.length) {
      this.results.appendChild(h('div', { class: 'search__empty', text: t('search.noResults') }));
    }

    for (const group of ['country', 'region', 'city'] as const) {
      const entries = places.filter((p) => p.type === group);
      if (!entries.length) continue;
      this.results.appendChild(h('div', { class: 'search__group', text: t(PLACE_GROUP_LABEL[group]) }));
      for (const place of entries.slice(0, 5)) {
        this.results.appendChild(h('button', {
          class: 'search__item',
          attrs: { type: 'button', role: 'option' },
          on: { click: () => this.pickPlace(place) },
        }, [
          h('span', { class: 'search__item-flag', text: flagEmoji(place.country) }),
          h('span', { class: 'search__item-name', text: place.name }),
          h('span', { class: 'search__item-type', text: place.typeLabel || t(PLACE_GROUP_LABEL[place.type] ?? 'search.cities') }),
        ]));
      }
    }

    if (news.length) {
      this.results.appendChild(h('div', { class: 'search__group', text: t('search.news') }));
      for (const item of news.slice(0, 5)) {
        this.results.appendChild(h('button', {
          class: 'search__item',
          attrs: { type: 'button', role: 'option' },
          on: { click: () => { this.hideResults(); this.actions.openNews(item.id); } },
        }, [
          h('span', { class: 'search__item-flag', text: '📰' }),
          h('span', { class: 'search__item-name', text: item.title }),
        ]));
      }
    }

    this.open = true;
    this.results.removeAttribute('hidden');
    this.input.setAttribute('aria-expanded', 'true');
  }

  private pickPlace(place: SearchResponse['places'][number]): void {
    this.hideResults();
    this.input.value = place.name;
    this.actions.setQuery('');
    if (place.type === 'country') this.actions.selectCountry(place.id, true);
    else if (place.type === 'region') {
      this.actions.selectCountry(place.country, false);
      this.actions.selectRegion(place.id, true);
    } else {
      this.actions.selectCountry(place.country, false);
      if (place.administrativeLevel1) this.actions.selectRegion(place.administrativeLevel1, false);
      this.actions.selectCity(place.name, true);
    }
    this.actions.flyTo(place.lat, place.lng, place.type === 'country' ? 2.4 : 1.5);
  }

  private hideResults(): void {
    this.open = false;
    this.results.setAttribute('hidden', 'true');
    this.input.setAttribute('aria-expanded', 'false');
  }

  update(state: AppState): void {
    if (this.input.placeholder !== t('search.placeholder')) this.input.placeholder = t('search.placeholder');
    this.input.setAttribute('aria-label', t('search.label'));
    const select = this.el.querySelector('select');
    if (select && select.value !== state.locale) select.value = state.locale;
    const motion = this.el.querySelector('.control--icon');
    if (motion) {
      motion.setAttribute('aria-pressed', String(state.reduceMotion));
      motion.setAttribute('title', t('a11y.reduceMotion'));
    }
    if (state.query === '' && document.activeElement !== this.input) this.input.value = '';
  }
}
