import { Geolocation } from '@capacitor/geolocation';

export interface Position { lat: number; lon: number }

/** One shot, 10 s, cached up to 2 min. Throws when denied/unavailable — the caller shows `monasteries.no_location`. */
export async function currentPosition(): Promise<Position> {
  const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
  return { lat: p.coords.latitude, lon: p.coords.longitude };
}

/** True when location may be read WITHOUT a prompt (already granted) — the home screen fills «Поруч» only then; otherwise it
 *  shows a one-line invitation and asks on tap. */
export async function locationGranted(): Promise<boolean> {
  try {
    const s = await Geolocation.checkPermissions();
    return s.location === 'granted' || s.coarseLocation === 'granted';
  } catch {
    return false;
  }
}
