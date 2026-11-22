package info.inok.app;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A-84 (ref/FUTURE_notifications.md, items 1-6): EVERY notification decision of the app, in plain Java (no android.*), so the JVM
 * unit test drives it with a fake tray (NotifierTest). The Android side (InokNotifications) only implements {@link Tray} and
 * {@link Words} with NotificationManager and the app-language resources.
 * <ul>
 * <li>(a) articles: one GROUP + one InboxStyle summary (constant tag / id), updated in place; the children are silent
 *     (GROUP_ALERT_SUMMARY), the summary sounds once (setOnlyAlertOnce) - a batch rings once;</li>
 * <li>(b) consumed = removed: «Нове на сайті» seen on Home -> all articles; an article opened -> its own; the summary follows;</li>
 * <li>(c) «ефір»: one notification per channel (tag {@code live_<id>}), a newer one replaces it, {@link #LIVE_TIMEOUT_MS} safety net,
 *     removed when live-status no longer lists the channel, or on {@code stream_ended} (R-42, its own topic {@code chend_<id>});</li>
 * <li>(e) an unknown {@code type} draws NOTHING (1.0.4 drew any non-article as a stream);</li>
 * <li>(f) two channels; a user who had switched the old one OFF keeps both new ones off; the old one deleted after;</li>
 * <li>(g) the summary's «Позначити прочитаним» = {@link #consumeArticles}(all); (h) taps carry the message data.</li>
 * </ul>
 */
final class Notifier {
    static final String CH_ARTICLES = "inok_articles";
    static final String CH_LIVE = "inok_live";
    static final String CH_LEGACY = "inok_push"; // 1.0.0-1.0.4: one channel for everything
    static final String GROUP = "info.inok.app.ARTICLES";
    static final String TAG_ARTICLE = "article";
    static final String TAG_SUMMARY = "articles";
    static final String TAG_LIVE = "live_";
    static final int SUMMARY_ID = 1;
    static final int LIVE_ID = 1;
    static final String TYPE_ARTICLE = "article";
    static final String TYPE_LIVE = "stream_live";
    static final String TYPE_LIVE_END = "stream_ended";
    /** (h) the summary's tap: the app opens «Нове на сайті» (src/data/live/pushRoute.ts). */
    static final String TYPE_SUMMARY_TAP = "articles_summary";
    /** (c) the safety net: a «ефір» notification goes by itself after 6 h even if neither live-status nor stream_ended removed it.
     *  The longest broadcast service (the Paschal night: midnight office + matins + liturgy) runs 4-5 h; the site announces a stream
     *  only within 3 h of its start (contract §4) - 6 h covers both without leaving a dead notification for a day. */
    static final long LIVE_TIMEOUT_MS = 6L * 60 * 60 * 1000;
    /** (c) live-status lags the push (the server caches it, the app polls it): a «ефір» notification younger than this is never removed by
     *  live-status (stream_ended and the timeout still remove it). */
    static final long LIVE_GRACE_MS = 10L * 60 * 1000;
    /** InboxStyle lines shown; more items = «+N» under them. */
    static final int SUMMARY_LINES = 5;
    /** android.app.NotificationManager importance values (API 24+). */
    static final int IMPORTANCE_NONE = 0;
    static final int IMPORTANCE_DEFAULT = 3;

    /** The words, in the APP's language (not the device's). */
    interface Words {
        String articleTitle();
        String liveTitle();
        String summaryTitle(int count); // plurals: «5 нових статей»
        String more(int count);         // «+3»
        String channelArticles();
        String channelLive();
        String text(String titleJson);  // contract §4: `title` = JSON of the three languages -> the app's one
        String lang();                  // the app's language (uk | ru | en) - the site's ready texts are picked in it
    }

    /** One of OUR notifications now in the tray. */
    static final class Shown {
        final String tag; final int id; final String text; final long when;
        Shown(String tag, int id, String text, long when) { this.tag = tag; this.id = id; this.text = text; this.when = when; }
    }

    /** What to post. Plain data; the adapter turns it into a NotificationCompat.Builder. */
    static final class Note {
        String tag; int id; String channel; String title; String text; long when;
        List<String> lines = Collections.emptyList(); String subText;
        String group; boolean summary; boolean childOfGroup; boolean onlyAlertOnce; long timeoutMs;
        boolean markReadAction; boolean reportDismiss;
        Map<String, String> tap = new HashMap<>();
    }

    /** The notification manager, as far as these rules need it. */
    interface Tray {
        List<Shown> active();
        void post(Note n);
        void cancel(String tag, int id);
        Integer importance(String channel); // null = no such channel
        void createChannel(String id, String name, int importance);
        void deleteChannel(String id);
    }

    private final Tray tray;
    private final Words words;

    Notifier(Tray tray, Words words) { this.tray = tray; this.words = words; }

    /** (f) A user who switched the old channel OFF gets both new channels OFF; else the default. An app can never raise a channel's
     *  importance later (only the user can), so this is decided once, from the old channel, before it is deleted. */
    static int newChannelImportance(Integer legacy) {
        return legacy != null && legacy == IMPORTANCE_NONE ? IMPORTANCE_NONE : IMPORTANCE_DEFAULT;
    }

    /** (f) At every start and before every post: the two channels exist (names follow the app's language); the old one goes after them. */
    void ensureChannels() {
        Integer legacy = tray.importance(CH_LEGACY);
        int imp = newChannelImportance(legacy);
        tray.createChannel(CH_ARTICLES, words.channelArticles(), imp);
        tray.createChannel(CH_LIVE, words.channelLive(), imp);
        if (legacy != null) tray.deleteChannel(CH_LEGACY);
    }

    /** A notification id from the article id (contract: digits as a string); stable, so a repeat replaces. */
    static int articleNid(String id) {
        if (id == null) return 0;
        try { return Integer.parseInt(id.trim()) & 0x7fffffff; } catch (NumberFormatException e) { return id.hashCode() & 0x7fffffff; }
    }

    /** One FCM data message. `foreground`: the app is on screen - it shows articles / streams itself, the tray gets nothing. */
    void onData(Map<String, String> data, boolean foreground, String messageId, long now) {
        String type = data.get("type");
        if (TYPE_LIVE_END.equals(type)) { endLive(data.get("channel_id")); return; }
        if (foreground) return;
        if (TYPE_ARTICLE.equals(type)) article(data, messageId, now);
        else if (TYPE_LIVE.equals(type)) live(data, messageId, now);
        // (e) any other type: nothing (a later message type must never reach a tray as something else)
    }

    private static Map<String, String> tapData(Map<String, String> data, String messageId) {
        Map<String, String> tap = new HashMap<>(data);
        tap.put("google.message_id", messageId); // the Capacitor plugin reads a tap from the launch intent by this key
        return tap;
    }

    private void article(Map<String, String> data, String messageId, long now) {
        ensureChannels();
        Note n = new Note();
        n.tag = TAG_ARTICLE; n.id = articleNid(data.get("id")); n.channel = CH_ARTICLES; n.when = now;
        n.title = words.articleTitle(); n.text = words.text(data.get("title"));
        siteTexts(n, data);
        n.group = GROUP; n.childOfGroup = true; n.reportDismiss = true; n.tap = tapData(data, messageId);
        tray.post(n);
        List<Shown> kids = children(Collections.singleton(n.id));
        kids.add(0, new Shown(n.tag, n.id, n.text, now));
        summary(kids, now);
    }

    private void live(Map<String, String> data, String messageId, long now) {
        ensureChannels();
        Note n = new Note();
        n.tag = TAG_LIVE + data.get("channel_id"); n.id = LIVE_ID; n.channel = CH_LIVE; n.when = now;
        n.title = words.liveTitle(); n.text = words.text(data.get("title"));
        siteTexts(n, data);
        n.timeoutMs = LIVE_TIMEOUT_MS; n.tap = tapData(data, messageId);
        tray.post(n);
    }

    /**
     * A-161 (4) + A-162 (1) (cloud_44): the SITE's ready words of a push (InokSite 409, contract §4) - `n_title` / `n_text`, each a JSON string of
     * {uk, ru, en} - replace the app's own title / text, each field on its own, in the app's language (an empty one = uk). Anything missing,
     * empty or not such an object keeps the app's words (never a blank, never a crash). ONE function for every push type that carries them;
     * the channel, the group, the summary and the quiet hours stay the app's.
     */
    private void siteTexts(Note n, Map<String, String> data) {
        String t = siteText(data.get("n_title"), words.lang());
        String x = siteText(data.get("n_text"), words.lang());
        if (t != null) n.title = t;
        if (x != null) n.text = x;
    }

    /** The `lang` value (else uk) of a FLAT JSON object of strings, or null when the text is not one / both are empty. Plain Java (the JVM unit
     *  test has no org.json): whitespace, the JSON escapes incl. \\uXXXX; any other value type or trailing text = null. */
    static String siteText(String json, String lang) {
        if (json == null) return null;
        Map<String, String> o = new HashMap<>();
        int[] at = { skip(json, 0) };
        if (at[0] >= json.length() || json.charAt(at[0]) != '{') return null;
        at[0] = skip(json, at[0] + 1);
        if (at[0] < json.length() && json.charAt(at[0]) == '}') at[0]++;
        else while (true) {
            String k = str(json, at); if (k == null) return null;
            at[0] = skip(json, at[0]);
            if (at[0] >= json.length() || json.charAt(at[0]) != ':') return null;
            at[0] = skip(json, at[0] + 1);
            String v = str(json, at); if (v == null) return null;
            o.put(k, v);
            at[0] = skip(json, at[0]);
            if (at[0] >= json.length()) return null;
            char c = json.charAt(at[0]++);
            if (c == '}') break;
            if (c != ',') return null;
            at[0] = skip(json, at[0]);
        }
        if (skip(json, at[0]) != json.length()) return null;
        for (String l : new String[] { lang, "uk" }) { String v = o.get(l); if (v != null && !v.trim().isEmpty()) return v; }
        return null;
    }
    private static int skip(String s, int i) { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; return i; }
    /** a JSON string at at[0] (which moves past it), or null */
    private static String str(String s, int[] at) {
        int i = at[0];
        if (i >= s.length() || s.charAt(i) != '"') return null;
        StringBuilder b = new StringBuilder();
        for (i++; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"') { at[0] = i + 1; return b.toString(); }
            if (c != '\\') { b.append(c); continue; }
            if (++i >= s.length()) return null;
            char e = s.charAt(i);
            switch (e) {
                case '"': case '\\': case '/': b.append(e); break;
                case 'n': b.append('\n'); break;
                case 't': b.append('\t'); break;
                case 'r': b.append('\r'); break;
                case 'b': b.append('\b'); break;
                case 'f': b.append('\f'); break;
                case 'u':
                    if (i + 4 >= s.length()) return null;
                    try { b.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16)); } catch (NumberFormatException x) { return null; }
                    i += 4; break;
                default: return null;
            }
        }
        return null;
    }

    /** Our article children now in the tray, newest first, without the given ids. */
    private List<Shown> children(Collection<Integer> without) {
        List<Shown> out = new ArrayList<>();
        for (Shown s : tray.active()) if (TAG_ARTICLE.equals(s.tag) && !without.contains(s.id)) out.add(s);
        out.sort((a, b) -> Long.compare(b.when, a.when));
        return out;
    }

    /** (a) The summary, posted with the same tag / id every time = updated in place; none left = removed. */
    private void summary(List<Shown> kids, long now) {
        if (kids.isEmpty()) { tray.cancel(TAG_SUMMARY, SUMMARY_ID); return; }
        Note s = new Note();
        s.tag = TAG_SUMMARY; s.id = SUMMARY_ID; s.channel = CH_ARTICLES; s.when = now;
        s.title = words.summaryTitle(kids.size()); s.text = kids.get(0).text;
        List<String> lines = new ArrayList<>();
        for (Shown k : kids) { if (lines.size() == SUMMARY_LINES) break; lines.add(k.text); }
        s.lines = lines;
        if (kids.size() > SUMMARY_LINES) s.subText = words.more(kids.size() - SUMMARY_LINES);
        s.group = GROUP; s.summary = true; s.onlyAlertOnce = true; s.markReadAction = true;
        s.tap.put("type", TYPE_SUMMARY_TAP);
        s.tap.put("google.message_id", "summary-" + now);
        tray.post(s);
    }

    /** (b) / (g) Articles consumed: `ids` null = all (Home's «Нове на сайті» seen, «Позначити прочитаним»), else those opened. */
    void consumeArticles(Set<String> ids, long now) {
        List<Integer> gone = new ArrayList<>();
        for (Shown s : tray.active()) {
            if (!TAG_ARTICLE.equals(s.tag)) continue;
            if (ids == null || containsNid(ids, s.id)) { tray.cancel(TAG_ARTICLE, s.id); gone.add(s.id); }
        }
        if (ids == null) { tray.cancel(TAG_SUMMARY, SUMMARY_ID); return; }
        if (!gone.isEmpty()) summary(children(gone), now);
    }

    private static boolean containsNid(Set<String> ids, int nid) {
        for (String id : ids) if (articleNid(id) == nid) return true;
        return false;
    }

    /** One article swiped away by the user: the summary's count and lines follow (none left -> no summary). */
    void childDismissed(int nid, long now) {
        summary(children(Collections.singleton(nid)), now);
    }

    /** (c) live-status says which channels are live NOW: every «ефір» notification of another channel goes. */
    void keepLive(Set<String> liveChannelIds, long now) {
        for (Shown s : tray.active()) {
            if (s.tag == null || !s.tag.startsWith(TAG_LIVE) || now - s.when < LIVE_GRACE_MS) continue;
            if (!liveChannelIds.contains(s.tag.substring(TAG_LIVE.length()))) tray.cancel(s.tag, s.id);
        }
    }

    /** (d) `stream_ended` (R-42): that channel's notification goes, whether the app is open or not. */
    void endLive(String channelId) {
        if (channelId != null && !channelId.isEmpty()) tray.cancel(TAG_LIVE + channelId, LIVE_ID);
    }
}
