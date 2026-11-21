import Foundation
import SwiftUI

/// T9 (A-153 (2), A-155 (1), A-156 (1)): WHAT the three widgets show and HOW - the iOS twin of Android's WidgetModel (the same rules, the
/// same JSON; the words come from the app). In the widget extension AND the app (the debug snapshot of the ring). Text: at the normal
/// Dynamic Type every row whole (fewer rows when titles are long); above Large fewer rows, a title at most 2 lines with «…» - widgets only.
enum WKind: String, CaseIterable { case live, upcoming, new }

struct WRow: Identifiable {
    let id: Int
    let title: String, sub: String, url: URL, say: String
    let live: Bool, bell: Bool
}

struct WView {
    var header = "", big = "", foot = "", updated = "", note = ""
    var headerURL = URL(string: "inokapp://tab/streams")!
    var rows: [WRow] = []
    var empty = false
}

struct WData {
    var words: [String: String] = [:]
    var channels: [Int: String] = [:]
    var live: [(ch: Int, video: String, title: String)] = []
    var planned: [(ch: Int, video: String, title: String, at: Date)] = []
    var items: [(id: Int, kind: String, title: String, date: Date, url: String)] = []
    var reminders: Set<String> = []
    var updated: Date?

    func w(_ k: String) -> String { words[k] ?? "" }

    static func iso(_ s: Any?) -> Date? {
        guard let s = s as? String else { return nil }
        let f = ISO8601DateFormatter()
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s)
    }
    static func pick(_ o: Any?, _ lang: String) -> String {
        if let s = o as? String { return s }
        guard let d = o as? [String: Any] else { return "" }
        for l in [lang, "uk", "ru", "en"] { if let v = d[l] as? String, !v.isEmpty { return v } }
        return ""
    }

    /// The app's JSON + the widget's own newer fetches (the newer wins); nil = the app never wrote its data («Відкрийте застосунок…»).
    static func load() -> WData? {
        guard let a = InokShared.json(InokShared.appKey) else { return nil }
        var d = WData()
        d.words = a["words"] as? [String: String] ?? [:]
        for (k, v) in a["channels"] as? [String: [String: Any]] ?? [:] { if let id = Int(k) { d.channels[id] = v["name"] as? String ?? "" } }
        for r in a["reminders"] as? [[String: Any]] ?? [] { d.reminders.insert("\(r["channel_id"] as? Int ?? 0)|\(r["video_id"] as? String ?? "")") }
        let lang = a["lang"] as? String ?? "uk"
        let appAt = iso(a["updated_at"])?.timeIntervalSince1970 ?? 0
        let own = InokShared.json(InokShared.liveKey)
        let ownAt = (own?["at"] as? Double ?? 0) / 1000
        let status = (own != nil && ownAt > appAt ? own?["status"] : a["status"]) as? [String: Any]
        for l in status?["live"] as? [[String: Any]] ?? [] { d.live.append((l["channel_id"] as? Int ?? 0, l["video_id"] as? String ?? "", pick(l["title"], lang))) }
        for s in status?["scheduled"] as? [[String: Any]] ?? [] {
            if let at = iso(s["scheduled_at"]) { d.planned.append((s["channel_id"] as? Int ?? 0, s["video_id"] as? String ?? "", pick(s["title"], lang), at)) }
        }
        let ownNew = InokShared.json(InokShared.newKey)
        let newAt = (ownNew?["at"] as? Double ?? 0) / 1000
        let items = (ownNew != nil && newAt > appAt && (ownNew?["lang"] as? String) == lang ? ownNew?["items"] : a["items"]) as? [[String: Any]] ?? []
        for i in items { d.items.append((i["id"] as? Int ?? 0, i["kind"] as? String ?? "", i["title"] as? String ?? "", iso(i["published_at"]) ?? Date(), i["site_url"] as? String ?? "")) }
        let last = max(appAt, max(ownAt, newAt))
        d.updated = last > 0 ? Date(timeIntervalSince1970: last) : nil
        return d
    }
}

enum WModel {
    static let shortTitle = 34
    static func hhmm(_ d: Date) -> String { let f = DateFormatter(); f.dateFormat = "HH:mm"; return f.string(from: d) }
    /// A-147: the site's day in Kyiv, in digits
    static func shortDate(_ d: Date) -> String { let f = DateFormatter(); f.dateFormat = "dd.MM.yyyy"; f.timeZone = TimeZone(identifier: "Europe/Kiev"); return f.string(from: d) }
    static func fill(_ s: String, _ k: String, _ v: String) -> String { s.replacingOccurrences(of: "{\(k)}", with: v) }

    static func rows(_ small: Bool, _ large: Bool, _ titles: [String]) -> Int {
        if small { return 1 }
        let allShort = titles.prefix(3).allSatisfy { $0.count <= shortTitle }
        return large ? (allShort ? 2 : 1) : (allShort ? 3 : 2)
    }

    static func build(_ kind: WKind, small: Bool, large: Bool, data: WData?, now: Date = Date()) -> WView {
        var v = WView()
        guard let d = data, !d.words.isEmpty else { v.empty = true; return v }
        if let u = d.updated { v.updated = fill(d.w("updated"), "time", hhmm(u)) }
        let streams = URL(string: "inokapp://tab/streams")!
        switch kind {
        case .live:
            v.header = fill(d.w(small ? "live_small" : "live_title"), "n", "\(d.live.count)")
            if d.live.isEmpty { v.note = d.w("none_live"); return v }
            let k = min(d.live.count, rows(small, large, d.live.map { d.channels[$0.ch] ?? "" }))
            for (i, l) in d.live.prefix(k).enumerated() {
                let name = d.channels[l.ch] ?? ""
                v.rows.append(WRow(id: i, title: name, sub: l.title, url: URL(string: "https://inok.info/live/")!, say: fill(d.w("say_live"), "name", name), live: true, bell: false))
            }
            if d.live.count > k { v.foot = fill(d.w("more"), "n", "\(d.live.count - k)") }
        case .upcoming:
            v.header = d.w(small ? "nearest" : "upcoming_title")
            let next = d.planned.filter { $0.at > now }.sorted { $0.at < $1.at }
            if next.isEmpty { v.note = d.w("none_upcoming"); return v }
            let k = min(next.count, rows(small, large, next.map { d.channels[$0.ch] ?? "" }))
            let cal = Calendar.current
            for (i, p) in next.prefix(k).enumerated() {
                let name = d.channels[p.ch] ?? ""
                let day = cal.isDate(p.at, inSameDayAs: now) ? "" : cal.isDateInTomorrow(p.at) ? d.w("tomorrow") : shortDate(p.at)
                let when = (day.isEmpty ? "" : day + " ") + hhmm(p.at)
                let bell = d.reminders.contains("\(p.ch)|\(p.video)")
                let say = fill(fill(d.w("say_planned"), "name", name), "time", when)
                if small {
                    v.big = when // «завтра 07:00»: the small one shows no sub line, the day rides with the time
                    v.rows.append(WRow(id: i, title: name, sub: [day, p.title].filter { !$0.isEmpty }.joined(separator: " · "), url: streams, say: say, live: false, bell: bell))
                    if bell { v.foot = fill(d.w("remind"), "time", hhmm(p.at.addingTimeInterval(-600))) }
                } else {
                    v.rows.append(WRow(id: i, title: when + " · " + name, sub: p.title, url: streams, say: say, live: false, bell: bell))
                }
            }
            if !small && next.count == 1 { v.note = d.w("only_one") }
        case .new:
            v.header = d.w("new_title")
            v.headerURL = URL(string: "https://inok.info/articles/")!
            if d.items.isEmpty { v.note = d.w("none_new"); return v }
            let k = min(d.items.count, small ? 1 : max(2, rows(false, large, d.items.map { $0.title })))
            for (i, it) in d.items.prefix(k).enumerated() {
                let date = shortDate(it.date)
                v.rows.append(WRow(id: i, title: it.title, sub: it.kind == "news" ? d.w("news") + " · " + date : date,
                                   url: URL(string: it.url) ?? v.headerURL, say: it.title + ", " + date, live: false, bell: false))
            }
        }
        return v
    }
}

/// THE drawing (style B: the system's light / dark, blue accents, the app's name line); small = one tap target (widgetURL), medium = a Link per row.
struct WidgetBody: View {
    let kind: WKind
    let small: Bool
    let view: WView
    let openApp: String
    @Environment(\.dynamicTypeSize) private var type
    static let accent = Color(red: 0.047, green: 0.392, blue: 0.525)

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                if kind == .live && !view.rows.isEmpty { Circle().fill(Color.red).frame(width: 8, height: 8).accessibilityHidden(true) }
                Text(view.empty ? openTitle : view.header).font(.caption.bold()).foregroundColor(Self.accent).textCase(.uppercase).lineLimit(1)
            }
            if view.empty { Text(openApp).font(.footnote).foregroundColor(.secondary) }
            if !view.big.isEmpty { Text(view.big).font(.title.bold()) }
            ForEach(view.rows) { r in
                if small { row(r) } else { Link(destination: r.url) { row(r) } }
            }
            if !view.note.isEmpty { Text(view.note).font(.caption2).foregroundColor(.secondary) }
            Spacer(minLength: 0)
            HStack { Text(view.foot); Spacer(); Text(view.updated) }.font(.caption2).foregroundColor(.secondary)
        }
    }
    var openTitle: String { kind == .live ? NSLocalizedString("widget_live", comment: "") : kind == .upcoming ? NSLocalizedString("widget_upcoming", comment: "") : NSLocalizedString("widget_new", comment: "") }
    var large: Bool { type > .large }

    func row(_ r: WRow) -> some View {
        HStack(alignment: .top, spacing: 6) {
            VStack(alignment: .leading, spacing: 1) {
                // a small widget: the name gets the room (no sub line, a step smaller) - whole at the normal size (A-155 (1); ring snapshot 44907976664)
                Text(r.title).font(small ? .footnote.bold() : .subheadline.bold()).foregroundColor(.primary)
                    .lineLimit(large ? 2 : (small ? 4 : 3)).truncationMode(.tail).multilineTextAlignment(.leading)
                if !r.sub.isEmpty && !small { Text(r.sub).font(.caption).foregroundColor(.secondary).lineLimit(1) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Spacer(minLength: 0)
            if r.bell { Image(systemName: "bell.fill").font(.caption).foregroundColor(Self.accent).accessibilityHidden(true) }
        }
        .accessibilityElement(children: .ignore).accessibilityLabel(r.say)
    }
}
