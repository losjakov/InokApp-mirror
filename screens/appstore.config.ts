import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** cloud_40 (A-129, C1): ONLY the browser halves of the App Store frames 04-eparchy / 05-map (screens/appstore_frames.ts) - never part of
 *  the screens set; run by hand after the release run: `INSETS=<dir with insets-iphone.json / insets-ipad.json> npx playwright test -c
 *  screens/appstore.config.ts`, then `scripts/appstore_join.py` cuts the iPhone's marks from that run's simulator frames and joins them. */
export default defineConfig({ ...base, testMatch: /appstore_frames\.ts/, workers: 1, timeout: 180_000 });
