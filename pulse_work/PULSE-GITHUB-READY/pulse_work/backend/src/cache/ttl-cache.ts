/**
 * Tiny TTL cache used to avoid hammering upstream providers and to serve
 * responses quickly. Keeps both a value and its insertion time.
 */
export class TtlCache<T> {
  private readonly store = new Map<string, { value: T; at: number; ttl: number }>();

  constructor(private readonly defaultTtlMs = 60_000) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > hit.ttl) { this.store.delete(key); return undefined; }
    return hit.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, at: Date.now(), ttl: ttlMs });
  }

  /** Return a cached value or compute and cache it. */
  async wrap(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  delete(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
  get size(): number { return this.store.size; }
}
