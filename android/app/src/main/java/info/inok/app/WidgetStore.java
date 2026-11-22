package info.inok.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;

/**
 * T9: the widgets' data. (a) The APP writes `widgets` (InokWidgetsPlugin.set) into the SAME store InokMessagingService reads for the language
 * (Capacitor Preferences = SharedPreferences «CapacitorStorage»): words, channels, the last live-status, the 3 newest items, reminders, the
 * time, the API key. (b) The WIDGET's own fetch (WidgetWorker, every 30 min + at once on a stream push) keeps `widgets_live` / `widgets_new`
 * beside it; the newer of the two wins. Nothing here throws: a broken value = the other one, or the «open the app» line.
 */
final class WidgetStore {
    private WidgetStore() { }
    static final String PREFS = "CapacitorStorage";
    static final String APP_KEY = "widgets", LIVE_KEY = "widgets_live", NEW_KEY = "widgets_new";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static JSONObject app(Context c) {
        try { String s = prefs(c).getString(APP_KEY, null); return s == null ? null : new JSONObject(s); } catch (Exception e) { return null; }
    }
    static JSONObject own(Context c, String key) {
        try { String s = prefs(c).getString(key, null); return s == null ? null : new JSONObject(s); } catch (Exception e) { return null; }
    }
    static void putOwn(Context c, String key, JSONObject o) { prefs(c).edit().putString(key, o.toString()).apply(); }

    static long time(String iso) { try { return Instant.parse(iso).toEpochMilli(); } catch (Exception e) { return 0L; } }

    /** The app's JSON + the widget's own newer fetches -> the model's Data (null = the app never wrote its data). */
    static WidgetModel.Data load(Context c) {
        JSONObject a = app(c);
        if (a == null) return null;
        WidgetModel.Data d = new WidgetModel.Data();
        d.words = new HashMap<>();
        JSONObject w = a.optJSONObject("words");
        if (w != null) for (Iterator<String> it = w.keys(); it.hasNext(); ) { String k = it.next(); d.words.put(k, w.optString(k, "")); }
        d.channels = new HashMap<>();
        JSONObject chs = a.optJSONObject("channels");
        File kept = new File(c.getFilesDir(), "kept");
        if (chs != null) for (Iterator<String> it = chs.keys(); it.hasNext(); ) {
            String k = it.next(); JSONObject ch = chs.optJSONObject(k);
            if (ch == null) continue;
            String av = ch.optString("avatar", "");
            File f = av.isEmpty() ? null : new File(kept, av);
            try { d.channels.put(Integer.parseInt(k), new WidgetModel.Channel(ch.optString("name", ""), ch.optString("place", ""), f != null && f.isFile() ? f.getAbsolutePath() : null)); }
            catch (NumberFormatException ignored) { }
        }
        d.reminders = new HashSet<>();
        JSONArray rem = a.optJSONArray("reminders");
        if (rem != null) for (int i = 0; i < rem.length(); i++) { JSONObject r = rem.optJSONObject(i); if (r != null) d.reminders.add(r.optInt("channel_id") + "|" + r.optString("video_id")); }
        long appAt = time(a.optString("updated_at", ""));
        // live: the newer of the app's last status and the widget's own fetch
        JSONObject ownLive = own(c, LIVE_KEY);
        long ownLiveAt = ownLive == null ? 0L : ownLive.optLong("at", 0L);
        JSONObject status = ownLive != null && ownLiveAt > appAt ? ownLive.optJSONObject("status") : a.optJSONObject("status");
        String lang = a.optString("lang", "uk");
        if (status != null) {
            JSONArray live = status.optJSONArray("live");
            if (live != null) for (int i = 0; i < live.length(); i++) { JSONObject l = live.optJSONObject(i); if (l != null)
                d.live.add(new WidgetModel.Live(l.optInt("channel_id"), l.optString("video_id", ""), pick(l.opt("title"), lang))); }
            JSONArray sch = status.optJSONArray("scheduled");
            if (sch != null) for (int i = 0; i < sch.length(); i++) { JSONObject s = sch.optJSONObject(i); if (s != null)
                d.planned.add(new WidgetModel.Planned(s.optInt("channel_id"), s.optString("video_id", ""), pick(s.opt("title"), lang), time(s.optString("scheduled_at", "")))); }
        }
        JSONObject ownNew = own(c, NEW_KEY);
        long ownNewAt = ownNew == null ? 0L : ownNew.optLong("at", 0L);
        JSONArray items = ownNew != null && ownNewAt > appAt && lang.equals(ownNew.optString("lang")) ? ownNew.optJSONArray("items") : a.optJSONArray("items");
        if (items != null) for (int i = 0; i < items.length(); i++) { JSONObject it = items.optJSONObject(i); if (it != null)
            d.items.add(new WidgetModel.Item(it.optInt("id"), it.optString("kind", ""), it.optString("title", ""), time(it.optString("created_at", it.optString("published_at", ""))), it.optString("site_url", ""))); }
        // A-161 (1): the newest of ANY kind by their placing on the site (`created`) - the app's list and the widget's own fetch alike
        d.items.sort((x, y) -> Long.compare(y.created, x.created));
        // A-162 (2): the site's small settings (values only), already checked by the app (src/data/uiConfig.ts); anything else = the defaults
        JSONObject ui = a.optJSONObject("ui");
        if (ui != null) {
            d.maxRows = Math.max(0, ui.optInt("max_rows", 0));
            JSONObject dots = ui.optJSONObject("dots");
            if (dots != null) {
                d.dots = new HashMap<>();
                for (String theme : new String[] { "light", "dark" }) {
                    JSONObject t = dots.optJSONObject(theme);
                    if (t != null) for (String k : new String[] { WidgetModel.DOT_NEWS, WidgetModel.DOT_PUB, WidgetModel.DOT_VIDEO }) {
                        String hex = t.optString(k, "");
                        if (hex.matches("#[0-9A-Fa-f]{6}")) d.dots.put(theme + "." + k, hex);
                    }
                }
            }
        }
        d.updated = Math.max(appAt, Math.max(ownLiveAt, ownNewAt));
        return d;
    }

    /** A-162 (2): the site's colour of a kind's dot for the phone's CURRENT theme, or null (the kit's colour of the drawable) */
    static Integer dotColor(Context c, WidgetModel.Data d, String kind) {
        if (d == null || d.dots == null) return null;
        boolean night = (c.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        String hex = d.dots.get((night ? "dark." : "light.") + kind);
        try { return hex == null ? null : android.graphics.Color.parseColor(hex); } catch (IllegalArgumentException e) { return null; }
    }

    /** live-status titles are {uk, ru, en}; the app's language, then uk / ru / en. */
    static String pick(Object o, String lang) {
        if (o instanceof String) return (String) o;
        if (!(o instanceof JSONObject)) return "";
        JSONObject j = (JSONObject) o;
        for (String l : new String[] { lang, "uk", "ru", "en" }) { String v = j.optString(l, ""); if (!v.isEmpty()) return v; }
        return "";
    }
}
