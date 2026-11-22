package info.inok.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private static final String PREFS = "inok_crash";
    private static final String KEY_CODE = "render_gone";
    private static final String KEY_TIMES = "render_gone_times";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FcmTopicsPlugin.class); // local plugin: FCM topics (A-7)
        registerPlugin(NetPolicyPlugin.class); // local plugin: metered network + Data Saver (A-20)
        registerPlugin(AnalyticsPlugin.class); // local plugin: Firebase Analytics, screens only (A-36)
        registerPlugin(IntegrityPlugin.class); // local plugin: Play Integrity standard tokens for every write (A-66)
        registerPlugin(InAppReviewPlugin.class); // local plugin: Google Play's own rating window (cloud_41, A-133 C2)
        registerPlugin(InokWidgetsPlugin.class); // local plugin: the home-screen widgets' data (cloud_43, A-153 (2))
        registerPlugin(WindowColorsPlugin.class); // local plugin: the window colour under the system bars follows the app theme (cloud_38 NOTE 6)
        super.onCreate(savedInstanceState);
        if (bridge != null) bridge.addWebViewListener(new RenderGuard());
        // 1.0.5 round 2 (owner 11.11.2026, Huawei P30 Pro): the page learns how far it REALLY lies under the navigation bar (NavOverlap) -
        // after every layout (insets, rotation, the EMUI bar switch, a keyboard) and on every new page
        getWindow().getDecorView().getViewTreeObserver().addOnGlobalLayoutListener(() -> publishNavOverlap(false));
        if (bridge != null) bridge.addWebViewListener(new WebViewListener() {
            @Override public void onPageLoaded(WebView webView) { publishNavOverlap(true); }
        });
        // A-84 (f): the two channels exist from the first start of 1.0.5 (Android settings show them; the old one moves over)
        InokNotifications.of(this).ensureChannels();
        // 1.0.18 (A-160): the widget picker's generated previews on Android 15+, once per version and language (WidgetSamples)
        WidgetSamples.publishInBackground(this);
        // cloud_27: ONLY the qa build (R8, not debuggable; android/app/src/qa/res) keeps its WebView inspectable for the emulator's
        // DevTools steps (scripts/emu_nav.mjs); main = false, so release never does. After super.onCreate: Capacitor sets it there too.
        if (getResources().getBoolean(R.bool.inok_webview_inspectable)) WebView.setWebContentsDebuggingEnabled(true);
    }

    private String navJs;

    /** NavOverlap -> the page's --inok-nav-{left,right,bottom}; sent only when it changed (or to a new page). Native log = the proof on a
     *  non-debuggable build (the qa page has no console lines, REF_gotchas_4). */
    private void publishNavOverlap(boolean force) {
        if (bridge == null || bridge.getWebView() == null) return;
        View decor = getWindow().getDecorView();
        WebView web = bridge.getWebView();
        WindowInsetsCompat root = ViewCompat.getRootWindowInsets(decor);
        if (root == null || web.getWidth() == 0 || decor.getHeight() == 0) return;
        Insets nav = root.getInsets(WindowInsetsCompat.Type.navigationBars());
        int[] at = new int[2];
        web.getLocationInWindow(at);
        int[] px = NavOverlap.cssPx(decor.getWidth(), decor.getHeight(), new int[] { at[0], at[1], at[0] + web.getWidth(), at[1] + web.getHeight() },
            new int[] { nav.left, nav.top, nav.right, nav.bottom }, getResources().getDisplayMetrics().density);
        String js = NavOverlap.script(px);
        if (!force && js.equals(navJs)) return;
        navJs = js;
        web.evaluateJavascript(js, null);
        Log.i("InokInsets", "nav overlap css px left " + px[0] + " right " + px[1] + " bottom " + px[2] + " (nav bar px " + nav + ", sdk " + Build.VERSION.SDK_INT + ")");
    }

    /**
     * A-76: App Links never loop. The app opens site pages in a Custom Tab (Capacitor Browser, which marks its intent with
     * EXTRA_REFERRER = this app). Without a Custom Tabs session that intent is implicit, and for an inok.info page in the App Links
     * scope that the router sends to the browser (the /monasteries/ list, the A-33 comment form of an article…) Android would hand
     * it back to THIS activity. Such an intent goes on to the phone's browser instead; it never reaches the page's router.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        if (intent != null && fromThisApp(intent)) { toBrowser(intent); return; }
        super.onNewIntent(intent);
    }

    private boolean fromThisApp(Intent intent) {
        if (!Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) return false;
        Uri ref = intent.getParcelableExtra(Intent.EXTRA_REFERRER);
        return ref != null && ref.toString().equals("android-app://" + getPackageName());
    }

    private void toBrowser(Intent intent) {
        // the phone's browsers = what opens a page no app claims (manifest <queries>: VIEW https)
        Intent probe = new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com/")).addCategory(Intent.CATEGORY_BROWSABLE);
        PackageManager pm = getPackageManager();
        ResolveInfo def = pm.resolveActivity(probe, PackageManager.MATCH_DEFAULT_ONLY);
        String pkg = def != null && def.activityInfo != null ? def.activityInfo.packageName : null;
        if (pkg == null || pkg.equals(getPackageName()) || pkg.equals("android")) { // no default chosen: the first browser that is not this app
            pkg = null;
            for (ResolveInfo ri : pm.queryIntentActivities(probe, 0)) {
                if (ri.activityInfo != null && !ri.activityInfo.packageName.equals(getPackageName())) { pkg = ri.activityInfo.packageName; break; }
            }
        }
        if (pkg == null) { Log.w("InokLinks", "no browser for " + intent.getData()); return; }
        Intent out = new Intent(intent);
        out.setComponent(null);
        out.setPackage(pkg);
        out.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(out);
            Log.i("InokLinks", "to the browser " + pkg);
        } catch (ActivityNotFoundException e) {
            Log.w("InokLinks", "browser refused " + pkg);
        }
    }

    /**
     * A-48 (a): the page must never die white. When the WebView's renderer process is gone (crashed or killed for memory) the
     * system kills the app unless we handle it (API 26+); a WebView whose renderer is gone cannot be used again, so the activity
     * is recreated (a fresh WebView; Bridge.onDetachedFromWindow destroys the old one). The cause is kept and handed to the page
     * on its next load (`window.inokNativeCrash`, src/app/crash.ts), which shows THE error screen with the code. More than two
     * renderer deaths in a minute = no recreate loop: the activity finishes and the code is shown at the next launch.
     */
    private class RenderGuard extends WebViewListener {
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            boolean crashed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && detail != null && detail.didCrash();
            String code = crashed ? "RPG-CRASH" : "RPG-KILLED";
            Log.e("InokBoot", "render process gone " + code);
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            long now = SystemClock.elapsedRealtime();
            String[] times = p.getString(KEY_TIMES, "").split(",");
            int recent = 0;
            StringBuilder kept = new StringBuilder();
            for (String t : times) {
                try {
                    long v = Long.parseLong(t);
                    if (now - v < 60_000 && v <= now) { recent++; kept.append(v).append(','); }
                } catch (NumberFormatException ignored) { /* empty */ }
            }
            kept.append(now);
            p.edit().putString(KEY_CODE, code).putString(KEY_TIMES, kept.toString()).apply();
            if (recent >= 2) finish(); else recreate();
            return true;
        }

        @Override
        public void onPageLoaded(WebView webView) {
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            String code = p.getString(KEY_CODE, null);
            if (code == null) return;
            p.edit().remove(KEY_CODE).apply();
            webView.evaluateJavascript("window.inokNativeCrash&&window.inokNativeCrash('" + code + "')", null);
        }
    }
}
