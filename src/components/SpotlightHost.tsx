import { useEffect } from 'react';
import { useApp } from '@/state/AppContext';
import { useReading } from '@/state/reading';
import { allHouseRows, getDictionary } from '@/data/repo/monasteries';
import { listChannels } from '@/data/repo/channels';
import { channelItems, houseItems, savedItems, spotlight } from '@/native/spotlight';
import { snapOf } from '@/data/repo/reading';
import { isIos, isNative } from '@/native/platform';
import { LANGS, type Lang } from '@/i18n';

/** T10 (A-153 (3), iOS only): the index follows the data - the houses and channels after every import / language change, the ★ list after every
 *  change of it. Mounted once inside the tabs; renders nothing; a no-op on Android and the web. */
export function SpotlightHost(): null {
  const { db, lang, exportVersion } = useApp();
  const { saved, savedList } = useReading();
  const on = isNative() && isIos();
  useEffect(() => {
    if (!on || !db) return;
    void (async () => {
      const dicts = Object.fromEntries(await Promise.all(LANGS.map(async (l) => [l, await getDictionary(db, l)]))) as Record<Lang, Record<string, string>>;
      await spotlight('houses', houseItems(await allHouseRows(db), lang, dicts));
      await spotlight('channels', channelItems(await listChannels(db, lang), lang));
    })();
  }, [on, db, lang, exportVersion]);
  useEffect(() => {
    if (!on) return;
    void savedList().then((l) => spotlight('saved', savedItems(l.map(snapOf))));
  }, [on, saved, savedList]);
  return null;
}
