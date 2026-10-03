import { BufferAttribute, BufferGeometry, Color, Group, Points, PointsMaterial } from 'three';
import type { CityRecord } from '../types';
import { latLngToVector3 } from './coordinates';

/** Lightweight city layer: two point clouds, one for major cities and one for the regional layer. */
export class CityLayer {
  readonly group = new Group();
  private readonly major: Points;
  private readonly regional: Points;

  constructor(cities: CityRecord[]) {
    this.group.name = 'cities';
    this.major = this.build(cities.filter((c) => c.pop >= 1_000_000 || c.capital), '#bfeaff', 0.034, 'major');
    this.regional = this.build(cities.filter((c) => c.pop >= 100_000 && c.pop < 1_000_000 && !c.capital), '#7aa7c7', 0.018, 'regional');
    this.regional.visible = false;
    this.group.add(this.major, this.regional);
  }

  private build(cities: CityRecord[], color: string, size: number, kind: string): Points {
    const positions = new Float32Array(cities.length * 3);
    for (let i = 0; i < cities.length; i++) {
      const v = latLngToVector3(cities[i].lat, cities[i].lng, 1.012);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: new Color(color), size, sizeAttenuation: true,
      transparent: true, opacity: kind === 'major' ? 0.9 : 0.55, depthWrite: false,
    });
    const points = new Points(geometry, material);
    points.name = `cities-${kind}`;
    points.userData.cityIds = cities.map((c) => c.id);
    points.frustumCulled = false;
    return points;
  }

  update(zoom: number): void {
    this.regional.visible = zoom > 0.38;
    this.major.visible = true;
  }

  hitCityIndex(object: Points, instanceIndex: number): string | null {
    const ids = object.userData.cityIds as string[] | undefined;
    return ids?.[instanceIndex] ?? null;
  }

  dispose(): void {
    for (const points of [this.major, this.regional]) {
      points.geometry.dispose();
      (points.material as PointsMaterial).dispose();
    }
  }
}
