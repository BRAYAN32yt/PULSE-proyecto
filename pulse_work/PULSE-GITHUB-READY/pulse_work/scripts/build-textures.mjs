#!/usr/bin/env node
/**
 * build-textures.mjs
 * ---------------------------------------------------------------------------
 * Downloads the Earth day texture and produces a small, optimized set:
 *
 *   frontend/public/textures/earth-day-2k.jpg   2048x1024  (default / mobile)
 *   frontend/public/textures/earth-day-4k.jpg   4096x2048  (high tier)
 *   frontend/public/textures/earth-day-1k.jpg   1024x512   (low tier)
 *   frontend/public/textures/earth-bump.jpg     2048x1024  grayscale
 *
 * Textures are lazily selected at runtime by the performance tier, so slow
 * devices never download the 4K image.
 *
 * Source: NASA Blue Marble (public domain), mirrored by three-globe (MIT).
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'frontend', 'public', 'textures');
const CACHE = path.join(ROOT, '.cache', 'textures');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const DAY = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BUMP = 'https://unpkg.com/three-globe/example/img/earth-topology.png';

async function fetchTo(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 1024) return file;
  console.log('[textures] downloading', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

async function main() {
  const daySrc = await fetchTo(DAY, path.join(CACHE, 'earth-blue-marble.jpg'));
  const bumpSrc = await fetchTo(BUMP, path.join(CACHE, 'earth-topology.png'));

  const variants = [
    { name: 'earth-day-1k.jpg', width: 1024, quality: 70 },
    { name: 'earth-day-2k.jpg', width: 2048, quality: 82 },
    { name: 'earth-day-4k.jpg', width: 4096, quality: 84 },
  ];
  for (const v of variants) {
    const out = path.join(OUT, v.name);
    await sharp(daySrc)
      .resize(v.width, v.width / 2, { fit: 'cover' })
      .jpeg({ quality: v.quality, progressive: true, mozjpeg: true })
      .toFile(out);
    console.log(`[textures] ${v.name}  ${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
  }

  const bumpOut = path.join(OUT, 'earth-bump.jpg');
  await sharp(bumpSrc).resize(2048, 1024, { fit: 'cover' }).grayscale().jpeg({ quality: 60, progressive: true }).toFile(bumpOut);
  console.log(`[textures] earth-bump.jpg  ${(fs.statSync(bumpOut).size / 1024).toFixed(0)}KB`);
  console.log('[textures] done');
}

main().catch((err) => { console.error('[textures] failed:', err); process.exit(1); });
