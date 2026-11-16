import './app/polyfills'; // A-46: first - before any library module is evaluated
import { CrashBoundary, installCrashGuard } from './app/crash';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { setupIonicReact } from '@ionic/react';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/palettes/dark.class.css';
import './theme/variables.css';
import './theme/app.css';
import { App } from './app/App';
import { applyTheme } from './state/theme';
import { applyTextScale } from './state/textScale';
import { installBridgeProbe } from './app/bridgeProbe';
import { isIos } from './native/platform';

// D22 (cloud_06): the debug bridge JSON-stringifies EVERY plugin call and result into the console (the 2.2 MB export as base64,
// each article's JSON, every SQL row) — right after the first import that flood held the main thread and the first home stayed
// blank for seconds. Calls are not logged; console.* still reaches logcat (the WebView forwards it natively).
const cap = (window as { Capacitor?: { isLoggingEnabled?: boolean } }).Capacitor;
if (cap) cap.isLoggingEnabled = false;
if (import.meta.env.VITE_BRIDGE_PROBE === '1') installBridgeProbe(); // D22: the emulator build measures the bridge
// cloud_37 (A-121): the iOS simulator ring's remote hand - ONLY the simulator's Debug bundle (ios.yml `simulator`); dropped from every other build
if (import.meta.env.VITE_SIM_DRIVER === '1') void import('./app/simDriver').then((m) => m.startSimDriver());

installCrashGuard(); // A-48: never die white - window errors, rejections, the renderer gone, the crash of the last launch
// cloud_36 (B2): iOS has no system Back - the edge swipe walks the page stack as the header arrow does (Ionic's gesture; the md look stays)
setupIonicReact({ mode: 'md', swipeBackEnabled: isIos() });
applyTheme('system'); // before the first paint; the stored choice follows once the settings are read (AppContext)
applyTextScale(window, isIos()); // A-56: hyphenation only at a large system text scale; cloud_37: on iOS the root size follows Dynamic Type

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CrashBoundary>
      <App />
    </CrashBoundary>
  </React.StrictMode>,
);
