import pkg from '../../package.json';

export const APP_VERSION: string = pkg.version;

/** `a` < `b` for plain X.Y.Z (A-62); a part that is not a number counts as 0 - the site's `min_app_version` (R-2) against ours. */
export function versionBelow(a: string, b: string): boolean {
  const n = (v: string) => v.split('.').map((x) => parseInt(x, 10) || 0);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
}

/** A-62: versionCode = X*10000 + Y*100 + Z (build.gradle computes the same for Android; iOS CFBundleVersion = it) - 1.0.15 = 10015. */
export function versionCode(v: string = APP_VERSION): number {
  const [x, y, z] = v.split('.').map((p) => parseInt(p, 10) || 0);
  return (x ?? 0) * 10000 + (y ?? 0) * 100 + (z ?? 0);
}
