import { IonContent, IonPage } from '@ionic/react';
import { Busy } from '@/components/Busy';
import { callOutline, locationOutline, mailOutline, mapOutline, timeOutline } from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ExternalLinkRow, InfoRow } from '@/components/InfoRow';
import { DirectionsSheet } from '@/components/DirectionsSheet';
import { getContacts, hoursLines } from '@/data/repo/contacts';
import type { Contacts } from '@/data/api/types';
import { field } from '@/data/repo/types';
import { callPhone, mailTo } from '@/native/intents';
import { useApp } from '@/state/AppContext';
import { MiniMap } from '@/components/MiniMap';
import { ShareFooter } from '@/components/ShareFooter';
import { sitePageUrl } from '@/data/links/sitePages';
import { useNavigate } from 'react-router-dom';

const l3 = (prefix: string, o: Partial<Record<string, string | null>> | null | undefined) =>
  Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [`${prefix}_${k}`, v]));

/**
 * «Ще → Контакти» (A-23 #2, R-21): what /about/contacts/ prints from the site's constants — the editorial office's address and
 * its map point, the phone (+ the messenger note), the e-mail, when calls are answered — WITHOUT the project name, the founder
 * block and the «Комісія діє при…» sentence (the export leaves them out). Offline from the last import; the card's fact rows.
 */
export function ContactsPage() {
  const { db, t, lang, dict } = useApp();
  const [c, setC] = useState<Contacts | null | undefined>(undefined);
  const [dirs, setDirs] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { let on = true; void getContacts(db).then((x) => on && setC(x)); return () => { on = false; }; }, [db]);
  const title = dict.label_contacts || t('more.contacts');
  const address = c ? field(l3('a', c.address), 'a', lang) : '';
  const hours = c ? hoursLines(field(l3('h', c.hours), 'h', lang)) : null;
  const note = c ? field(l3('n', c.note), 'n', lang) : '';
  const geo = c?.lat != null && c?.lon != null;
  return (
    <IonPage>
      <PageHeader title={title} />
      <IonContent>
        {c === undefined ? <div className="empty"><Busy /></div> : !c ? <div className="empty" data-testid="contacts-empty">{t('contacts.empty')}</div> : (
          <>
          {/* PLAN 5: the office on THE map set-up; a tap opens the main map at the same place (`/map?at=`) */}
          {geo && <MiniMap key={lang} place={[c.lon!, c.lat!]} label={t('map.open_place')} onOpen={() => navigate(`/map?at=${c.lat},${c.lon}`)} testId="contacts-minimap" />}
          <section className="infos" data-testid="contacts">
            {address && <InfoRow label={dict.label_address ?? ''} icon={locationOutline} testId="contacts-address">{address}</InfoRow>}
            {geo && <ExternalLinkRow label={dict.label_map_location ?? ''} lead={mapOutline} onOpen={() => setDirs(true)} title={t('contacts.open_maps')} testId="contacts-map" />}
            {c.phone && (
              <InfoRow label={dict.label_phone ?? ''} icon={callOutline} onClick={() => callPhone(c.phone_dial || c.phone!)} caption={c.messengers ? `(${c.messengers})` : undefined} testId="contacts-phone">
                {c.phone}
              </InfoRow>
            )}
            {c.email && <InfoRow label={dict.label_email ?? ''} icon={mailOutline} onClick={() => mailTo(c.email!)} testId="contacts-email">{c.email}</InfoRow>}
            {hours && hours.lines.length > 0 && (
              <InfoRow label={hours.lead} icon={timeOutline} testId="contacts-hours">
                {hours.lines.map((l, i) => <span key={i} className="info__line">{l}</span>)}
              </InfoRow>
            )}
            {note && <p className="contacts__note" data-testid="contacts-note">{note}</p>}
            {geo && <DirectionsSheet open={dirs} onClose={() => setDirs(false)} lat={c.lat!} lon={c.lon!} label={address || title} />}
          </section>
          </>
        )}
        {c && <ShareFooter title={title} url={sitePageUrl('/more/contacts', lang)} />}
      </IonContent>
    </IonPage>
  );
}
