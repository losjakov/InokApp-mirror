import type { CapacitorConfig } from '@capacitor/cli';
import { ENGINE_FLOOR } from './src/app/engineFloor';

const config: CapacitorConfig = {
  appId: 'info.inok.app',
  // A-69: = android res/values/strings.xml app_name (the phone's name); the in-app title and the Play title are i18n / the listing
  appName: 'inok.info',
  webDir: 'dist',
  // A-46: the ONE engine floor (package.json browserslist); an older WebView / Chrome gets dist/error.html (src/i18n/errorPage.ts), never a white screen
  android: { allowMixedContent: false, minWebViewVersion: ENGINE_FLOOR },
  server: { errorPath: 'error.html' },
  plugins: {
    // Native HTTP for fetch(): the WebView origin https://localhost gets no CORS from inok.info (OPTIONS → 403)
    CapacitorHttp: { enabled: true },
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
};

export default config;
