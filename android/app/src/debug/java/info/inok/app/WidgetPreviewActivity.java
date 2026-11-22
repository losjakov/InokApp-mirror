package info.inok.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;

/**
 * DEBUG ONLY (src/debug): the REVIEW snapshots of the three widgets - the SAME RemoteViews a launcher gets (WidgetRender.views), applied in this
 * window at a widget's size in dp on a neutral backdrop. 1.0.18: any size (`--ei w 344 --ei h 176`; the kit's 2x1 170x80, 4x1 344x80, 2x2
 * 170x176, 4x2 344x176, 4x4 344x360) and the picker's sample data (`--es sample uk|ru|en`, WidgetSamples) beside the app's own data.
 * `--es mode layout --es sample uk` = the previewLayout of Android 12-14 in that language.
 * `adb shell am start -n info.inok.app/.WidgetPreviewActivity --es kind live|upcoming|new --ei w 344 --ei h 176 [--es sample uk]` (scripts/emu_widgets.sh).
 */
public class WidgetPreviewActivity extends Activity {
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        String kind = getIntent().getStringExtra("kind"); if (kind == null) kind = WidgetModel.LIVE;
        int w = getIntent().getIntExtra("w", 344), h = getIntent().getIntExtra("h", 176);
        String sample = getIntent().getStringExtra("sample");
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(120, 140, 150));
        WidgetModel.Data d = sample != null ? WidgetSamples.data(this, sample) : WidgetStore.load(this);
        View v;
        if ("layout".equals(getIntent().getStringExtra("mode")) && sample != null) {
            // Android 12-14's picker sample: the provider's previewLayout itself, in that language (the phone's theme)
            android.content.res.Configuration cf = new android.content.res.Configuration(getResources().getConfiguration());
            cf.setLocale(new java.util.Locale(sample));
            int res = "upcoming".equals(kind) ? R.layout.widget_preview_upcoming : "new".equals(kind) ? R.layout.widget_preview_new : R.layout.widget_preview_live;
            v = android.view.LayoutInflater.from(createConfigurationContext(cf)).inflate(res, root, false);
        } else v = WidgetRender.views(this, 0, kind, w, h, d).apply(this, root);
        root.addView(v, new FrameLayout.LayoutParams(dp(w), dp(h), Gravity.CENTER));
        setContentView(root);
        Log.i("InokWidgets", "preview " + kind + " " + w + "x" + h + " sample=" + sample + " data=" + (d != null) + " font=" + getResources().getConfiguration().fontScale);
    }
    int dp(int x) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, x, getResources().getDisplayMetrics())); }
}
