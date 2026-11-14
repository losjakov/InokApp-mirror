/**
 * D22 (cloud_06): boot phases in logcat (Capacitor forwards console to the `Capacitor/Console` tag) so the emulator smoke
 * can tell WHERE the first home after the import stops. One line per phase, never data or tokens.
 */
const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
export function bootLog(phase: string): void {
  const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0);
  console.info(`InokBoot: ${phase} +${ms}ms`);
}

/** D22: background work (feed, live status, config, push, photo downloads) starts once the first screen has been painted:
 *  two animation frames + a short pause; returns the cancel. */
export function afterFirstScreen(job: () => unknown, pauseMs = 800): () => void {
  let timer: number | undefined;
  let raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => { timer = window.setTimeout(() => void job(), pauseMs); }); });
  return () => { cancelAnimationFrame(raf); window.clearTimeout(timer); };
}
