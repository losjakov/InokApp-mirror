#!/usr/bin/env python3
"""a11y_dump.py - A-88 (4d): reads an `uiautomator dump` (the node tree an accessibility service - TalkBack - is given) and checks that
EVERY actionable node (clickable / long-clickable / checkable) of the app has a name: its own text or content-desc, or one in its subtree
(TalkBack speaks a clickable container with its children's words).

  python3 -I scripts/a11y_dump.py <dump.xml> <screen>   -> one line «a11y <screen>: actionable=N unnamed=M [bounds of the unnamed]»; exit 1 if M > 0
  python3 -I scripts/a11y_dump.py --self-test
Only the app's own nodes count (package info.inok.app); the system bars are the system's.
"""
import sys
import xml.etree.ElementTree as ET

PKG = 'info.inok.app'


def named(n):
    if (n.get('text') or '').strip() or (n.get('content-desc') or '').strip():
        return True
    return any(named(c) for c in n)


def check(xml_text):
    root = ET.fromstring(xml_text)
    act, unnamed = 0, []
    for n in root.iter('node'):
        if n.get('package') != PKG:
            continue
        if 'true' in (n.get('clickable'), n.get('long-clickable'), n.get('checkable')):
            # the WebView itself is a clickable host of the page's virtual tree, never spoken as one control
            if n.get('class') == 'android.webkit.WebView':
                continue
            act += 1
            if not named(n):
                unnamed.append(f"{n.get('class', '?').split('.')[-1]}{n.get('bounds', '')}")
    return act, unnamed


def self_test():
    x = ('<hierarchy><node package="info.inok.app" class="android.webkit.WebView" clickable="true" text="" content-desc="">'
         '<node package="info.inok.app" class="android.widget.Button" clickable="true" text="" content-desc="Назад" bounds="[0,0][48,48]"/>'
         '<node package="info.inok.app" class="android.view.View" clickable="true" text="" content-desc="" bounds="[0,60][360,120]">'
         '<node package="info.inok.app" class="android.widget.TextView" text="Обитель" content-desc=""/></node>'
         '<node package="info.inok.app" class="android.widget.Button" clickable="true" text="" content-desc="" bounds="[300,0][348,48]"/>'
         '</node><node package="com.android.systemui" class="android.widget.ImageView" clickable="true" text="" content-desc=""/></hierarchy>')
    act, un = check(x)
    assert act == 3 and un == ['Button[300,0][348,48]'], (act, un)
    print('a11y_dump self-test: PASS')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    elif len(sys.argv) == 3:
        try:
            act, un = check(open(sys.argv[1], encoding='utf-8', errors='replace').read())
        except ET.ParseError as e:
            print(f'a11y {sys.argv[2]}: no dump ({e})'); sys.exit(2)
        print(f"a11y {sys.argv[2]}: actionable={act} unnamed={len(un)}{(' ' + ' '.join(un[:8])) if un else ''}")
        sys.exit(1 if un or act == 0 else 0)
    else:
        print(__doc__, file=sys.stderr); sys.exit(2)
