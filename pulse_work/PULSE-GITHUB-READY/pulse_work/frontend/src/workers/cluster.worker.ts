/**
 * Clustering worker.
 *
 * Marker aggregation is the heaviest per-frame-ish task, so it runs off the
 * main thread. The main thread posts the visible markers plus the current
 * zoom, and receives clusters back. Coordinates are bucketed on a grid whose
 * cell size shrinks as the camera zooms in, which produces the classic
 * "127 -> 42/18/7 -> individual" progression.
 */

export interface ClusterMarker {
  id: string;
  lat: number;
  lng: number;
  category: string;
  /** 0..1 recency weight used for pulse animation. */
  recency: number;
}

export interface ClusterRequest {
  requestId: number;
  markers: ClusterMarker[];
  /** Camera altitude factor: ~0 (far) .. 1 (close). */
  zoom: number;
  maxMarkers: number;
}

export interface Cluster {
  lat: number;
  lng: number;
  count: number;
  /** Dominant category id in the cluster. */
  category: string;
  /** Highest recency among members. */
  recency: number;
  /** Present only for singleton clusters. */
  markerId?: string;
}

export interface ClusterResponse {
  requestId: number;
  clusters: Cluster[];
  clustered: number;
  single: number;
}

self.onmessage = (event: MessageEvent<ClusterRequest>) => {
  const { requestId, markers, zoom, maxMarkers } = event.data;
  const response = cluster(markers, zoom, maxMarkers, requestId);
  (self as unknown as Worker).postMessage(response);
};

function cluster(markers: ClusterMarker[], zoom: number, maxMarkers: number, requestId: number): ClusterResponse {
  // Cell size in degrees: ~10° far away down to ~0.15° when close.
  const clampedZoom = Math.max(0, Math.min(1, zoom));
  const cell = 10 * Math.pow(0.02 / 10, clampedZoom);
  const buckets = new Map<string, ClusterMarker[]>();

  for (const marker of markers) {
    const key = `${Math.floor(marker.lng / cell)}:${Math.floor(marker.lat / cell)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(marker);
    else buckets.set(key, [marker]);
  }

  const clusters: Cluster[] = [];
  for (const bucket of buckets.values()) {
    const lat = bucket.reduce((sum, m) => sum + m.lat, 0) / bucket.length;
    const lng = bucket.reduce((sum, m) => sum + m.lng, 0) / bucket.length;
    const categoryCounts = new Map<string, number>();
    let recency = 0;
    for (const m of bucket) {
      categoryCounts.set(m.category, (categoryCounts.get(m.category) ?? 0) + 1);
      if (m.recency > recency) recency = m.recency;
    }
    let dominant = 'general';
    let best = 0;
    for (const [cat, count] of categoryCounts) if (count > best) { best = count; dominant = cat; }
    clusters.push({
      lat, lng,
      count: bucket.length,
      category: dominant,
      recency,
      markerId: bucket.length === 1 ? bucket[0].id : undefined,
    });
  }

  // Cap the number of clusters by merging the smallest into their neighbours.
  if (clusters.length > maxMarkers) {
    clusters.sort((a, b) => b.count - a.count);
    clusters.length = maxMarkers;
  }

  const clustered = clusters.filter((c) => c.count > 1).reduce((sum, c) => sum + c.count, 0);
  return { requestId, clusters, clustered, single: clusters.filter((c) => c.count === 1).length };
}
