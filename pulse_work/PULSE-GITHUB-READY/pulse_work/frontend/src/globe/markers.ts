import {
  Color, ConeGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, Quaternion, SphereGeometry, Vector3,
} from 'three';
import type { Cluster } from '../workers/cluster.worker';
import { categoryColor } from '../news/categories';
import { GLOBE_RADIUS, latLngToVector3 } from './coordinates';

/**
 * News markers.
 *
 * A single InstancedMesh renders every marker (one draw call) for both single
 * stories and clusters. Clusters use a cone "pin"; singles a small sphere.
 * Recent items pulse via a light per-instance scale animation, which is
 * disabled when the user prefers reduced motion or the device is low-tier.
 */

const UP = new Vector3(0, 1, 0);
const MARKER_RADIUS = GLOBE_RADIUS * 1.01;
const BASE_SINGLE_SCALE = 0.011;
const BASE_CLUSTER_SCALE = 0.02;

interface AnimatedInstance { index: number; phase: number; baseScale: number; }

export class MarkerLayer {
  readonly group = new Group();
  private singles: InstancedMesh | null = null;
  private clusters: InstancedMesh | null = null;
  private readonly dummy = new Object3D();
  private readonly quaternion = new Quaternion();
  private readonly normal = new Vector3();
  private readonly matrix = new Matrix4();
  private readonly color = new Color();
  private animated: AnimatedInstance[] = [];
  private reduceMotion = false;
  private time = 0;
  private capacity = 1;
  private selectedId: string | null = null;

  constructor(capacity: number, reduceMotion: boolean) {
    this.group.name = 'markers';
    this.capacity = Math.max(64, capacity);
    this.reduceMotion = reduceMotion;
    this.singles = this.createMesh(new SphereGeometry(1, 8, 8), this.capacity);
    this.clusters = this.createMesh(new ConeGeometry(0.7, 2.2, 6), this.capacity);
    this.group.add(this.singles, this.clusters);
  }

  private createMesh(geometry: ConeGeometry | SphereGeometry, capacity: number): InstancedMesh {
    const material = new MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false });
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(35048 /* DynamicDrawUsage */);
    mesh.frustumCulled = false;
    mesh.count = 0;
    return mesh;
  }

  setReduceMotion(value: boolean): void { this.reduceMotion = value; }

  setSelected(markerId: string | null): void { this.selectedId = markerId; }

  /** Rebuild instance matrices from the latest clustering result. */
  update(clusters: Cluster[]): void {
    if (!this.singles || !this.clusters) return;
    this.animated = [];
    const singleIds: string[] = [];
    const clusterIds: string[] = [];
    let singleIndex = 0;
    let clusterIndex = 0;

    for (const cluster of clusters) {
      const isSingle = cluster.count === 1 && cluster.markerId !== undefined;
      const scale = (isSingle ? BASE_SINGLE_SCALE : BASE_CLUSTER_SCALE)
        * (isSingle && cluster.markerId === this.selectedId ? 1.8 : 1);
      const mesh = isSingle ? this.singles : this.clusters;
      const index = isSingle ? singleIndex++ : clusterIndex++;
      if (index >= this.capacity) continue;

      latLngToVector3(cluster.lat, cluster.lng, MARKER_RADIUS, this.normal);
      this.quaternion.setFromUnitVectors(UP, this.normal.clone().normalize());
      this.dummy.position.copy(this.normal);
      this.dummy.quaternion.copy(this.quaternion);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(index, this.dummy.matrix);
      this.color.set(categoryColor(cluster.category));
      mesh.setColorAt(index, this.color);

      if (isSingle) singleIds.push(cluster.markerId as string);
      else clusterIds.push(''); // clusters are not individually pickable

      if (!this.reduceMotion && cluster.recency > 0.55 && index < 400) {
        this.animated.push({ index, phase: Math.random() * Math.PI * 2, baseScale: scale });
      }
    }

    this.singles.count = Math.min(singleIndex, this.capacity);
    this.clusters.count = Math.min(clusterIndex, this.capacity);
    this.singles.userData.ids = singleIds;
    this.clusters.userData.ids = clusterIds;
    this.singles.instanceMatrix.needsUpdate = true;
    this.clusters.instanceMatrix.needsUpdate = true;
    if (this.singles.instanceColor) this.singles.instanceColor.needsUpdate = true;
    if (this.clusters.instanceColor) this.clusters.instanceColor.needsUpdate = true;
  }

  /** Advance pulse animation. Only animated (recent) instances are updated. */
  animate(delta: number): void {
    if (this.reduceMotion || !this.singles || !this.animated.length) return;
    this.time += delta;
    const mesh = this.singles;
    for (const item of this.animated) {
      if (item.index >= mesh.count) continue;
      const pulse = 1 + 0.28 * Math.sin(this.time * 3 + item.phase);
      mesh.getMatrixAt(item.index, this.matrix);
      this.dummy.matrix.copy(this.matrix);
      this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
      this.dummy.scale.setScalar(item.baseScale * pulse);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(item.index, this.dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.singles, this.clusters]) {
      if (!mesh) continue;
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
      mesh.dispose();
    }
    this.singles = null;
    this.clusters = null;
  }
}
