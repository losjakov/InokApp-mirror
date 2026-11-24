import { Device } from '@capacitor/device';

/** A-181 / A-182 (cloud_46): the device's OS version and model - ONE read for the error report, the «Надіслати розробнику» text and the
 *  map's GL-failure flag. `@capacitor/device` getInfo (native: UIDevice.systemVersion / the hardware id, Build.VERSION.RELEASE /
 *  Build.MODEL; web: the user agent's). Never the device name or any id. A failed read = empty strings (a report still goes). */
export interface DeviceFacts { os_version: string; model: string }
let facts: Promise<DeviceFacts> | null = null;
export const deviceFacts = (): Promise<DeviceFacts> => (facts ??= Device.getInfo()
  .then((i) => ({ os_version: String(i.osVersion ?? '').slice(0, 20), model: String(i.model ?? '').slice(0, 40) }))
  .catch(() => ({ os_version: '', model: '' })));
/** tests only */
export const resetDeviceFacts = (): void => { facts = null; };
