package info.inok.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 1.0.18 (A-160, A-163; the CD kit README «Android - three mechanisms»): the widget PICKER shows each widget with its own content.
 * (1) Android 15+ (API 35): a GENERATED preview per kind - the SAME renderer as a placed widget (WidgetRender) fed with the kit's sample data
 *     (res/raw/widget_samples.json) in the phone's language, pushed by AppWidgetManager.setWidgetPreview ONCE per (version, language): the
 *     platform rate-limits it (about 2 calls an hour), so a refusal is logged and tried again at the next start - never in a loop;
 * (2) Android 12-14: `previewLayout` = res/layout/widget_preview_<kind>.xml (scripts/widget_samples.py);
 * (3) Android <= 11: `previewImage` = the kit's pictures (res/drawable[-uk|-ru][-night]-nodpi/widget_preview_<kind>.webp).
 */
final class WidgetSamples {
    private WidgetSamples() { }
    static final String STAMP = "widget_preview_stamp";
    static final String TAG = "InokWidgets";

    /** the picker's language: the phone's when it is one of the three, else English (= the default resources of (2) and (3)) */
    static String pickerLang() {
        String l = Locale.getDefault().getLanguage();
        return "uk".equals(l) || "ru".equals(l) ? l : "en";
    }

    /** The kit's samples of one language as the model's Data (pictures = the bundled «av:<id>», no «оновлено», the sample's own count and times). */
    static WidgetModel.Data data(Context c, String lang) {
        try (InputStream in = c.getResources().openRawResource(R.raw.widget_samples)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(); byte[] b = new byte[8192]; int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
            JSONObject j = new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8)).getJSONObject(lang);
            WidgetModel.Data d = new WidgetModel.Data();
            Map<String, String> w = new HashMap<>();
            w.put("live_title", j.getString("live_head") + " · {n}"); w.put("live_small", j.getString("live_head_small") + " · {n}");
            w.put("more", j.getString("more_fmt")); w.put("upcoming_title", j.getString("up_title")); w.put("nearest", j.getString("up_small"));
            w.put("new_title", j.getString("new_title")); w.put("tomorrow", j.getString("tomorrow"));
            for (String k : new String[] { "say_live", "say_planned" }) w.put(k, "{name}");
            for (String k : new String[] { "say_news", "say_pub", "say_video" }) w.put(k, "{title}");
            d.words = w;
            d.channels = new HashMap<>();
            d.liveTotal = j.getInt("live_total");
            JSONArray live = j.getJSONArray("live");
            for (int i = 0; i < live.length(); i++) {
                JSONObject x = live.getJSONObject(i); int id = x.getInt("id");
                d.channels.put(id, new WidgetModel.Channel(x.getString("name"), "", "av:" + id));
                d.live.add(new WidgetModel.Live(id, "", ""));
            }
            JSONArray up = j.getJSONArray("up");
            List<String> when = new ArrayList<>();
            for (int i = 0; i < up.length(); i++) {
                JSONObject x = up.getJSONObject(i); int id = x.getInt("id");
                if (!d.channels.containsKey(id)) d.channels.put(id, new WidgetModel.Channel(x.getString("name"), "", "av:" + id));
                d.planned.add(new WidgetModel.Planned(id, "", "", i)); when.add(x.getString("when"));
            }
            d.sampleWhen = when;
            JSONArray items = j.getJSONArray("new");
            for (int i = 0; i < items.length(); i++) {
                JSONObject x = items.getJSONObject(i); String k = x.getString("kind");
                d.items.add(new WidgetModel.Item(i, "pub".equals(k) ? "publication" : k, x.getString("title"), items.length() - i, ""));
            }
            return d;
        } catch (Exception e) { Log.w(TAG, "samples: " + e); return null; }
    }

    /** (1) once per (versionCode, language): every kind's generated preview, off the main thread */
    static void publishInBackground(Context c) { Context app = c.getApplicationContext(); new Thread(() -> publishOnce(app), "inok-widget-previews").start(); }

    /** (1) once per (versionCode, language): every kind's generated preview; the stamp is written only when all three were accepted */
    static void publishOnce(Context c) {
        if (Build.VERSION.SDK_INT < 35) return;
        Context app = c.getApplicationContext();
        String lang = pickerLang();
        String stamp;
        try { stamp = app.getPackageManager().getPackageInfo(app.getPackageName(), 0).getLongVersionCode() + "|" + lang; } catch (Exception e) { return; }
        SharedPreferences p = app.getSharedPreferences(WidgetStore.PREFS, Context.MODE_PRIVATE);
        if (stamp.equals(p.getString(STAMP, ""))) return;
        WidgetModel.Data d = data(app, lang);
        if (d == null) return;
        AppWidgetManager m = AppWidgetManager.getInstance(app);
        boolean all = true;
        for (Class<?> k : WidgetRender.PROVIDERS) {
            RemoteViews v = WidgetRender.views(app, 0, WidgetRender.kindOf(k), WidgetRender.DEFAULT_W, WidgetRender.DEFAULT_H, d);
            boolean ok;
            try { ok = m.setWidgetPreview(new ComponentName(app, k), AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN, v); }
            catch (Exception e) { ok = false; Log.w(TAG, "setWidgetPreview " + k.getSimpleName() + ": " + e); }
            Log.i(TAG, "setWidgetPreview " + k.getSimpleName() + " " + lang + " = " + ok);
            all &= ok;
        }
        if (all) p.edit().putString(STAMP, stamp).apply(); // a refusal (the rate limit) = the next start tries again, once
    }
}
