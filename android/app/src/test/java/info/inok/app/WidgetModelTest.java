package info.inok.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.time.ZoneId;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;

import org.junit.Test;

/** T9 (A-153 (2), A-155 (1)): what the widgets show - from a fixture, the words of the app, the row count by the text size. */
public class WidgetModelTest {
    static final ZoneId KYIV = ZoneId.of("Europe/Kiev");
    static final long NOW = 1_763_712_000_000L; // 2025-11-21T08:00:00Z = 10:00 Kyiv

    static WidgetModel.Data data() {
        WidgetModel.Data d = new WidgetModel.Data();
        Map<String, String> w = new HashMap<>();
        w.put("live_title", "Зараз в ефірі · {n}"); w.put("live_small", "В ефірі · {n}"); w.put("more", "+{n} ще"); w.put("updated", "оновлено {time}");
        w.put("upcoming_title", "Найближчі трансляції"); w.put("nearest", "Найближча"); w.put("tomorrow", "завтра"); w.put("remind", "нагадаю о {time}");
        w.put("new_title", "Нове на сайті"); w.put("news", "Новини"); w.put("none_live", "Зараз немає трансляцій"); w.put("none_upcoming", "—"); w.put("none_new", "—");
        w.put("say_live", "{name}, в ефірі"); w.put("say_planned", "{name}, о {time}"); w.put("only_one", "Інші канали ще не оголосили наступну трансляцію");
        d.words = w;
        d.channels = new HashMap<>();
        d.channels.put(1, new WidgetModel.Channel("Почаївська Лавра", "", "/data/kept/ch1.webp"));
        d.channels.put(2, new WidgetModel.Channel("Іонинський монастир", "", null));
        d.channels.put(3, new WidgetModel.Channel("З Почаєва", "", null));
        d.live.add(new WidgetModel.Live(1, "v1", "Пряма трансляція"));
        d.live.add(new WidgetModel.Live(2, "v2", "Пряма"));
        d.live.add(new WidgetModel.Live(3, "v3", "Літургія"));
        d.planned.add(new WidgetModel.Planned(2, "p2", "Літургія", NOW + 23 * 3_600_000L)); // tomorrow 09:00 Kyiv
        d.items.add(new WidgetModel.Item(10, "news", "Суд скасував рішення", NOW - 86_400_000L, "https://inok.info/articles/news/10/"));
        d.items.add(new WidgetModel.Item(11, "publication", "Ангели і біси", NOW, "https://inok.info/articles/publications/11/"));
        d.reminders = new HashSet<>();
        d.reminders.add("2|p2");
        d.updated = NOW;
        return d;
    }

    @Test public void liveMediumNormalThreeRowsWhole() {
        WidgetModel.View v = WidgetModel.build(WidgetModel.LIVE, false, 1.0f, data(), NOW, KYIV);
        assertEquals("Зараз в ефірі · 3", v.header);
        assertEquals(3, v.rows.size());
        assertEquals("https://www.youtube.com/watch?v=v1", v.rows.get(0).url);
        assertEquals("/data/kept/ch1.webp", v.rows.get(0).image);
        assertEquals("Почаївська Лавра, в ефірі", v.rows.get(0).say);
        assertEquals(false, v.ellipsize);
        assertEquals("оновлено 10:00", v.updated);
    }

    @Test public void liveLargeFontFewerRowsAndMore() {
        WidgetModel.View v = WidgetModel.build(WidgetModel.LIVE, false, 1.3f, data(), NOW, KYIV);
        assertEquals(2, v.rows.size());
        assertEquals("+1 ще", v.foot);
        assertTrue(v.ellipsize);
        assertEquals(2, v.titleLines);
    }

    @Test public void liveSmallFirstChannelPlusMore() {
        WidgetModel.View v = WidgetModel.build(WidgetModel.LIVE, true, 1.0f, data(), NOW, KYIV);
        assertEquals("В ефірі · 3", v.header);
        assertEquals(1, v.rows.size());
        assertEquals("+2 ще", v.foot);
    }

    @Test public void upcomingTomorrowWithBellAndReminderTime() {
        WidgetModel.View s = WidgetModel.build(WidgetModel.UPCOMING, true, 1.0f, data(), NOW, KYIV);
        assertEquals("09:00", s.big);
        assertTrue(s.rows.get(0).bell);
        assertEquals("нагадаю о 08:50", s.foot);
        WidgetModel.View m = WidgetModel.build(WidgetModel.UPCOMING, false, 1.0f, data(), NOW, KYIV);
        assertEquals("завтра 09:00 · Іонинський монастир", m.rows.get(0).title);
        assertEquals("Інші канали ще не оголосили наступну трансляцію", m.note);
    }

    @Test public void newsLabelOnlyOnNewsDateInDigits() {
        WidgetModel.View v = WidgetModel.build(WidgetModel.NEW, false, 1.0f, data(), NOW, KYIV);
        assertEquals("Новини · 20.11.2025", v.rows.get(0).sub);
        assertEquals("21.11.2025", v.rows.get(1).sub);
        assertEquals("https://inok.info/articles/", v.headerUrl);
    }

    @Test public void noDataYetIsTheOpenAppLineNeverEmptyBoxes() {
        WidgetModel.View v = WidgetModel.build(WidgetModel.LIVE, false, 1.0f, new WidgetModel.Data(), NOW, KYIV);
        assertTrue(v.empty);
        WidgetModel.Data d = data(); d.live.clear();
        WidgetModel.View none = WidgetModel.build(WidgetModel.LIVE, false, 1.0f, d, NOW, KYIV);
        assertEquals("Зараз немає трансляцій", none.note);
        assertEquals("оновлено 10:00", none.updated); // the last data with its time
    }
}
