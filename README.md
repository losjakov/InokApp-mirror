# inok.info — the mobile app (Android)

The official mobile app of [inok.info](https://inok.info) — «Монастирський вісник України», the monastery herald of Ukraine:
a directory of the monasteries of Ukraine that works offline, a map with «near me», live broadcasts with notifications,
and the site's publications, videos and news. Languages: Ukrainian, Russian, English.

Google Play: https://play.google.com/store/apps/details?id=info.inok.app

## About this repository
- This is a **read-only mirror** of the app's source code. It is updated automatically; its history is a sequence of
  snapshots, not the development history.
- **Issues and pull requests are not accepted.**
- Its continuous integration builds the debug APK and runs the tests, the browser screenshots and the emulator checks.
  Release builds are not made here.

Stack: Capacitor, Ionic React, TypeScript, Vite, SQLite (FTS5) on the device, MapLibre GL JS.
Build: `npm ci`, `npm test`, `npm run build`, `npx cap sync android`, then Gradle in `android/`.

## Rights
The code is published for building and reading only. **All rights reserved.** Any use of it — copying, modifying,
distributing, or using it in other projects — is allowed only with the owner's written permission.
No licence is granted. The pictures and texts under `fixtures/` come from inok.info and belong to their owners.

## Українською
Офіційний мобільний застосунок сайту [inok.info](https://inok.info) «Монастирський вісник України»: довідник монастирів
України, що працює без мережі, мапа, трансляції та публікації сайту. Google Play:
https://play.google.com/store/apps/details?id=info.inok.app

Цей репозиторій — дзеркало коду лише для читання, оновлюється автоматично; issues і pull requests не приймаються.
Код опубліковано для збирання та читання. Усі права застережено: будь-яке використання — лише з письмового дозволу
власника. Зображення й тексти в `fixtures/` взято з inok.info, вони належать їхнім власникам.
