package info.inok.app;

import android.app.ActivityManager;
import android.content.Context;
import android.content.SharedPreferences;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The site sends DATA messages (contract §4: `type`, `title` = JSON of the three languages, ids). A data message in the
 * background shows nothing by itself, so this service (declared with a higher priority than the plugin's) builds the
 * notification in the app's language (InokNotifications / Notifier, A-84) and hands everything else to the Capacitor plugin (foreground
 * event, token, tap).
 */
public class InokMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(RemoteMessage msg) {
        Map<String, String> data = msg.getData();
        // A-84: every rule (group + summary, one «ефір» per channel, stream_ended, unknown types = nothing) is in Notifier
        if (msg.getNotification() == null && !data.isEmpty()) {
            String id = msg.getMessageId() == null ? String.valueOf(System.currentTimeMillis()) : msg.getMessageId();
            InokNotifications.of(this).onData(data, isForeground(this), id, System.currentTimeMillis());
            // T9 (A-153 (2)): a stream push changes «Зараз в ефірі» AT ONCE - the payload into the widgets' own data now, the fetch right after
            String type = data.get("type");
            if ("stream_live".equals(type) || "stream_ended".equals(type)) WidgetPush.onStream(this, data);
        }
        super.onMessageReceived(msg); // the plugin's foreground event (pushNotificationReceived)
    }

    /** The app is on screen: it shows new articles / streams itself, the tray gets nothing (PushTestReceiver, debug only, asks the same). */
    static boolean isForeground(Context ctx) {
        ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
        List<ActivityManager.RunningAppProcessInfo> procs = am == null ? null : am.getRunningAppProcesses();
        if (procs == null) return false;
        for (ActivityManager.RunningAppProcessInfo p : procs) {
            if (p.processName.equals(ctx.getPackageName()) && p.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) return true;
        }
        return false;
    }

    /** The app's language: Capacitor Preferences (`settings.lang`), else the device language if uk/ru/en, else uk (spec §1). */
    static String appLang(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            String s = sp.getString("settings", null);
            if (s != null) {
                String lang = new JSONObject(s).optString("lang", "");
                if (lang.equals("uk") || lang.equals("ru") || lang.equals("en")) return lang;
            }
        } catch (Exception ignored) { }
        String dev = Locale.getDefault().getLanguage();
        return (dev.equals("ru") || dev.equals("en")) ? dev : "uk";
    }

    /** `title` arrives as a JSON string of the three languages; pick the app's, fall back uk → ru → en. */
    static String pickTitle(String json, String lang) {
        if (json == null) return "";
        try {
            JSONObject o = new JSONObject(json);
            for (String l : new String[] { lang, "uk", "ru", "en" }) {
                String v = o.optString(l, "");
                if (!v.isEmpty()) return v;
            }
        } catch (Exception ignored) { return json; }
        return "";
    }
}
