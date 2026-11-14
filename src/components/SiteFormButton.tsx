import { IonButton, IonIcon } from '@ionic/react';
import { useEffect, useState } from 'react';
import { online, onNetChange } from '@/native/network';

/** The connection now, following its changes (Capacitor Network; the browser's `inok.net` in screens). */
export function useOnline(): boolean {
  const [net, setNet] = useState(true);
  useEffect(() => {
    let on = true;
    const read = () => void online().then((x) => on && setNet(x));
    read();
    const off = onNetChange(read);
    return () => { on = false; off(); };
  }, []);
  return net;
}

/**
 * THE button that opens a form of inok.info in the in-app tab (A-33 the article's «Додати коментар»; A-85 the streams' «Додайте свій
 * канал») - one look, one behaviour: it keeps its own label, goes quiet offline and the one grey line under it says why (D54).
 * `onOpen` = `openOnSite(page, lang, anchor)` (src/native/intents.ts) - the caller names the page and the anchor, nothing else differs.
 */
export function SiteFormButton({ icon, label, offline, onOpen, testId, offlineTestId, className }: {
  icon: string; label: string; offline: string; onOpen: () => Promise<void> | void; testId: string; offlineTestId: string; className?: string;
}) {
  const net = useOnline();
  return (
    <>
      <IonButton expand="block" fill="outline" className={className} disabled={!net} onClick={() => void onOpen()} data-testid={testId} data-net={net ? 'on' : 'off'}>
        <IonIcon slot="start" icon={icon} aria-hidden="true" />{label}
      </IonButton>
      {!net && <p className="comment__note" role="status" data-testid={offlineTestId}>{offline}</p>}
    </>
  );
}
