import type { GeoLocation, LocationPrecision } from '../types/domain';
import { isValidLatLng, normalizeText } from '../utils/geo';
import { GeoIndex, getGeoIndex } from './geo-index';

/**
 * Turns the messy location signals found in news feeds (country codes, names,
 * free-text mentions, coordinates) into a single, honest GeoLocation.
 *
 * Rule: never invent precision. If only a country is known, precision is
 * "country"; if a region is known, "admin1"; a matched city gives "city".
 */

export interface RawLocationInput {
  country?: string | null;        // ISO2, ISO3 or name
  administrativeLevel1?: string | null; // region id or name
  administrativeLevel2?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Optional free text to mine for place names when structured fields are absent. */
  text?: string | null;
}

const EMPTY: GeoLocation = {
  country: null, countryName: null,
  administrativeLevel1: null, administrativeLevel1Name: null,
  administrativeLevel2: null, administrativeLevel2Name: null,
  city: null, latitude: null, longitude: null, precision: 'unknown',
};

export class Locator {
  constructor(private readonly geo: GeoIndex = getGeoIndex()) {}

  /** Resolve a country from ISO2 / ISO3 / name. */
  resolveCountry(value: string | null | undefined): { id: string; name: string } | null {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const byId = this.geo.getCountry(raw);
    if (byId) return { id: byId.id, name: byId.name };
    const upper = raw.toUpperCase();
    const byIso3 = this.geo.countries.items.find((c) => c.iso3.toUpperCase() === upper);
    if (byIso3) return { id: byIso3.id, name: byIso3.name };
    const byName = this.geo.findCountryByName(raw);
    if (byName) return { id: byName.id, name: byName.name };
    return null;
  }

  resolveRegion(countryId: string | null, value: string | null | undefined): { id: string; name: string } | null {
    if (!value) return null;
    const raw = String(value).trim();
    const byId = this.geo.getRegion(raw);
    if (byId) return { id: byId.id, name: byId.name };
    const key = normalizeText(raw);
    const candidates = this.geo.regions.items.filter(
      (r) => (!countryId || r.country === countryId)
        && (normalizeText(r.name) === key || Object.values(r.names).some((n) => normalizeText(n) === key)),
    );
    if (candidates.length) {
      const pick = candidates[0];
      return { id: pick.id, name: pick.name };
    }
    return null;
  }

  resolveCity(countryId: string | null, regionId: string | null, value: string | null | undefined): {
    name: string; lat: number; lng: number; regionId: string | null; country: string;
  } | null {
    if (!value) return null;
    const key = normalizeText(String(value));
    if (!key) return null;
    let candidates = this.geo.cities.items.filter(
      (c) => normalizeText(c.name) === key || Object.values(c.names).some((n) => normalizeText(n) === key),
    );
    if (regionId) {
      const inRegion = candidates.filter((c) => c.regionId === regionId);
      if (inRegion.length) candidates = inRegion;
    }
    if (countryId) {
      const inCountry = candidates.filter((c) => c.country === countryId);
      if (inCountry.length) candidates = inCountry;
    }
    if (!candidates.length) return null;
    const pick = candidates.sort((a, b) => b.pop - a.pop)[0];
    return { name: pick.name, lat: pick.lat, lng: pick.lng, regionId: pick.regionId, country: pick.country };
  }

  /**
   * Build a GeoLocation from raw signals. Coordinates win for positioning, but
   * the reported precision reflects what we actually know.
   */
  locate(input: RawLocationInput): GeoLocation {
    const country = this.resolveCountry(input.country);

    let region = this.resolveRegion(country?.id ?? null, input.administrativeLevel1);
    let city = this.resolveCity(country?.id ?? null, region?.id ?? null, input.city);

    // Mine free text for a known city/region when structured fields are absent.
    if (!country && !city && input.text) {
      const mined = this.mineText(input.text);
      if (mined) {
        const minedCountry = this.resolveCountry(mined.country);
        const minedRegion = this.resolveRegion(minedCountry?.id ?? null, mined.region);
        const minedCity = this.resolveCity(minedCountry?.id ?? null, minedRegion?.id ?? null, mined.city);
        return finalize({
          country: minedCountry, region: minedRegion, city: minedCity,
          latitude: input.latitude ?? null, longitude: input.longitude ?? null,
        });
      }
      return { ...EMPTY };
    }

    return finalize({
      country, region, city,
      latitude: input.latitude ?? null, longitude: input.longitude ?? null,
    });
  }

  /** Reverse geocode a coordinate to the nearest known administrative unit. */
  fromCoordinates(lat: number, lng: number): GeoLocation {
    const hit = this.geo.reverse(lat, lng);
    const country = this.resolveCountry(hit.country);
    const region = this.resolveRegion(hit.country, hit.administrativeLevel1);
    const city = hit.city ? this.resolveCity(hit.country, hit.administrativeLevel1, hit.city) : null;
    return finalize({
      country, region, city,
      latitude: lat, longitude: lng,
      forcedPrecision: hit.precision,
    });
  }

  /** Cheap scan of free text for a matching city or region name. */
  private mineText(text: string): { country: string; region: string; city: string } | null {
    const haystack = ' ' + normalizeText(text) + ' ';
    let best: { country: string; region: string; city: string; weight: number } | null = null;
    for (const c of this.geo.cities.items) {
      if (c.pop < 200_000) continue;
      const n = normalizeText(c.name);
      if (n.length >= 4 && haystack.includes(' ' + n + ' ')) {
        const weight = c.pop + 1e9;
        if (!best || weight > best.weight) best = { country: c.country, region: c.regionId || '', city: c.name, weight };
      }
    }
    if (best) return { country: best.country, region: best.region, city: best.city };
    for (const r of this.geo.regions.items) {
      const n = normalizeText(r.name);
      if (n.length >= 4 && haystack.includes(' ' + n + ' ')) {
        return { country: r.country, region: r.name, city: '' };
      }
    }
    return null;
  }
}

interface FinalizeInput {
  country: { id: string; name: string } | null;
  region: { id: string; name: string } | null;
  city: { name: string; lat: number; lng: number; regionId: string | null; country: string } | null;
  latitude: number | null;
  longitude: number | null;
  forcedPrecision?: LocationPrecision;
}

function finalize(input: FinalizeInput): GeoLocation {
  const { country, region, city } = input;
  let precision: LocationPrecision = input.forcedPrecision ?? 'unknown';
  let latitude = input.latitude;
  let longitude = input.longitude;

  if (isValidLatLng(latitude, longitude)) {
    // Keep provided coordinates; precision follows the best known admin level.
    precision = city ? 'city' : region ? 'admin1' : country ? 'country' : 'unknown';
  } else if (city) {
    latitude = city.lat; longitude = city.lng; precision = 'city';
  } else if (region) {
    const r = getGeoIndex().getRegion(region.id);
    latitude = r?.lat ?? null; longitude = r?.lng ?? null; precision = 'admin1';
  } else if (country) {
    const c = getGeoIndex().getCountry(country.id);
    latitude = c?.centroid[1] ?? null; longitude = c?.centroid[0] ?? null; precision = 'country';
  } else {
    latitude = null; longitude = null; precision = 'unknown';
  }

  if (!isValidLatLng(latitude, longitude)) { latitude = null; longitude = null; if (precision !== 'unknown') precision = country ? 'country' : 'unknown'; }

  const resolvedCountryId = country?.id ?? city?.country ?? null;
  const countryRecord = resolvedCountryId ? getGeoIndex().getCountry(resolvedCountryId) : undefined;
  const regionId = region?.id ?? city?.regionId ?? null;
  const regionRecord = regionId ? getGeoIndex().getRegion(regionId) : undefined;

  return {
    country: resolvedCountryId,
    countryName: countryRecord?.name ?? country?.name ?? null,
    administrativeLevel1: regionId,
    administrativeLevel1Name: regionRecord?.name ?? region?.name ?? null,
    administrativeLevel2: null,
    administrativeLevel2Name: null,
    city: city?.name ?? null,
    latitude, longitude, precision,
  };
}

let singleton: Locator | null = null;
export function getLocator(): Locator {
  if (!singleton) singleton = new Locator();
  return singleton;
}
