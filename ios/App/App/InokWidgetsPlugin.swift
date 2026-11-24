import Foundation
import Capacitor
import WidgetKit
import SwiftUI
import CoreSpotlight
import UniformTypeIdentifiers

/// T9 (A-153 (2), cloud_43): THE bridge of the widgets on iOS (src/native/widgets.ts; Android twin InokWidgetsPlugin.java). `set({json})` = the
/// app's data -> the App Group (`group.info.inok.app`, key `widgets`, InokShared) + WidgetCenter.reloadAllTimelines (best-effort: iOS
/// budgets widget reloads).
@objc(InokWidgetsPlugin)
public class InokWidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InokWidgetsPlugin"
    public let jsName = "InokWidgets"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "snapshot", returnType: CAPPluginReturnPromise),
                                                   CAPPluginMethod(name: "index", returnType: CAPPluginReturnPromise)]

    @objc func set(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else { call.reject("json required"); return }
        guard let d = InokShared.defaults else { call.reject("no app group"); return }
        d.set(json, forKey: InokShared.appKey)
        copyAvatars(json)
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        call.resolve()
    }

    /// A-163 (3) (cloud_44, supersedes A-158 (3)): the iPhone widgets draw the channel pictures like Android - the app copies its KEPT avatars
    /// (Documents/kept/<name>, the same files its rows show offline) into the App Group (avatars/<channel id>) on every data write; a file
    /// already there with the same size is left alone. Never throws: a missing picture = the widget's plain circle.
    func copyAvatars(_ json: String) {
        guard let data = json.data(using: .utf8), let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let chs = o["channels"] as? [String: [String: Any]], let dir = InokShared.avatarsDir else { return }
        let fm = FileManager.default
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let kept = fm.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("kept")
        for (id, c) in chs {
            guard let name = c["avatar"] as? String, !name.isEmpty else { continue }
            let src = kept.appendingPathComponent(name), dst = dir.appendingPathComponent(id)
            guard let a = try? fm.attributesOfItem(atPath: src.path) else { continue }
            if let b = try? fm.attributesOfItem(atPath: dst.path), (b[.size] as? Int) == (a[.size] as? Int) { continue }
            try? fm.removeItem(at: dst)
            try? fm.copyItem(at: src, to: dst)
        }
    }

    /// The REVIEW snapshots (for the REPORT, never store frames): the SAME WidgetBody the extension draws, rendered by ImageRenderer (iOS 16+)
    /// 1.0.18: kind x small / medium / large x light / dark from the App Group data (`app-…`) AND from the gallery's sample in uk / ru / en
    /// (`sample-…`, the kit's acceptance sheets) -> Documents/widgets/*.png (the ring copies them).
    @objc func snapshot(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else { call.resolve(["n": 0, "data": false]); return }
        Task { @MainActor in
            let real = WData.load()
            let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("widgets")
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            var n = 0
            let sets: [(String, WData?)] = [("app", real)] + ["uk", "ru", "en"].map { ("sample-\($0)", WData.sample($0)) }
            let boxes: [(WSize, CGSize)] = [(.small, CGSize(width: 170, height: 170)), (.medium, CGSize(width: 364, height: 170)), (.large, CGSize(width: 364, height: 382))]
            for (tag, data) in sets { for kind in WKind.allCases { for (fam, box) in boxes { for dark in [false, true] {
                let scheme: ColorScheme = dark ? .dark : .light
                let v = WModel.build(kind, compact: fam == .small, data: data)
                let inner = CGSize(width: box.width - 32, height: box.height - 32)
                let body = WidgetBody(kind: kind, family: fam, view: v, data: data, openApp: NSLocalizedString("widget_open_app", comment: ""), size: inner)
                    .padding(16).frame(width: box.width, height: box.height)
                    .background(WStyle.background(scheme)).cornerRadius(22)
                    .environment(\.colorScheme, scheme)
                let r = ImageRenderer(content: body)
                r.scale = 3
                if let png = r.uiImage?.pngData() {
                    try? png.write(to: dir.appendingPathComponent("\(tag)-\(kind.rawValue)-\(fam.rawValue)-\(dark ? "dark" : "light").png")); n += 1
                }
            } } } }
            // cloud_46 (A-173 (A) / (B)): the Lock Screen kinds - the rectangle with its plate and the two circles, x light / dark wallpaper
            // x normal / large text, from the same data (the system's vibrant tint is the phone's own: these show the layout and the words)
            for (tag, data) in sets { for kind in WKind.allCases { for dark in [false, true] { for big in [false, true] {
                let scheme: ColorScheme = dark ? .dark : .light
                let wall = dark ? Color(red: 0.08, green: 0.13, blue: 0.28) : Color(red: 0.84, green: 0.89, blue: 0.95)
                let size: DynamicTypeSize = big ? .accessibility1 : .large
                let rect = LockBody(kind: kind, inline: false, view: WModel.build(kind, compact: true, data: data), data: data)
                    .frame(width: 172, height: 76).padding(14).background(wall).cornerRadius(24)
                    .environment(\.colorScheme, scheme).environment(\.dynamicTypeSize, size).foregroundColor(dark ? .white : .black)
                let suffix = "\(dark ? "dark" : "light")\(big ? "-big" : "")"
                let rr = ImageRenderer(content: rect); rr.scale = 3
                if let png = rr.uiImage?.pngData() { try? png.write(to: dir.appendingPathComponent("lock-\(tag)-\(kind.rawValue)-rect-\(suffix).png")); n += 1 }
                guard kind != .new else { continue }
                let round = RoundBody(kind: kind, data: data).frame(width: 76, height: 76).clipShape(Circle()).padding(14).background(wall).cornerRadius(24)
                    .environment(\.colorScheme, scheme).environment(\.dynamicTypeSize, size).foregroundColor(dark ? .white : .black)
                let ro = ImageRenderer(content: round); ro.scale = 3
                if let png = ro.uiImage?.pngData() { try? png.write(to: dir.appendingPathComponent("lock-\(tag)-\(kind.rawValue)-round-\(suffix).png")); n += 1 }
            } } } }
            call.resolve(["n": n, "data": real != nil])
        }
    }

    /// T10 (A-153 (3)): Spotlight - ONE kind (`houses` | `saved` | `channels`) re-indexed whole: its domain deleted, then its items (id = the
    /// site address the router opens; title; description; keywords x3). On-device only. `houses` is also kept in the App Group for Siri (T11).
    @objc func index(_ call: CAPPluginCall) {
        guard let domain = call.getString("domain"), let items = call.getArray("items") as? [[String: Any]] else { call.reject("domain + items required"); return }
        if domain == "houses" { InokShared.put("houses", ["items": items]) }
        let idx = CSSearchableIndex.default()
        idx.deleteSearchableItems(withDomainIdentifiers: [domain]) { _ in
            let list: [CSSearchableItem] = items.compactMap { o in
                guard let id = o["id"] as? String, let title = o["title"] as? String else { return nil }
                let a = CSSearchableItemAttributeSet(contentType: UTType.content)
                a.title = title
                a.contentDescription = o["desc"] as? String
                a.keywords = o["keywords"] as? [String]
                return CSSearchableItem(uniqueIdentifier: id, domainIdentifier: domain, attributeSet: a)
            }
            idx.indexSearchableItems(list) { e in
                if let e = e { call.reject(e.localizedDescription) } else { call.resolve(["n": list.count]) }
            }
        }
    }
}
