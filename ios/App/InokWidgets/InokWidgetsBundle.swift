import WidgetKit
import SwiftUI

/// T9 (A-153 (2), A-155 (1), A-156 (1); cloud_43): the three home-screen widgets of the iPhone / iPad - small + medium, style B. The timeline
/// refreshes ITSELF every 30 min (the app's JavaScript does not run while it is closed): live-status + articles?limit=3 with the PUBLIC
/// X-Inok-App key the app wrote; the app reloads them after each of its own refreshes (best-effort); a stream push reloads them at once
/// (the Notification Service Extension, T13). Any failure keeps the last data and its time - never empty boxes.
struct Entry: TimelineEntry { let date: Date; let data: WData? }

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), data: WData.load()) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: Date(), data: WData.load())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        Fetch.refresh {
            let now = Date()
            completion(Timeline(entries: [Entry(date: now, data: WData.load())], policy: .after(now.addingTimeInterval(30 * 60))))
        }
    }
}

/// The widget's own fetch (contract §1: the public key, the app's User-Agent form); both answers kept in the App Group with their time.
enum Fetch {
    static func refresh(_ done: @escaping () -> Void) {
        guard let app = InokShared.json(InokShared.appKey), let api = app["api"] as? [String: String], let base = api["base"], let key = api["key"] else { done(); return }
        let lang = app["lang"] as? String ?? "uk"
        let g = DispatchGroup()
        get(base + "live-status", key, g) { o in InokShared.put(InokShared.liveKey, ["at": InokShared.nowMs, "status": o]) }
        get(base + "articles?lang=\(lang)&limit=3", key, g) { o in if let items = o["items"] { InokShared.put(InokShared.newKey, ["at": InokShared.nowMs, "lang": lang, "items": items]) } }
        g.notify(queue: .main, execute: done)
    }
    static func get(_ url: String, _ key: String, _ g: DispatchGroup, _ ok: @escaping ([String: Any]) -> Void) {
        guard let u = URL(string: url) else { return }
        g.enter()
        var r = URLRequest(url: u, timeoutInterval: 20)
        r.setValue(key, forHTTPHeaderField: "X-Inok-App")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        r.setValue("InokApp/\(v) (ios)", forHTTPHeaderField: "User-Agent")
        URLSession.shared.dataTask(with: r) { data, resp, _ in
            defer { g.leave() }
            guard (resp as? HTTPURLResponse)?.statusCode == 200, let data = data,
                  let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
            ok(o)
        }.resume()
    }
}

struct InokWidgetView: View {
    let kind: WKind
    let entry: Entry
    @Environment(\.widgetFamily) private var family
    @Environment(\.dynamicTypeSize) private var type
    var body: some View {
        let small = family == .systemSmall
        let v = WModel.build(kind, small: small, large: type > .large, data: entry.data, now: entry.date)
        let content = WidgetBody(kind: kind, small: small, view: v, openApp: NSLocalizedString("widget_open_app", comment: ""))
            .widgetURL(small ? (v.rows.first?.url ?? v.headerURL) : v.headerURL)
        if #available(iOS 17.0, *) { content.containerBackground(.background, for: .widget) } else { content.padding() }
    }
}

struct LiveWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "info.inok.app.widget.live", provider: Provider()) { InokWidgetView(kind: .live, entry: $0) }
            .configurationDisplayName(Text("widget_live")).description(Text("widget_live_desc")).supportedFamilies([.systemSmall, .systemMedium])
    }
}
struct UpcomingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "info.inok.app.widget.upcoming", provider: Provider()) { InokWidgetView(kind: .upcoming, entry: $0) }
            .configurationDisplayName(Text("widget_upcoming")).description(Text("widget_upcoming_desc")).supportedFamilies([.systemSmall, .systemMedium])
    }
}
struct NewWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "info.inok.app.widget.new", provider: Provider()) { InokWidgetView(kind: .new, entry: $0) }
            .configurationDisplayName(Text("widget_new")).description(Text("widget_new_desc")).supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct InokWidgetsBundle: WidgetBundle {
    var body: some Widget { LiveWidget(); UpcomingWidget(); NewWidget() }
}
