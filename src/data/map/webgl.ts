/** WebGL present? (no MapLibre import: the mini-map's shell decides its stub before the lazy map chunk loads) */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** A-183 (6): which GL the device offers - the WebGL VERSION + RENDERER of a test context (≤ 120 chars), «none» without one; the error
 *  report of a map GL failure carries it so the site sees which GPUs fail */
export function glInfo(): string {
  try {
    const c = document.createElement('canvas');
    const g = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!g) return 'none';
    return `${String(g.getParameter(g.VERSION))} / ${String(g.getParameter(g.RENDERER))}`.slice(0, 120);
  } catch { return 'none'; }
}
