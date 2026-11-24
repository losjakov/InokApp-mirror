package info.inok.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;

/**
 * cloud_46 (A-174, the Android twin of A-173 (C)): the reminder's COUNTDOWN - an ongoing, silent notification on its own channel (low
 * importance: no sound, no vibration, no heads-up) with the system's counting-down chronometer to the start (`setUsesChronometer` +
 * `setChronometerCountDown` + `setWhen(start)`, API 24+ = every supported device, minSdk 26), the channel's picture, «Відкрити» /
 * «Скасувати» (both open the APP with its address - `inokapp://tab/streams…`, the cancel goes through the app's own reminder path). From the
 * start: «Трансляція почалася — відкрити», dismissible, gone 15 min after (`setTimeoutAfter`). ONE method `sync` = the reminders inside the
 * 8 h window as they are now (src/native/countdown.ts): posts / updates them, removes the rest. Android 14+: a swipe removes the countdown only
 * (remembered: not posted again for that reminder); the reminder itself stays. Android 13+ without the notification permission: nothing.
 */
@CapacitorPlugin(name = "InokCountdown")
public class CountdownPlugin extends Plugin {
    static final String CHANNEL = "countdown";
    static final String TAG = "countdown";
    static final String GONE_KEY = "countdown_gone"; // ids the person swiped away (CapacitorStorage, beside the reminders)
    static final String ACTION_GONE = "info.inok.app.COUNTDOWN_GONE";
    static final String EXTRA_ID = "countdown_id";
    static final long AFTER_MS = 15 * 60_000L;

    /** the notification id of a reminder id «channel|video» (stable, the same reminder always replaces its own) */
    static int nid(String id) { return id.hashCode(); }

    @PluginMethod
    public void sync(PluginCall call) {
        Context ctx = getContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        JSArray items = call.getArray("items", new JSArray());
        JSObject words = call.getObject("words", new JSObject());
        long now = call.getLong("now", System.currentTimeMillis());
        JSObject out = new JSObject();
        boolean allowed = Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        if (nm == null || !allowed) { cancelAllBut(nm, new HashSet<>()); out.put("active", 0); call.resolve(out); return; }
        NotificationChannel ch = new NotificationChannel(CHANNEL, words.getString("channel", "Countdown"), NotificationManager.IMPORTANCE_LOW);
        ch.setSound(null, null); ch.enableVibration(false); ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
        Set<String> gone = gone(ctx);
        Set<String> keep = new HashSet<>();
        Set<String> stillListed = new HashSet<>();
        WidgetModel.Data data = null;
        try { data = WidgetStore.load(ctx); } catch (Exception ignored) { /* no channel pictures: the app icon */ }
        for (int i = 0; i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            String id = it.optString("id");
            stillListed.add(id);
            if (gone.contains(id)) continue; // swiped away by the person: the countdown stays gone, the reminder stays
            long at = it.optLong("at");
            int channel = it.optInt("channel_id");
            String video = it.optString("video_id");
            String title = it.optString("title");
            String monastery = it.optString("monastery");
            boolean started = now >= at;
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_push)
                .setContentTitle(monastery.isEmpty() ? title : monastery)
                .setContentText(started ? words.getString("started", "") : title)
                .setSubText(words.getString("label", ""))
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setSilent(true).setOnlyAlertOnce(true)
                .setWhen(at).setShowWhen(true)
                .setUsesChronometer(!started).setChronometerCountDown(true)
                .setOngoing(!started).setAutoCancel(started)
                .setTimeoutAfter(Math.max(1000L, at + AFTER_MS - now))
                .setContentIntent(WidgetRender.open(ctx, nid(id), started ? WidgetModel.liveUrl(video) : WidgetModel.STREAMS))
                .addAction(0, words.getString("open", ""), WidgetRender.open(ctx, nid(id) + 1, started ? WidgetModel.liveUrl(video) : WidgetModel.STREAMS))
                .addAction(0, words.getString("cancel", ""), WidgetRender.open(ctx, nid(id) + 2, WidgetModel.STREAMS + "?cancel=" + channel + "." + video))
                .setDeleteIntent(goneIntent(ctx, id));
            if (data != null) {
                String avatar = WidgetModel.ch(data, channel).avatar;
                Bitmap pic = avatar == null ? null : WidgetRender.avatar(ctx, avatar);
                if (pic != null) b.setLargeIcon(pic);
            }
            nm.notify(TAG, nid(id), b.build());
            keep.add(id);
        }
        cancelAllBut(nm, keep);
        gone.retainAll(stillListed); // a reminder no longer listed forgets its swipe
        prefs(ctx).edit().putStringSet(GONE_KEY, gone).apply();
        out.put("active", keep.size());
        call.resolve(out);
    }

    /** the emulator pass / the ring: how many countdowns are on the shade now */
    @PluginMethod
    public void state(PluginCall call) {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        JSObject out = new JSObject();
        JSArray ids = new JSArray();
        int n = 0;
        if (nm != null) for (StatusBarNotification s : nm.getActiveNotifications()) if (TAG.equals(s.getTag())) { n++; ids.put(s.getId()); }
        out.put("active", n); out.put("ids", ids);
        call.resolve(out);
    }

    private static void cancelAllBut(NotificationManager nm, Set<String> keep) {
        if (nm == null) return;
        Set<Integer> want = new HashSet<>();
        for (String id : keep) want.add(nid(id));
        for (StatusBarNotification s : nm.getActiveNotifications()) if (TAG.equals(s.getTag()) && !want.contains(s.getId())) nm.cancel(TAG, s.getId());
    }

    static SharedPreferences prefs(Context c) { return WidgetStore.prefs(c); }
    static Set<String> gone(Context c) { return new HashSet<>(prefs(c).getStringSet(GONE_KEY, new HashSet<>())); }
    /** Android 14+: the person swiped the countdown away - remembered (NotifyReceiver) */
    static void markGone(Context c, String id) { Set<String> g = gone(c); g.add(id); prefs(c).edit().putStringSet(GONE_KEY, g).apply(); }

    private static PendingIntent goneIntent(Context c, String id) {
        Intent i = new Intent(c, NotifyReceiver.class).setAction(ACTION_GONE).putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(c, (ACTION_GONE + id).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
