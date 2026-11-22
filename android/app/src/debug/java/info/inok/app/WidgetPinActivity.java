package info.inok.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Bundle;
import android.util.Log;

/**
 * DEBUG ONLY (src/debug - never in qa / release: build.yml reads the release APK's strings back): the store frame «02-widgets» (A-168 (2)) needs
 * the three widgets on the device's REAL home screen. This asks the launcher to place one (AppWidgetManager.requestPinAppWidget - the
 * launcher's own confirm dialog, tapped by uiautomator in scripts/emu_store_widgets.sh); nothing is drawn or composed by the app.
 * `adb shell am start -n info.inok.app/.WidgetPinActivity --es kind live|upcoming|new`
 */
public class WidgetPinActivity extends Activity {
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        String kind = getIntent().getStringExtra("kind");
        Class<?> p = "upcoming".equals(kind) ? UpcomingWidget.class : "new".equals(kind) ? NewWidget.class : LiveWidget.class;
        AppWidgetManager m = AppWidgetManager.getInstance(this);
        boolean ok = m.isRequestPinAppWidgetSupported() && m.requestPinAppWidget(new ComponentName(this, p), null, null);
        Log.i("InokWidgets", "requestPinAppWidget " + p.getSimpleName() + " = " + ok);
        finish();
    }
}
