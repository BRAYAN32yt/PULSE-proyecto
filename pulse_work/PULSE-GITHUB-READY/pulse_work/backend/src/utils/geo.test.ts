import { describe, expect, it } from 'vitest';
import {
  clampLat, gridKey, haversineKm, isValidLatLng, normalizeText, wrapLng,
} from './geo';

describe('haversineKm', () => {
  it('is ~0 for identical points', () => {
    expect(haversineKm(0, 0, 0, 0)).toBeCloseTo(0, 5);
  });

  it('matches a known distance (London→Paris ≈ 344 km)', () => {
    expect(haversineKm(51.5074, -0.1278, 48.8566, 2.3522)).toBeGreaterThan(330);
    expect(haversineKm(51.5074, -0.1278, 48.8566, 2.3522)).toBeLessThan(360);
  });
});

describe('normalizeText', () => {
  it('strips accents, case and punctuation', () => {
    expect(normalizeText('  Nuevo León, México!  ')).toBe('nuevo leon mexico');
  });
});

describe('gridKey', () => {
  it('buckets nearby coordinates together', () => {
    expect(gridKey(24.1, -98.5)).toBe(gridKey(24.9, -98.1));
    expect(gridKey(24.1, -98.5)).not.toBe(gridKey(25.4, -98.5));
  });
});

describe('clampLat / wrapLng', () => {
  it('clamps latitude to [-90, 90]', () => {
    expect(clampLat(120)).toBe(90);
    expect(clampLat(-120)).toBe(-90);
    expect(clampLat(45)).toBe(45);
  });

  it('wraps longitude into [-180, 180)', () => {
    expect(wrapLng(190)).toBeCloseTo(-170, 5);
    expect(wrapLng(-190)).toBeCloseTo(170, 5);
    expect(wrapLng(45)).toBe(45);
  });
});

describe('isValidLatLng', () => {
  it('rejects out-of-range and null-island coordinates', () => {
    expect(isValidLatLng(24, -98)).toBe(true);
    expect(isValidLatLng(0, 0)).toBe(false);
    expect(isValidLatLng(120, 10)).toBe(false);
    expect(isValidLatLng(10, 200)).toBe(false);
    expect(isValidLatLng('x', 10)).toBe(false);
  });
});
