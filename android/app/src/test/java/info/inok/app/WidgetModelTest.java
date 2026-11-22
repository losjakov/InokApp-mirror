package info.inok.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.time.ZoneId;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;

import org.junit.Test;

/** 1.0.18 (A-160, A-161, A-163, A-155 (1)): what the widgets show - the sizes, the content rules of the CD kit, the rows that fit WHOLE. */
public class WidgetModelTest {
    static final ZoneId KYIV = ZoneId.of("Europe/Kiev");
    static final long NOW = 1_763_712_000_000L; // 2025-11-21T08:00:00Z = 10:00 Kyiv

    /** Roboto-like: a bold glyph ~0.5 em, a line 1.25 em; words wrap whole (no hyphenation) - the phone's StaticLayout in WidgetRender */
    static final class FakeMeasure implements WidgetModel.Measure {
        final float fs;
        FakeMeasure(float fs) { this.fs = fs; }
        public int lines(String text, float widthDp, float sp) {
            int per = Math.max(1, (int) (widthDp / (sp * 0.5f * fs)));
            int lines = 1, len = 0;
            for (String word : text.split(" ")) {
                int add = (len == 0 ? 0 : 1) + word.length();
                if (len > 0 && len + add > per) { lines++; len = word.length(); } else len += add;
                while (len > per) { lines++; len -= per; } // a word longer than the line (never in real names)
            }
            return lines;
        }
        public float height(String text, float widthDp, float sp, int maxLines) {
            int n = lines(text, widthDp, sp);
            return (maxLines > 0 ? Math.min(n, maxLines) : n) * sp * 1.25f * fs;
        }
    }
    static final FakeMeasure M = new FakeMeasure(1.0f);

    static Map<String, String> words() {
        Map<String, String> w = new HashMap<>();
        w.put("live_title", "Зараз в ефірі · {n}"); w.put("live_small", "В ефірі · {n}"); w.put("more", "+{n} ще"); w.put("updated", "оновлено {time}");
        w.put("upcoming_title", "Найближчі трансляції"); w.put("nearest", "Найближча"); w.put("tomorrow", "завтра"); w.put("remind", "нагадаю о {time}");
        w.put("new_title", "Нове на сайті"); w.put("none_live", "Зараз немає трансляцій"); w.put("none_upcoming", "—"); w.put("none_new", "—");
        w.put("say_live", "{name}, в ефірі"); w.put("say_planned", "{name}, о {time}");
        w.put("say_news", "Новина: {title}"); w.put("say_pub", "Стаття: {title}"); w.put("say_video", "Відео: {title}");
        return w;
    }

    /** the NOTE 1 names of REVIEW cloud_43 (the ones cut / hyphenated in 1.0.17) */
    static final String[] NAMES = { "Києво-Печерська Успенська Лавра", "Почаївська Успенська Лавра", "Свято-Успенська Святогірська Лавра",
        "Свято-Троїцький Іонинський чоловічий монастир", "Вознесенський Банченський чоловічий монастир", "Кафедральний Хрестовоздвиженський собор (м. Ужгород)",
        "Храм святителя Іоанна Шанхайського і Сан-Франциського (м. Ужгород)", "Київська духовна академія і семінарія", "Духовний світ Буковини", "Свято-Макаріївський храм (м. Київ)" };

    static WidgetModel.Data data() {
        WidgetModel.Data d = new WidgetModel.Data();
        d.words = words();
        d.channels = new HashMap<>();
        for (int i = 0; i < NAMES.length; i++) d.channels.put(i + 1, new WidgetModel.Channel(NAMES[i], "", i == 0 ? "/data/kept/ch1.webp" : null));
        for (int i = 1; i <= 10; i++) d.live.add(new WidgetModel.Live(i, "v" + i, "Пряма трансляція " + i));
        d.planned.add(new WidgetModel.Planned(1, "p7", "Літургія", NOW + 23 * 3_600_000L)); // tomorrow 09:00 Kyiv
        d.planned.add(new WidgetModel.Planned(4, "p4", "Вечірня", NOW + 7 * 3_600_000L));  // today 17:00
        d.planned.add(new WidgetModel.Planned(5, "p5", "Акафіст", NOW + 8 * 3_600_000L));  // today 18:00
        d.planned.add(new WidgetModel.Planned(6, "p6", "Утреня", NOW + 3 * 86_400_000L));  // 24.11
        d.items.add(new WidgetModel.Item(10, "news", "Престольне свято Звіринецького монастиря", NOW, "https://inok.info/articles/news/10/"));
        d.items.add(new WidgetModel.Item(11, "publication", "Ангели і біси. Таємниці духовного світу", NOW - 1, "https://inok.info/articles/publications/11/"));
        d.items.add(new WidgetModel.Item(12, "video", "Мгарський чоловічий монастир. Фільм 2. Паломниця", NOW - 2, "https://inok.info/articles/video/12/"));
        d.items.add(new WidgetModel.Item(13, "video", "Герман. Історія одного ченця", NOW - 3, "https://inok.info/articles/video/13/"));
        d.items.add(new WidgetModel.Item(14, "news", "Верховний суд скасував рішення у справі Почаївської лаври", NOW - 4, "https://inok.info/articles/news/14/"));
        d.reminders = new HashSet<>(Arrays.asList("4|p4"));
        d.updated = NOW;
        return d;
    }

    @Test public void sizeBuckets() {
        assertEquals(WidgetModel.Size.TINY, WidgetModel.sizeOf(170, 80));
        assertEquals(WidgetModel.Size.STRIP, WidgetModel.sizeOf(344, 80));
        assertEquals(WidgetModel.Size.SMALL, WidgetModel.sizeOf(170, 176));
        assertEquals(WidgetModel.Size.LIST, WidgetModel.sizeOf(344, 176));
        assertEquals(WidgetModel.Size.LIST, WidgetModel.sizeOf(344, 360));
        assertEquals(WidgetModel.Size.SMALL, WidgetModel.sizeOf(170, 360)); // 2x4: the small look, the rows that fit
    }

    @Test public void liveListChannelsOnlyRowsThatFitAndTheRestCounted() {
        WidgetModel.View v = WidgetModel.build(WidgetModel.LIVE, 344, 176, 1.0f, data(), NOW, KYIV, M);
        assertEquals("Зараз в ефірі · 10", v.header);
        assertEquals(3, v.rows.size()); // the kit: 4x2 live = 3
        assertEquals("+7 ще", v.foot);
        assertEquals(NAMES[0], v.rows.get(0).text); // the channel, never the stream's title
        assertEquals("/data/kept/ch1.webp", v.rows.get(0).image);
        assertEquals("Києво-Печерська Успенська Лавра, в ефірі", v.rows.get(0).say);
        assertTrue(v.rows.get(0).live);
        assertEquals("оновлено 10:00", v.updated);
        assertEquals(0, v.titleLines); // whole at the normal size
        WidgetModel.View big = WidgetModel.build(WidgetModel.LIVE, 344, 360, 1.0f, data(), NOW, KYIV, M);
        assertEquals(7, big.rows.size()); // the kit: 4x4 live = 7
        assertEquals("+3 ще", big.foot);
    }

    @Test public void aLiveTapOpensStreamsWithTheStreamOnTop() {
        WidgetModel.View v = WidgetModel.build(WidgetModel.LIVE, 344, 176, 1.0f, data(), NOW, KYIV, M);
        assertEquals("inokapp://tab/streams?play=v1", v.rows.get(0).url);
        assertEquals("inokapp://tab/streams", WidgetModel.liveUrl(""));
        assertEquals("inokapp://tab/streams?play=abc_D-1x", WidgetModel.liveUrl("abc_D-1\"><x"));
        assertEquals("inokapp://tab/streams", v.headerUrl);
    }

    @Test public void upcomingRowsAreTimeAndChannelTheDayRidesWithTheTime() {
        WidgetModel.View v = WidgetModel.build(WidgetModel.UPCOMING, 344, 176, 1.0f, data(), NOW, KYIV, M);
        assertEquals("17:00 · " + NAMES[3], v.rows.get(0).text);
        assertEquals("17:00", v.rows.get(0).time);
        assertTrue(v.rows.get(0).bell);
        assertEquals("18:00 · " + NAMES[4], v.rows.get(1).text);
        assertEquals("завтра 09:00 · " + NAMES[0], v.rows.get(2).text);
        assertEquals(3, v.rows.size());
        // the small widget (NOTE 1 D1 / D2): the big line = day + time, «завтра» never dropped
        WidgetModel.Data d = data(); d.planned.remove(1); d.planned.remove(1);
        WidgetModel.View s = WidgetModel.build(WidgetModel.UPCOMING, 170, 176, 1.0f, d, NOW, KYIV, M);
        assertEquals("Найближча", s.header);
        assertEquals("завтра 09:00", s.big);
        assertEquals(NAMES[0], s.rows.get(0).text);
        WidgetModel.View later = WidgetModel.build(WidgetModel.UPCOMING, 344, 80, 1.0f, oneLater(), NOW, KYIV, M);
        assertEquals("24.11 10:00", later.big);
    }
    static WidgetModel.Data oneLater() { WidgetModel.Data d = data(); d.planned.clear(); d.planned.add(new WidgetModel.Planned(6, "p6", "x", NOW + 3 * 86_400_000L)); return d; }

    @Test public void newIsTitlesWithADotPerKindAndTheKindSpoken() {
        WidgetModel.View v = WidgetModel.build(WidgetModel.NEW, 344, 176, 1.0f, data(), NOW, KYIV, M);
        assertEquals("Нове на сайті", v.header);
        assertEquals(4, v.rows.size()); // the kit: 4x2 new = 4
        assertEquals(Arrays.asList("news", "pub", "video", "video"), Arrays.asList(v.rows.get(0).dot, v.rows.get(1).dot, v.rows.get(2).dot, v.rows.get(3).dot));
        assertEquals("Престольне свято Звіринецького монастиря", v.rows.get(0).text); // the title only: no kind label, no date
        assertEquals("Новина: Престольне свято Звіринецького монастиря", v.rows.get(0).say);
        assertEquals("Стаття: Ангели і біси. Таємниці духовного світу", v.rows.get(1).say);
        assertEquals("Відео: Герман. Історія одного ченця", v.rows.get(3).say);
        assertEquals("https://inok.info/articles/news/10/", v.rows.get(0).url);
    }

    /** A-155 (1): at the normal size every shown row is WHOLE - its measured height fits; the first that does not fit hides with the rest */
    @Test public void everyShownRowFitsWholeForEveryNameAndSize() {
        float[][] sizes = { { 344, 176 }, { 344, 360 }, { 170, 176 }, { 300, 150 }, { 411, 200 }, { 250, 130 } };
        for (String kind : new String[] { WidgetModel.LIVE, WidgetModel.UPCOMING, WidgetModel.NEW }) for (float[] s : sizes) {
            WidgetModel.View v = WidgetModel.build(kind, s[0], s[1], 1.0f, data(), NOW, KYIV, M);
            if (v.size != WidgetModel.Size.LIST && !(v.size == WidgetModel.Size.SMALL && kind.equals(WidgetModel.NEW))) continue;
            boolean small = v.size == WidgetModel.Size.SMALL;
            float used = 0;
            for (WidgetModel.Row r : v.rows) used += WidgetModel.rowHeight(r, kind, s[0], small, 0, M);
            float room = WidgetModel.listSpace(s[1], small ? !v.updated.isEmpty() : !v.foot.isEmpty());
            assertTrue(kind + " " + s[0] + "x" + s[1] + ": " + used + " <= " + room, used <= room + 0.5f);
            assertFalse(v.ellipsize);
            assertTrue(kind + " at least one row", v.rows.size() >= 1);
        }
    }

    @Test public void aLaterShorterRowIsNeverPulledUp() {
        WidgetModel.Data d = data(); d.items.clear();
        d.items.add(new WidgetModel.Item(1, "news", "Коротко", NOW, "u1"));
        d.items.add(new WidgetModel.Item(2, "news", "Дуже довгий заголовок новини, що займає кілька рядків навіть на широкому віджеті, бо в ньому багато слів і подробиць про подію", NOW, "u2"));
        d.items.add(new WidgetModel.Item(3, "news", "Ще коротко", NOW, "u3"));
        WidgetModel.View v = WidgetModel.build(WidgetModel.NEW, 344, 120 + 44, 1.0f, d, NOW, KYIV, new FakeMeasure(1.0f));
        float second = WidgetModel.rowHeight(new WidgetModel.Row(d.items.get(1).title, "", null, "", "", "news", false, false), WidgetModel.NEW, 344, false, 0, M);
        float room = WidgetModel.listSpace(164, false);
        if (WidgetModel.rowHeight(new WidgetModel.Row("Коротко", "", null, "", "", "news", false, false), WidgetModel.NEW, 344, false, 0, M) + second > room) {
            assertEquals(1, v.rows.size()); // the long one does not fit -> it AND the short one after it are hidden
        }
    }

    @Test public void largerTextFewerRowsTwoLinesWithEllipsisInsideWidgetsOnly() {
        WidgetModel.View n = WidgetModel.build(WidgetModel.LIVE, 344, 176, 1.0f, data(), NOW, KYIV, M);
        WidgetModel.View v = WidgetModel.build(WidgetModel.LIVE, 344, 176, 1.3f, data(), NOW, KYIV, new FakeMeasure(1.3f));
        assertTrue(v.ellipsize);
        assertEquals(2, v.titleLines);
        assertTrue(v.rows.size() <= n.rows.size());
        assertEquals("+" + (10 - v.rows.size()) + " ще", v.foot);
    }

    @Test public void stripAndTinyAndSmall() {
        WidgetModel.View strip = WidgetModel.build(WidgetModel.LIVE, 344, 80, 1.0f, data(), NOW, KYIV, M);
        assertEquals(WidgetModel.Size.STRIP, strip.size);
        assertEquals(1, strip.rows.size());
        assertEquals(4, strip.avatars.size());
        assertEquals("+9 ще", strip.foot);
        WidgetModel.View tiny = WidgetModel.build(WidgetModel.LIVE, 170, 80, 1.0f, data(), NOW, KYIV, M);
        assertEquals("В ефірі · 10", tiny.header);
        assertEquals(3, tiny.avatars.size());
        assertEquals(0, tiny.rows.size());
        WidgetModel.View small = WidgetModel.build(WidgetModel.LIVE, 170, 176, 1.0f, data(), NOW, KYIV, M);
        assertEquals("В ефірі · 10", small.header);
        assertEquals(NAMES[0], small.rows.get(0).text);
        assertEquals("+9 ще", small.foot);
        WidgetModel.View newStrip = WidgetModel.build(WidgetModel.NEW, 344, 80, 1.0f, data(), NOW, KYIV, M);
        assertEquals(1, newStrip.rows.size());
        assertEquals("news", newStrip.rows.get(0).dot);
    }

    @Test public void noneAndEmptyAndTheUiConfigCap() {
        WidgetModel.Data d = data(); d.live.clear();
        assertEquals("Зараз немає трансляцій", WidgetModel.build(WidgetModel.LIVE, 344, 176, 1.0f, d, NOW, KYIV, M).note);
        assertTrue(WidgetModel.build(WidgetModel.LIVE, 344, 176, 1.0f, null, NOW, KYIV, M).empty);
        WidgetModel.Data c = data(); c.maxRows = 2;
        assertEquals(2, WidgetModel.build(WidgetModel.LIVE, 344, 360, 1.0f, c, NOW, KYIV, M).rows.size());
        c.maxRows = 50; // never more than fit
        assertEquals(7, WidgetModel.build(WidgetModel.LIVE, 344, 360, 1.0f, c, NOW, KYIV, M).rows.size());
    }

    @Test public void theSamplesTakeTheirOwnWhenAndCount() {
        WidgetModel.Data d = data(); d.updated = 0; d.liveTotal = 10; d.live.subList(8, 10).clear();
        d.sampleWhen = Arrays.asList("17:00", "18:00", "завтра 06:30");
        WidgetModel.View v = WidgetModel.build(WidgetModel.LIVE, 344, 176, 1.0f, d, NOW, KYIV, M);
        assertEquals("Зараз в ефірі · 10", v.header);
        assertEquals("", v.updated); // no «оновлено» in a sample (A-163)
        WidgetModel.View u = WidgetModel.build(WidgetModel.UPCOMING, 344, 176, 1.0f, d, NOW, KYIV, M);
        assertEquals("17:00", u.rows.get(0).time); // the sample's own order and words, whatever the clock
        assertEquals("18:00", u.rows.get(1).time);
    }
}
