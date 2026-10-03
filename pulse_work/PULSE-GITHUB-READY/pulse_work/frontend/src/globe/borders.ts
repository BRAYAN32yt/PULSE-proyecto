import {
  BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Group,
} from 'three';
import type { GeoData, IndexedFeature } from '../maps/geo-data';
import { GLOBE_RADIUS, ringToFan, ringsToSegments } from './coordinates';

/**
 * Administrative boundary layers.
 *
 * - National borders: two detail levels (low/mid) selected by the perf tier.
 * - Region outlines + fills: loaded per country on demand (lazy), so we never
 *   build the whole planet at maximum detail up front.
 *
 * All geometry is built as line segments / triangle fans in single BufferGeometry
 * objects to keep draw calls low.
 */

const BORDER_RADIUS = GLOBE_RADIUS * 1.002;
const REGION_RADIUS = GLOBE_RADIUS * 1.0015;

export class BorderLayer {
  readonly group = new Group();
  private borders: LineSegments | null = null;
  private detail: 'low' | 'mid' | null = null;
  private countryIndex = new Map<string, number>();

  constructor(private readonly geo: GeoData) {
    this.group.name = 'borders';
  }

  async setDetail(detail: 'low' | 'mid'): Promise<void> {
    if (this.detail === detail && this.borders) return;
    const features = await this.geo.loadBorders(detail);
    this.build(features);
    this.detail = detail;
  }

  private build(features: IndexedFeature[]): void {
    const positions: number[] = [];
    this.countryIndex.clear();
    features.forEach((feature, index) => {
      this.countryIndex.set(String(feature.properties.id), index);
      const polygons = feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
      for (const polygon of polygons) ringsToSegments(polygon as number[][][], BORDER_RADIUS, positions);
    });

    if (this.borders) {
      this.group.remove(this.borders);
      this.borders.geometry.dispose();
      (this.borders.material as LineBasicMaterial).dispose();
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    const material = new LineBasicMaterial({ color: new Color('#7fd4ff'), transparent: true, opacity: 0.5 });
    this.borders = new LineSegments(geometry, material);
    this.borders.name = 'national-borders';
    this.borders.frustumCulled = false;
    this.group.add(this.borders);
  }

  setOpacity(value: number): void {
    if (this.borders) (this.borders.material as LineBasicMaterial).opacity = value;
  }

  dispose(): void {
    if (!this.borders) return;
    this.borders.geometry.dispose();
    (this.borders.material as LineBasicMaterial).dispose();
  }
}

export class RegionLayer {
  readonly group = new Group();
  private outline: LineSegments | null = null;
  private fill: Mesh | null = null;
  private highlight: LineSegments | null = null;
  private readonly outlineGeometry = new Map<string, { positions: number[]; bbox: number[] }>();
  private currentCountry: string | null = null;

  constructor(private readonly geo: GeoData) {
    this.group.name = 'regions';
    this.group.visible = false;
  }

  /** Build (once per country) and show region geometry for a country. */
  async showCountry(country: string): Promise<void> {
    const cc = country.toUpperCase();
    if (this.currentCountry === cc && this.group.visible) return;
    const features = await this.geo.loadRegions(cc);
    if (this.currentCountry !== cc) this.build(cc, features);
    this.currentCountry = cc;
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  get visible(): boolean { return this.group.visible; }
  get country(): string | null { return this.currentCountry; }

  private build(country: string, features: IndexedFeature[]): void {
    const outlinePositions: number[] = [];
    const fillPositions: number[] = [];
    this.outlineGeometry.clear();

    for (const feature of features) {
      const id = String(feature.properties.id);
      const local: number[] = [];
      const polygons = feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
      for (const polygon of polygons as number[][][][]) {
        ringsToSegments(polygon, REGION_RADIUS, local);
        ringToFan(polygon[0], REGION_RADIUS, fillPositions);
      }
      this.outlineGeometry.set(id, { positions: local, bbox: feature.bbox });
      outlinePositions.push(...local);
    }

    this.clearMeshes();
    if (!outlinePositions.length) return;

    const outlineGeom = new BufferGeometry();
    outlineGeom.setAttribute('position', new BufferAttribute(new Float32Array(outlinePositions), 3));
    const outlineMat = new LineBasicMaterial({ color: new Color('#9fe8ff'), transparent: true, opacity: 0.42 });
    this.outline = new LineSegments(outlineGeom, outlineMat);
    this.outline.frustumCulled = false;

    const fillGeom = new BufferGeometry();
    fillGeom.setAttribute('position', new BufferAttribute(new Float32Array(fillPositions), 3));
    const fillMat = new MeshBasicMaterial({ color: new Color('#1a3a6b'), transparent: true, opacity: 0.18, depthWrite: false });
    this.fill = new Mesh(fillGeom, fillMat);
    this.fill.frustumCulled = false;

    this.group.add(this.fill, this.outline);
    this.group.userData.country = country;
  }

  /** Highlight one region by rebuilding a small line set for it. */
  highlightRegion(regionId: string | null): void {
    if (this.highlight) {
      this.group.remove(this.highlight);
      this.highlight.geometry.dispose();
      (this.highlight.material as LineBasicMaterial).dispose();
      this.highlight = null;
    }
    if (!regionId) return;
    const entry = this.outlineGeometry.get(regionId.toUpperCase());
    if (!entry) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(entry.positions), 3));
    const material = new LineBasicMaterial({ color: new Color('#00e5ff'), transparent: true, opacity: 0.95 });
    this.highlight = new LineSegments(geometry, material);
    this.highlight.frustumCulled = false;
    this.group.add(this.highlight);
  }

  private clearMeshes(): void {
    for (const mesh of [this.fill, this.outline]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as LineBasicMaterial | MeshBasicMaterial).dispose();
    }
    this.fill = null;
    this.outline = null;
  }

  dispose(): void {
    this.clearMeshes();
    this.highlightRegion(null);
  }
}
