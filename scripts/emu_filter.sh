#!/usr/bin/env bash
# emu_filter.sh - A-166 (cloud_44): WHICH links the installed app's filters accept on THIS Android (no JavaScript needed - API 26 too): the
# package manager's own answer (`cmd package query-activities`) for every short / gallery form and for paths that must stay in the browser.
# Android 12+ = the main filter's pathAdvancedPattern (digits only); Android 8-11 = the .ShortLinks alias (pathPattern «/<digit>.*»).
# Output: $OUT/filter.txt; the last line = «filter ok» | «filter FAIL:<url>».
set -u
OUT="${1:?out dir}"; API="${2:?api level}"; PKG=info.inok.app
F="$OUT/filter.txt"; : > "$F"; RES=ok
takes() { adb shell cmd package query-activities -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "'$1'" 2>/dev/null | tr -d '\r' | grep -c "$PKG" || true; }
want() { # url yes|no
  local n; n=$(takes "$1"); n=${n:-0}
  echo "$1 -> app activities: $n (want $2)" >> "$F"
  if [ "$2" = yes ] && [ "$n" -eq 0 ]; then RES="FAIL:$1 not taken"; fi
  if [ "$2" = no ] && [ "$n" -gt 0 ]; then RES="FAIL:$1 taken"; fi
}
for u in /140 /140/ /140/g /140/G/ /ru/140 /uk/140/ /en/140/g /ru/140/g/ /objects/monasteries/140/ /monasteries/140/; do want "https://inok.info$u" yes; done
for u in /ru/map/ /app/ /app/versions/ /de/140 /; do want "https://inok.info$u" no; done
# a non-card short path with a leading digit: Android 12+ refuses it (digits only); 8-11 lets it in (pathPattern) and the router hands it on
case "${API%%-*}" in 2[6-9]|30) want 'https://inok.info/140a' yes;; *) want 'https://inok.info/140a' no;; esac
echo "filter $RES" | tee -a "$F"
