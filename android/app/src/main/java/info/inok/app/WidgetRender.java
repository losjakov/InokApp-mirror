package info.inok.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.Layout;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.text.style.ForegroundColorSpan;
import android.util.SizeF;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

/**
 * THE drawing of the three widgets (RemoteViews; no Compose / Glance): WidgetModel decides, this draws. 1.0.18 (A-163, the CD kit): one
 * layout per size bucket (2x1 tiny, 4x1 strip, 2x2 small, 4x2 / 4x4 list), the rows added one by one (widget_row_<kind>.xml); Android 12+
 * gets one RemoteViews PER SIZE the launcher uses (OPTION_APPWIDGET_SIZES -> RemoteViews(Map<SizeF, RemoteViews>), developer.android.com
 * «Responsive layouts»), Android 8-11 the portrait size (OPTION_APPWIDGET_MIN_WIDTH / MIN_HEIGHT). The rows that fit are MEASURED here
 * (StaticLayout with the rows' own text settings: no hyphenation, whole words) - never guessed from a title's length.
 */
final class WidgetRender {
    private WidgetRender() { }

    static String kindOf(Class<?> p) { return p == LiveWidget.class ? WidgetModel.LIVE : p == UpcomingWidget.class ? WidgetModel.UPCOMING : WidgetModel.NEW; }
    static final Class<?>[] PROVIDERS = { LiveWidget.class, UpcomingWidget.class, NewWidget.class };
    /** the kit's 4x2 (README «Measures»): the size a widget is drawn at when the launcher says none */
    static final float DEFAULT_W = 344, DEFAULT_H = 176;

    static boolean anyWidget(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (Class<?> p : PROVIDERS) if (m.getAppWidgetIds(new ComponentName(c, p)).length > 0) return true;
        return false;
    }

    /** Every placed widget of every kind (after the app's `set`, the worker, a push). */
    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        WidgetModel.Data d = WidgetStore.load(c);
        for (Class<?> p : PROVIDERS) for (int id : m.getAppWidgetIds(new ComponentName(c, p))) draw(c, m, id, kindOf(p), d);
    }

    static void draw(Context c, AppWidgetManager m, int id, String kind, WidgetModel.Data d) {
        m.updateAppWidget(id, forWidget(c, m.getAppWidgetOptions(id), id, kind, d));
    }

    /** API 31+: a RemoteViews per size the launcher draws this widget at; older: the portrait size (min width x min height - never cut). */
    static RemoteViews forWidget(Context c, Bundle o, int id, String kind, WidgetModel.Data d) {
        if (Build.VERSION.SDK_INT >= 31 && o != null) {
            ArrayList<SizeF> sizes = o.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            if (sizes != null && !sizes.isEmpty()) {
                Map<SizeF, RemoteViews> map = new HashMap<>();
                int n = 0;
                for (SizeF s : sizes) if (!map.containsKey(s) && n < 16) map.put(s, views(c, id * 20 + (n++) * 2, kind, s.getWidth(), s.getHeight(), d));
                return new RemoteViews(map);
            }
        }
        float w = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        float h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        return views(c, id * 20, kind, w > 0 ? w : DEFAULT_W, h > 0 ? h : DEFAULT_H, d);
    }

    /** The text as the phone lays it out in the rows (the row layouts' settings: bold, line spacing 1.07, no hyphenation, simple breaks). */
    static final class PhoneMeasure implements WidgetModel.Measure {
        final Context c; final float density;
        PhoneMeasure(Context c) { this.c = c; this.density = c.getResources().getDisplayMetrics().density; }
        StaticLayout layout(String text, float widthDp, float sp, int maxLines) {
            TextPaint p = new TextPaint(TextPaint.ANTI_ALIAS_FLAG);
            p.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, c.getResources().getDisplayMetrics()));
            p.setTypeface(Typeface.DEFAULT_BOLD);
            StaticLayout.Builder b = StaticLayout.Builder.obtain(text, 0, text.length(), p, Math.max(1, Math.round(widthDp * density)))
                .setLineSpacing(0f, LINE_SPACING).setIncludePad(true)
                .setBreakStrategy(Layout.BREAK_STRATEGY_SIMPLE).setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE);
            if (maxLines > 0) b.setMaxLines(maxLines).setEllipsize(TextUtils.TruncateAt.END);
            return b.build();
        }
        @Override public float height(String text, float widthDp, float sp, int maxLines) { return layout(text, widthDp, sp, maxLines).getHeight() / density; }
        @Override public int lines(String text, float widthDp, float sp) { return layout(text, widthDp, sp, 0).getLineCount(); }
    }
    /** = android:lineSpacingMultiplier of the row layouts (line height ~1.25 em, the kit) */
    static final float LINE_SPACING = 1.07f;

    static int layoutOf(WidgetModel.Size s) {
        switch (s) {
            case TINY: return R.layout.widget_tiny;
            case STRIP: return R.layout.widget_strip;
            case SMALL: return R.layout.widget_small;
            default: return R.layout.widget_list;
        }
    }

    static RemoteViews views(Context c, int code, String kind, float wDp, float hDp, WidgetModel.Data d) {
        float fs = c.getResources().getConfiguration().fontScale;
        WidgetModel.View w = WidgetModel.build(kind, wDp, hDp, fs, d, System.currentTimeMillis(), ZoneId.systemDefault(), new PhoneMeasure(c));
        RemoteViews v = new RemoteViews(c.getPackageName(), layoutOf(w.size));
        if (w.empty) { // first added before the app ever wrote its data: the name + «Відкрийте застосунок…» (x3 resources), never empty boxes
            v.setTextViewText(R.id.w_header, c.getString(kind.equals(WidgetModel.LIVE) ? R.string.widget_live : kind.equals(WidgetModel.UPCOMING) ? R.string.widget_upcoming : R.string.widget_new));
            if (w.size == WidgetModel.Size.STRIP || w.size == WidgetModel.Size.TINY) v.setViewVisibility(R.id.w_head_row, View.VISIBLE);
            v.setTextViewText(R.id.w_note, c.getString(R.string.widget_open_app));
            v.setViewVisibility(R.id.w_note, View.VISIBLE);
            v.setOnClickPendingIntent(R.id.w_root, open(c, code + 1, kind.equals(WidgetModel.NEW) ? "inokapp://tab/articles" : WidgetModel.STREAMS));
            return v;
        }
        v.setTextViewText(R.id.w_header, w.header);
        v.setViewVisibility(R.id.w_live_dot, w.liveDot ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_note, w.note.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_note, w.note);
        v.setOnClickPendingIntent(R.id.w_root, open(c, code + 1, w.url.isEmpty() ? w.headerUrl : w.url));
        switch (w.size) {
            case LIST: list(c, v, w, kind, code, d); break;
            case SMALL: small(c, v, w, kind, code, d); break;
            default: line(c, v, w, kind, d); break;
        }
        return v;
    }

    static void list(Context c, RemoteViews v, WidgetModel.View w, String kind, int code, WidgetModel.Data d) {
        v.setOnClickPendingIntent(R.id.w_header, open(c, code + 1, w.headerUrl));
        v.setTextViewText(R.id.w_updated, w.updated);
        rows(c, v, w, kind, code, false, d);
        v.setViewVisibility(R.id.w_foot, w.foot.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_foot, w.foot);
    }

    static void small(Context c, RemoteViews v, WidgetModel.View w, String kind, int code, WidgetModel.Data d) {
        v.setViewVisibility(R.id.w_big, w.big.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_big, w.big);
        if (kind.equals(WidgetModel.NEW)) rows(c, v, w, kind, code, true, d);
        else { // live / upcoming: ONE channel, its name whole (no picture: the width is the words')
            v.removeAllViews(R.id.w_rows);
            if (!w.rows.isEmpty()) {
                RemoteViews r = new RemoteViews(c.getPackageName(), R.layout.widget_row_new);
                r.setViewVisibility(R.id.w_dot, View.GONE);
                r.setTextViewText(R.id.w_text, w.rows.get(0).text);
                r.setTextViewTextSize(R.id.w_text, TypedValue.COMPLEX_UNIT_SP, WidgetModel.SMALL_SP);
                if (w.titleLines > 0) r.setInt(R.id.w_text, "setMaxLines", w.titleLines);
                r.setContentDescription(R.id.w_row, w.rows.get(0).say);
                v.addView(R.id.w_rows, r);
            }
        }
        v.setTextViewText(R.id.w_foot, w.foot);
        v.setTextViewText(R.id.w_updated, w.updated);
    }

    /** 4x1 / 2x1: the header (live, upcoming), the big time, ONE line of words (shrinks to stay whole), the pictures */
    static void line(Context c, RemoteViews v, WidgetModel.View w, String kind, WidgetModel.Data d) {
        boolean strip = w.size == WidgetModel.Size.STRIP;
        WidgetModel.Row r = w.rows.isEmpty() ? null : w.rows.get(0);
        boolean head = kind.equals(WidgetModel.LIVE) || (!strip && kind.equals(WidgetModel.UPCOMING));
        v.setViewVisibility(R.id.w_head_row, head ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_big, w.big.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_big, w.big);
        boolean words = r != null && !(kind.equals(WidgetModel.UPCOMING) && !strip);
        v.setViewVisibility(R.id.w_line, words ? View.VISIBLE : View.GONE);
        if (r != null) { v.setTextViewText(R.id.w_line, r.text); v.setContentDescription(R.id.w_root, r.say); }
        if (kind.equals(WidgetModel.NEW) && r != null) { v.setViewVisibility(R.id.w_dot, View.VISIBLE); dot(c, v, R.id.w_dot, r.dot, d); }
        else v.setViewVisibility(R.id.w_dot, View.GONE);
        if (strip) { v.setViewVisibility(R.id.w_foot, w.foot.isEmpty() ? View.GONE : View.VISIBLE); v.setTextViewText(R.id.w_foot, w.foot); }
        int[] av = strip ? new int[] { R.id.w_av1, R.id.w_av2, R.id.w_av3, R.id.w_av4 } : new int[] { R.id.w_av1, R.id.w_av2, R.id.w_av3 };
        v.setViewVisibility(R.id.w_avatars, w.avatars.isEmpty() ? View.GONE : View.VISIBLE);
        for (int i = 0; i < av.length; i++) {
            if (i >= w.avatars.size()) { v.setViewVisibility(av[i], View.GONE); continue; }
            v.setViewVisibility(av[i], View.VISIBLE); picture(c, v, av[i], w.avatars.get(i));
        }
        if (!strip) { // 2x1 «Найближча»: the channel's picture beside the time
            boolean side = kind.equals(WidgetModel.UPCOMING) && r != null;
            v.setViewVisibility(R.id.w_side, side ? View.VISIBLE : View.GONE);
            if (side) picture(c, v, R.id.w_side, r.image);
        }
    }

    /** the rows the model kept, each from its kind's row layout; a tap opens its own address */
    static void rows(Context c, RemoteViews v, WidgetModel.View w, String kind, int code, boolean small, WidgetModel.Data d) {
        v.removeAllViews(R.id.w_rows);
        int layout = kind.equals(WidgetModel.LIVE) ? R.layout.widget_row_live : kind.equals(WidgetModel.UPCOMING) ? R.layout.widget_row_upcoming : R.layout.widget_row_new;
        for (int i = 0; i < w.rows.size(); i++) {
            WidgetModel.Row row = w.rows.get(i);
            RemoteViews r = new RemoteViews(c.getPackageName(), layout);
            if (kind.equals(WidgetModel.UPCOMING)) {
                SpannableString s = new SpannableString(row.text); // the time transparent here, drawn over it in the accent colour (w_time)
                s.setSpan(new ForegroundColorSpan(Color.TRANSPARENT), 0, Math.min(row.time.length(), row.text.length()), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                r.setTextViewText(R.id.w_text, s);
                r.setTextViewText(R.id.w_time, row.time);
                r.setViewVisibility(R.id.w_bell, row.bell ? View.VISIBLE : View.GONE);
            } else r.setTextViewText(R.id.w_text, row.text);
            // a larger text size (A-155 (1)): at most 2 lines, «…» (the layouts' ellipsize="end" acts only under a line limit - never at the normal size)
            if (w.titleLines > 0) r.setInt(R.id.w_text, "setMaxLines", w.titleLines);
            if (small) r.setTextViewTextSize(R.id.w_text, TypedValue.COMPLEX_UNIT_SP, WidgetModel.SMALL_SP);
            if (kind.equals(WidgetModel.NEW)) dot(c, r, R.id.w_dot, row.dot, d);
            else picture(c, r, R.id.w_img, row.image);
            r.setContentDescription(R.id.w_row, row.say);
            r.setOnClickPendingIntent(R.id.w_row, open(c, code + 2 + i, row.url));
            v.addView(R.id.w_rows, r);
        }
    }

    /** the kind's dot: the kit's colour (a drawable per kind, the theme's own) or the site's ui-config colour (A-162 (2)) */
    static void dot(Context c, RemoteViews v, int id, String kind, WidgetModel.Data d) {
        v.setImageViewResource(id, WidgetModel.DOT_NEWS.equals(kind) ? R.drawable.widget_dot_news : WidgetModel.DOT_VIDEO.equals(kind) ? R.drawable.widget_dot_video : R.drawable.widget_dot_pub);
        Integer col = WidgetStore.dotColor(c, d, kind);
        if (col != null) v.setInt(id, "setColorFilter", col);
    }

    /** a channel picture: the kit's bundled one («av:<site channel id>», the samples) or the app's kept file; none = the app's icon */
    static void picture(Context c, RemoteViews v, int id, String image) {
        if (image != null && image.startsWith("av:")) {
            int res = c.getResources().getIdentifier("widget_av_" + image.substring(3), "drawable", c.getPackageName());
            if (res != 0) { v.setImageViewResource(id, res); return; }
        }
        Bitmap b = image == null ? null : avatar(c, image);
        if (b != null) v.setImageViewBitmap(id, b); else v.setImageViewResource(id, R.mipmap.ic_launcher_round);
    }

    /** A kept channel picture (files/kept, the app's own cache), scaled to 34 dp - RemoteViews carry the bitmap, so it stays small. */
    static Bitmap avatar(Context c, String path) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options(); o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(path, o);
            int px = Math.round(WidgetModel.AVATAR * c.getResources().getDisplayMetrics().density);
            int s = 1; while (o.outWidth / (s * 2) >= px && o.outHeight / (s * 2) >= px) s *= 2;
            o = new BitmapFactory.Options(); o.inSampleSize = s;
            Bitmap b = BitmapFactory.decodeFile(path, o);
            return b == null ? null : Bitmap.createScaledBitmap(b, px, px, true);
        } catch (Exception e) { return null; }
    }

    /** A row / the header opens the APP with its address (inokapp://tab/…, inokapp://tab/streams?play=<id> - A-161 (3): «Трансляції» first, the
     *  stream on top, started FROM the app so Back returns to «Трансляції»; https://inok.info/… - THE router, linkRoute). Never straight to YouTube. */
    static PendingIntent open(Context c, int code, String url) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url), c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
