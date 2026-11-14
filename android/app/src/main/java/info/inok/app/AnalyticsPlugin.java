package info.inok.app;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.analytics.FirebaseAnalytics;

import java.util.EnumMap;
import java.util.Map;

/**
 * A-36: Firebase Analytics, screens only. Collection starts OFF (manifest), `setEnabled` follows «Ще → Режим інкогніто» (off = on, A-96 W-7)
 * (read by the app at every start); consent: analytics storage only, every advertising signal denied (R-9 keeps the ad id out).
 * JS side: src/native/analytics.ts. Without google-services.json there is no Firebase app: calls resolve and do nothing.
 */
@CapacitorPlugin(name = "InokAnalytics")
public class AnalyticsPlugin extends Plugin {
    private static final String TAG = "InokAnalytics";

    private FirebaseAnalytics fa() {
        try { return FirebaseAnalytics.getInstance(getContext()); } catch (Exception e) { return null; }
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        FirebaseAnalytics a = fa();
        if (a != null) {
            Map<FirebaseAnalytics.ConsentType, FirebaseAnalytics.ConsentStatus> c = new EnumMap<>(FirebaseAnalytics.ConsentType.class);
            c.put(FirebaseAnalytics.ConsentType.ANALYTICS_STORAGE, on ? FirebaseAnalytics.ConsentStatus.GRANTED : FirebaseAnalytics.ConsentStatus.DENIED);
            c.put(FirebaseAnalytics.ConsentType.AD_STORAGE, FirebaseAnalytics.ConsentStatus.DENIED);
            c.put(FirebaseAnalytics.ConsentType.AD_USER_DATA, FirebaseAnalytics.ConsentStatus.DENIED);
            c.put(FirebaseAnalytics.ConsentType.AD_PERSONALIZATION, FirebaseAnalytics.ConsentStatus.DENIED);
            a.setConsent(c);
            a.setAnalyticsCollectionEnabled(on);
        }
        Log.i(TAG, "collection " + (on ? "on" : "off") + (a == null ? " (no firebase)" : ""));
        call.resolve();
    }

    @PluginMethod
    public void screen(PluginCall call) {
        String name = call.getString("name");
        FirebaseAnalytics a = fa();
        if (a != null && name != null && !name.isEmpty()) {
            Bundle b = new Bundle();
            b.putString(FirebaseAnalytics.Param.SCREEN_NAME, name);
            b.putString(FirebaseAnalytics.Param.SCREEN_CLASS, "App");
            a.logEvent(FirebaseAnalytics.Event.SCREEN_VIEW, b);
            Log.i(TAG, "screen " + name);
        }
        call.resolve();
    }
}
