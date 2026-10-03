import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { haversineKm, normalizeText } from '../utils/geo';

/**
 * GeoIndex loads the generated Natural Earth datasets (see
 * scripts/build-geo.mjs) and provides:
 *   - fast lookup of country / region / city by id or name
 *   - nearest-place reverse geocoding for news coordinates
 *   - structured search across all administrative levels
 *
 * Only the small metadata indexes are held in memory; polygon geometry stays
 * on the client and is lazy-loaded there.
 */

export interface CountryRecord {
  id: string; iso3: string; name: string; names: Record<string, string>;
  continent: string; subregion: string; centroid: [number, number];
  bbox: number[]; pop: number; regionCount: number; cityCount: number;
}

export interface RegionRecord {
  id: string; country: string; name: string; names: Record<string, string>;
  type: string; lat: number; lng: number;
}

export interface CityRecord {
  id: string; country: string; regionId: string | null; name: string;
  names: Record<string, string>; lat: number; lng: number; pop: number; capital: boolean;
}

interface Indexed<T> {
  items: T[];
  byId: Map<string, T>;
}

function loadJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (err) {
    console.warn(`[geo] could not read ${file}:`, (err as Error).message);
    return fallback;
  }
}

export class GeoIndex {
  readonly countries: Indexed<CountryRecord>;
  readonly regions: Indexed<RegionRecord>;
  readonly cities: Indexed<CityRecord>;
  private readonly countryByName = new Map<string, CountryRecord>();
  private readonly regionByName = new Map<string, RegionRecord[]>();
  private readonly cityByName = new Map<string, CityRecord[]>();

  constructor(private readonly dataDir = path.resolve(__dirname, '..', '..', config.paths.geo)) {
    const countries = loadJson<{ countries: CountryRecord[] }>(
      path.join(this.dataDir, 'countries', 'index.json'), { countries: [] });
    const regions = loadJson<{ regions: RegionRecord[] }>(
      path.join(this.dataDir, 'regions', 'index.json'), { regions: [] });
    const cities = loadJson<{ cities: CityRecord[] }>(
      path.join(this.dataDir, 'cities', 'index.json'), { cities: [] });

    this.countries = indexBy(countries.countries, (c) => c.id);
    this.regions = indexBy(regions.regions, (r) => r.id);
    this.cities = indexBy(cities.cities, (c) => c.id);

    for (const c of this.countries.items) {
      this.addName(this.countryByName, c.name, c);
      for (const n of Object.values(c.names)) this.addName(this.countryByName, n, c);
    }
    for (const r of this.regions.items) {
      this.addName(this.regionByName, r.name, r);
      for (const n of Object.values(r.names)) this.addName(this.regionByName, n, r);
    }
    for (const c of this.cities.items) {
      this.addName(this.cityByName, c.name, c);
      for (const n of Object.values(c.names)) this.addName(this.cityByName, n, c);
    }
    console.log(`[geo] index ready: ${this.countries.items.length} countries, ` +
      `${this.regions.items.length} regions, ${this.cities.items.length} cities`);
  }

  private addName<T>(map: Map<string, T | T[]>, raw: string, value: T): void {
    const key = normalizeText(raw);
    if (!key || key.length < 2) return;
    const existing = map.get(key);
    if (existing === undefined) map.set(key, value);
    else if (Array.isArray(existing)) { if (!existing.includes(value)) existing.push(value); }
    else map.set(key, [existing as T, value]);
  }

  getCountry(id: string | null | undefined): CountryRecord | undefined {
    return id ? this.countries.byId.get(id.toUpperCase()) : undefined;
  }
  getRegion(id: string | null | undefined): RegionRecord | undefined {
    return id ? this.regions.byId.get(id.toUpperCase()) : undefined;
  }
  getCity(id: string | null | undefined): CityRecord | undefined {
    return id ? this.cities.byId.get(id) : undefined;
  }
  findCountryByName(name: string): CountryRecord | undefined {
    const hit = this.countryByName.get(normalizeText(name));
    return Array.isArray(hit) ? hit[0] : hit;
  }

  /** Regions belonging to a country, most-populous cities first. */
  regionsOf(country: string): RegionRecord[] {
    const cc = country.toUpperCase();
    return this.regions.items.filter((r) => r.country === cc);
  }
  citiesOf(country: string): CityRecord[] {
    const cc = country.toUpperCase();
    return this.cities.items.filter((c) => c.country === cc).sort((a, b) => b.pop - a.pop);
  }
  citiesOfRegion(regionId: string): CityRecord[] {
    const id = regionId.toUpperCase();
    return this.cities.items.filter((c) => c.regionId === id).sort((a, b) => b.pop - a.pop);
  }

  /**
   * Resolve the best administrative location for a coordinate. Uses a coarse
   * bounding-box prefilter then nearest-city search, and finally falls back to
   * the nearest country centroid. Precision is reported honestly.
   */
  reverse(lat: number, lng: number): {
    country: string | null; administrativeLevel1: string | null; city: string | null;
    precision: 'city' | 'admin1' | 'country' | 'unknown';
  } {
    const nearestCountry = this.nearestCountry(lat, lng);
    if (!nearestCountry) return { country: null, administrativeLevel1: null, city: null, precision: 'unknown' };

    let bestCity: CityRecord | null = null;
    let bestKm = Infinity;
    for (const c of this.cities.items) {
      if (c.country !== nearestCountry.id) continue;
      const km = haversineKm(lat, lng, c.lat, c.lng);
      if (km < bestKm) { bestKm = km; bestCity = c; }
    }
    if (bestCity && bestKm <= 60) {
      return { country: bestCity.country, administrativeLevel1: bestCity.regionId, city: bestCity.name, precision: 'city' };
    }

    let bestRegion: RegionRecord | null = null;
    let bestRegionKm = Infinity;
    for (const r of this.regions.items) {
      if (r.country !== nearestCountry.id) continue;
      const km = haversineKm(lat, lng, r.lat, r.lng);
      if (km < bestRegionKm) { bestRegionKm = km; bestRegion = r; }
    }
    if (bestRegion && bestRegionKm <= 400) {
      return { country: nearestCountry.id, administrativeLevel1: bestRegion.id, city: null, precision: 'admin1' };
    }
    return { country: nearestCountry.id, administrativeLevel1: null, city: null, precision: 'country' };
  }

  private nearestCountry(lat: number, lng: number): CountryRecord | null {
    let best: CountryRecord | null = null;
    let bestKm = Infinity;
    for (const c of this.countries.items) {
      const [minX, minY, maxX, maxY] = c.bbox;
      const inside = lng >= minX - 5 && lng <= maxX + 5 && lat >= minY - 5 && lat <= maxY + 5;
      const km = inside ? 0 : haversineKm(lat, lng, c.centroid[1], c.centroid[0]);
      if (km < bestKm) { bestKm = km; best = c; }
    }
    return best;
  }

  /** Structured search over countries, regions and cities. */
  search(q: string, limit = 20): Array<{
    type: 'country' | 'region' | 'city'; id: string; name: string;
    country: string | null; countryName: string | null;
    administrativeLevel1: string | null; lat: number; lng: number;
    typeLabel?: string; pop?: number;
  }> {
    const query = normalizeText(q);
    if (!query) return [];
    const results: Array<ReturnType<GeoIndex['search']>[number] & { score: number }> = [];

    const push = (type: 'country' | 'region' | 'city', score: number, payload: Omit<ReturnType<GeoIndex['search']>[number], 'type'>) => {
      results.push({ type, score, ...payload });
    };

    for (const c of this.countries.items) {
      const s = matchScore(query, [c.name, ...Object.values(c.names)]);
      if (s > 0) push('country', s + 3, {
        id: c.id, name: c.name, country: c.id, countryName: c.name,
        administrativeLevel1: null, lat: c.centroid[1], lng: c.centroid[0],
      });
    }
    for (const r of this.regions.items) {
      const s = matchScore(query, [r.name, ...Object.values(r.names)]);
      if (s > 0) push('region', s + 2, {
        id: r.id, name: r.name, country: r.country,
        countryName: this.getCountry(r.country)?.name ?? null,
        administrativeLevel1: r.id, lat: r.lat, lng: r.lng, typeLabel: r.type,
      });
    }
    for (const c of this.cities.items) {
      const s = matchScore(query, [c.name, ...Object.values(c.names)]);
      if (s > 0) push('city', s + (c.pop > 500_000 ? 2 : c.pop > 100_000 ? 1 : 0), {
        id: c.id, name: c.name, country: c.country,
        countryName: this.getCountry(c.country)?.name ?? null,
        administrativeLevel1: c.regionId, lat: c.lat, lng: c.lng, pop: c.pop,
      });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score: _score, ...rest }) => rest);
  }
}

function indexBy<T>(items: T[], key: (item: T) => string): Indexed<T> {
  const byId = new Map<string, T>();
  for (const item of items) byId.set(key(item), item);
  return { items, byId };
}

/** Score how well a query matches a set of names (0 = no match). */
function matchScore(query: string, names: string[]): number {
  let best = 0;
  for (const name of names) {
    const n = normalizeText(name);
    if (!n) continue;
    if (n === query) best = Math.max(best, 10);
    else if (n.startsWith(query)) best = Math.max(best, 7);
    else if (n.includes(query)) best = Math.max(best, 4);
    else if (query.length >= 4 && query.includes(n)) best = Math.max(best, 2);
  }
  return best;
}

let singleton: GeoIndex | null = null;
export function getGeoIndex(): GeoIndex {
  if (!singleton) singleton = new GeoIndex();
  return singleton;
}
