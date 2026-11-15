/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { renderErrorPage } from './src/i18n/errorPage';
import { ENGINE_FLOOR, IOS_FLOOR } from './src/app/engineFloor';

// Serves /fixtures/* from the repository's fixtures folder in dev and preview (web = fixtures mode;
// the native app talks to the live API). Nothing from fixtures/ is copied into the production bundle.
function fixturesServer() {
  const root = fileURLToPath(new URL('./fixtures/', import.meta.url));
  const serve = (server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) => {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/fixtures/')) return next();
      const name = req.url.slice('/fixtures/'.length).split('?')[0];
      if (!/^[\w.-]+$/.test(name)) return next();
      const fs = await import('node:fs/promises');
      try {
        const data = await fs.readFile(root + name);
        res.setHeader('Content-Type', name.endsWith('.gz') ? 'application/gzip' : 'application/json; charset=utf-8');
        res.end(data);
      } catch {
        next();
      }
    });
  };
  return { name: 'inok-fixtures', configureServer: serve, configurePreviewServer: serve };
}

// Emits dist/error.html — the page Capacitor shows when the Android WebView is older than minWebViewVersion.
function errorPage(): Plugin {
  return {
    name: 'inok-error-page',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'error.html', source: renderErrorPage() });
    },
  };
}

export default defineConfig({
  plugins: [react(), fixturesServer(), errorPage()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  // A-46: the build target = THE engine floors (package.json browserslist: Android's Chrome, iOS's Safari - cloud_36); the map worker the same way
  build: { target: [`chrome${ENGINE_FLOOR}`, `safari${IOS_FLOOR}`], sourcemap: false },
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    testTimeout: 30000,
  },
});
