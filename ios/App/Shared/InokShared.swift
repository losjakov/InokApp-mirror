import Foundation

/// T9 / T13 (cloud_43, A-153 (2), A-155 (2)): THE App Group store of the widgets - one file in THREE targets (the app, the widget extension,
/// the notification service extension). The app writes `widgets` (src/native/widgets.ts via InokWidgetsPlugin), the widget's own fetch
/// writes `widgets_live` / `widgets_new`, a stream push writes `widgets_live` (NSE / AppDelegate). Same keys and JSON as Android's WidgetStore.
enum InokShared {
    static let group = "group.info.inok.app"
    static let appKey = "widgets", liveKey = "widgets_live", newKey = "widgets_new"
    static var defaults: UserDefaults? { UserDefaults(suiteName: group) }

    static func json(_ key: String) -> [String: Any]? {
        guard let s = defaults?.string(forKey: key), let d = s.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
    }
    static func put(_ key: String, _ o: [String: Any]) {
        guard let d = try? JSONSerialization.data(withJSONObject: o), let s = String(data: d, encoding: .utf8) else { return }
        defaults?.set(s, forKey: key)
    }
    static var nowMs: Double { Date().timeIntervalSince1970 * 1000 }

    /// A `stream_live` / `stream_ended` push into the widgets' live data at once (the payload's channel_id, video_id, title); false = not a
    /// stream push or nothing to change. Never throws.
    @discardableResult
    static func applyStreamPush(_ info: [AnyHashable: Any]) -> Bool {
        guard let type = info["type"] as? String, type == "stream_live" || type == "stream_ended",
              let chs = info["channel_id"] as? String ?? (info["channel_id"] as? NSNumber)?.stringValue, let ch = Int(chs) else { return false }
        let base = json(liveKey)?["status"] as? [String: Any] ?? json(appKey)?["status"] as? [String: Any] ?? [:]
        var status = base
        var live = (base["live"] as? [[String: Any]] ?? []).filter { ($0["channel_id"] as? Int) != ch }
        if type == "stream_live" {
            var l: [String: Any] = ["channel_id": ch, "video_id": info["video_id"] as? String ?? ""]
            let t = info["title"] as? String ?? ""
            if let d = t.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { l["title"] = o } else { l["title"] = t }
            live.insert(l, at: 0)
        }
        status["live"] = live
        put(liveKey, ["at": nowMs, "status": status])
        return true
    }
}
