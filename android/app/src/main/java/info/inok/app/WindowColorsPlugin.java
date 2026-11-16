package info.inok.app;

import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * cloud_38 (REVIEW cloud_37 NOTE 6): the window's own colour under the system bars follows the APP's theme, not the system's. Where
 * the WebView does not reach under the bars (Capacitor pads the window on a WebView older than 140) the status bar strip showed the
 * DayNight window background - white above the app's dark theme. The strip above = the header's colour, the strip below = the tab bar's
 * (one vertical gradient whose middle third lies under the WebView). JS side: src/native/systemBars.ts.
 */
@CapacitorPlugin(name = "WindowColors")
public class WindowColorsPlugin extends Plugin {

    @PluginMethod
    public void set(PluginCall call) {
        final int top, bottom;
        try {
            top = Color.parseColor(call.getString("top", "#0c6486"));
            bottom = Color.parseColor(call.getString("bottom", "#ffffff"));
        } catch (IllegalArgumentException e) {
            call.reject("bad colour");
            return;
        }
        getActivity().runOnUiThread(() -> {
            GradientDrawable d = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] { top, top, bottom, bottom });
            getActivity().getWindow().getDecorView().setBackground(d);
            call.resolve();
        });
    }
}
