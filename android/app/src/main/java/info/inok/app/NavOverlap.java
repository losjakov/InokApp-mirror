package info.inok.app;

/**
 * 1.0.5 round 2 (owner 11.11.2026, Huawei P30 Pro, Android 10, 3-button navigation): how far the WebView REALLY lies under the
 * navigation bar, per edge, in CSS px - pure arithmetic (no android.*: JUnit runs it here and in CI).
 *
 * Why geometry and not the insets Capacitor hands to the page: Capacitor 8.6.0's SystemBars injects a bottom inset of 0 on API < 30
 * with WebView >= 140 (capacitor#8603: androidx guesses «keyboard open» on rebuilt insets), so the tab bar went under the buttons. The
 * overlap of two rectangles is true whoever padded what: 0 where the window is already padded above the bar (WebView < 140, Android 11+
 * when Capacitor gets it right, a keyboard that resized the window), the bar's size where the page runs under it. The page takes the
 * MAX of this and Capacitor's value (src/theme/variables.css), so a value is never added twice.
 */
public final class NavOverlap {
    private NavOverlap() {}

    /**
     * @param winW   the window's (decor view's) width, px
     * @param winH   the window's height, px
     * @param web    the WebView's rectangle in window coordinates {left, top, right, bottom}, px
     * @param nav    the navigation bar insets {left, top, right, bottom}, px (a bar on one side; 0 when hidden)
     * @param density px per CSS px (DisplayMetrics.density)
     * @return the overlap per edge {left, right, bottom}, CSS px, never negative
     */
    public static int[] cssPx(int winW, int winH, int[] web, int[] nav, float density) {
        int bottom = Math.max(0, web[3] - (winH - nav[3]));
        int right = Math.max(0, web[2] - (winW - nav[2]));
        int left = Math.max(0, nav[0] - web[0]);
        float d = density > 0 ? density : 1f;
        return new int[] { Math.round(left / d), Math.round(right / d), Math.round(bottom / d) };
    }

    /** The page's three variables, set in one call; an edge with no overlap is removed (the CSS falls back to 0). */
    public static String script(int[] px) {
        String[] names = { "left", "right", "bottom" };
        StringBuilder js = new StringBuilder("(function(){var s=document.documentElement.style;");
        for (int i = 0; i < 3; i++) {
            js.append(px[i] > 0 ? "s.setProperty('--inok-nav-" + names[i] + "','" + px[i] + "px');" : "s.removeProperty('--inok-nav-" + names[i] + "');");
        }
        return js.append("})();").toString();
    }
}
