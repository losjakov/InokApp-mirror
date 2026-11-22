package info.inok.app;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * WHAT the three home-screen widgets show - pure Java (no Android), unit-tested by scripts/java_unit.sh (WidgetModelTest). WidgetRender draws
 * it with RemoteViews; WidgetStore feeds it from the JSON the app writes (`widgets`) and the widget's own fetch; WidgetSamples feeds it the
 * picker's sample data. The words come from the app (its language, one i18n table); none are built here.
 * 1.0.18 (A-160, A-161, A-163, A-155 (1); the CD kit reports/mockups/a1018/widgets/README.md):
 * <ul>
 * <li>SIZES: 2x1 TINY, 4x1 STRIP, 2x2 SMALL, 4x2 / 4x4 LIST (one look, the rows that fit) - chosen by the widget's own size in dp;</li>
 * <li>«Зараз в ефірі»: channels only (picture + live mark + name), «+N ще» counts the rest; «Найближчі»: «<time> · <channel>», «завтра HH:MM»
 *     when not today; «Нове на сайті»: the newest items of ANY kind by their placing on the site, the title only, one dot per kind
 *     (news / publication / video) - the reader hears the kind («Новина: …»), colour is never the only cue (WCAG 1.4.1);</li>
 * <li>ROWS = AS MANY AS FIT WHOLE: laid out in order by their MEASURED height (a {@link Measure}: StaticLayout on the phone), the first row that
 *     does not fit is hidden with every row after it - never a cut row, never «…» at the normal text size; at a larger size a title takes at
 *     most 2 lines with «…» (inside widgets only, A-155 (1)).</li>
 * </ul>
 */
public final class WidgetModel {
    private WidgetModel() { }

    public static final String LIVE = "live", UPCOMING = "upcoming", NEW = "new";
    /** the kind of an item -> its dot (the kit's three colours) */
    public static final String DOT_NEWS = "news", DOT_PUB = "pub", DOT_VIDEO = "video";
    /** a stream's tap (A-161 (3)): the app on «Трансляції», the stream on top - THE link path of the app (quick actions' address form) */
    public static final String STREAMS = "inokapp://tab/streams";

    public enum Size { TINY, STRIP, SMALL, LIST }

    /** The geometry of the layouts (dp / sp) - the SAME numbers res/layout/widget_*.xml use (WidgetModelTest pins them against the XML). */
    static final float PAD_TOP = 10, PAD_SIDE = 10, PAD_BOTTOM = 8, HEADER = 26, FOOT = 16;
    static final float AVATAR = 34, AVATAR_GAP = 8, DOT = 10, DOT_GAP = 10, BELL = 24, ROW_PAD = 4, ROW_MIN_AVATAR = 38;
    static final float ROW_SP = 14, SMALL_SP = 13, BIG_SP = 26;
    /** a widget narrower than this is a 2-cell one; lower than ROW2_H dp is a one-row (x1) one */
    static final float WIDE_W = 250, ROW2_H = 130;

    public static Size sizeOf(float wDp, float hDp) {
        boolean wide = wDp >= WIDE_W;
        if (hDp < ROW2_H) return wide ? Size.STRIP : Size.TINY;
        return wide ? Size.LIST : Size.SMALL;
    }

    /** Text measured as the phone lays it out (no hyphenation, whole words); dp. maxLines <= 0 = no limit. */
    public interface Measure {
        float height(String text, float widthDp, float sp, int maxLines);
        int lines(String text, float widthDp, float sp);
    }

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
        public final int id; public final String kind, title, url; public final long created;
        public Item(int id, String kind, String title, long created, String url) { this.id = id; this.kind = kind; this.title = title; this.created = created; this.url = url; }
    }
    /** Everything a widget knows: the app's words, the channels, the last data and its time; `liveTotal` > 0 = a sample's own count. */
    public static final class Data {
        public Map<String, String> words; public Map<Integer, Channel> channels;
        public List<Live> live = new ArrayList<>(); public List<Planned> planned = new ArrayList<>(); public List<Item> items = new ArrayList<>();
        public Set<String> reminders; public long updated; public int liveTotal;
        /** A-162 (2) ui-config: the most rows a LIST widget may show (0 = as many as fit; never more than fit) */
        public int maxRows;
        /** A-162 (2) ui-config: the dots' colours «<light|dark>.<news|pub|video>» -> #RRGGBB (absent = the kit's colours) */
        public Map<String, String> dots;
        /** a sample's own «when» per planned row (the kit's texts: «17:00», «завтра 06:30»); null = from the time */
        public List<String> sampleWhen;
    }

    /** One drawn row. `time` = the accent part of an upcoming row's text (its start), `dot` = the item's kind dot, `say` = the reader's label. */
    public static final class Row {
        public final String text, time, image, url, say, dot; public final boolean live, bell;
        Row(String text, String time, String image, String url, String say, String dot, boolean live, boolean bell) {
            this.text = text; this.time = time; this.image = image; this.url = url; this.say = say; this.dot = dot; this.live = live; this.bell = bell; }
    }
    /** One widget as drawn. `empty` = the app never wrote its data yet («Відкрийте застосунок…», a string resource x3). */
    public static final class View {
        public Size size = Size.LIST;
        public String header = "", headerUrl = "", big = "", foot = "", updated = "", note = "", url = "";
        public boolean liveDot, empty, ellipsize;
        public List<Row> rows = new ArrayList<>();
        /** the strip / 2x1 live widget: the pictures of the channels on air (at most 4 / 3) */
        public List<String> avatars = new ArrayList<>();
        /** a title's line limit (0 = none: whole at the normal size) */
        public int titleLines;
    }

    static String w(Data d, String key) { String v = d.words == null ? null : d.words.get(key); return v == null ? "" : v; }
    static String fill(String s, String k, String v) { return s.replace("{" + k + "}", v); }

    /** HH:MM on the phone's own clock (the stream's local start, «оновлено HH:MM»). */
    public static String hhmm(long ms, ZoneId zone) { return DateTimeFormatter.ofPattern("HH:mm").withZone(zone).format(Instant.ofEpochMilli(ms)); }

    public static String dotOf(String kind) { return "news".equals(kind) ? DOT_NEWS : "video".equals(kind) ? DOT_VIDEO : DOT_PUB; }
    static String sayKind(String dot) { return DOT_NEWS.equals(dot) ? "say_news" : DOT_VIDEO.equals(dot) ? "say_video" : "say_pub"; }

    /** The tap of a live stream (A-161 (3)): «Трансляції», then the stream on top; no video id = «Трансляції» only. */
    public static String liveUrl(String videoId) {
        return videoId == null || videoId.isEmpty() ? STREAMS : STREAMS + "?play=" + videoId.replaceAll("[^A-Za-z0-9_-]", "");
    }

    public static View build(String kind, float wDp, float hDp, float fontScale, Data d, long now, ZoneId zone, Measure m) {
        View v = new View();
        v.size = sizeOf(wDp, hDp);
        v.ellipsize = fontScale > 1.0f;
        v.titleLines = v.ellipsize ? 2 : 0;
        if (d == null || d.words == null || d.words.isEmpty()) { v.empty = true; return v; }
        v.updated = d.updated > 0 ? fill(w(d, "updated"), "time", hhmm(d.updated, zone)) : "";
        switch (kind) {
            case LIVE: live(v, wDp, hDp, d, m); break;
            case UPCOMING: upcoming(v, wDp, hDp, d, now, zone, m); break;
            default: fresh(v, wDp, hDp, d, m); break;
        }
        return v;
    }

    static Channel ch(Data d, int id) { Channel c = d.channels == null ? null : d.channels.get(id); return c == null ? new Channel("", "", null) : c; }

    /** the text width of a LIST row of this kind (the widget minus its sides, the picture / the dot, the bell) */
    static float textWidth(String kind, float wDp, boolean bell, boolean small) {
        float w = wDp - 2 * PAD_SIDE;
        if (NEW.equals(kind)) w -= DOT + DOT_GAP;
        else if (!small) w -= AVATAR + AVATAR_GAP;
        if (bell) w -= BELL;
        return Math.max(40, w);
    }

    /** A row's height in dp: its text measured (whole at the normal size, 2 lines at a larger one) + padding; a picture keeps its minimum. */
    static float rowHeight(Row r, String kind, float wDp, boolean small, int titleLines, Measure m) {
        float sp = small ? SMALL_SP : ROW_SP;
        float h = m.height(r.text, textWidth(kind, wDp, r.bell, small), sp, titleLines) + ROW_PAD;
        return NEW.equals(kind) || small ? h : Math.max(ROW_MIN_AVATAR, h);
    }

    /** ROWS = AS MANY AS FIT WHOLE (owner 22.11 08:39): in order; the first row that does not fit goes with every row after it. */
    static int fit(List<Row> rows, String kind, float wDp, float availDp, boolean small, int titleLines, int cap, Measure m) {
        float used = 0; int k = 0;
        for (Row r : rows) {
            if (cap > 0 && k >= cap) break;
            float h = rowHeight(r, kind, wDp, small, titleLines, m);
            if (used + h > availDp + 0.5f) break;
            used += h; k++;
        }
        return k;
    }

    /** the rows' room: a LIST widget carries «оновлено HH:MM» at the END OF ITS HEADER (cloud_44: the kit's rows keep their room), so its foot
     *  line exists only for «+N ще»; a SMALL one keeps «оновлено» in its foot */
    static float listSpace(float hDp, boolean foot) { return hDp - PAD_TOP - PAD_BOTTOM - HEADER - (foot ? FOOT : 0); }

    static void live(View v, float wDp, float hDp, Data d, Measure m) {
        int n = d.liveTotal > 0 ? d.liveTotal : d.live.size();
        v.headerUrl = STREAMS; v.url = STREAMS;
        boolean compact = v.size == Size.SMALL || v.size == Size.TINY;
        v.header = fill(w(d, compact ? "live_small" : "live_title"), "n", String.valueOf(n));
        if (d.live.isEmpty()) { v.note = w(d, "none_live"); return; }
        v.liveDot = true;
        List<Row> all = new ArrayList<>();
        for (Live l : d.live) {
            Channel c = ch(d, l.channelId);
            all.add(new Row(c.name, "", c.avatar, liveUrl(l.videoId), fill(w(d, "say_live"), "name", c.name), null, true, false));
        }
        v.url = all.get(0).url;
        int shown;
        if (v.size == Size.LIST) {
            shown = fit(all, LIVE, wDp, listSpace(hDp, false), false, v.titleLines, d.maxRows, m);
            if (shown < n) shown = fit(all, LIVE, wDp, listSpace(hDp, true), false, v.titleLines, d.maxRows, m); // «+N ще» takes its line
            for (int i = 0; i < shown; i++) v.rows.add(all.get(i));
        } else if (v.size == Size.SMALL || v.size == Size.STRIP) {
            v.rows.add(all.get(0)); shown = 1;
            if (v.size == Size.STRIP) for (int i = 0; i < Math.min(4, all.size()); i++) v.avatars.add(all.get(i).image);
        } else { // TINY: the header + the pictures only
            for (int i = 0; i < Math.min(3, all.size()); i++) v.avatars.add(all.get(i).image);
            shown = v.avatars.size(); return;
        }
        if (n > shown) v.foot = fill(w(d, "more"), "n", String.valueOf(n - shown));
    }

    /** «17:00» today, «завтра 06:30» tomorrow, «dd.MM HH:MM» later - the day ALWAYS rides with the time (NOTE 1: «завтра» never dropped). */
    static String when(Data d, int i, Planned p, long now, ZoneId zone) {
        if (d.sampleWhen != null && i < d.sampleWhen.size()) return d.sampleWhen.get(i);
        DateTimeFormatter iso = DateTimeFormatter.ISO_LOCAL_DATE.withZone(zone);
        String day = iso.format(Instant.ofEpochMilli(p.at));
        if (day.equals(iso.format(Instant.ofEpochMilli(now)))) return hhmm(p.at, zone);
        if (day.equals(iso.format(Instant.ofEpochMilli(now + 86_400_000L)))) return w(d, "tomorrow") + " " + hhmm(p.at, zone);
        return DateTimeFormatter.ofPattern("dd.MM").withZone(zone).format(Instant.ofEpochMilli(p.at)) + " " + hhmm(p.at, zone);
    }

    static void upcoming(View v, float wDp, float hDp, Data d, long now, ZoneId zone, Measure m) {
        boolean compact = v.size == Size.SMALL || v.size == Size.TINY;
        v.header = w(d, compact ? "nearest" : "upcoming_title");
        v.headerUrl = STREAMS; v.url = STREAMS;
        List<Planned> next = new ArrayList<>();
        for (Planned p : d.planned) if (d.sampleWhen != null || p.at > now) next.add(p);
        if (d.sampleWhen == null) next.sort((a, b) -> Long.compare(a.at, b.at));
        if (next.isEmpty()) { v.note = w(d, "none_upcoming"); return; }
        List<Row> all = new ArrayList<>();
        for (int i = 0; i < next.size(); i++) {
            Planned p = next.get(i); Channel c = ch(d, p.channelId);
            String when = when(d, i, p, now, zone);
            boolean bell = d.reminders != null && d.reminders.contains(p.channelId + "|" + p.videoId);
            all.add(new Row(when + " · " + c.name, when, c.avatar, STREAMS, fill(fill(w(d, "say_planned"), "name", c.name), "time", when), null, false, bell));
        }
        if (v.size != Size.LIST) { // one stream: the big day + time, the channel under it (2x1: the picture beside)
            Row r = all.get(0);
            v.big = r.time;
            v.rows.add(new Row(ch(d, next.get(0).channelId).name, "", r.image, r.url, r.say, null, false, r.bell));
            if (r.bell) v.foot = fill(w(d, "remind"), "time", hhmm(next.get(0).at - 600_000L, zone));
            return;
        }
        int shown = fit(all, UPCOMING, wDp, listSpace(hDp, false), false, v.titleLines, d.maxRows, m);
        for (int i = 0; i < shown; i++) v.rows.add(all.get(i));
    }

    static void fresh(View v, float wDp, float hDp, Data d, Measure m) {
        v.header = w(d, "new_title");
        v.headerUrl = "https://inok.info/articles/"; v.url = v.headerUrl;
        if (d.items.isEmpty()) { v.note = w(d, "none_new"); return; }
        List<Row> all = new ArrayList<>();
        for (Item it : d.items) {
            String dot = dotOf(it.kind);
            all.add(new Row(it.title, "", null, it.url, fill(w(d, sayKind(dot)), "title", it.title), dot, false, false));
        }
        v.url = all.get(0).url;
        if (v.size == Size.STRIP || v.size == Size.TINY) { v.rows.add(all.get(0)); return; }
        boolean small = v.size == Size.SMALL;
        int shown = fit(all, NEW, wDp, listSpace(hDp, small && !v.updated.isEmpty()), small, v.titleLines, small ? 0 : d.maxRows, m);
        for (int i = 0; i < shown; i++) v.rows.add(all.get(i));
    }
}
