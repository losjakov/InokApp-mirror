import pkg from '../../package.json';

export const APP_VERSION: string = pkg.version;

/** `a` < `b` for plain X.Y.Z (A-62); a part that is not a number counts as 0 - the site's `min_app_version` (R-2) against ours. */
export function versionBelow(a: string, b: string): boolean {
  const n = (v: string) => v.split('.').map((x) => parseInt(x, 10) || 0);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
}
