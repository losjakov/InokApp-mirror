package info.inok.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * T9 (A-153 (2)): THE bridge of the widgets (a local plugin, no npm package; src/native/widgets.ts). `set({json})` = the app's data for the
 * widgets after each refresh -> the store the widgets read (WidgetStore) + every placed widget redrawn. iOS twin: InokWidgetsPlugin.swift
 * (App Group defaults + WidgetCenter.reloadAllTimelines).
 */
@CapacitorPlugin(name = "InokWidgets")
public class InokWidgetsPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        String json = call.getString("json");
        if (json == null || json.isEmpty()) { call.reject("json required"); return; }
        WidgetStore.prefs(getContext()).edit().putString(WidgetStore.APP_KEY, json).apply();
        WidgetRender.updateAll(getContext());
        if (WidgetRender.anyWidget(getContext())) WidgetWorker.ensurePeriodic(getContext());
        call.resolve();
    }
}
