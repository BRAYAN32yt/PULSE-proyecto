/** Tiny observable store — no framework, no dependencies. */

export type Listener<T> = (state: T, previous: T) => void;

export class Store<T extends object> {
  private state: T;
  private readonly listeners = new Set<Listener<T>>();

  constructor(initial: T) { this.state = initial; }

  get(): Readonly<T> { return this.state; }

  set(patch: Partial<T> | ((state: T) => Partial<T>)): void {
    const previous = this.state;
    const delta = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...delta };
    for (const listener of this.listeners) listener(this.state, previous);
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Race a promise against a timeout; rejects with a clear error. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'request'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/** Retry with exponential backoff; used for the news snapshot fetch. */
export async function retry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 500): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      lastError = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw lastError;
}

/** Trailing-edge request coalescer: only the last call within a window runs. */
export function coalesce<A extends unknown[], R>(fn: (...args: A) => Promise<R>, waitMs = 200) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Array<{ resolve: (v: R) => void; reject: (e: unknown) => void; args: A }> = [];
  const run = () => {
    const batch = pending;
    pending = [];
    const last = batch[batch.length - 1];
    if (!last) return;
    fn(...last.args).then(
      (value) => batch.forEach((b) => b.resolve(value)),
      (err) => batch.forEach((b) => b.reject(err)),
    );
  };
  return (...args: A): Promise<R> => new Promise<R>((resolve, reject) => {
    pending.push({ resolve, reject, args });
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, waitMs);
  });
}
