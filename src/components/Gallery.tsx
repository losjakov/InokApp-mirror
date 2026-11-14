import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { useApp } from '@/state/AppContext';
import type { GalleryItem } from '@/data/photos/gallery';
import { CoverImage } from './CoverImage';
import { PhotoViewer, viewerPhotos, type ViewerSet } from './PhotoViewer';

/** The cell = the widest thumbnail's own width (never upscaled, A-96 W-4 (a)); a gallery without sizes uses the site's 150. */
export const galleryCell = (items: GalleryItem[]): number => Math.max(...items.map((x) => x.w ?? 0), 0) || 150;

/**
 * A-96 W-4 (R-45): a site gallery in a publication of any kind - its thumbnails at their own size in a centred, even grid whose column
 * count follows the width (rotation re-flows it; CSS grid `auto-fit`, no script); each cell is THE photo slot (A-20: a thumbnail = the
 * small class, loaded as list thumbnails are; offline from the cache or the icon). A tap opens THE viewer on that photo with the whole
 * set to page through (the full file of the shown photo only).
 */
export function Gallery({ items, photoKey }: { items: GalleryItem[]; photoKey: string }) {
  const { t } = useApp();
  const [set, setSet] = useState<ViewerSet | null>(null);
  const photos = useMemo(() => viewerPhotos(items, photoKey), [items, photoKey]);
  const open = useCallback((at: number, shown: string) => setSet({ at, photos: photos.map((p, k) => (k === at ? { ...p, shown } : p)) }), [photos]);
  const style = { '--gallery-cell': `${galleryCell(items)}px` } as CSSProperties;
  return (
    <div className="gallery" style={style} role="list" data-testid="gallery-grid">
      {items.map((x, k) => (
        <div key={k} role="listitem" className="gallery__cell">
          <CoverImage code={photoKey} url={x.src} alt={x.alt} className="gallery__pic" small ratio={x.w && x.h ? x.w / x.h : 1}
            openable={{ open: (shown) => open(k, shown), label: `${t('photos.open')}: ${t('gallery.photo', { n: k + 1, total: items.length })}` }} />
        </div>
      ))}
      <PhotoViewer set={set} onClose={() => setSet(null)} />
    </div>
  );
}
