package info.inok.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.TimeUnit;

/**
 * T9 (A-153 (2)): the widgets refresh THEMSELVES - the app's JavaScript does not run while it is closed. ONE unique periodic job every
 * 30 min while any widget exists (enqueued by a provider's onEnabled, cancelled when the last is removed) + ONE «now» job on a `stream_live`
 * / `stream_ended` push (InokMessagingService). GET live-status and articles?lang=<lang>&limit=3 with the PUBLIC X-Inok-App key (contract §1);
 * any failure keeps the last data and its time (never empty boxes).
 */
public class WidgetWorker extends Worker {
    static final String PERIODIC = "inok-widgets-30min", NOW = "inok-widgets-now";
    static final String API = "https://inok.info/api/app/v1/";

    public WidgetWorker(@NonNull Context c, @NonNull WorkerParameters p) { super(c, p); }

    static void ensurePeriodic(Context c) {
        Constraints net = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(WidgetWorker.class, 30, TimeUnit.MINUTES).setConstraints(net).build());
    }
    static void cancelPeriodic(Context c) { WorkManager.getInstance(c).cancelUniqueWork(PERIODIC); }
    static void now(Context c) {
        Constraints net = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        WorkManager.getInstance(c).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, new OneTimeWorkRequest.Builder(WidgetWorker.class).setConstraints(net).build());
    }

    @NonNull @Override public Result doWork() {
        Context c = getApplicationContext();
        if (!WidgetRender.anyWidget(c)) return Result.success();
        JSONObject app = WidgetStore.app(c);
        String key = app == null ? "" : app.optJSONObject("api") == null ? "" : app.optJSONObject("api").optString("key", "");
        String lang = app == null ? "uk" : app.optString("lang", "uk");
        long at = System.currentTimeMillis();
        try {
            JSONObject status = new JSONObject(get(API + "live-status", key));
            WidgetStore.putOwn(c, WidgetStore.LIVE_KEY, new JSONObject().put("at", at).put("status", status));
        } catch (Exception e) { android.util.Log.i("InokWidgets", "live-status kept: " + e.getClass().getSimpleName()); }
        try {
            JSONObject page = new JSONObject(get(API + "articles?lang=" + lang + "&limit=3", key));
            JSONArray items = page.optJSONArray("items");
            if (items != null) WidgetStore.putOwn(c, WidgetStore.NEW_KEY, new JSONObject().put("at", at).put("lang", lang).put("items", items));
        } catch (Exception e) { android.util.Log.i("InokWidgets", "articles kept: " + e.getClass().getSimpleName()); }
        WidgetRender.updateAll(c);
        return Result.success();
    }

    static String get(String url, String key) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(15_000); h.setReadTimeout(20_000);
        if (!key.isEmpty()) h.setRequestProperty("X-Inok-App", key);
        h.setRequestProperty("Accept", "application/json");
        h.setRequestProperty("User-Agent", "InokApp/" + BuildConfig.VERSION_NAME + " (android)");
        try {
            int code = h.getResponseCode();
            String type = h.getContentType() == null ? "" : h.getContentType();
            if (code != 200 || type.contains("html")) throw new IllegalStateException("http " + code);
            try (InputStream in = h.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] b = new byte[8192]; int n;
                while ((n = in.read(b)) > 0) out.write(b, 0, n);
                return out.toString("UTF-8");
            }
        } finally { h.disconnect(); }
    }
}
