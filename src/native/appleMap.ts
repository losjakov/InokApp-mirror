import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { LAVRA_TYPE } from '@/data/map/geojson';
import { field, type MapPoint } from '@/data/repo/types';
import type { Lang } from '@/i18n';
import { OVERLAYS, overlayOpen } from '@/components/overlays';
import { isNative, platform } from './platform';

/**
 * A-183 (cloud_46): on an iPhone whose WebGL cannot draw our map (A-182's trigger), the «Карта» tab shows Apple's OWN map (MapKit, the
 * App target's plugin `InokAppleMap`, ios/App/App/InokAppleMapPlugin.swift) with the SAME houses our map draws. The native view lies ABOVE
 * the web view: it is hidden while any web overlay is open (sheets, dialogs, toasts) and while the tab is not the shown page. A failure of
 * the native map = A-182's list (never the stop screen). Android keeps the list (A-182 (4)).
 */
export interface Rect { x: number; y: number; width: number; height: number }
export interface AppleHouse { code: number; lat: number; lon: number; title: string; lavra: boolean }
export interface AppleMapPlugin {
  show(o: { rect: Rect; houses: AppleHouse[]; center?: { lat: number; lon: number }; open: string }): Promise<{ count: number }>;
  setRect(o: { rect: Rect }): Promise<void>;
  setVisible(o: { visible: boolean }): Promise<void>;
  setHouses(o: { houses: AppleHouse[] }): Promise<{ count: number }>;
  destroy(): Promise<void>;
  addListener(e: 'open', f: (d: { code: number }) => void): Promise<PluginListenerHandle>;
}
export const AppleMap = registerPlugin<AppleMapPlugin>('InokAppleMap');

/** THE choice of the «Карта» tab: our WebGL map, Apple's map (iPhone only, when ours cannot draw), or the houses list */
export type MapMode = 'webgl' | 'apple' | 'list';
export function mapMode(o: { glOk: boolean; ios: boolean; appleFailed: boolean }): MapMode {
  if (o.glOk) return 'webgl';
  return o.ios && !o.appleFailed ? 'apple' : 'list';
}
export const appleMapPossible = (): boolean => isNative() && platform() === 'ios';

/** the houses as Apple's annotations: name in the interface language, the lavras marked (gold) */
export const appleHouses = (rows: MapPoint[], lang: Lang): AppleHouse[] => rows.flatMap((r) => (r.lat == null || r.lon == null ? []
  : [{ code: r.code, lat: r.lat, lon: r.lon, title: field(r, 'name', lang), lavra: r.object_type === LAVRA_TYPE }]));

/** a web overlay over the map's area: the app's dialogs / sheets (the update door's own test) and toasts */
export const webOverlayOpen = (doc: Document = document): boolean => overlayOpen(doc, `${OVERLAYS}, ion-toast`);

/** One native map while the tab shows it: placed over `box`, shown / hidden by the overlays and the page, the houses replaced on change */
export class AppleMapView {
  private live = false;
  private visible = true;
  private pageShown = true;
  private sub: PluginListenerHandle | null = null;
  /** the first houses wait here until the area has a size (a page still entering: 0 x 0 - cloud_46 E2, ring 45328638031 iPad) */
  private pending: { houses: AppleHouse[]; open: string; center?: { lat: number; lon: number } } | null = null;
  private starting = false;
  constructor(private plugin: AppleMapPlugin, private rect: () => Rect | null, private onOpen: (code: number) => void,
    private onFail: (e: unknown) => void, private overlay: () => boolean = () => webOverlayOpen()) {}
  async start(houses: AppleHouse[], open: string, center?: { lat: number; lon: number }): Promise<void> {
    this.pending = { houses, open, ...(center ? { center } : {}) };
    return this.begin();
  }
  /** the native view made once the area has a size (asked again by every sync: a resize, the page shown, an overlay change) */
  private async begin(): Promise<void> {
    const r = this.rect();
    const p = this.pending;
    if (!r || !p || this.live || this.starting) return;
    this.starting = true; this.pending = null;
    const { houses, open, center } = p;
    try {
      this.sub = await this.plugin.addListener('open', (d) => this.onOpen(Number(d.code)));
      await this.plugin.show({ rect: r, houses, open, ...(center ? { center } : {}) });
      this.live = true;
      await this.sync();
    } catch (e) { this.fail(e); } finally { this.starting = false; }
  }
  /** the rect and the visibility as they are now (an overlay opened / closed, the page shown / left, a resize) */
  async sync(): Promise<void> {
    if (!this.live) { if (this.pending) await this.begin(); return; }
    const want = this.pageShown && !this.overlay();
    try {
      const r = this.rect();
      if (r && want) await this.plugin.setRect({ rect: r });
      if (want !== this.visible) { this.visible = want; await this.plugin.setVisible({ visible: want }); }
    } catch (e) { this.fail(e); }
  }
  page(shown: boolean): Promise<void> { this.pageShown = shown; return this.sync(); }
  async setHouses(houses: AppleHouse[]): Promise<void> {
    if (!this.live) { if (this.pending) this.pending = { ...this.pending, houses }; return; }
    try { await this.plugin.setHouses({ houses }); } catch (e) { this.fail(e); }
  }
  async stop(): Promise<void> {
    this.live = false;
    void this.sub?.remove(); this.sub = null;
    try { await this.plugin.destroy(); } catch { /* already gone */ }
  }
  private fail(e: unknown) { this.live = false; void this.stop(); this.onFail(e); }
}
