import {
  Color, PerspectiveCamera, Raycaster, Scene, TextureLoader, Vector2, Vector3,
  WebGLRenderer, SphereGeometry, Mesh, ACESFilmicToneMapping, SRGBColorSpace, type Texture, type Points,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GeoData } from '../maps/geo-data';
import type { PerfProfile } from '../utils/perf';
import { createAmbientLight, createAtmosphereMaterial, createEarthMaterial, createSunLight } from './materials';
import { createStars } from './starfield';
import { BorderLayer, RegionLayer } from './borders';
import { MarkerLayer } from './markers';
import { CityLayer } from './cities';
import { GLOBE_RADIUS, latLngToVector3, vector3ToLatLng } from './coordinates';
import type { Cluster, ClusterMarker } from '../workers/cluster.worker';

export interface GlobeCallbacks {
  onPickCountry?: (id: string, name: string) => void;
  onPickRegion?: (country: string, regionId: string, regionName: string) => void;
  onHover?: (info: { lat: number; lng: number; country?: string } | null) => void;
  onBackgroundClick?: () => void;
  onMarkerPick?: (markerId: string) => void;
  onPickCity?: (cityId: string) => void;
  onZoomLevelChange?: (level: number) => void;
}

export interface GlobeMarkerInput {
  id: string;
  lat: number;
  lng: number;
  category: string;
  publishedAt: string;
}


export class Globe {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly earth: Mesh;
  private readonly atmosphere: Mesh;
  private readonly stars: Points;
  private readonly borders: BorderLayer;
  private readonly regions: RegionLayer;
  private readonly markers: MarkerLayer;
  private readonly cities: CityLayer;
  private readonly textureLoader = new TextureLoader();
  private readonly sunLight = createSunLight();
  private worker: Worker | null = null;
  private clusterRequestId = 0;
  private pendingMarkers: ClusterMarker[] = [];
  private lastClusterZoom = -1;
  private resizeObserver: ResizeObserver;
  private clock = performance.now();
  private rafId = 0;
  private disposed = false;
  private pageHidden = document.visibilityState === 'hidden';
  private lastFrameAt = 0;
  private readonly frameInterval = this.profile.tier === 'low' ? 1000 / 45 : 1000 / 60;
  private autoRotate = true;
  private userInteracted = false;
  private readonly hoverPoint = new Vector3();
  private lastHoverAt = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly geo: GeoData,
    private readonly profile: PerfProfile,
    private readonly callbacks: GlobeCallbacks = {},
  ) {
    this.renderer = new WebGLRenderer({
      antialias: profile.antialias,
      alpha: false,
      powerPreference: profile.tier === 'low' ? 'low-power' : 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(profile.pixelRatio, window.devicePixelRatio || 1));
    this.renderer.setClearColor(new Color('#03050d'), 1);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D Earth');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.tabIndex = 0;

    this.camera = new PerspectiveCamera(45, 1, 0.01, 400);
    this.camera.position.set(0, 0.6, 3.1);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.8;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.18;
    this.controls.maxDistance = 6;
    this.controls.autoRotate = this.autoRotate && !profile.reduceMotion;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.addEventListener('start', () => { this.userInteracted = true; this.controls.autoRotate = false; });
    this.controls.addEventListener('end', () => { this.callbacks.onZoomLevelChange?.(this.computeZoomLevel()); });

    this.stars = createStars(profile.starCount);
    this.scene.add(this.stars);

    // Earth
    const dayTexture = this.textureLoader.load(this.texturePath(profile.textureSize));
    dayTexture.colorSpace = SRGBColorSpace;
    dayTexture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    const bumpTexture = profile.tier === 'low' ? null : this.loadBump();
    this.earth = new Mesh(
      new SphereGeometry(GLOBE_RADIUS, profile.tier === 'low' ? 48 : 96, profile.tier === 'low' ? 32 : 64),
      createEarthMaterial(dayTexture, bumpTexture),
    );
    this.earth.name = 'earth';
    this.scene.add(this.earth);
    this.scene.add(this.sunLight);
    this.scene.add(createAmbientLight());

    // Atmosphere
    this.atmosphere = new Mesh(new SphereGeometry(GLOBE_RADIUS * 1.035, 48, 32), createAtmosphereMaterial('#2f6dff'));
    this.atmosphere.visible = profile.atmosphere;
    this.scene.add(this.atmosphere);

    this.borders = new BorderLayer(geo);
    this.regions = new RegionLayer(geo);
    this.markers = new MarkerLayer(profile.maxMarkers, profile.reduceMotion);
    this.cities = new CityLayer(geo.cities);
    this.scene.add(this.borders.group, this.regions.group, this.cities.group, this.markers.group);

    this.worker = this.createWorker();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();

    this.attachEvents();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.loop();
  }

  private loadBump(): Texture | null {
    try {
      const texture = this.textureLoader.load('/textures/earth-bump.jpg');
      texture.colorSpace = SRGBColorSpace;
      return texture;
    } catch { return null; }
  }

  private texturePath(size: number): string {
    if (size >= 4096) return '/textures/earth-day-4k.jpg';
    if (size >= 2048) return '/textures/earth-day-2k.jpg';
    return '/textures/earth-day-1k.jpg';
  }

  private createWorker(): Worker | null {
    try {
      const worker = new Worker(new URL('../workers/cluster.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<{ requestId: number; clusters: Cluster[] }>) => {
        if (event.data.requestId !== this.clusterRequestId) return;
        this.markers.update(event.data.clusters);
      };
      worker.onerror = (err) => console.warn('[globe] cluster worker error:', err.message);
      return worker;
    } catch (err) {
      console.warn('[globe] worker unavailable, clustering on main thread:', err);
      return null;
    }
  }

  private attachEvents(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    canvas.addEventListener('pointerleave', () => this.callbacks.onHover?.(null));
    canvas.addEventListener('click', (event) => this.onClick(event));
    canvas.addEventListener('dblclick', () => this.resetView());
  }

  private readonly onVisibilityChange = (): void => {
    this.pageHidden = document.visibilityState === 'hidden';
    this.clock = performance.now();
  };

  private updatePointer(event: PointerEvent): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return true;
  }

  private onPointerMove(event: PointerEvent): void {
    const now = performance.now();
    if (now - this.lastHoverAt < 60) return;
    this.lastHoverAt = now;
    if (!this.updatePointer(event)) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.earth, false)[0];
    if (!hit) { this.callbacks.onHover?.(null); return; }
    this.hoverPoint.copy(hit.point).normalize();
    const { lat, lng } = vector3ToLatLng(this.hoverPoint);
    this.callbacks.onHover?.({ lat, lng });
  }

  private onClick(event: PointerEvent): void {
    if (!this.updatePointer(event)) return;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const cityHits = this.raycaster.intersectObjects(this.cities.group.children, false);
    const cityHit = cityHits[0];
    const markerHit = this.raycaster.intersectObjects(this.markers.group.children, false)[0];
    const earthHit = this.raycaster.intersectObject(this.earth, false)[0];
    if (cityHit && cityHit.index != null && (!earthHit || cityHit.distance <= earthHit.distance + 0.02)) {
      const cityId = this.cities.hitCityIndex(cityHit.object as import('three').Points, cityHit.index);
      if (cityId) { this.callbacks.onPickCity?.(cityId); return; }
    }
    if (markerHit && markerHit.instanceId != null && (!earthHit || markerHit.distance <= earthHit.distance + 0.02)) {
      const ids = markerHit.object.userData?.ids as string[] | undefined;
      const id = ids?.[markerHit.instanceId];
      if (id) { this.callbacks.onMarkerPick?.(id); return; }
    }
    if (!earthHit) { this.callbacks.onBackgroundClick?.(); return; }

    this.hoverPoint.copy(earthHit.point).normalize();
    const { lat, lng } = vector3ToLatLng(this.hoverPoint);
    const country = this.geo.findCountry(lng, lat);
    if (!country) { this.callbacks.onBackgroundClick?.(); return; }

    // If region geometry for this country is loaded, try a finer hit.
    const region = this.geo.findRegion(country.id, lng, lat);
    if (region) {
      this.regions.highlightRegion(region.id);
      this.callbacks.onPickRegion?.(country.id, region.id, region.name);
    } else {
      this.callbacks.onPickCountry?.(country.id, country.name);
    }
  }

  /** Feed the marker set; clustering happens in the worker. */
  setMarkers(markers: GlobeMarkerInput[]): void {
    const now = Date.now();
    this.pendingMarkers = markers.map((m) => ({
      id: m.id,
      lat: m.lat,
      lng: m.lng,
      category: m.category,
      recency: Math.max(0, Math.min(1, 1 - (now - new Date(m.publishedAt).getTime()) / (6 * 3600_000))),
    }));
    this.requestClusters(true);
  }

  private requestClusters(force = false): void {
    const zoom = this.computeZoomLevel();
    if (!force && Math.abs(zoom - this.lastClusterZoom) < 0.02) return;
    this.lastClusterZoom = zoom;
    const payload = {
      requestId: ++this.clusterRequestId,
      markers: this.pendingMarkers,
      zoom,
      maxMarkers: this.profile.maxMarkers,
    };
    if (this.worker) this.worker.postMessage(payload);
    else this.clusterOnMainThread(payload);
  }

  private clusterOnMainThread(payload: { requestId: number; markers: ClusterMarker[]; zoom: number; maxMarkers: number }): void {
    // Fallback: simple grid clustering identical to the worker.
    const cell = 10 * Math.pow(0.02 / 10, Math.max(0, Math.min(1, payload.zoom)));
    const buckets = new Map<string, ClusterMarker[]>();
    for (const marker of payload.markers) {
      const key = `${Math.floor(marker.lng / cell)}:${Math.floor(marker.lat / cell)}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(marker); else buckets.set(key, [marker]);
    }
    const clusters: Cluster[] = [...buckets.values()].map((bucket) => ({
      lat: bucket.reduce((s, m) => s + m.lat, 0) / bucket.length,
      lng: bucket.reduce((s, m) => s + m.lng, 0) / bucket.length,
      count: bucket.length,
      category: bucket[0].category,
      recency: Math.max(...bucket.map((m) => m.recency)),
      markerId: bucket.length === 1 ? bucket[0].id : undefined,
    }));
    this.markers.update(clusters);
  }

  private computeZoomLevel(): number {
    const distance = this.camera.position.length();
    const min = this.controls.minDistance;
    const max = this.controls.maxDistance;
    return Math.max(0, Math.min(1, 1 - (distance - min) / (max - min)));
  }

  /** Smoothly move the camera to a coordinate. */
  flyTo(lat: number, lng: number, altitude = 1.9): void {
    const target = latLngToVector3(lat, lng, altitude);
    this.animateCamera(target);
  }

  resetView(): void {
    this.animateCamera(new Vector3(0, 0.6, 3.1));
  }

  private animateCamera(target: Vector3): void {
    const start = this.camera.position.clone();
    const startTime = performance.now();
    const duration = this.profile.reduceMotion ? 1 : 900;
    const step = () => {
      if (this.disposed) return;
      const t = Math.min(1, (performance.now() - startTime) / duration);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.camera.position.lerpVectors(start, target, eased);
      this.camera.lookAt(0, 0, 0);
      this.controls.update();
      if (t < 1) requestAnimationFrame(step);
      else this.callbacks.onZoomLevelChange?.(this.computeZoomLevel());
    };
    step();
  }

  /** Toggle auto-rotation (pauses while the user interacts). */
  setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled;
    this.controls.autoRotate = enabled && !this.userInteracted && !this.profile.reduceMotion;
  }

  private resize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (this.pageHidden) { this.clock = now; return; }
    if (now - this.lastFrameAt < this.frameInterval) return;
    this.lastFrameAt = now;
    const delta = Math.min(0.05, (now - this.clock) / 1000);
    this.clock = now;
    this.controls.update();
    this.markers.animate(delta);
    if (this.stars) this.stars.rotation.y += delta * 0.005;
    // Re-cluster as the camera moves.
    this.requestClusters();
    this.cities.update(this.computeZoomLevel());
    this.renderer.render(this.scene, this.camera);
  };

  /** Called when the user selects a country, to load its region polygons. */
  async showRegions(country: string): Promise<void> {
    await this.regions.showCountry(country);
  }

  /** Toggle reduced-motion behaviour at runtime (user preference). */
  setReduceMotion(value: boolean): void {
    this.markers.setReduceMotion(value);
    this.controls.autoRotate = this.autoRotate && !this.userInteracted && !value;
  }

  get bordersLayer(): BorderLayer { return this.borders; }

  hideRegions(): void { this.regions.hide(); }

  highlightRegion(regionId: string | null): void { this.regions.highlightRegion(regionId); }

  selectMarker(id: string | null): void { this.markers.setSelected(id); }

  get regionsVisible(): boolean { return this.regions.visible; }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.worker?.terminate();
    this.controls.dispose();
    this.borders.dispose();
    this.regions.dispose();
    this.markers.dispose();
    this.cities.dispose();
    this.earth.geometry.dispose();
    (this.earth.material as { dispose: () => void }).dispose();
    this.atmosphere.geometry.dispose();
    (this.atmosphere.material as { dispose: () => void }).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
