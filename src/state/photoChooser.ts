/**
 * cloud_40 (A2, both platforms): «Автозавантаження фото» asked by an offer (a photo placeholder, the viewer's block) - a ONE-SHOT intent in
 * memory, consumed when «Ще» shows the sheet; never in the URL or the history (1.0.13 kept it as `/more?photos=1`, so Back from an inner
 * item of «Ще» returned to that address and opened the sheet again).
 */
let wanted = false;
export const askPhotoChooser = (): void => { wanted = true; };
/** true once per ask: the caller opens the sheet now */
export const takePhotoChooser = (): boolean => { const w = wanted; wanted = false; return w; };
