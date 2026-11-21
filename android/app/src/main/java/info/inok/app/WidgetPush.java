package info.inok.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Map;

/**
 * T9 (A-153 (2)): Android refreshes the widgets AT ONCE on a stream push (InokMessagingService runs natively in the background): the
 * payload (channel_id, video_id, title) goes into the widgets' own live data at once, the widgets are redrawn, and WidgetWorker fetches the
 * whole live-status right after (network allowing). No widget placed = nothing at all.
 */
final class WidgetPush {
    private WidgetPush() { }

    static void onStream(Context c, Map<String, String> data) {
        try {
            if (!WidgetRender.anyWidget(c)) return;
            int ch = Integer.parseInt(data.get("channel_id") == null ? "-1" : data.get("channel_id"));
            JSONObject own = WidgetStore.own(c, WidgetStore.LIVE_KEY);
            JSONObject app = WidgetStore.app(c);
            JSONObject status = own != null && own.optJSONObject("status") != null ? own.getJSONObject("status")
                : app != null && app.optJSONObject("status") != null ? new JSONObject(app.getJSONObject("status").toString()) : new JSONObject();
            JSONArray live = status.optJSONArray("live") == null ? new JSONArray() : status.getJSONArray("live");
            JSONArray kept = new JSONArray();
            for (int i = 0; i < live.length(); i++) { JSONObject l = live.optJSONObject(i); if (l != null && l.optInt("channel_id") != ch) kept.put(l); }
            if ("stream_live".equals(data.get("type"))) {
                JSONObject l = new JSONObject().put("channel_id", ch).put("video_id", data.get("video_id") == null ? "" : data.get("video_id"));
                String t = data.get("title");
                l.put("title", t == null ? "" : t.trim().startsWith("{") ? new JSONObject(t) : t);
                JSONArray first = new JSONArray().put(l);
                for (int i = 0; i < kept.length(); i++) first.put(kept.get(i));
                kept = first;
            }
            status.put("live", kept);
            WidgetStore.putOwn(c, WidgetStore.LIVE_KEY, new JSONObject().put("at", System.currentTimeMillis()).put("status", status));
            WidgetRender.updateAll(c);
            WidgetWorker.now(c);
        } catch (Exception e) {
            android.util.Log.i("InokWidgets", "push kept: " + e.getClass().getSimpleName());
        }
    }
}
