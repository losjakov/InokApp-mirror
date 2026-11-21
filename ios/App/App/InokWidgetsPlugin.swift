import Foundation
import Capacitor
import WidgetKit
import SwiftUI

/// T9 (A-153 (2), cloud_43): THE bridge of the widgets on iOS (src/native/widgets.ts; Android twin InokWidgetsPlugin.java). `set({json})` = the
/// app's data -> the App Group (`group.info.inok.app`, key `widgets`, InokShared) + WidgetCenter.reloadAllTimelines (best-effort: iOS
/// budgets widget reloads).
@objc(InokWidgetsPlugin)
public class InokWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InokWidgetsPlugin"
    public let jsName = "InokWidgets"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "snapshot", returnType: CAPPluginReturnPromise)]

    @objc func set(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else { call.reject("json required"); return }
        guard let d = InokShared.defaults else { call.reject("no app group"); return }
        d.set(json, forKey: InokShared.appKey)
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        call.resolve()
    }

    /// The REVIEW snapshots (A-156 (3): for the REPORT, never store frames): the SAME WidgetBody the extension draws, from the SAME App Group
    /// data, rendered by ImageRenderer (iOS 16+) - kind x small / medium x light / dark -> Documents/widgets/*.png (the ring copies them).
    @objc func snapshot(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else { call.resolve(["n": 0, "data": false]); return }
        Task { @MainActor in
            let data = WData.load()
            let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("widgets")
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            var n = 0
            for kind in WKind.allCases { for small in [true, false] { for dark in [false, true] {
                let v = WModel.build(kind, small: small, large: false, data: data)
                let body = WidgetBody(kind: kind, small: small, view: v, openApp: NSLocalizedString("widget_open_app", comment: ""))
                    .padding(16).frame(width: small ? 170 : 364, height: 170)
                    .background(dark ? Color(white: 0.11) : Color.white).cornerRadius(22)
                    .environment(\.colorScheme, dark ? .dark : .light)
                let r = ImageRenderer(content: body)
                r.scale = 3
                if let png = r.uiImage?.pngData() {
                    try? png.write(to: dir.appendingPathComponent("\(kind.rawValue)-\(small ? "small" : "medium")-\(dark ? "dark" : "light").png")); n += 1
                }
            } } }
            call.resolve(["n": n, "data": data != nil])
        }
    }
}
