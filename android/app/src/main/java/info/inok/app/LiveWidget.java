package info.inok.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** T9 (A-153 (2)): the home-screen widget «Зараз в ефірі» - draws from WidgetStore, refreshes by WidgetWorker. */
public class LiveWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        WidgetModel.Data d = WidgetStore.load(c);
        for (int id : ids) WidgetRender.draw(c, m, id, WidgetRender.kindOf(getClass()), d);
        WidgetWorker.ensurePeriodic(c);
    }
    @Override public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
        WidgetRender.draw(c, m, id, WidgetRender.kindOf(getClass()), WidgetStore.load(c)); // resized: small <-> medium
    }
    @Override public void onEnabled(Context c) { WidgetWorker.ensurePeriodic(c); WidgetWorker.now(c); }
    @Override public void onDisabled(Context c) { if (!WidgetRender.anyWidget(c)) WidgetWorker.cancelPeriodic(c); }
}
