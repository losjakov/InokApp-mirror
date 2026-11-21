package info.inok.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Base64;
import android.util.Log;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * DEBUG ONLY (src/debug): `adb shell am broadcast -n info.inok.app/.PushTestReceiver --es payload <base64 of a JSON object>` = one FCM
 * data message (contract §4: all values strings) handed to the SAME code as InokMessagingService.onMessageReceived. Base64 keeps the
 * JSON's quotes out of adb's shell. Logs «InokNotifyTest: <type>» for scripts/emu_notify.sh.
 */
public class PushTestReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String b64 = intent == null ? null : intent.getStringExtra("payload");
        if (b64 == null) return;
        try {
            JSONObject o = new JSONObject(new String(Base64.decode(b64, Base64.DEFAULT), StandardCharsets.UTF_8));
            Map<String, String> data = new HashMap<>();
            for (Iterator<String> k = o.keys(); k.hasNext(); ) { String key = k.next(); data.put(key, o.getString(key)); }
            InokNotifications.of(ctx).onData(data, InokMessagingService.isForeground(ctx), "test-" + System.currentTimeMillis(), System.currentTimeMillis());
            String type = data.get("type"); // T9: the same widget hook as InokMessagingService
            if ("stream_live".equals(type) || "stream_ended".equals(type)) WidgetPush.onStream(ctx, data);
            Log.i("InokNotifyTest", String.valueOf(data.get("type")));
        } catch (Exception e) {
            Log.w("InokNotifyTest", "bad payload " + e);
        }
    }
}
