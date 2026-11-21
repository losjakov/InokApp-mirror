package info.inok.app;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * T9 (A-153 (2) + A-155 (1) + A-156 (1), cloud_43): WHAT the three home-screen widgets show - pure Java (no Android), unit-tested by
 * scripts/java_unit.sh like Notifier. WidgetRender draws it with RemoteViews; WidgetStore feeds it from the JSON the app writes (`widgets`)
 * and the widget's own fetch of live-status / articles. The words come from the app (its language, one i18n table); none are built here.
 * Text: at the NORMAL system size every row whole (fewer rows when titles are long); at a LARGER size fewer rows, a title at most 2 lines
 * with «…» - inside widgets only (A-155 (1)).
 */
public final class WidgetModel {
    private WidgetModel() { }

    public static final String LIVE = "live", UPCOMING = "upcoming", NEW = "new";
    /** A title this long or shorter takes one line in a medium row at the normal size (measured on the 360 dp ring phone, 4 cells). */
    static final int SHORT_TITLE = 34;

    public static final class Channel {
        public final String name, place, avatar;
        public Channel(String name, String place, String avatar) { this.name = name; this.place = place; this.avatar = avatar; }
    }
    public static final class Live {
        public final int channelId; public final String videoId, title;
        public Live(int channelId, String videoId, String title) { this.channelId = channelId; this.videoId = videoId; this.title = title; }
    }
    public static final class Planned {
        public final int channelId; public final String videoId, title; public final long at;
        public Planned(int channelId, String videoId, String title, long at) { this.channelId = channelId; this.videoId = videoId; this.title = title; this.at = at; }
    }
    public static final class Item {
        public final int id; public final String kind, title, url; public final long published;
        public Item(int id, String kind, String title, long published, String url) { this.id = id; this.kind = kind; this.title = title; this.published = published; this.url = url; }
    }
    /** Everything a widget knows: the app's words, the channels, the last data and its time. */
    public static final class Data {
        public Map<String, String> words; public Map<Integer, Channel> channels;
        public List<Live> live = new ArrayList<>(); public List<Planned> planned = new ArrayList<>(); public List<Item> items = new ArrayList<>();
        public Set<String> reminders; public long updated; public boolean mixedNews = true;
    }

    /** One drawn row: its words, its picture (a kept avatar file or none), its link, the live dot, the bell; `say` = the reader's label. */
    public static final class Row {
        public final String title, sub, image, url, say; public final boolean live, bell;
        Row(String title, String sub, String image, String url, String say, boolean live, boolean bell) {
            this.title = title; this.sub = sub; this.image = image; this.url = url; this.say = say; this.live = live; this.bell = bell; }
    }
    /** One widget as drawn. `empty` = the app never wrote its data yet («Відкрийте застосунок…», a string resource x3). */
    public static final class View {
        public String header = "", headerUrl = "", big = "", foot = "", updated = "", note = "";
        public List<Row> rows = new ArrayList<>();
        public int titleLines = 3; public boolean ellipsize, empty;
    }

    static String w(Data d, String key) { String v = d.words == null ? null : d.words.get(key); return v == null ? "" : v; }
    static String fill(String s, String k, String v) { return s.replace("{" + k + "}", v); }

    /** HH:MM on the phone's own clock (the stream's local start, «оновлено HH:MM»). */
    public static String hhmm(long ms, ZoneId zone) { return DateTimeFormatter.ofPattern("HH:mm").withZone(zone).format(Instant.ofEpochMilli(ms)); }
    /** A-147: the site's day in Kyiv in digits, as every article row of the app. */
    public static String shortDate(long ms) { return DateTimeFormatter.ofPattern("dd.MM.yyyy").withZone(ZoneId.of("Europe/Kiev")).format(Instant.ofEpochMilli(ms)); }

    /** A-155 (1): how many rows fit - normal size: 3 when every title is short, else 2; a larger size: 2 short / 1 long. Small = 1. */
    static int rowsFor(boolean small, float fontScale, List<String> titles) {
        if (small) return 1;
        boolean allShort = true;
        for (int i = 0; i < Math.min(3, titles.size()); i++) if (titles.get(i).length() > SHORT_TITLE) { allShort = false; break; }
        if (fontScale <= 1.0f) return allShort ? 3 : 2;
        return allShort ? 2 : 1;
    }

    public static View build(String kind, boolean small, float fontScale, Data d, long now, ZoneId zone) {
        View v = new View();
        v.ellipsize = fontScale > 1.0f;
        v.titleLines = v.ellipsize ? 2 : (small ? 5 : 3);
        if (d == null || d.words == null || d.words.isEmpty()) { v.empty = true; return v; }
        v.updated = d.updated > 0 ? fill(w(d, "updated"), "time", hhmm(d.updated, zone)) : "";
        switch (kind) {
            case LIVE: live(v, small, fontScale, d); break;
            case UPCOMING: upcoming(v, small, fontScale, d, now, zone); break;
            default: fresh(v, small, fontScale, d); break;
        }
        return v;
    }

    static Channel ch(Data d, int id) { Channel c = d.channels == null ? null : d.channels.get(id); return c == null ? new Channel("", "", null) : c; }

    static void live(View v, boolean small, float fs, Data d) {
        int n = d.live.size();
        v.header = small ? fill(w(d, "live_small"), "n", String.valueOf(n)) : fill(w(d, "live_title"), "n", String.valueOf(n));
        v.headerUrl = "inokapp://tab/streams";
        if (n == 0) { v.note = w(d, "none_live"); return; }
        List<String> titles = new ArrayList<>();
        for (Live l : d.live) titles.add(ch(d, l.channelId).name);
        int k = Math.min(n, rowsFor(small, fs, titles));
        for (int i = 0; i < k; i++) {
            Live l = d.live.get(i); Channel c = ch(d, l.channelId);
            String url = l.videoId == null || l.videoId.isEmpty() ? "inokapp://tab/streams" : "https://www.youtube.com/watch?v=" + l.videoId;
            v.rows.add(new Row(c.name, l.title, c.avatar, url, fill(w(d, "say_live"), "name", c.name), true, false));
        }
        if (n > k) v.foot = fill(w(d, "more"), "n", String.valueOf(n - k));
    }

    static void upcoming(View v, boolean small, float fs, Data d, long now, ZoneId zone) {
        v.header = small ? w(d, "nearest") : w(d, "upcoming_title");
        v.headerUrl = "inokapp://tab/streams";
        List<Planned> next = new ArrayList<>();
        for (Planned p : d.planned) if (p.at > now) next.add(p);
        next.sort((a, b) -> Long.compare(a.at, b.at));
        if (next.isEmpty()) { v.note = w(d, "none_upcoming"); return; }
        List<String> titles = new ArrayList<>();
        for (Planned p : next) titles.add(ch(d, p.channelId).name);
        int k = Math.min(next.size(), rowsFor(small, fs, titles));
        String today = DateTimeFormatter.ISO_LOCAL_DATE.withZone(zone).format(Instant.ofEpochMilli(now));
        String tomorrow = DateTimeFormatter.ISO_LOCAL_DATE.withZone(zone).format(Instant.ofEpochMilli(now + 86_400_000L));
        for (int i = 0; i < k; i++) {
            Planned p = next.get(i); Channel c = ch(d, p.channelId);
            String day = DateTimeFormatter.ISO_LOCAL_DATE.withZone(zone).format(Instant.ofEpochMilli(p.at));
            String when = (day.equals(today) ? "" : day.equals(tomorrow) ? w(d, "tomorrow") + " " : shortDate(p.at) + " ") + hhmm(p.at, zone);
            boolean bell = d.reminders != null && d.reminders.contains(p.channelId + "|" + p.videoId);
            if (small && i == 0) {
                v.big = hhmm(p.at, zone);
                String sub = (day.equals(today) ? "" : day.equals(tomorrow) ? w(d, "tomorrow") : shortDate(p.at));
                v.rows.add(new Row(c.name, join(sub, p.title), c.avatar, "inokapp://tab/streams", fill(fill(w(d, "say_planned"), "name", c.name), "time", when), false, bell));
                if (bell) v.foot = fill(w(d, "remind"), "time", hhmm(p.at - 600_000L, zone));
            } else {
                v.rows.add(new Row(when + " · " + c.name, p.title, c.avatar, "inokapp://tab/streams", fill(fill(w(d, "say_planned"), "name", c.name), "time", when), false, bell));
            }
        }
        if (!small && next.size() == 1) v.note = w(d, "only_one");
    }

    static void fresh(View v, boolean small, float fs, Data d) {
        v.header = w(d, "new_title");
        v.headerUrl = "https://inok.info/articles/";
        if (d.items.isEmpty()) { v.note = w(d, "none_new"); return; }
        List<String> titles = new ArrayList<>();
        for (Item it : d.items) titles.add(it.title);
        int k = Math.min(d.items.size(), small ? 1 : Math.max(2, rowsFor(false, fs, titles)));
        for (int i = 0; i < k; i++) {
            Item it = d.items.get(i);
            String date = shortDate(it.published);
            String sub = "news".equals(it.kind) && d.mixedNews ? w(d, "news") + " · " + date : date; // A-146: «Новини» only, in this mixed list
            v.rows.add(new Row(it.title, sub, null, it.url, it.title + ", " + date, false, false));
        }
    }

    static String join(String a, String b) {
        if (a == null || a.isEmpty()) return b == null ? "" : b;
        if (b == null || b.isEmpty()) return a;
        return a + " · " + b;
    }
}
