import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(rootDir, '../data');

/**
 * Serves the generated geo datasets at /geo during dev and copies them into
 * the build output, so the client can lazy-load them per country. The data is
 * NOT bundled into JS — it is fetched on demand.
 */
function geoDataPlugin(): Plugin {
  let outDir = 'dist';
  const serve = (req: { url?: string }, res: any, next: () => void) => {
    const rel = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
    const file = path.resolve(dataDir, rel);
    if (!file.startsWith(dataDir)) { res.statusCode = 403; res.end('forbidden'); return; }
    fs.stat(file, (err: NodeJS.ErrnoException | null, stat: import("node:fs").Stats) => {
      if (err || !stat.isFile()) { next(); return; }
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'public, max-age=3600');
      fs.createReadStream(file).pipe(res);
    });
  };
  return {
    name: 'worldpulse-geo-data',
    apply: (_config, env) => env.mode !== 'test',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/geo', serve);
    },
    configResolved(config) { outDir = config.build.outDir; },
    closeBundle() {
      const target = path.resolve(rootDir, outDir, 'geo');
      fs.mkdirSync(target, { recursive: true });
      fs.cpSync(dataDir, target, { recursive: true });
      // eslint-disable-next-line no-console
      console.log(`[geo] copied datasets to ${path.relative(rootDir, target)}`);
    },
  };
}

export default defineConfig({
  plugins: [geoDataPlugin()],
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  worker: { format: 'es' },
  server: {
    port: 5173,
    host: true,
    // Allow proxied dev hosts (e.g. *.prod-runtime.all-hands.dev). Dev only.
    allowedHosts: true,
    proxy: {
      // Same-origin API in dev; avoids CORS entirely. SSE passes through.
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  preview: { port: 4173 },
});
