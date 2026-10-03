import type { AppState } from '../state/app-state';

/** Every UI widget implements this small lifecycle. */
export interface Component {
  readonly el: HTMLElement;
  update(state: AppState): void;
  destroy?(): void;
}

export interface AppActions {
  setView(view: AppState['view']): void;
  setCategory(category: AppState['category']): void;
  setTimeRange(range: AppState['timeRange']): void;
  setQuery(query: string): void;
  setLocale(locale: AppState['locale']): void;
  setReduceMotion(value: boolean): void;
  selectCountry(country: string | null, fly?: boolean): void;
  selectRegion(region: string | null, fly?: boolean): void;
  selectCity(city: string | null, fly?: boolean): void;
  clearSelection(): void;
  openNews(id: string): void;
  closeNews(): void;
  flyTo(lat: number, lng: number, altitude?: number): void;
  markNewSeen(): void;
}
