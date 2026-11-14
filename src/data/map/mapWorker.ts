// A-46: the map worker is bundled by Vite (`?worker&url`), so it is lowered to the engine floor like the page, and the
// polyfills it needs (MapLibre's own code calls `.at` / `Object.hasOwn`) are installed before MapLibre's worker code runs.
import '@/app/polyfills';
// maplibre-gl declares `sideEffects` (css, src only): a bare import of its dist worker - and even a re-export from the worker entry -
// is tree-shaken away (the worker never starts: no tiles, the map is never `idle`; measured cloud_16: a 530-byte worker).
// So the worker module is USED: its export is kept on the worker scope, which keeps the module and its start-up code.
// @ts-expect-error - the dist worker ships no type declaration (it is only ever loaded as the worker's code)
import * as mapLibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs';
(self as unknown as { __mapLibreWorker: unknown }).__mapLibreWorker = mapLibreWorker;
