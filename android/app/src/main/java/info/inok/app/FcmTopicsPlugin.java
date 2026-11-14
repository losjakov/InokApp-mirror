package info.inok.app;

import android.content.Intent;
import android.provider.Settings;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

import java.util.HashSet;
import java.util.Set;

/**
 * FCM topic subscription (ruling A-7: topics are managed on the device, the server keeps no tokens).
 * `@capacitor/push-notifications` registers the token and delivers messages but has no topic API, so this local plugin adds
 * the two calls on top of the firebase-messaging it already ships. JS side: src/native/push.ts.
 * A-84: also the tray side of «consumed» (articles seen / opened) and of live-status (channels no longer live) - Notifier decides.
 */
@CapacitorPlugin(name = "FcmTopics")
public class FcmTopicsPlugin extends Plugin {

    @PluginMethod
    public void subscribe(PluginCall call) {
        String topic = call.getString("topic");
        if (topic == null || topic.isEmpty()) { call.reject("topic required"); return; }
        FirebaseMessaging.getInstance().subscribeToTopic(topic).addOnCompleteListener(task -> {
            // cloud_27: a NATIVE line (the page's console reaches logcat only in a debuggable build) - the qa smoke's push proof; never the token
            if (task.isSuccessful()) { Log.i("InokPush", "subscribed " + topic); call.resolve(); } else call.reject(String.valueOf(task.getException()));
        });
    }

    @PluginMethod
    public void unsubscribe(PluginCall call) {
        String topic = call.getString("topic");
        if (topic == null || topic.isEmpty()) { call.reject("topic required"); return; }
        FirebaseMessaging.getInstance().unsubscribeFromTopic(topic).addOnCompleteListener(task -> {
            if (task.isSuccessful()) call.resolve(); else call.reject(String.valueOf(task.getException()));
        });
    }

    /** A-67: the soft question's «Відкрити налаштування» - this app's notification settings (API 26+, the app's minSdk). */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); call.resolve(); } catch (Exception e) { call.reject(String.valueOf(e)); }
    }

    /** A-84 (b): articles consumed in the app - `ids` absent = all (Home's «Нове на сайті» seen), else the opened article(s). */
    @PluginMethod
    public void consumedArticles(PluginCall call) {
        JSArray ids = call.getArray("ids", null);
        Set<String> set = ids == null ? null : strings(ids);
        InokNotifications.of(getContext()).consumeArticles(set, System.currentTimeMillis());
        call.resolve();
    }

    /** A-84 (c): the channels live NOW (a fresh live-status); every «ефір» notification of another channel goes. */
    @PluginMethod
    public void liveChannels(PluginCall call) {
        JSArray ids = call.getArray("ids", null);
        if (ids == null) { call.reject("ids required"); return; }
        InokNotifications.of(getContext()).keepLive(strings(ids), System.currentTimeMillis());
        call.resolve();
    }

    private static Set<String> strings(JSArray a) {
        Set<String> out = new HashSet<>();
        for (int i = 0; i < a.length(); i++) out.add(String.valueOf(a.opt(i)));
        return out;
    }
}
