import { Vector3 } from 'three';

/**
 * Latitude/longitude <-> 3D conversions, consistent with the equirectangular
 * texture mapping used by THREE.SphereGeometry.
 */

export const GLOBE_RADIUS = 1;

export function latLngToVector3(lat: number, lng: number, radius = GLOBE_RADIUS, target = new Vector3()): Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  const sinPhi = Math.sin(phi);
  return target.set(
    -radius * sinPhi * Math.cos(theta),
    radius * Math.cos(phi),
    radius * sinPhi * Math.sin(theta),
  );
}

export function vector3ToLatLng(point: Vector3): { lat: number; lng: number } {
  const r = point.length() || 1;
  const lat = 90 - (Math.acos(Math.min(1, Math.max(-1, point.y / r))) * 180) / Math.PI;
  const lng = (Math.atan2(point.z, -point.x) * 180) / Math.PI - 180;
  return { lat, lng: ((lng + 540) % 360) - 180 };
}

/** Fill a Float32Array of segment endpoints from polygon rings. */
export function ringsToSegments(
  rings: number[][][],
  radius: number,
  output: number[],
  step = 1,
): void {
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i += step) {
      const a = ring[i];
      const b = ring[i + 1] ?? ring[0];
      const va = latLngToVector3(a[1], a[0], radius);
      const vb = latLngToVector3(b[1], b[0], radius);
      output.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
    }
  }
}

/** Triangulate a polygon ring fan into the sphere surface (good enough for fills). */
export function ringToFan(ring: number[][], radius: number, output: number[]): void {
  if (ring.length < 3) return;
  const origin = latLngToVector3(ring[0][1], ring[0][0], radius);
  for (let i = 1; i < ring.length - 1; i++) {
    const b = latLngToVector3(ring[i][1], ring[i][0], radius);
    const c = latLngToVector3(ring[i + 1][1], ring[i + 1][0], radius);
    output.push(origin.x, origin.y, origin.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
}
