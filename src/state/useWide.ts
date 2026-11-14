import { useEffect, useState } from 'react';

const Q = '(min-width: 600px)';

/** ≥600 dp → two-pane layouts (spec §2). */
export function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(Q).matches);
  useEffect(() => {
    const m = window.matchMedia(Q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}
