import { t } from '../i18n';
import type { CityRecord, CountryRecord, RegionRecord } from '../types';
import { clear, h } from '../utils/dom';
import { flagEmoji, formatNumber, relativeTime } from '../utils/format';
import { selectFiltered, type AppState } from '../state/app-state';
import { createNewsCard } from './news-card';
import type { AppActions, Component } from './types';

/**
 * Right panel: the country -> region -> city drill-down, with live news counts
 * per administrative unit. Selecting a unit filters the feed and re-centers the
 * camera.
 */
export class LocationPanel implements Component {
  readonly el: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private lastLocale = '';

  constructor(private readonly actions: AppActions) {
    this.bodyEl = h('div', { class: 'panel__body' });
    this.el = h('aside', { class: 'panel panel--right', attrs: { 'aria-label': t('panel.location'), hidden: 'true' } }, [
      h('div', { class: 'panel__head' }, [
        h('h2', { class: 'panel__title', text: t('panel.location') }),
        h('button', {
          class: 'control control--icon',
          attrs: { type: 'button', 'aria-label': t('panel.close') },
          text: '✕',
          on: { click: () => this.actions.clearSelection() },
        }),
      ]),
      this.bodyEl,
    ]);
  }

  update(state: AppState): void {
    const { selection } = state;
    if (!selection.country) { this.el.setAttribute('hidden', 'true'); return; }
    this.el.removeAttribute('hidden');

    const filtered = selectFiltered(state);
    const country = state.countryInfo?.get(selection.country) ?? null;
    clear(this.bodyEl);

    this.bodyEl.appendChild(this.header(state, country, filtered.length));

    if (!selection.region) {
      this.bodyEl.appendChild(this.regionList(state));
    } else if (!selection.city) {
      this.bodyEl.appendChild(this.cityList(state));
    } else {
      this.bodyEl.appendChild(this.newsList(state));
    }

    if (this.lastLocale !== state.locale) this.lastLocale = state.locale;
  }

  private header(state: AppState, country: CountryRecord | null, count: number): HTMLElement {
    const { selection } = state;
    const region = selection.region ? state.regionInfo?.get(selection.region) : null;
    const title = [country?.name, region?.name, selection.city].filter(Boolean).join(' · ');
    return h('div', { class: 'location-header' }, [
      h('div', { class: 'location-header__title' }, [
        h('span', { class: 'location-header__flag', text: flagEmoji(selection.country) }),
        h('span', { text: title || selection.country || '' }),
      ]),
      h('div', { class: 'location-header__stats' }, [
        h('span', { class: 'location-header__count', text: t('panel.newsCount', { count }) }),
        h('span', { class: 'location-header__updated', text: `${t('panel.lastUpdate')}: ${relativeTime(state.lastUpdated, state.locale)}` }),
      ]),
    ]);
  }

  private regionList(state: AppState): HTMLElement {
    const selection = state.selection;
    const regions: RegionRecord[] = selection.country ? (state.regionsByCountry?.get(selection.country) ?? []) : [];
    const counts = new Map<string, number>();
    for (const item of selectFiltered(state)) {
      const id = item.location.administrativeLevel1;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    const withNews = regions
      .map((region) => ({ region, count: counts.get(region.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.region.name.localeCompare(b.region.name));

    const list = h('div', { class: 'region-list', attrs: { role: 'list' } });
    if (!withNews.length) {
      list.appendChild(h('p', { class: 'empty', text: t('panel.noNews') }));
      return list;
    }
    for (const { region, count } of withNews) {
      const row = h('button', {
        class: `region-row${count ? '' : ' is-empty'}`,
        attrs: { type: 'button', role: 'listitem', 'aria-label': `${region.name}, ${count}` },
        on: { click: () => this.actions.selectRegion(region.id, true) },
      }, [
        h('span', { class: 'region-row__name', text: region.name }),
        h('span', { class: 'region-row__type', text: region.type }),
        h('span', { class: `region-row__count${count ? ' has-news' : ''}`, text: formatNumber(count, state.locale) }),
      ]);
      list.appendChild(row);
    }
    return list;
  }


  private cityList(state: AppState): HTMLElement {
    const regionId = state.selection.region;
    if (!regionId) return h('div', { class: 'empty', text: t('panel.noNews') });
    const cities: CityRecord[] = this.actionsCityData(state);
    const counts = new Map<string, number>();
    for (const item of selectFiltered(state)) {
      const city = item.location.city;
      if (city) counts.set(city.toLowerCase(), (counts.get(city.toLowerCase()) ?? 0) + 1);
    }

    const list = h('div', { class: 'region-list', attrs: { role: 'list' } });
    const rows = cities.map((city) => ({ city, count: counts.get(city.name.toLowerCase()) ?? 0 }))
      .sort((a, b) => b.count - a.count || b.city.pop - a.city.pop || a.city.name.localeCompare(b.city.name));
    if (!rows.length) {
      list.appendChild(h('p', { class: 'empty', text: t('panel.noCities') }));
      return list;
    }

    list.appendChild(h('button', {
      class: 'link-button', attrs: { type: 'button' }, text: `← ${t('panel.statesWithNews')}`,
      on: { click: () => this.actions.selectRegion(null, false) },
    }));

    for (const { city, count } of rows.slice(0, 80)) {
      const row = h('button', {
        class: `region-row city-row${count ? '' : ' is-empty'}`,
        attrs: { type: 'button', role: 'listitem', 'aria-label': `${city.name}, ${count}` },
        on: { click: () => this.actions.selectCity(city.name, true) },
      }, [
        h('span', { class: 'city-row__icon', text: city.capital ? '★' : '•', attrs: { 'aria-hidden': 'true' } }),
        h('span', { class: 'region-row__name', text: city.name }),
        h('span', { class: 'city-row__population', text: city.pop ? formatNumber(city.pop, state.locale) : '' }),
        h('span', { class: `region-row__count${count ? ' has-news' : ''}`, text: formatNumber(count, state.locale) }),
      ]);
      list.appendChild(row);
    }
    return list;
  }

  private actionsCityData(state: AppState): CityRecord[] {
    const regionId = state.selection.region;
    if (!regionId) return [];
    // Geo metadata is attached to the store through the region/country maps;
    // the component gets the city list through the globally indexed panel cache.
    // The App injects the city index on the document for this lightweight view.
    const data = state.cityInfo ? [...state.cityInfo.values()] : [];
    return data.filter((city) => city.regionId === regionId);
  }

  private newsList(state: AppState): HTMLElement {
    const items = selectFiltered(state);
    const container = h('div', { class: 'location-news' });
    container.appendChild(h('button', {
      class: 'link-button', attrs: { type: 'button' },
      text: selectionCityBackLabel(state),
      on: { click: () => this.actions.selectCity(null, false) },
    }));
    const list = h('div', { class: 'feed' });
    if (!items.length) list.appendChild(h('p', { class: 'empty', text: t('panel.noNews') }));
    for (const item of items.slice(0, 60)) list.appendChild(createNewsCard(item, (id) => this.actions.openNews(id)));
    container.appendChild(list);
    return container;
  }
}

function selectionCityBackLabel(_state: AppState): string {
  return `← ${t('panel.cities')}`;
}
