import { IonSearchbar } from '@ionic/react';
import { forwardRef, useEffect, useRef, type ComponentProps } from 'react';
import { useApp } from '@/state/AppContext';

/** THE search field of the app (REVIEW cloud_34 Q4 (b)): Ionic names its inner input with a fixed English «search text» and passes no
 *  `aria-*` from the host (it inherits `lang` / `dir` only), so TalkBack heard no words of ours (emulator dump 43664565852). Its name = the
 *  words it shows: the inner input's `aria-label` = `placeholder`, set once it exists and again when the language changes (Ionic's render
 *  never rewrites its own constant). One component for every list's search, so no field is left without it.
 *  cloud_36 (REVIEW cloud_35 Q2): its clear «×» carries Ionic's English constant «reset» - named by the same rule: `common.clear`. */
export const SearchField = forwardRef<HTMLIonSearchbarElement, ComponentProps<typeof IonSearchbar>>((p, ref) => {
  const own = useRef<HTMLIonSearchbarElement | null>(null);
  const { placeholder } = p;
  const clear = useApp().t('common.clear');
  useEffect(() => {
    const el = own.current;
    if (!el || !placeholder) return;
    let on = true;
    void el.getInputElement().then((i) => {
      if (!on) return;
      i.setAttribute('aria-label', placeholder);
      el.querySelector('.searchbar-clear-button')?.setAttribute('aria-label', clear); // rendered with the input, in the same light DOM
    });
    return () => { on = false; };
  }, [placeholder, clear]);
  const setRef = (e: HTMLIonSearchbarElement | null) => {
    own.current = e;
    if (typeof ref === 'function') ref(e); else if (ref) ref.current = e;
  };
  return <IonSearchbar ref={setRef} {...p} />;
});
SearchField.displayName = 'SearchField';
