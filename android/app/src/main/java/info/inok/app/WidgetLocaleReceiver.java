package info.inok.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 1.0.18 (A-160): the phone's language changed / the app was updated -> the picker's generated previews again (Android 15+, WidgetSamples:
 *  once per version and language, the rate limit respected) and every placed widget redrawn. */
public class WidgetLocaleReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        PendingResult r = goAsync();
        new Thread(() -> {
            try { WidgetSamples.publishOnce(c.getApplicationContext()); WidgetRender.updateAll(c.getApplicationContext()); } finally { r.finish(); }
        }, "inok-widget-locale").start();
    }
}
