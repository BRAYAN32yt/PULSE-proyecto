#!/usr/bin/env node
/**
 * build-geo.mjs
 * ---------------------------------------------------------------------------
 * Builds WorldPulse 3D geographic datasets from Natural Earth public-domain
 * data. Output is intentionally small and split so the client can lazy-load
 * only what it needs:
 *
 *   data/countries/index.json      country metadata + centroids (search, counts)
 *   data/countries/borders-low.json 110m national borders (zoomed out)
 *   data/countries/borders-mid.json 50m national borders (zoomed in)
 *   data/regions/index.json        administrative_level_1 metadata (all)
 *   data/regions/bundles/*.json   admin-1 polygons grouped by continent for GitHub-friendly file counts
 *   data/cities/index.json         populated places (search + city level); city points are embedded in this compact index
 *   data/meta.json                 provenance + counts
 *
 * Sources (public domain / CC0):
 *   - Natural Earth Vector  https://www.naturalearthdata.com/
 *   - world-atlas (TopoJSON of Natural Earth) https://github.com/topojson/world-atlas
 *
 * Geometry simplification is done with mapshaper (topology-preserving) so
 * shared borders stay consistent and the payload stays small.
 * ---------------------------------------------------------------------------
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const CACHE = path.join(ROOT, '.cache', 'geo');
const TMP = path.join(ROOT, '.tmp', 'geo');
const MAPSHAPER = path.join(ROOT, 'node_modules', '.bin', 'mapshaper');

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const SOURCES = {
  countriesLow: `${NE}/ne_110m_admin_0_countries.geojson`,
  countriesMid: `${NE}/ne_50m_admin_0_countries.geojson`,
  admin1: `${NE}/ne_10m_admin_1_states_provinces.geojson`,
  places: `${NE}/ne_10m_populated_places.geojson`,
};

for (const dir of [DATA, CACHE, TMP,
  path.join(DATA, 'countries'), path.join(DATA, 'regions'), path.join(DATA, 'cities')]) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Remove previous per-country outputs so removed/renamed ids don't linger. */
function cleanGenerated() {
  for (const sub of ['regions', 'cities']) {
    const dir = path.join(DATA, sub);
    for (const f of fs.readdirSync(dir)) {
      if (sub === 'regions' && (f === 'index.json' || f === 'bundles' || f === 'bundles-index.json')) continue;
      if (sub === 'cities' && f === 'index.json') continue;
      fs.rmSync(path.join(dir, f), { recursive: true, force: true });
    }
  }
  fs.mkdirSync(path.join(DATA, 'regions', 'bundles'), { recursive: true });
}

const log = (...a) => console.log('[geo]', ...a);

async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 1024 && !process.env.GEO_FORCE) {
    log('cached', path.basename(file));
    return file;
  }
  log('downloading', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  log('saved', path.basename(file), (buf.length / 1e6).toFixed(1) + 'MB');
  return file;
}

function mapshaper(args, outFile) {
  execFileSync(MAPSHAPER, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  return JSON.parse(fs.readFileSync(outFile, 'utf8'));
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, obj) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(obj));
  return fs.statSync(f).size;
};

function slug(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}

function countPoints(geometry) {
  if (!geometry) return 0;
  let n = 0;
  const walk = (c) => {
    if (typeof c[0] === 'number') { n++; return; }
    for (const x of c) walk(x);
  };
  walk(geometry.coordinates);
  return n;
}

function bboxOf(geometry) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
      return;
    }
    for (const x of c) walk(x);
  };
  walk(geometry.coordinates);
  return [minX, minY, maxX, maxY];
}

/** ISO-2 can be "-99" in Natural Earth; fall back to the "EH" variant. */
function iso2Of(p) {
  const candidates = [p.ISO_A2, p.ISO_A2_EH, p.iso_a2, p.ISO_A2_EH];
  for (const c of candidates) if (c && c !== '-99' && /^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
  return null;
}

function pickNames(p) {
  const names = {};
  const map = {
    en: ['NAME_EN', 'name_en', 'NAME'], es: ['NAME_ES', 'name_es'],
    fr: ['NAME_FR', 'name_fr'], pt: ['NAME_PT', 'name_pt'],
    de: ['NAME_DE', 'name_de'], it: ['NAME_IT', 'name_it'],
    ja: ['NAME_JA', 'name_ja'], ko: ['NAME_KO', 'name_ko'], zh: ['NAME_ZH', 'name_zh'],
  };
  for (const [k, keys] of Object.entries(map)) {
    for (const key of keys) {
      if (p[key] && typeof p[key] === 'string' && p[key] !== '-99') { names[k] = p[key]; break; }
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// 1. Countries
// ---------------------------------------------------------------------------
async function buildCountries() {
  log('— countries —');
  const lowSrc = await download(SOURCES.countriesLow, path.join(CACHE, 'ne_110m_admin_0_countries.geojson'));
  const midSrc = await download(SOURCES.countriesMid, path.join(CACHE, 'ne_50m_admin_0_countries.geojson'));

  const low = readJson(lowSrc);
  const countries = [];
  const byIso2 = new Map();
  const byIso3 = new Map();

  for (const f of low.features) {
    const p = f.properties;
    const iso2 = iso2Of(p);
    if (!iso2) continue;
    const iso3 = (p.ISO_A3 && p.ISO_A3 !== '-99') ? p.ISO_A3 : (p.ADM0_A3 || iso2);
    const entry = {
      id: iso2,
      iso3,
      name: p.NAME_EN || p.NAME || iso2,
      names: pickNames(p),
      continent: p.CONTINENT || '',
      subregion: p.SUBREGION || '',
      centroid: [
        Number.isFinite(p.LABEL_X) ? round(p.LABEL_X, 3) : round(bboxCenter(f.geometry)[0], 3),
        Number.isFinite(p.LABEL_Y) ? round(p.LABEL_Y, 3) : round(bboxCenter(f.geometry)[1], 3),
      ],
      bbox: bboxOf(f.geometry).map((v) => round(v, 2)),
      pop: Number(p.POP_EST) || 0,
      regionCount: 0,
      cityCount: 0,
    };
    countries.push(entry);
    byIso2.set(iso2, entry);
    byIso3.set(iso3, entry);
    byIso3.set(p.ADM0_A3, entry);
  }
  countries.sort((a, b) => a.name.localeCompare(b.name));

  // Simplified border geometry. Props reduced to id + name only.
  const lowBorders = mapshaper(
    [lowSrc, '-filter-fields', 'ISO_A2,ISO_A2_EH,ISO_A3,ADM0_A3,NAME,NAME_EN',
      '-each', 'iso2=this.properties.ISO_A2!="-99"?this.properties.ISO_A2:this.properties.ISO_A2_EH',
      '-filter', 'iso2 && /^[A-Za-z]{2}$/.test(iso2)',
      '-simplify', '18%', 'keep-shapes',
      '-o', 'precision=0.01', 'format=geojson', path.join(TMP, 'borders-low.json')],
    path.join(TMP, 'borders-low.json'),
  );
  const midBorders = mapshaper(
    [midSrc, '-filter-fields', 'ISO_A2,ISO_A2_EH,ISO_A3,ADM0_A3,NAME,NAME_EN',
      '-each', 'iso2=this.properties.ISO_A2!="-99"?this.properties.ISO_A2:this.properties.ISO_A2_EH',
      '-filter', 'iso2 && /^[A-Za-z]{2}$/.test(iso2)',
      '-simplify', '10%', 'keep-shapes',
      '-o', 'precision=0.002', 'format=geojson', path.join(TMP, 'borders-mid.json')],
    path.join(TMP, 'borders-mid.json'),
  );
  const slimBorders = (fc) => ({
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      type: 'Feature',
      properties: { id: String(f.properties.iso2).toUpperCase(), name: f.properties.NAME_EN || f.properties.NAME },
      geometry: f.geometry,
    })),
  });

  const s1 = writeJson(path.join(DATA, 'countries', 'borders-low.json'), slimBorders(lowBorders));
  const s2 = writeJson(path.join(DATA, 'countries', 'borders-mid.json'), slimBorders(midBorders));
  const s3 = writeJson(path.join(DATA, 'countries', 'index.json'), {
    generatedAt: new Date().toISOString(), count: countries.length, countries,
  });
  log(`countries: ${countries.length} | borders-low ${(s1 / 1e3).toFixed(0)}KB, borders-mid ${(s2 / 1e3).toFixed(0)}KB, index ${(s3 / 1e3).toFixed(0)}KB`);
  return { byIso2, byIso3 };
}

function bboxCenter(geometry) {
  const [minX, minY, maxX, maxY] = bboxOf(geometry);
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

const round = (n, p) => Math.round(n * 10 ** p) / 10 ** p;

// ---------------------------------------------------------------------------
// 2. Administrative level 1 (states / provinces / regions / prefectures)
// ---------------------------------------------------------------------------
async function buildRegions({ byIso2, byIso3 }) {
  log('— administrative level 1 —');
  const src = await download(SOURCES.admin1, path.join(CACHE, 'ne_10m_admin_1.geojson'));

  // Geometry (simplified, lean fields) — split per country afterwards.
  const geo = mapshaper(
    [src, '-filter-fields', 'iso_3166_2,iso_a2,adm0_a3,name,name_en,name_es,name_local,type_en,latitude,longitude,postal',
      '-simplify', '4%', 'keep-shapes',
      '-o', 'precision=0.001', 'format=geojson', path.join(TMP, 'admin1.json')],
    path.join(TMP, 'admin1.json'),
  );

  // Full properties for the metadata index (names, types, i18n).
  const full = readJson(src);
  const metaByCode = new Map();
  for (const f of full.features) metaByCode.set(f.properties.iso_3166_2 + '|' + f.properties.name, f.properties);

  const regions = [];
  const byCountry = new Map();
  const usedIds = new Set();

  for (const f of geo.features) {
    const p = f.properties;
    const country = /^[A-Za-z]{2}$/.test(p.iso_a2 || '') ? p.iso_a2.toUpperCase()
      : (byIso3.get(p.adm0_a3)?.id || null);
    if (!country || !byIso2.has(country)) continue;
    const meta = metaByCode.get(p.iso_3166_2 + '|' + p.name) || {};
    let id = (p.iso_3166_2 && p.iso_3166_2 !== '-99') ? p.iso_3166_2.toUpperCase() : null;
    if (!id || usedIds.has(id)) id = `${country}-${slug(p.name)}`;
    let unique = id, i = 2;
    while (usedIds.has(unique)) unique = `${id}-${i++}`;
    id = unique;
    usedIds.add(id);

    const names = pickNames(meta);
    if (p.name_en) names.en = p.name_en;
    if (p.name_es) names.es = p.name_es;

    const region = {
      id,
      country,
      name: p.name || meta.name || id,
      names,
      type: p.type_en || meta.type_en || 'Region',
      lat: round(Number(p.latitude ?? meta.latitude) || bboxCenter(f.geometry)[1], 3),
      lng: round(Number(p.longitude ?? meta.longitude) || bboxCenter(f.geometry)[0], 3),
    };
    regions.push(region);
    const slim = {
      type: 'Feature',
      properties: {
        id, country, name: region.name,
        name_en: names.en || region.name, name_es: names.es || region.name,
        type: region.type,
      },
      geometry: f.geometry,
    };
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country).push(slim);
  }

  regions.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));

  const continentByCountry = new Map();
  for (const [country, entry] of byIso2) continentByCountry.set(country, entry.continent || 'Other');
  const bundles = new Map();
  const bundleSlug = (value) => String(value || 'Other').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
  for (const [country, features] of byCountry) {
    const key = bundleSlug(continentByCountry.get(country) || 'Other');
    if (!bundles.has(key)) bundles.set(key, []);
    bundles.get(key).push(...features);
  }
  let totalBytes = 0;
  const bundleMap = {};
  for (const [bundle, features] of bundles) {
    totalBytes += writeJson(path.join(DATA, 'regions', 'bundles', `${bundle}.json`),
      { type: 'FeatureCollection', features });
    for (const feature of features) bundleMap[String(feature.properties.country).toUpperCase()] = bundle;
  }
  writeJson(path.join(DATA, 'regions', 'bundles-index.json'), {
    generatedAt: new Date().toISOString(), strategy: 'continent-bundled-region-geometry', bundles: bundleMap,
  });
  const idxBytes = writeJson(path.join(DATA, 'regions', 'index.json'), {
    generatedAt: new Date().toISOString(), count: regions.length, regions,
  });

  for (const r of regions) {
    const c = byIso2.get(r.country);
    if (c) c.regionCount++;
  }
  log(`regions: ${regions.length} across ${byCountry.size} countries | index ${(idxBytes / 1e3).toFixed(0)}KB, geometry ${(totalBytes / 1e6).toFixed(2)}MB total`);
  return { regions, byCountry };
}

// ---------------------------------------------------------------------------
// 3. Cities (populated places)
// ---------------------------------------------------------------------------
async function buildCities({ byIso2, regions }) {
  log('— cities —');
  const src = await download(SOURCES.places, path.join(CACHE, 'ne_10m_populated_places.geojson'));
  const fc = readJson(src);

  // Index regions by country + normalized name for city -> admin1 matching.
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const regionByName = new Map();
  for (const r of regions) {
    regionByName.set(r.country + '|' + norm(r.name), r.id);
    if (r.names.en) regionByName.set(r.country + '|' + norm(r.names.en), r.id);
    if (r.names.es) regionByName.set(r.country + '|' + norm(r.names.es), r.id);
  }

  const cities = [];
  const byCountry = new Map();
  for (const f of fc.features) {
    const p = f.properties;
    const country = iso2Of({ ISO_A2: p.ISO_A2 });
    if (!country) continue;
    const pop = Number(p.POP_MAX) || 0;
    if (pop < 1000 && !p.ADM0CAP) continue;
    const [lng, lat] = f.geometry.coordinates;
    const regionId = regionByName.get(country + '|' + norm(p.ADM1NAME)) || null;
    const names = pickNames(p);
    const id = `${country}-${p.GEONAMESID || slug(p.NAME)}`;
    const city = {
      id, country, regionId,
      name: p.NAME || p.NAMEASCII || id,
      names,
      lat: round(lat, 4), lng: round(lng, 4),
      pop, capital: !!p.ADM0CAP,
    };
    cities.push(city);
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country).push({
      type: 'Feature',
      properties: {
        id, country, regionId, name: city.name,
        name_en: names.en || city.name, name_es: names.es || city.name,
        pop, capital: city.capital,
      },
      geometry: { type: 'Point', coordinates: [city.lng, city.lat] },
    });
  }

  cities.sort((a, b) => b.pop - a.pop);
  const idxBytes = writeJson(path.join(DATA, 'cities', 'index.json'), {
    generatedAt: new Date().toISOString(), count: cities.length, cities,
  });
  for (const c of cities) {
    const co = byIso2.get(c.country);
    if (co) co.cityCount++;
  }
  log(`cities: ${cities.length} across ${byCountry.size} countries | index ${(idxBytes / 1e3).toFixed(0)}KB, points ${(totalBytes / 1e6).toFixed(2)}MB`);
  return { cities };
}

// ---------------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  cleanGenerated();
  const { byIso2, byIso3 } = await buildCountries();
  const { regions } = await buildRegions({ byIso2, byIso3 });
  const { cities } = await buildCities({ byIso2, regions });

  writeJson(path.join(DATA, 'meta.json'), {
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    license: 'Natural Earth — public domain',
    counts: { countries: byIso2.size, regions: regions.length, cities: cities.length },
  });
  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => { console.error('[geo] failed:', err); process.exit(1); });
