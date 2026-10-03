import { BufferAttribute, BufferGeometry, Color, Points, PointsMaterial } from 'three';

/**
 * Starfield background. Uses a single Points object (one draw call) with a
 * radial gradient sprite generated on a canvas, so no texture download is
 * needed. Count is driven by the performance tier.
 */
export function createStars(count: number, radius = 60): Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new Color();

  for (let i = 0; i < count; i++) {
    // Uniform distribution on a sphere shell.
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * (0.75 + Math.random() * 0.25);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const tint = 0.7 + Math.random() * 0.3;
    color.setHSL(0.55 + Math.random() * 0.08, 0.35, tint);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  const material = new PointsMaterial({
    size: 0.22,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  const points = new Points(geometry, material);
  points.name = 'stars';
  points.frustumCulled = false;
  return points;
}
