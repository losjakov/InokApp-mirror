package info.inok.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;

/**
 * DEBUG ONLY (src/debug): the REVIEW snapshots of the three widgets (T9; A-156 (3): for the REPORT, never store frames) - the SAME RemoteViews a
 * launcher gets (WidgetRender.views from WidgetStore), applied in this window at the size of a 2x2 / 4x2 cell block on a neutral backdrop.
 * `adb shell am start -n info.inok.app/.WidgetPreviewActivity --es kind live|upcoming|new --es size small|medium` (scripts/emu_widgets.sh).
 */
public class WidgetPreviewActivity extends Activity {
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        String kind = getIntent().getStringExtra("kind"); if (kind == null) kind = WidgetModel.LIVE;
        boolean small = "small".equals(getIntent().getStringExtra("size"));
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(120, 140, 150));
        float fs = getResources().getConfiguration().fontScale;
        WidgetModel.Data d = WidgetStore.load(this);
        RemoteViews rv = WidgetRender.views(this, 0, kind, small, fs, d);
        View v = rv.apply(this, root);
        int w = dp(small ? 170 : 350), h = dp(180);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h, Gravity.CENTER);
        root.addView(v, lp);
        setContentView(root);
        Log.i("InokWidgets", "preview " + kind + " " + (small ? "small" : "medium") + " data=" + (d != null) + " font=" + fs);
    }
    int dp(int x) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, x, getResources().getDisplayMetrics())); }
}
