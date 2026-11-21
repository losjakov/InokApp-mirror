package info.inok.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.View;
import android.widget.RemoteViews;

import java.time.ZoneId;

/** T9: THE drawing of the three widgets (RemoteViews; no Compose / Glance - no heavy dependency): WidgetModel decides, this draws. */
final class WidgetRender {
    private WidgetRender() { }

    static final int[] ROW = { R.id.w_row1, R.id.w_row2, R.id.w_row3 };
    static final int[] ROW_IMG = { R.id.w_row1_img, R.id.w_row2_img, R.id.w_row3_img };
    static final int[] ROW_DOT = { R.id.w_row1_dot, R.id.w_row2_dot, R.id.w_row3_dot };
    static final int[] ROW_TITLE = { R.id.w_row1_title, R.id.w_row2_title, R.id.w_row3_title };
    static final int[] ROW_SUB = { R.id.w_row1_sub, R.id.w_row2_sub, R.id.w_row3_sub };
    static final int[] ROW_BELL = { R.id.w_row1_bell, R.id.w_row2_bell, R.id.w_row3_bell };

    static String kindOf(Class<?> p) { return p == LiveWidget.class ? WidgetModel.LIVE : p == UpcomingWidget.class ? WidgetModel.UPCOMING : WidgetModel.NEW; }
    static final Class<?>[] PROVIDERS = { LiveWidget.class, UpcomingWidget.class, NewWidget.class };

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
        Bundle o = m.getAppWidgetOptions(id);
        int minW = o == null ? 250 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        boolean small = minW < 200; // 2 cells wide = small (A-153: small 2x2 + medium 4x2)
        float fs = c.getResources().getConfiguration().fontScale;
        m.updateAppWidget(id, views(c, id, kind, small, fs, d));
    }

    static RemoteViews views(Context c, int id, String kind, boolean small, float fs, WidgetModel.Data d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), small ? R.layout.widget_small : R.layout.widget_medium);
        WidgetModel.View w = WidgetModel.build(kind, small, fs, d, System.currentTimeMillis(), ZoneId.systemDefault());
        if (w.empty) { // first added before the app ever wrote its data: the name + «Відкрийте застосунок…» (x3 resources), never empty boxes
            v.setTextViewText(R.id.w_header, c.getString(kind.equals(WidgetModel.LIVE) ? R.string.widget_live : kind.equals(WidgetModel.UPCOMING) ? R.string.widget_upcoming : R.string.widget_new));
            v.setTextViewText(R.id.w_note, c.getString(R.string.widget_open_app));
            v.setViewVisibility(R.id.w_note, View.VISIBLE);
            for (int i = 0; i < rows(small); i++) v.setViewVisibility(ROW[i], View.GONE);
            v.setViewVisibility(R.id.w_big, View.GONE);
            v.setTextViewText(R.id.w_foot, ""); v.setTextViewText(R.id.w_updated, "");
            v.setOnClickPendingIntent(R.id.w_root, open(c, id * 10 + 9, "inokapp://tab/" + (kind.equals(WidgetModel.NEW) ? "articles" : "streams")));
            return v;
        }
        v.setTextViewText(R.id.w_header, w.header);
        v.setOnClickPendingIntent(R.id.w_header, open(c, id * 10 + 8, w.headerUrl));
        v.setViewVisibility(R.id.w_live_dot, kind.equals(WidgetModel.LIVE) && !w.rows.isEmpty() ? View.VISIBLE : View.GONE);
        if (small) {
            v.setViewVisibility(R.id.w_big, w.big.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextViewText(R.id.w_big, w.big);
        }
        for (int i = 0; i < rows(small); i++) {
            if (i >= w.rows.size()) { v.setViewVisibility(ROW[i], View.GONE); continue; }
            WidgetModel.Row r = w.rows.get(i);
            v.setViewVisibility(ROW[i], View.VISIBLE);
            v.setTextViewText(ROW_TITLE[i], r.title);
            v.setInt(ROW_TITLE[i], "setMaxLines", w.titleLines);
            v.setViewVisibility(ROW_SUB[i], TextUtils.isEmpty(r.sub) ? View.GONE : View.VISIBLE);
            v.setTextViewText(ROW_SUB[i], r.sub == null ? "" : r.sub);
            v.setViewVisibility(ROW_BELL[i], r.bell ? View.VISIBLE : View.GONE);
            v.setViewVisibility(ROW_DOT[i], r.live ? View.VISIBLE : View.GONE);
            Bitmap b = r.image == null ? null : avatar(c, r.image);
            if (b != null) { v.setImageViewBitmap(ROW_IMG[i], b); v.setViewVisibility(ROW_IMG[i], View.VISIBLE); }
            else v.setViewVisibility(ROW_IMG[i], kind.equals(WidgetModel.NEW) ? View.GONE : View.VISIBLE);
            v.setContentDescription(ROW[i], r.say);
            v.setOnClickPendingIntent(ROW[i], open(c, id * 10 + i, r.url));
        }
        if (small) v.setOnClickPendingIntent(R.id.w_root, open(c, id * 10 + 7, w.rows.isEmpty() ? w.headerUrl : w.rows.get(0).url));
        v.setViewVisibility(R.id.w_note, w.note.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_note, w.note);
        v.setTextViewText(R.id.w_foot, w.foot);
        v.setTextViewText(R.id.w_updated, w.updated);
        return v;
    }

    static int rows(boolean small) { return small ? 1 : 3; }

    /** A kept channel picture (files/kept, the app's own cache), scaled to the row's 40 dp - RemoteViews carry the bitmap, so it stays small. */
    static Bitmap avatar(Context c, String path) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options(); o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(path, o);
            int px = Math.round(40 * c.getResources().getDisplayMetrics().density);
            int s = 1; while (o.outWidth / (s * 2) >= px && o.outHeight / (s * 2) >= px) s *= 2;
            o = new BitmapFactory.Options(); o.inSampleSize = s;
            Bitmap b = BitmapFactory.decodeFile(path, o);
            return b == null ? null : Bitmap.createScaledBitmap(b, px, px, true);
        } catch (Exception e) { return null; }
    }

    /** A row / the header opens its screen: a YouTube broadcast in the YouTube app (as the app's live row, A-37); anything else = the app
     *  itself with the address (inokapp://tab/…, https://inok.info/… - THE router, linkRoute). */
    static PendingIntent open(Context c, int code, String url) {
        Intent i;
        if (url.startsWith("https://www.youtube.com/")) i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        else { i = new Intent(Intent.ACTION_VIEW, Uri.parse(url), c, MainActivity.class); i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP); }
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
