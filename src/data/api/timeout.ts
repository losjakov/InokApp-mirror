/**
 * A-46: the ONE timeout signal of every request. `AbortSignal.timeout` is Chrome 103+ (the reference phone runs
 * Chrome 98), so: an AbortController aborted by a timer. `abort()` takes no reason here (a reason is Chrome 98+, the floor is lower).
 */
export function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
