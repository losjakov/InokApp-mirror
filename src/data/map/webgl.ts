/** WebGL present? (no MapLibre import: the mini-map's shell decides its stub before the lazy map chunk loads) */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
