import { api } from '../api/client';
import { RealtimeClient } from '../api/realtime';
import { Globe } from '../globe/globe';
import { GeoData } from '../maps/geo-data';
import { i18n } from '../i18n';
import type { NewsItem } from '../types';
import { detectPerfTier, getProfile, probeWebGL } from '../utils/perf';
import { throttle } from '../utils/format';
import { appStore, selectFiltered, selectMappable, type AppState } from '../state/app-state';
import { TopBar } from './top-bar';
import { SidePanel } from './side-panel';
import { LocationPanel } from './location-panel';
import { BottomBar } from './bottom-bar';
import { NewsModal } from './news-modal';
import { Dashboard } from './dashboard';
import { LoadingVeil, StatusBanner } from './overlays';
import type { AppActions, Component } from './types';

/**
 * Application shell. Owns the globe, the UI components, the realtime client and
 * all user actions, and keeps them in sync through a single store subscription.
 */
export class App {
  private readonly geo = new GeoData();
  private globe: Globe | null = null;
  private readonly components: Component[] = [];
  private readonly actions: AppActions;
  private realtime: RealtimeClient | null = null;
  private readonly sidePanel: SidePanel;
  private readonly locationPanel: LocationPanel;
  private readonly modal: NewsModal;
  private readonly dashboard: Dashboard;

  constructor(private readonly root: HTMLElement) {
    this.sidePanel = new SidePanel(this.actionsProxy());
    this.locationPanel = new LocationPanel(this.actionsProxy());
    this.modal = new NewsModal(this.actionsProxy());
    this.dashboard = new Dashboard(this.actionsProxy());
    this.actions = this.actionsProxy();
  }

  // Actions are created lazily but must be stable references for components.
  private actionsInstance: AppActions | null = null;
  private actionsProxy(): AppActions {
    if (this.actionsInstance) return this.actionsInstance;
    const self = this;
    this.actionsInstance = {
      setView: (view) => appStore.set({ view, selectedNewsId: null }),
      setCategory: (category) => appStore.set({ category }),
      setTimeRange: (timeRange) => appStore.set({ timeRange }),
      setQuery: (query) => appStore.set({ query }),
      setLocale: (locale) => { i18n.setLocale(locale); appStore.set({ locale }); },
      setReduceMotion: (reduceMotion) => {
        appStore.set({ reduceMotion });
        self.globe?.setReduceMotion(reduceMotion);
        document.documentElement.classList.toggle('reduce-motion', reduceMotion);
      },
      selectCountry: (country, fly = false) => self.selectCountry(country, fly),
      selectRegion: (region, fly = false) => self.selectRegion(region, fly),
      selectCity: (city, fly = false) => self.selectCity(city, fly),
      clearSelection: () => self.clearSelection(),
      openNews: (id) => self.openNews(id),
      closeNews: () => appStore.set({ selectedNewsId: null }),
      flyTo: (lat, lng, altitude) => self.globe?.flyTo(lat, lng, altitude),
      markNewSeen: () => appStore.set({ newCount: 0 }),
    };
    return this.actionsInstance;
  }

  async start(): Promise<void> {
    const tier = detectPerfTier();
    const profile = getProfile(tier, false);
    const webgl = probeWebGL();
    appStore.set({ webglOk: webgl.ok, reduceMotion: profile.reduceMotion, locale: i18n.current });

    this.root.appendChild(this.buildLayout());
    this.mountComponents();
    document.documentElement.classList.toggle('reduce-motion', profile.reduceMotion);

    // Load geographic metadata (small indexes) in parallel with first news.
    try {
      await this.geo.loadIndexes();
      this.buildGeoMaps();
    } catch (err) {
      console.warn('[app] geo indexes unavailable:', err);
    }

    if (webgl.ok) {
      try {
        this.globe = new Globe(this.root.querySelector('.globe') as HTMLElement, this.geo, profile, {
          onPickCountry: (id) => this.selectCountry(id, false),
          onPickRegion: (country, regionId) => { this.selectCountry(country, false); this.selectRegion(regionId, false); },
          onMarkerPick: (id) => this.openNews(id),
          onPickCity: (cityId) => this.selectCityById(cityId, true),
          onBackgroundClick: () => this.clearSelection(),
        });
        await this.globe.bordersLayer.setDetail(profile.borderDetail);
        this.globe.setAutoRotate(true);
      } catch (err) {
        console.warn('[app] globe init failed:', err);
        appStore.set({ webglOk: false });
      }
    }

    await this.loadInitialNews();
    this.startRealtime();
    this.subscribe();
    this.setupKeyboard();
    appStore.set({ ready: true });
  }

  private buildLayout(): HTMLElement {
    const layout = document.createElement('div');
    layout.className = 'layout';
    return layout;
  }

  private mountComponents(): void {
    const layout = this.root.querySelector('.layout') as HTMLElement;
    const topbar = new TopBar(this.actions);
    const bottomBar = new BottomBar(this.actions);
    const veil = new LoadingVeil();
    const banner = new StatusBanner();
    this.components.push(topbar, this.sidePanel, this.locationPanel, this.dashboard, bottomBar, veil, banner, this.modal);

    const globeHost = document.createElement('main');
    globeHost.className = 'globe';
    globeHost.id = 'main-content';
    globeHost.setAttribute('aria-label', i18n.t('a11y.globe'));

    const menuButton = document.createElement('button');
    menuButton.className = 'control control--menu';
    menuButton.type = 'button';
    menuButton.setAttribute('aria-label', i18n.t('a11y.menu'));
    menuButton.textContent = '☰';
    menuButton.addEventListener('click', () => document.body.classList.toggle('panel-open'));

    layout.append(
      topbar.el, globeHost, this.sidePanel.el, this.locationPanel.el,
      this.dashboard.el, bottomBar.el, veil.el, banner.el, menuButton, this.modal.el,
    );
  }

  private buildGeoMaps(): void {
    const countryInfo = new Map(this.geo.countries.map((c) => [c.id, c]));
    const regionInfo = new Map(this.geo.regions.map((r) => [r.id, r]));
    const regionsByCountry = new Map<string, typeof this.geo.regions>();
    for (const region of this.geo.regions) {
      const list = regionsByCountry.get(region.country);
      if (list) list.push(region); else regionsByCountry.set(region.country, [region]);
    }
    const cityInfo = new Map(this.geo.cities.map((c) => [c.id, c]));
    appStore.set({ countryInfo, regionInfo, regionsByCountry, cityInfo });
  }

  private async loadInitialNews(): Promise<void> {
    try {
      const res = await api.getNews({ limit: 500 });
      const merged = this.mergeItems(res.items);
      appStore.set({ items: merged, lastUpdated: new Date().toISOString() });
      this.realtime?.seed(merged.map((i) => i.id));
    } catch {
      appStore.set({ degraded: true });
    }
    try {
      const status = await api.getStatus();
      appStore.set({ status, degraded: status.degraded, lastUpdated: status.lastUpdated });
    } catch { /* status is optional */ }
  }

  private startRealtime(): void {
    this.realtime = new RealtimeClient({
      onItem: (item) => {
        const current = appStore.get();
        if (current.items.some((i) => i.id === item.id)) return;
        appStore.set({
          items: this.mergeItems([item, ...current.items]),
          newCount: current.newCount + 1,
          lastUpdated: new Date().toISOString(),
        });
      },
      onStatus: (status) => appStore.set({
        lastUpdated: status.lastUpdated,
        degraded: status.degraded,
        offline: false,
      }),
      onError: (kind) => appStore.set({ degraded: kind === 'degraded', offline: kind === 'offline' }),
    });
    this.realtime.seed(appStore.get().items.map((i) => i.id));
    this.realtime.start();
  }

  private mergeItems(items: NewsItem[]): NewsItem[] {
    const byId = new Map<string, NewsItem>();
    for (const item of items) byId.set(item.id, item);
    return [...byId.values()].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }

  private subscribe(): void {
    appStore.subscribe((state) => {
      for (const component of this.components) component.update(state);
      this.syncGlobe(state);
      document.documentElement.classList.toggle('panel-open', Boolean(state.selection.country));
    });
    // Initial paint.
    const initial = appStore.get();
    for (const component of this.components) component.update(initial);
    this.syncGlobe(initial);
  }

  private readonly syncGlobe = throttle((state: AppState) => {
    if (!this.globe) return;
    const filtered = selectFiltered(state);
    const mappable = selectMappable(filtered);
    this.globe.setMarkers(mappable.map((item) => ({
      id: item.id,
      lat: item.location.latitude as number,
      lng: item.location.longitude as number,
      category: item.category,
      publishedAt: item.publishedAt,
    })));
    this.globe.selectMarker(state.selectedNewsId);
  }, 150);

  private async selectCountry(country: string | null, fly: boolean): Promise<void> {
    if (!country) { this.clearSelection(); return; }
    appStore.set({ selection: { country, region: null, city: null }, view: 'globe' });
    if (this.globe) {
      try { await this.globe.showRegions(country); } catch { /* geometry optional */ }
      this.globe.highlightRegion(null);
      if (fly) {
        const record = this.geo.getCountry(country);
        if (record) this.globe.flyTo(record.centroid[1], record.centroid[0], 2.1);
      }
    }
  }

  private selectRegion(region: string | null, fly: boolean): void {
    const current = appStore.get().selection;
    appStore.set({ selection: { ...current, region, city: null } });
    if (this.globe) {
      this.globe.highlightRegion(region);
      if (region && fly) {
        const record = this.geo.getRegion(region);
        if (record) this.globe.flyTo(record.lat, record.lng, 1.45);
      }
    }
  }

  private selectCityById(cityId: string, fly: boolean): void {
    const record = appStore.get().cityInfo?.get(cityId);
    if (!record) return;
    if (record.country) this.selectCountry(record.country, false);
    if (record.regionId) this.selectRegion(record.regionId, false);
    this.selectCity(record.name, fly);
  }

  private selectCity(city: string | null, fly: boolean): void {
    const current = appStore.get().selection;
    appStore.set({ selection: { ...current, city } });
    if (city && fly && current.country) {
      const record = (current.region ? this.geo.citiesOfRegion(current.region) : this.geo.citiesOf(current.country)).find((c) => c.name === city);
      if (record) this.globe?.flyTo(record.lat, record.lng, 1.35);
    }
  }

  private clearSelection(): void {
    appStore.set({ selection: { country: null, region: null, city: null } });
    this.globe?.hideRegions();
    this.globe?.highlightRegion(null);
  }

  private openNews(id: string): void {
    appStore.set({ selectedNewsId: id, view: 'globe' });
    const item = appStore.get().items.find((i) => i.id === id);
    if (item?.location.latitude != null && item.location.longitude != null) {
      this.globe?.flyTo(item.location.latitude, item.location.longitude, 1.5);
      this.globe?.selectMarker(id);
    }
    this.sidePanel.highlight(item ?? null);
  }

  private setupKeyboard(): void {
    document.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      if (event.key === '/' && !typing) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.search__input')?.focus();
      }
      if (event.key === 'Escape' && !typing) this.clearSelection();
    });
  }

  destroy(): void {
    this.realtime?.stop();
    this.globe?.dispose();
    for (const component of this.components) component.destroy?.();
  }
}
