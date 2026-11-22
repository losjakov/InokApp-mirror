import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

/** 1.0.18 (A-160, A-163): the widget PICKER / gallery samples = the CD kit exactly (reports/mockups/a1018/widgets/ - a private path: the
 *  comparisons with the kit run at home only; the mirror checks the copies against each other). Red before: previewLayout = the empty
 *  widget, previewImage = the launcher icon, three identical boxes. */
const RES = 'android/app/src/main/res';
const KIT = 'reports/mockups/a1018/widgets';
const KINDS = ['live', 'upcoming', 'new'] as const;

describe('widget samples (A-160 / A-163)', () => {
  it('ONE sample text source: the Android raw copy = the iPhone copy (= the kit at home)', () => {
    const android = readFileSync(`${RES}/raw/widget_samples.json`, 'utf8');
    expect(readFileSync('ios/App/InokWidgets/widget_samples.json', 'utf8')).toBe(android);
    if (existsSync(`${KIT}/sample_data.json`)) expect(android).toBe(readFileSync(`${KIT}/sample_data.json`, 'utf8'));
    const d = JSON.parse(android);
    for (const l of ['uk', 'ru', 'en']) for (const k of ['live', 'up', 'new']) expect(d[l][k].length, `${l}.${k}`).toBeGreaterThanOrEqual(8);
  });
  it('the three Android mechanisms per kind: previewLayout (12-14), previewImage (<= 11, the kit\'s pictures), the generated one (15+)', () => {
    for (const k of KINDS) {
      const info = readFileSync(`${RES}/xml/widget_${k}_info.xml`, 'utf8');
      expect(info).toContain(`android:previewLayout="@layout/widget_preview_${k}"`);
      expect(info).toContain(`android:previewImage="@drawable/widget_preview_${k}"`);
      expect(info).not.toMatch(/ic_launcher/);
      expect(info).toMatch(/android:targetCellWidth="4" android:targetCellHeight="2"/); // 4x2 by default
      expect(info).toMatch(/android:minResizeHeight="40dp"/); // down to x1 rows (2x1 / 4x1)
      for (const dir of ['drawable-nodpi', 'drawable-night-nodpi', 'drawable-uk-nodpi', 'drawable-uk-night-nodpi', 'drawable-ru-nodpi', 'drawable-ru-night-nodpi']) {
        expect(existsSync(`${RES}/${dir}/widget_preview_${k}.webp`), `${dir} ${k}`).toBe(true);
        if (existsSync(KIT)) expect(readFileSync(`${RES}/${dir}/widget_preview_${k}.webp`).equals(readFileSync(`${KIT}/android/res/${dir}/widget_preview_${k}.webp`)), `${dir} = the kit`).toBe(true);
      }
      const layout = readFileSync(`${RES}/layout/widget_preview_${k}.xml`, 'utf8');
      expect(layout).not.toMatch(/ic_launcher_round" android:importantForAccessibility="no" \/>\s*<FrameLayout|@\+id\//);
    }
    const ws = readFileSync('android/app/src/main/java/info/inok/app/WidgetSamples.java', 'utf8');
    expect(ws).toMatch(/setWidgetPreview\(/);
    expect(ws).toMatch(/SDK_INT < 35\) return/);
    expect(ws).toMatch(/if \(all\) p\.edit\(\)\.putString\(STAMP, stamp\)/); // a refusal (rate limit) = tried at the next start, never in a loop
    expect(readFileSync('android/app/src/main/java/info/inok/app/MainActivity.java', 'utf8')).toContain('WidgetSamples.publishInBackground(this)');
  });
  it('the previewLayouts are generated from the samples and the widgets\' own rows (scripts/widget_samples.py --check)', () => {
    expect(execFileSync('python3', ['-I', 'scripts/widget_samples.py', '--check'], { encoding: 'utf8' })).toMatch(/up to date/);
    const rows = { live: 3, upcoming: 3, new: 4 }; // the kit's 4x2 rows
    for (const k of KINDS) expect(readFileSync(`${RES}/layout/widget_preview_${k}.xml`, 'utf8').match(/@string\/wsample_(live|up|new)_\d"/g)).toHaveLength(rows[k]);
    expect(readFileSync(`${RES}/values-uk/widget_samples.xml`, 'utf8')).toContain('Престольне свято Звіринецького монастиря');
  });
  it('the kit\'s channel pictures are bundled for the samples (av:<id>)', () => {
    const ids = readdirSync(`${KIT}/av`.replace(/^.*$/, existsSync(`${KIT}/av`) ? `${KIT}/av` : `${RES}/drawable-nodpi`)).filter((f) => /\.webp$/.test(f));
    const d = JSON.parse(readFileSync(`${RES}/raw/widget_samples.json`, 'utf8'));
    for (const c of [...d.uk.live, ...d.uk.up]) expect(existsSync(`${RES}/drawable-nodpi/widget_av_${c.id}.webp`), `av ${c.id}`).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
  });
  it('the layouts carry the model\'s geometry (WidgetModel.java: what fits is computed with THESE numbers) and never hyphenate', () => {
    const model = readFileSync('android/app/src/main/java/info/inok/app/WidgetModel.java', 'utf8');
    const num = (n: string) => Number(model.match(new RegExp(`\\b${n} = (\\d+)`))![1]);
    const list = readFileSync(`${RES}/layout/widget_list.xml`, 'utf8');
    expect(list).toMatch(new RegExp(`paddingStart="${num('PAD_SIDE')}dp" android:paddingEnd="${num('PAD_SIDE')}dp" android:paddingTop="${num('PAD_TOP')}dp" android:paddingBottom="${num('PAD_BOTTOM')}dp"`));
    expect(list).toMatch(/android:layout_height="24dp" android:layout_marginBottom="2dp"/); // HEADER 26
    expect(num('HEADER')).toBe(26);
    expect(list).toMatch(new RegExp(`w_foot" android:layout_width="match_parent" android:layout_height="${num('FOOT')}dp"`));
    const live = readFileSync(`${RES}/layout/widget_row_live.xml`, 'utf8');
    expect(live).toMatch(new RegExp(`android:minHeight="${num('ROW_MIN_AVATAR')}dp"`));
    expect(live).toMatch(new RegExp(`android:layout_width="${num('AVATAR')}dp" android:layout_height="${num('AVATAR')}dp" android:layout_marginEnd="${num('AVATAR_GAP')}dp"`));
    const nw = readFileSync(`${RES}/layout/widget_row_new.xml`, 'utf8');
    expect(nw).toMatch(new RegExp(`android:layout_width="${num('DOT')}dp" android:layout_height="${num('DOT')}dp" android:layout_marginTop="5dp" android:layout_marginEnd="${num('DOT_GAP')}dp"`));
    for (const f of ['widget_row_live', 'widget_row_upcoming', 'widget_row_new']) {
      const x = readFileSync(`${RES}/layout/${f}.xml`, 'utf8');
      expect(x).toMatch(/android:paddingTop="2dp" android:paddingBottom="2dp"/); // ROW_PAD 4
      expect(x).toMatch(new RegExp(`android:textSize="${num('ROW_SP')}sp" android:textStyle="bold" android:hyphenationFrequency="none" android:breakStrategy="simple" android:includeFontPadding="true" android:lineSpacingMultiplier="1.07"`));
    }
    expect(readFileSync('android/app/src/main/java/info/inok/app/WidgetRender.java', 'utf8')).toMatch(/LINE_SPACING = 1\.07f/);
  });
});
