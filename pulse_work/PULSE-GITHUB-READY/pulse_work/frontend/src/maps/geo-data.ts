import type { CityRecord, CountryRecord, RegionRecord } from '../types';

/**
 * Client-side geographic data access.
 *
 * Only small metadata indexes load at startup. National borders load at the
 * detail level chosen by the performance tier, and continent-bundled region geometry is fetched lazily the first time a country is selected or zoomed.
 * City points remain in one compact global index for fast search and LOD rendering.
 * All files are served from /geo (static, cacheable).
 */

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: GeoGeometry;
  }>;
}

export type GeoGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
  | { type: 'Point'; coordinates: number[] }
  | { type: 'MultiPoint'; coordinates: number[][] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] };

type CountryIndex = { count: number; countries: CountryRecord[] };
type RegionIndex = { count: number; regions: RegionRecord[] };
type CityIndex = { count: number; cities: CityRecord[] };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

const bboxOf = (geometry: GeoGeometry): [number, number, number, number] => {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as number[];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      return;
    }
    if (Array.isArray(c)) for (const item of c) walk(item);
  };
  walk(geometry.coordinates);
  return [minX, minY, maxX, maxY];
};

/** Ray-casting point-in-polygon over a single linear ring. */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > lat) !== (yj > lat)
      && lng < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lng: number, lat: number, geometry: GeoGeometry): boolean {
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates;
    if (!pointInRing(lng, lat, outer)) return false;
    return !holes.some((hole) => pointInRing(lng, lat, hole));
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) => pointInGeometry(lng, lat, { type: 'Polygon', coordinates: poly }));
  }
  return false;
}

interface IndexedFeature {
  properties: Record<string, unknown>;
  geometry: GeoGeometry;
  bbox: [number, number, number, number];
}

export class GeoData {
  countries: CountryRecord[] = [];
  regions: RegionRecord[] = [];
  cities: CityRecord[] = [];

  private readonly countryById = new Map<string, CountryRecord>();
  private readonly regionById = new Map<string, RegionRecord>();
  private readonly regionGeometry = new Map<string, IndexedFeature[]>();
  private readonly regionGeometryPromise = new Map<string, Promise<IndexedFeature[]>>();
  private borders: IndexedFeature[] = [];
  private bordersDetail: 'low' | 'mid' | null = null;
  private loaded = false;

  get isLoaded(): boolean { return this.loaded; }

  async loadIndexes(): Promise<void> {
    if (this.loaded) return;
    const [countries, regions, cities] = await Promise.all([
      fetchJson<CountryIndex>('/geo/countries/index.json'),
      fetchJson<RegionIndex>('/geo/regions/index.json'),
      fetchJson<CityIndex>('/geo/cities/index.json'),
    ]);
    this.countries = countries.countries;
    this.regions = regions.regions;
    this.cities = cities.cities;
    for (const c of this.countries) this.countryById.set(c.id, c);
    for (const r of this.regions) this.regionById.set(r.id, r);
    this.loaded = true;
  }

  getCountry(id: string | null | undefined): CountryRecord | undefined {
    return id ? this.countryById.get(id.toUpperCase()) : undefined;
  }
  getRegion(id: string | null | undefined): RegionRecord | undefined {
    return id ? this.regionById.get(id.toUpperCase()) : undefined;
  }
  regionsOf(country: string): RegionRecord[] {
    const cc = country.toUpperCase();
    return this.regions.filter((r) => r.country === cc);
  }
  citiesOf(country: string): CityRecord[] {
    const cc = country.toUpperCase();
    return this.cities.filter((c) => c.country === cc).sort((a, b) => b.pop - a.pop);
  }

  citiesOfRegion(regionId: string): CityRecord[] {
    const id = regionId.toUpperCase();
    return this.cities.filter((c) => c.regionId === id).sort((a, b) => b.pop - a.pop);
  }

  async loadBorders(detail: 'low' | 'mid'): Promise<IndexedFeature[]> {
    if (this.bordersDetail === detail && this.borders.length) return this.borders;
    const fc = await fetchJson<FeatureCollection>(`/geo/countries/borders-${detail}.json`);
    this.borders = fc.features.map(toIndexed);
    this.bordersDetail = detail;
    return this.borders;
  }

  /** Lazily load and cache region polygons for a country. */
  async loadRegions(country: string): Promise<IndexedFeature[]> {
    const cc = country.toUpperCase();
    const cached = this.regionGeometry.get(cc);
    if (cached) return cached;
    const pending = this.regionGeometryPromise.get(cc);
    if (pending) return pending;
    const continent = this.countryById.get(cc)?.continent || 'Other';
    const bundle = continent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
    const promise = fetchJson<FeatureCollection>(`/geo/regions/bundles/${bundle}.json`)
      .then((fc) => {
        const indexed = fc.features
          .filter((feature) => String(feature.properties.country || '').toUpperCase() === cc)
          .map(toIndexed);
        this.regionGeometry.set(cc, indexed);
        this.regionGeometryPromise.delete(cc);
        return indexed;
      })
      .catch((err) => { this.regionGeometryPromise.delete(cc); throw err; });
    this.regionGeometryPromise.set(cc, promise);
    return promise;
  }

  /** Country feature containing a coordinate (uses loaded borders). */
  findCountry(lng: number, lat: number): { id: string; name: string } | null {
    for (const feature of this.borders) {
      const [minX, minY, maxX, maxY] = feature.bbox;
      if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
      if (pointInGeometry(lng, lat, feature.geometry)) {
        return { id: String(feature.properties.id), name: String(feature.properties.name) };
      }
    }
    return null;
  }

  /** Region feature containing a coordinate within a loaded country. */
  findRegion(country: string, lng: number, lat: number): { id: string; name: string } | null {
    const features = this.regionGeometry.get(country.toUpperCase());
    if (!features) return null;
    for (const feature of features) {
      const [minX, minY, maxX, maxY] = feature.bbox;
      if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
      if (pointInGeometry(lng, lat, feature.geometry)) {
        return { id: String(feature.properties.id), name: String(feature.properties.name) };
      }
    }
    return null;
  }

  hasRegionGeometry(country: string): boolean {
    return this.regionGeometry.has(country.toUpperCase());
  }

  regionFeatures(country: string): IndexedFeature[] {
    return this.regionGeometry.get(country.toUpperCase()) ?? [];
  }
}

function toIndexed(feature: FeatureCollection['features'][number]): IndexedFeature {
  return {
    properties: feature.properties,
    geometry: feature.geometry,
    bbox: bboxOf(feature.geometry),
  };
}

export type { IndexedFeature };
