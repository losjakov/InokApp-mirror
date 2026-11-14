package info.inok.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** NavOverlap: the WebView's real overlap with the navigation bar (owner 11.11.2026, P30 Pro). Density 3 = 1080 x 2340 px, 360 x 780 dp. */
public class NavOverlapTest {
    private static final int W = 1080, H = 2340;
    private static final int[] NAV_3BUTTON = { 0, 0, 0, 144 }; // 48 dp at the bottom

    @Test public void webViewUnderTheButtons_isPushedUpByTheBar() {
        // the P30 Pro case: the page runs to the window's bottom, the 3 buttons over it
        assertArrayEquals(new int[] { 0, 0, 48 }, NavOverlap.cssPx(W, H, new int[] { 0, 0, W, H }, NAV_3BUTTON, 3f));
    }

    @Test public void windowAlreadyPaddedAboveTheBar_addsNothing() {
        // Capacitor padded the decor (WebView < 140) or Android 11+ insets are right: the WebView ends where the bar begins
        assertArrayEquals(new int[] { 0, 0, 0 }, NavOverlap.cssPx(W, H, new int[] { 0, 66, W, H - 144 }, NAV_3BUTTON, 3f));
    }

    @Test public void keyboardResizedTheWindow_addsNothing() {
        // the IME pads the window: the WebView ends above the keyboard, far above the bar - no gap above the keyboard
        assertArrayEquals(new int[] { 0, 0, 0 }, NavOverlap.cssPx(W, H, new int[] { 0, 0, W, H - 900 }, NAV_3BUTTON, 3f));
    }

    @Test public void gestureHandle_isItsOwnHeight() {
        assertArrayEquals(new int[] { 0, 0, 16 }, NavOverlap.cssPx(W, H, new int[] { 0, 0, W, H }, new int[] { 0, 0, 0, 48 }, 3f));
    }

    @Test public void landscapeBarOnTheRight_or_left() {
        assertArrayEquals(new int[] { 0, 48, 0 }, NavOverlap.cssPx(H, W, new int[] { 0, 0, H, W }, new int[] { 0, 0, 144, 0 }, 3f));
        assertArrayEquals(new int[] { 48, 0, 0 }, NavOverlap.cssPx(H, W, new int[] { 0, 0, H, W }, new int[] { 144, 0, 0, 0 }, 3f));
    }

    @Test public void hiddenBar_orImmersive_addsNothing() {
        // EMUI's «hide the navigation bar» switch: insets 0 -> nothing
        assertArrayEquals(new int[] { 0, 0, 0 }, NavOverlap.cssPx(W, H, new int[] { 0, 0, W, H }, new int[] { 0, 0, 0, 0 }, 3f));
    }

    @Test public void script_setsOrRemovesEachEdge() {
        assertEquals("(function(){var s=document.documentElement.style;s.removeProperty('--inok-nav-left');"
            + "s.removeProperty('--inok-nav-right');s.setProperty('--inok-nav-bottom','48px');})();", NavOverlap.script(new int[] { 0, 0, 48 }));
    }
}
