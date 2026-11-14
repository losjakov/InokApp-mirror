/**
 * A-46: ONLY the polyfills the engine floor (ENGINE_FLOOR = Chrome 89) needs - found by the census of the bundle (REPORT cloud_16):
 * MapLibre 6 calls `Array.prototype.at` (Chrome 92) and `Object.hasOwn` (Chrome 93) unguarded, in the page and in its worker.
 * Syntax (class static blocks, Chrome 94) is lowered by the build target; our own code is held to the floor by eslint-plugin-compat.
 * Installed only where missing; loaded first by main.tsx and by the map worker (src/data/map/mapWorker.ts).
 */
function at<T>(this: ArrayLike<T>, i: number): T | undefined {
  const n = Math.trunc(i) || 0;
  const k = n < 0 ? this.length + n : n;
  return k < 0 || k >= this.length ? undefined : this[k];
}

const define = (o: object, name: string, value: unknown) =>
  Object.defineProperty(o, name, { value, writable: true, configurable: true, enumerable: false });

export function installPolyfills(g: typeof globalThis = globalThis): void {
  for (const C of [g.Array, g.String, g.Int8Array, g.Uint8Array, g.Uint8ClampedArray, g.Int16Array, g.Uint16Array, g.Int32Array, g.Uint32Array, g.Float32Array, g.Float64Array]) {
    if (C && !('at' in C.prototype)) define(C.prototype, 'at', at);
  }
  if (!('hasOwn' in g.Object)) define(g.Object, 'hasOwn', (o: object, k: PropertyKey) => Object.prototype.hasOwnProperty.call(o, k));
}

installPolyfills();
