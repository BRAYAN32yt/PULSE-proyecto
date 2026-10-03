/**
 * Device performance tiering. We estimate the device's capability once at
 * startup and derive concrete budgets (texture size, particle count, border
 * detail, marker limits, effects). This keeps the scene smooth on modest
 * hardware without ever looking broken.
 */

export type PerfTier = 'low' | 'medium' | 'high';

export interface PerfProfile {
  tier: PerfTier;
  /** Earth day texture width in px (256..4096). */
  textureSize: number;
  /** Star particle count. */
  starCount: number;
  /** Use the atmosphere shader glow. */
  atmosphere: boolean;
  /** Max simultaneous news markers (rest are clustered). */
  maxMarkers: number;
  /** Border dataset resolution. */
  borderDetail: 'low' | 'mid';
  /** Render device pixel ratio cap. */
  pixelRatio: number;
  /** Enable antialiasing. */
  antialias: boolean;
  /** Reduce motion (user preference or low tier). */
  reduceMotion: boolean;
}

const PROFILES: Record<PerfTier, PerfProfile> = {
  low: {
    tier: 'low', textureSize: 1024, starCount: 800, atmosphere: false,
    maxMarkers: 300, borderDetail: 'low', pixelRatio: 1, antialias: false, reduceMotion: true,
  },
  medium: {
    tier: 'medium', textureSize: 2048, starCount: 2500, atmosphere: true,
    maxMarkers: 1200, borderDetail: 'mid', pixelRatio: Math.min(1.35, window.devicePixelRatio || 1),
    antialias: true, reduceMotion: false,
  },
  high: {
    tier: 'high', textureSize: 4096, starCount: 6000, atmosphere: true,
    maxMarkers: 4000, borderDetail: 'mid', pixelRatio: Math.min(1.6, window.devicePixelRatio || 1),
    antialias: true, reduceMotion: false,
  },
};

export function detectPerfTier(): PerfTier {
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ?? false;

  if (saveData || prefersReduced) return cores <= 4 ? 'low' : 'medium';
  if (isMobile) return cores >= 8 && memory >= 6 ? 'medium' : 'low';
  if (cores >= 8 && memory >= 8) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

/** Quick WebGL capability probe (also detects a missing/failed context). */
export function probeWebGL(): { ok: boolean; renderer: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { ok: false, renderer: 'none' };
    const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? String((gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    const lose = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
    lose?.loseContext();
    // Software renderers (SwiftShader/llvmpipe) should be treated as low tier.
    const software = /swiftshader|llvmpipe|software|basic render/i.test(renderer);
    return { ok: true, renderer: software ? 'software' : renderer };
  } catch {
    return { ok: false, renderer: 'error' };
  }
}

export function getProfile(tier: PerfTier, reduceMotionOverride = false): PerfProfile {
  const profile = { ...PROFILES[tier] };
  if (reduceMotionOverride) profile.reduceMotion = true;
  return profile;
}
