# shellcheck shell=bash
# store_lib.sh - THE shooting of a store frame (A-15): sourced by scripts/emu_store.sh (Google Play, the Android emulator) and
# scripts/ios_sim_tour.sh (the App Store, the iOS simulator). The frames = scripts/store_frames.txt; the read-backs = scripts/store_checks.mjs
# (through scripts/emu_nav.mjs: DevTools on Android, scripts/ios_relay.mjs on iOS). The caller defines before sourcing:
#   ROOT, S (log dir), ART (the article), capture <file> (the screen as a PNG), demo_all (the status bar in demo mode; may do nothing)
# Every rule of A-122 (B3) is read back per frame and a fault is written to $S/nav.txt with its own word (summed by store_summary).
NAVJS="$ROOT/scripts/emu_nav.mjs"
nav() { node "$NAVJS" "$@" >> "$S/nav.txt" 2>&1 || echo "nav $* failed" >> "$S/nav.txt"; }
check() { node "$NAVJS" check "$1" 2>/dev/null; }
# a read-back polled until it says $2 (pictures arrive, a toast fades) - prints the last value; 1 = never
waitcheck() { local v="" _; for _ in $(seq 1 "${3:-20}"); do v=$(check "$1"); [ "$v" = "$2" ] && { echo "$v"; return 0; }; sleep 1.5; done; echo "$v"; return 1; }
# cloud_38 (the iOS simulator: after a WebGL map its picture stays white): STORE_SKIP / STORE_ONLY = a regex of frame names left out / kept
frames() { grep "^$1|" "$ROOT/scripts/store_frames.txt" | cut -d'|' -f2- | sed "s/\\\$ART/$ART/g" \
  | { if [ -n "${STORE_SKIP:-}" ]; then grep -vE "^[^|]*(${STORE_SKIP})"; else cat; fi; } | { if [ -n "${STORE_ONLY:-}" ]; then grep -E "^[^|]*(${STORE_ONLY})"; else cat; fi; }; }

set_lang() {
  # cloud_43 (T14; ios 44907976664 iphone63: «LANG FAIL ru» after a fixed 3 s): the switch is WAITED for (polled), the tap asked once more
  local _
  for _ in 1 2; do
    nav go /more/language; nav wait "[data-testid=\"lang-$1\"]"; nav click "[data-testid=\"lang-$1\"]"
    waitcheck lang "$1" 8 > /dev/null && return 0
  done
  echo "LANG FAIL $1" >> "$S/nav.txt"
}
set_theme() { # light | dark
  # cloud_40 (ios run 2, App Store iPhone): ONE tap lost to the remote hand's relay (connect ETIMEDOUT) left the theme dark - asked once more
  local d _
  for _ in 1 2; do
    nav go /more; nav wait "[data-testid=\"theme-$1\"]"; nav click "[data-testid=\"theme-$1\"]"; sleep 2
    d=$(check theme); [ "$d" = "$1" ] && return 0
  done
  echo "THEME FAIL $1 ($d)" >> "$S/nav.txt"
}
# A-75 (1): BEFORE a language is shot, the export's unit words of card 242 and the list are read back in it
units_ok() {
  local r1 r2; nav go /monasteries/242; sleep 3; node "$NAVJS" wait '[data-testid="card"] .card__sub' >> "$S/nav.txt" 2>&1; r1=$(check units)
  nav go /monasteries; sleep 3; node "$NAVJS" wait '[data-testid^="mrow-"]' >> "$S/nav.txt" 2>&1; r2=$(check units)
  echo "units $1: card=$r1 list=$r2" >> "$S/demo.txt"
  [ "$r1" = ok ] && [ "$r2" = ok ] || { echo "UNITS FAIL $1: card=$r1 list=$r2" >> "$S/nav.txt"; return 1; }
}

shot_frame() { # file name path ready steps
  local f=$1 name=$2 path=$3 ready=$4 steps=${5:--} v
  nav go "$path"; sleep 3
  node "$NAVJS" wait "$ready" >> "$S/nav.txt" 2>&1 || echo "MISSING $f: $ready" >> "$S/nav.txt"
  if [ "$steps" != "-" ]; then node "$NAVJS" drawn >> "$S/nav.txt" 2>&1   # a map: the step AFTER the app's own fit
    local step; IFS=';' read -ra st <<< "$steps"
    for step in "${st[@]}"; do
      case "$step" in do:*) node "$NAVJS" "do" "${step#do:}" >> "$S/nav.txt" 2>&1 || echo "STEP FAIL $f: $step" >> "$S/nav.txt";; *) nav click "$step";; esac; sleep 2
    done
  fi
  demo_all; sleep 2
  node "$NAVJS" drawn >> "$S/nav.txt" 2>&1 || echo "NOT DRAWN $f" >> "$S/nav.txt"   # D61: MapLibre `idle`, never a timer
  v=$(waitcheck photos ok 30) || echo "PHOTOS FAIL $f: $v" >> "$S/nav.txt"         # A-122: every picture in view loaded
  v=$(waitcheck overlays clear 20) || echo "OVERLAY FAIL $f: $v" >> "$S/nav.txt"    # A-68 / A-122: nothing over the frame
  case "$steps" in *do:fitLavras*) v=$(check lavras); echo "lavras $f: $v" >> "$S/demo.txt"; [ "$v" = ok ] || echo "LAVRAS FAIL $f: $v" >> "$S/nav.txt";; esac
  case "$steps" in *do:showSelected*) v=$(check articleTop); echo "articleTop $f: $v" >> "$S/demo.txt"; [ "$v" = ok ] || echo "ARTICLE TOP FAIL $f: $v" >> "$S/nav.txt";; esac
  case "$name" in *card*) v=$(check gallery); echo "gallery $f: $v" >> "$S/demo.txt"; [ "$v" = in-app ] || echo "GALLERY FAIL $f: $v" >> "$S/nav.txt";; esac
  case "$name" in *publications*) v=$(check kind); echo "kind $f: $v" >> "$S/demo.txt"; [ "$v" = publication ] || echo "KIND FAIL $f: $v" >> "$S/nav.txt";; esac
  case "$name" in 02-home) v=$(check live); echo "live on air $f: $v" >> "$S/demo.txt";; esac
  case "$steps" in *do:wholeRows*) v=$(check rowsWhole); echo "rowsWhole $f: $v" >> "$S/demo.txt"; [ "$v" = ok ] || echo "ROWS CUT FAIL $f: $v" >> "$S/nav.txt";; esac
  case "$steps" in *do:showSelected*) v=$(check listTop); echo "listTop $f: $v" >> "$S/demo.txt"; [ "$v" = ok ] || echo "LIST TOP FAIL $f: $v" >> "$S/nav.txt";; esac
  case "$name" in *map*) v=$(check mapview); echo "mapview $f: $v" >> "$S/demo.txt"; [ "$v" = ok ] || echo "MAP VIEW FAIL $f: $v" >> "$S/nav.txt"
    v=$(check mapbox); [ "$v" = none ] || echo "$v" > "$f.maprect";; esac   # D16: store_png.py reads the box and refuses a canvas painted in part
  v=$(check crash); [ "$v" = none ] || echo "CRASH FAIL $f: $v" >> "$S/nav.txt"   # E11: the crash screen is never a frame
  capture "$f"
  [ "$v" = none ] || rm -f "$f"   # E11: a crash frame is not kept (the set is then short: store_png.py says FAIL)
}

# one set in one language: every frame of store_frames.txt for `set`, in its order; the «-dark» frames in the dark theme
shoot_frames() { # set dir lang
  local set=$1 d=$2 lang=$3 line name path ready steps
  mkdir -p "$d"
  # read first (adb / simctl inside the loop must not eat the list from stdin); a read loop, not mapfile - macOS bash 3.2 has none (ios run 2)
  FR=(); while IFS= read -r line; do FR+=("$line"); done < <(frames "$set")
  for line in "${FR[@]}"; do
    IFS='|' read -r name path ready steps <<< "$line"
    # cloud_41 (E): STORE_NOSCROLL=1 (the App Store set) = the frame as it opens - the home not scrolled to whole rows
    if [ -n "${STORE_NOSCROLL:-}" ]; then steps="${steps//;do:wholeRows/}"; steps="${steps//do:wholeRows;/}"; [ "$steps" = do:wholeRows ] && steps=-; fi
    case "$name" in *-dark) set_theme dark;; esac
    shot_frame "$d/$name.png" "$name" "$path" "$ready" "$steps"
    if [ "$name" = "${FR[0]%%|*}" ]; then # A-74 (4) fail fast: the FIRST frame of each language read back before the others are shot
      local l t want=light; l=$(check lang); t=$(check theme); case "$name" in *-dark) want=dark;; esac
      echo "first frame $set/$lang: lang=$l theme=$t" >> "$S/demo.txt"
      if [ "$l" != "$lang" ] || [ "$t" != "$want" ]; then echo "FIRST FRAME FAIL $set/$lang: lang=$l theme=$t (want $want)" >> "$S/nav.txt"; return 1; fi
    fi
    case "$name" in *-dark) set_theme light;; esac
    # A-78 4: the gold eye on the card and the stars' token on the article - read on the first of each
    if { [ "$name" != "${name/card/}" ] || [ "$name" != "${name/article/}" ]; } ; then
      local k; [ "$name" != "${name/card/}" ] && k=eye || k=stars
      if [ ! -e "$S/colours-$k.txt" ]; then local c; c=$(check "$k"); echo "first $name frame $set/$lang: $k=$c" | tee "$S/colours-$k.txt" >> "$S/demo.txt"
        [ "$c" = ok ] || { echo "COLOUR FAIL $set/$lang $name: $k=$c" >> "$S/nav.txt"; return 1; }; fi
    fi
  done
}

# the verdict lines of a store run (sizes.txt), each a count of one fault word of $S/nav.txt
store_summary() {
  local w
  for w in 'missing elements:MISSING' 'maps not drawn:NOT DRAWN' 'pictures not loaded / placeholders (A-122):PHOTOS FAIL' \
    'anything over a frame - dialog, toast, banner (A-122):OVERLAY FAIL' 'gallery not in the app on the card (A-122):GALLERY FAIL' \
    '«Публікації» not on «Статті» (A-122):KIND FAIL' 'language / theme switches not taken:LANG FAIL|THEME FAIL' \
    'unit words / first frames wrong:UNITS FAIL|FIRST FRAME FAIL' 'lavras cut / steps failed:LAVRAS FAIL|STEP FAIL' 'article top cut:ARTICLE TOP FAIL' \
    'colours wrong:COLOUR FAIL' 'crash screen in a frame (E11):CRASH FAIL' 'map view not on Ukraine / canvas not sized (D16):MAP VIEW FAIL' \
    'list beside the article starts on a cut row (NOTE 7):LIST TOP FAIL' 'a home frame ends on a cut row (NOTE 9):ROWS CUT FAIL' \
    '«Я тут був» frame without its three marks (cloud_41):VISITED FAIL'; do
    echo "${w%%:*}: $(grep -cE "^(${w#*:})" "$S/nav.txt" 2>/dev/null || true)"
  done
  echo "on air at the minute of the frames: $(grep '^live on air' "$S/demo.txt" | sed 's/.*: //' | tr '\n' ' ')"
}
