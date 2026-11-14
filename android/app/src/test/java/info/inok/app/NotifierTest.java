package info.inok.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.Before;
import org.junit.Test;

/** A-84: the notification rules (Notifier) against a FAKE notification manager - what the tray holds after each step. */
public class NotifierTest {
    /** The notification manager, mocked: a map of what is shown + a log of the channel calls. */
    static final class FakeTray implements Notifier.Tray {
        final Map<String, Notifier.Note> shown = new LinkedHashMap<>();
        final Map<String, Integer> channels = new LinkedHashMap<>();
        final List<String> log = new ArrayList<>();
        final List<Notifier.Note> posts = new ArrayList<>();
        static String key(String tag, int id) { return tag + "#" + id; }
        @Override public List<Notifier.Shown> active() {
            List<Notifier.Shown> out = new ArrayList<>();
            for (Notifier.Note n : shown.values()) out.add(new Notifier.Shown(n.tag, n.id, n.text, n.when));
            return out;
        }
        @Override public void post(Notifier.Note n) { shown.put(key(n.tag, n.id), n); posts.add(n); }
        @Override public void cancel(String tag, int id) { shown.remove(key(tag, id)); log.add("cancel " + key(tag, id)); }
        @Override public Integer importance(String ch) { return channels.get(ch); }
        @Override public void createChannel(String id, String name, int imp) {
            if (!channels.containsKey(id)) channels.put(id, imp); // Android: an existing channel keeps its importance
            log.add("create " + id + " " + channels.get(id));
        }
        @Override public void deleteChannel(String id) { channels.remove(id); log.add("delete " + id); }
        int articles() { int c = 0; for (Notifier.Note n : shown.values()) if (n.tag.equals(Notifier.TAG_ARTICLE)) c++; return c; }
        Notifier.Note summary() { return shown.get(key(Notifier.TAG_SUMMARY, Notifier.SUMMARY_ID)); }
    }

    static final class FakeWords implements Notifier.Words {
        public String articleTitle() { return "Нове на inok.info"; }
        public String liveTitle() { return "Зараз в ефірі"; }
        public String summaryTitle(int n) { return n + " нових"; }
        public String more(int n) { return "+" + n; }
        public String channelArticles() { return "Нові статті"; }
        public String channelLive() { return "Ефір"; }
        public String text(String json) { return json; }
    }

    FakeTray tray;
    Notifier n;
    long clock = 1000;

    @Before public void setUp() { tray = new FakeTray(); n = new Notifier(tray, new FakeWords()); }

    static Map<String, String> msg(String... kv) {
        Map<String, String> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return m;
    }
    void article(String id) { n.onData(msg("type", "article", "id", id, "kind", "news", "title", "T" + id), false, "m" + id, clock++); }
    void live(String ch, String video) { n.onData(msg("type", "stream_live", "channel_id", ch, "video_id", video, "title", "L" + ch), false, "v" + video, clock++); }

    @Test public void fiveArticlesMakeOneGroupWithOneSummaryUpdatedInPlace() {
        for (String id : new String[] { "101", "102", "103", "104", "105" }) article(id);
        assertEquals(5, tray.articles());
        Notifier.Note s = tray.summary();
        assertEquals("5 нових", s.title);
        assertEquals(Arrays.asList("T105", "T104", "T103", "T102", "T101"), s.lines); // newest first
        assertTrue(s.summary); assertTrue(s.onlyAlertOnce); assertTrue(s.markReadAction);
        assertEquals(Notifier.GROUP, s.group);
        assertEquals(Notifier.TYPE_SUMMARY_TAP, s.tap.get("type"));
        int summaries = 0;
        for (Notifier.Note p : tray.posts) if (p.summary) { summaries++; assertEquals(Notifier.SUMMARY_ID, p.id); assertEquals(Notifier.TAG_SUMMARY, p.tag); }
        assertEquals(5, summaries); // one per item, always the SAME tag / id = updated, never a second summary
        for (Notifier.Note p : tray.posts) if (!p.summary) {
            assertTrue("children are silent, the summary alerts", p.childOfGroup);
            assertEquals(Notifier.GROUP, p.group);
            assertEquals(Notifier.CH_ARTICLES, p.channel);
            assertEquals("article", p.tap.get("type"));
        }
        assertEquals(101, tray.shown.get(FakeTray.key("article", 101)).id); // the id = the article id: stable
    }

    @Test public void theSameArticleTwiceReplacesItself() {
        article("7"); article("7");
        assertEquals(1, tray.articles());
        assertEquals("1 нових", tray.summary().title);
    }

    @Test public void moreThanFiveShowsFiveLinesAndTheRestAsACount() {
        for (int i = 1; i <= 8; i++) article(String.valueOf(i));
        assertEquals(5, tray.summary().lines.size());
        assertEquals("+3", tray.summary().subText);
        assertEquals("8 нових", tray.summary().title);
    }

    @Test public void homeSeenClearsAllArticlesButNotStreams() {
        article("1"); article("2"); live("3", "v1");
        n.consumeArticles(null, clock++);
        assertEquals(0, tray.articles());
        assertNull(tray.summary());
        assertTrue(tray.shown.containsKey(FakeTray.key("live_3", Notifier.LIVE_ID)));
    }

    @Test public void anOpenedArticleRemovesOnlyItselfAndTheSummaryFollows() {
        article("1"); article("2"); article("3");
        n.consumeArticles(new HashSet<>(Collections.singletonList("2")), clock++);
        assertEquals(2, tray.articles());
        assertFalse(tray.shown.containsKey(FakeTray.key("article", 2)));
        assertEquals("2 нових", tray.summary().title);
        n.consumeArticles(new HashSet<>(Arrays.asList("1", "3")), clock++);
        assertNull(tray.summary());
    }

    @Test public void anArticleNotInTheTrayChangesNothing() {
        article("1");
        int before = tray.posts.size();
        n.consumeArticles(new HashSet<>(Collections.singletonList("99")), clock++);
        assertEquals(before, tray.posts.size());
        assertEquals(1, tray.articles());
    }

    @Test public void aSwipedChildUpdatesTheSummaryAndTheLastOneRemovesIt() {
        article("1"); article("2");
        tray.shown.remove(FakeTray.key("article", 1)); n.childDismissed(1, clock++);
        assertEquals("1 нових", tray.summary().title);
        tray.shown.remove(FakeTray.key("article", 2)); n.childDismissed(2, clock++);
        assertNull(tray.summary());
    }

    @Test public void streamsOfOneChannelReplaceEachOtherAndCarryTheSafetyNet() {
        live("3", "a"); live("3", "b"); live("4", "c");
        assertEquals(2, tray.shown.size());
        Notifier.Note l3 = tray.shown.get(FakeTray.key("live_3", Notifier.LIVE_ID));
        assertEquals("b", l3.tap.get("video_id")); // the newer one
        assertEquals(Notifier.CH_LIVE, l3.channel);
        assertEquals(Notifier.LIVE_TIMEOUT_MS, l3.timeoutMs);
        assertEquals(6L * 3600 * 1000, Notifier.LIVE_TIMEOUT_MS);
        assertNull(l3.group); // never in the articles' group
    }

    @Test public void liveStatusRemovesChannelsNoLongerLive() {
        live("3", "a"); live("4", "b"); article("1");
        n.keepLive(new HashSet<>(Collections.singletonList("4")), clock + Notifier.LIVE_GRACE_MS);
        assertFalse(tray.shown.containsKey(FakeTray.key("live_3", 1)));
        assertTrue(tray.shown.containsKey(FakeTray.key("live_4", 1)));
        assertEquals(1, tray.articles());
    }

    @Test public void aJustAnnouncedStreamSurvivesALaggingLiveStatus() {
        live("3", "a");
        n.keepLive(new HashSet<String>(), clock + Notifier.LIVE_GRACE_MS - 2); // live-status not yet updated by the server
        assertTrue(tray.shown.containsKey(FakeTray.key("live_3", 1)));
        n.keepLive(new HashSet<String>(), clock + Notifier.LIVE_GRACE_MS);
        assertFalse(tray.shown.containsKey(FakeTray.key("live_3", 1)));
    }

    @Test public void streamEndedRemovesItsChannelEvenInTheForeground() {
        live("3", "a"); live("4", "b");
        n.onData(msg("type", "stream_ended", "channel_id", "3", "video_id", "a"), true, "e", clock++);
        assertFalse(tray.shown.containsKey(FakeTray.key("live_3", 1)));
        assertTrue(tray.shown.containsKey(FakeTray.key("live_4", 1)));
    }

    @Test public void anUnknownTypeDrawsNothing() {
        n.onData(msg("type", "something_new", "channel_id", "3", "title", "X"), false, "x", clock++);
        n.onData(msg("title", "no type"), false, "y", clock++);
        assertTrue(tray.posts.isEmpty());
    }

    @Test public void inTheForegroundNothingIsDrawn() {
        n.onData(msg("type", "article", "id", "1", "title", "T"), true, "a", clock++);
        n.onData(msg("type", "stream_live", "channel_id", "3", "title", "L"), true, "b", clock++);
        assertTrue(tray.posts.isEmpty());
    }

    @Test public void migrationKeepsTheUsersOffSwitch() {
        tray.channels.put(Notifier.CH_LEGACY, Notifier.IMPORTANCE_NONE);
        n.ensureChannels();
        assertEquals(Integer.valueOf(Notifier.IMPORTANCE_NONE), tray.channels.get(Notifier.CH_ARTICLES));
        assertEquals(Integer.valueOf(Notifier.IMPORTANCE_NONE), tray.channels.get(Notifier.CH_LIVE));
        assertFalse(tray.channels.containsKey(Notifier.CH_LEGACY));
        // the old one is deleted only AFTER both new ones exist
        assertEquals(Arrays.asList("create inok_articles 0", "create inok_live 0", "delete inok_push"), tray.log);
    }

    @Test public void migrationFromAnOnChannelAndAFreshInstall() {
        tray.channels.put(Notifier.CH_LEGACY, 4); // the user had raised it: the new ones start at the default
        n.ensureChannels();
        assertEquals(Integer.valueOf(Notifier.IMPORTANCE_DEFAULT), tray.channels.get(Notifier.CH_ARTICLES));
        FakeTray fresh = new FakeTray();
        new Notifier(fresh, new FakeWords()).ensureChannels();
        assertEquals(Integer.valueOf(Notifier.IMPORTANCE_DEFAULT), fresh.channels.get(Notifier.CH_LIVE));
        assertFalse(fresh.log.contains("delete inok_push"));
        // a second start: nothing deleted, importance untouched
        n.ensureChannels();
        assertEquals(Integer.valueOf(Notifier.IMPORTANCE_DEFAULT), tray.channels.get(Notifier.CH_LIVE));
    }

    @Test public void articleIdsAreStable() {
        assertEquals(2869, Notifier.articleNid("2869"));
        assertEquals(Notifier.articleNid("x-1"), Notifier.articleNid("x-1"));
        assertTrue(Notifier.articleNid("x-1") >= 0);
    }
}
