/** An open dialog (Ionic keeps closed overlays in the DOM with `overlay-hidden`): the banner never comes over it (A-80 ADDENDUM 1, A-73);
 *  A-183: Apple's map (a native view above the page) hides while one is open. ONE test of «a web overlay is open». */
export const OVERLAYS = 'ion-alert, ion-modal, ion-action-sheet, ion-popover, ion-loading';
export const overlayOpen = (doc: Document = document, sel: string = OVERLAYS): boolean =>
  Array.from(doc.querySelectorAll(sel))
    .some((e) => !e.classList.contains('overlay-hidden') && e.getBoundingClientRect().width > 0);
