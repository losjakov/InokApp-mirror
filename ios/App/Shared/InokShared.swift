import Foundation
import UserNotifications

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

    /// A-163 (3) (cloud_44): the channel pictures the widgets draw - the app copies its kept avatars here (InokWidgetsPlugin.set), the widget reads
    static var avatarsDir: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("avatars", isDirectory: true) }
    static func avatarPath(_ channel: Int) -> String? {
        guard let p = avatarsDir?.appendingPathComponent("\(channel)").path, FileManager.default.fileExists(atPath: p) else { return nil }
        return p
    }

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

/// cloud_46 (A-171 Part A, ref/FUTURE_notifications_ios.md §4): the A-84 tray rules on iPhone - the app, the notification service extension
/// and the background push remove DELIVERED notifications by their REAL identifiers, read back from `getDeliveredNotifications` (a guessed id
/// fails now and then - Apple forums 721873); the site's `apns-collapse-id` (`live_<channel>` / `art_<id>`) replaces a repeat by itself.
/// Never touches what it is not asked to: articles never remove «ефір», «ефір» rules never remove an article.
enum InokTray {
    static let articleCategory = "INOK_ARTICLE"
    static let markRead = "INOK_MARK_READ"
    static func str(_ v: Any?) -> String? { v as? String ?? (v as? NSNumber)?.stringValue }
    private static func kind(_ n: UNNotification) -> String? { n.request.content.userInfo["type"] as? String }

    /// A2 / A5 / A6: the delivered article notifications - all (`ids` nil) or those of the given ids - removed
    static func removeArticles(_ ids: Set<String>?, done: ((Int) -> Void)? = nil) {
        let c = UNUserNotificationCenter.current()
        c.getDeliveredNotifications { ns in
            let gone = ns.filter { kind($0) == "article" && (ids == nil || ids!.contains(str($0.request.content.userInfo["id"]) ?? "")) }
                .map { $0.request.identifier }
            if !gone.isEmpty { c.removeDeliveredNotifications(withIdentifiers: gone) }
            done?(gone.count)
        }
    }
    /// A3 / A4 (b) (c): the delivered «ефір» of every channel NOT in `live` removed; `keep` (the request being delivered) never
    static func keepLive(_ live: Set<String>, except keep: String? = nil, done: ((Int) -> Void)? = nil) {
        let c = UNUserNotificationCenter.current()
        c.getDeliveredNotifications { ns in
            let gone = ns.filter { kind($0) == "stream_live" && $0.request.identifier != keep
                && !live.contains(str($0.request.content.userInfo["channel_id"]) ?? "") }.map { $0.request.identifier }
            if !gone.isEmpty { c.removeDeliveredNotifications(withIdentifiers: gone) }
            done?(gone.count)
        }
    }
    /// A4 (a): one channel's broadcast ended - its delivered «ефір» removed
    static func removeLive(channel: String) {
        let c = UNUserNotificationCenter.current()
        c.getDeliveredNotifications { ns in
            let gone = ns.filter { kind($0) == "stream_live" && str($0.request.content.userInfo["channel_id"]) == channel }.map { $0.request.identifier }
            if !gone.isEmpty { c.removeDeliveredNotifications(withIdentifiers: gone) }
        }
    }
    /// the live channels as the App Group knows them - only when that knowledge is fresh (≤ 60 min); nil = unknown (remove nothing)
    static func liveKnown(maxAgeMs: Double = 3_600_000) -> Set<String>? {
        guard let o = InokShared.json(InokShared.liveKey), let at = o["at"] as? Double, InokShared.nowMs - at <= maxAgeMs,
              let st = o["status"] as? [String: Any], let live = st["live"] as? [[String: Any]] else { return nil }
        return Set(live.compactMap { str($0["channel_id"]) })
    }
}
