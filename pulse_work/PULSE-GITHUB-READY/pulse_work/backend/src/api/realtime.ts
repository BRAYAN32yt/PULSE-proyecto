import type { Request, Response } from 'express';
import type { NewsService } from '../news/news-service';
import type { RealtimeEvent } from '../types/domain';

/**
 * Server-Sent Events hub.
 *
 * SSE is used (rather than WebSockets) because updates flow one way
 * (server -> browser) and SSE reconnects automatically, works over plain HTTP
 * and needs no extra dependency. On serverless platforms without long-lived
 * connections, the client transparently falls back to polling /api/news/latest.
 */
export class RealtimeHub {
  private readonly clients = new Set<Response>();
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(private readonly service: NewsService) {
    service.on('realtime', (event: RealtimeEvent) => this.broadcast(event));
  }

  handle(req: Request, res: Response): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    this.clients.add(res);

    const status: RealtimeEvent = {
      type: 'status', at: new Date().toISOString(),
      payload: {
        lastUpdated: this.service.lastUpdate.toISOString(),
        total: this.service.queryNews({ limit: 1 }).total,
        demo: this.service.usingDemo,
        degraded: this.service.lastFailure !== null,
      },
    };
    this.send(res, status);

    req.on('close', () => {
      this.clients.delete(res);
    });

    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => {
        for (const client of this.clients) client.write(': ping\n\n');
      }, 25_000);
      this.heartbeat.unref?.();
    }
  }

  private broadcast(event: RealtimeEvent): void {
    for (const client of this.clients) this.send(client, event);
  }

  private send(res: Response, event: RealtimeEvent): void {
    try {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    } catch {
      this.clients.delete(res);
    }
  }

  get clientCount(): number { return this.clients.size; }
}
