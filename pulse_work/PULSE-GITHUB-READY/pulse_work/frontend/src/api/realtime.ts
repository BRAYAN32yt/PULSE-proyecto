import { api, apiBase } from '../api/client';
import type { NewsEvent, NewsItem, RealtimeEvent } from '../types';

/**
 * Realtime client.
 *
 * Tries Server-Sent Events first (true push). If the connection cannot be
 * established — e.g. a serverless platform that does not hold long-lived
 * connections — it falls back to intelligent polling of /api/news/latest.
 * Both paths deliver the same normalized items to the caller.
 */
export interface RealtimeHandlers {
  onItem: (item: NewsItem, event: NewsEvent | null) => void;
  onStatus: (status: { lastUpdated: string; total: number; demo: boolean; degraded: boolean }) => void;
  onError: (kind: 'offline' | 'degraded') => void;
}

export class RealtimeClient {
  private source: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollSince: string | null = null;
  private closed = false;
  private mode: 'sse' | 'polling' = 'sse';
  private lastSeenIds = new Set<string>();

  constructor(private readonly handlers: RealtimeHandlers, private readonly pollIntervalMs = 45_000) {}

  get transport(): 'sse' | 'polling' { return this.mode; }

  start(): void {
    this.closed = false;
    this.connectSse();
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
  }

  private connectSse(): void {
    if (this.closed) return;
    try {
      this.source = new EventSource(`${apiBase}/api/stream`);
    } catch {
      this.startPolling();
      return;
    }

    const timeout = setTimeout(() => {
      if (this.source && this.source.readyState !== EventSource.OPEN) this.startPolling();
    }, 6000);

    this.source.addEventListener('open', () => {
      clearTimeout(timeout);
      this.mode = 'sse';
      this.stopPolling();
    });
    this.source.addEventListener('news', (event) => {
      const parsed = safeParse<RealtimeEvent>(event);
      if (parsed && parsed.type === 'news') {
        this.handlers.onItem(parsed.payload.item, parsed.payload.event);
      }
    });
    this.source.addEventListener('status', (event) => {
      const parsed = safeParse<RealtimeEvent>(event);
      if (parsed && parsed.type === 'status') this.handlers.onStatus(parsed.payload);
    });
    this.source.addEventListener('error', () => {
      clearTimeout(timeout);
      if (this.mode === 'sse') this.startPolling();
    });
  }

  private startPolling(): void {
    this.mode = 'polling';
    this.source?.close();
    this.source = null;
    if (this.pollTimer) return;
    this.pollOnce();
    this.pollTimer = setInterval(() => this.pollOnce(), this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  private async pollOnce(): Promise<void> {
    if (this.closed) return;
    try {
      const res = await api.getLatest(100, this.pollSince ?? undefined);
      const fresh = res.items.filter((item) => !this.lastSeenIds.has(item.id));
      for (const item of fresh) this.handlers.onItem(item, null);
      if (res.items[0]) this.pollSince = res.items[0].publishedAt;
      this.handlers.onStatus({
        lastUpdated: res.lastUpdated, total: res.total, demo: res.items.some((i) => i.origin === 'demo'), degraded: false,
      });
    } catch {
      this.handlers.onError(navigator.onLine ? 'degraded' : 'offline');
    }
  }

  /** Mark ids as already known so polling does not re-emit them. */
  seed(ids: string[]): void { this.lastSeenIds = new Set(ids); }

  private onOnline = (): void => {
    if (this.mode === 'polling') this.connectSse();
  };
  private onOffline = (): void => this.handlers.onError('offline');

  stop(): void {
    this.closed = true;
    this.source?.close();
    this.source = null;
    this.stopPolling();
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
  }
}

function safeParse<T>(event: MessageEvent): T | null {
  try { return JSON.parse(event.data) as T; } catch { return null; }
}
