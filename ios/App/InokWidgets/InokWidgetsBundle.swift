import WidgetKit
import SwiftUI

/// The three widgets of the iPhone / iPad. 1.0.18 (A-160, A-161, A-163; the CD kit): small / medium / large on the Home Screen + the Lock Screen's
/// inline and rectangular (iOS 16+, `#available` - the app's floor stays iOS 15.0). The GALLERY and a widget without data yet show the kit's
/// SAMPLE (widget_samples.json + the bundled channel pictures; never grey bars, never «Відкрийте застосунок…» in the gallery). The timeline
/// refreshes ITSELF every 30 min (live-status + articles?limit=8&sort=created with the PUBLIC X-Inok-App key the app wrote); the app reloads
/// it after each of its own refreshes; a stream push reloads it at once (the Notification Service Extension). A failure keeps the last data.
struct Entry: TimelineEntry { let date: Date; let data: WData?; let sample: Bool }

struct Provider: TimelineProvider {
    /// A-160 (4): the gallery / a placeholder = the kit's sample (no redaction); a real widget = the last real data, else the sample
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), data: WData.sample(), sample: true) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        if context.isPreview { completion(Entry(date: Date(), data: WData.sample(), sample: true)); return }
        let d = WData.load()
        completion(Entry(date: Date(), data: d ?? WData.sample(), sample: d == nil))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        Fetch.refresh {
            let now = Date()
            completion(Timeline(entries: [Entry(date: now, data: WData.load(), sample: false)], policy: .after(now.addingTimeInterval(30 * 60))))
        }
    }
}

/// The widget's own fetch (contract §1: the public key, the app's User-Agent form); both answers kept in the App Group with their time.
enum Fetch {
    /// as many items as the large widget can show, newest by their placing on the site (A-161 (1); Android WidgetWorker.ITEMS)
    static let items = 8
    static func refresh(_ done: @escaping () -> Void) {
        guard let app = InokShared.json(InokShared.appKey), let api = app["api"] as? [String: String], let base = api["base"], let key = api["key"] else { done(); return }
        let lang = app["lang"] as? String ?? "uk"
        let g = DispatchGroup()
        get(base + "live-status", key, g) { o in InokShared.put(InokShared.liveKey, ["at": InokShared.nowMs, "status": o]) }
        get(base + "articles?lang=\(lang)&limit=\(items)&sort=created", key, g) { o in if let items = o["items"] { InokShared.put(InokShared.newKey, ["at": InokShared.nowMs, "lang": lang, "items": items]) } }
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
    @Environment(\.colorScheme) private var scheme

    var size: WSize {
        if #available(iOSApplicationExtension 16.0, *) {
            if family == .accessoryInline { return .inline }
            if family == .accessoryRectangular { return .rect }
        }
        return family == .systemSmall ? .small : family == .systemLarge ? .large : .medium
    }

    var body: some View {
        let s = size
        let compact = s == .small || s == .rect || s == .inline
        let v = WModel.build(kind, compact: compact, data: entry.data, now: entry.date)
        let tap = v.rows.first?.url ?? v.headerURL
        if s == .inline || s == .rect {
            LockBody(kind: kind, inline: s == .inline, view: v, data: entry.data).widgetURL(tap).lockBackground()
        } else {
            GeometryReader { g in
                WidgetBody(kind: kind, family: s, view: v, data: entry.data, openApp: NSLocalizedString("widget_open_app", comment: ""), size: g.size)
            }
            .widgetURL(s == .small ? tap : v.headerURL)
            .homeBackground(WStyle.background(scheme))
        }
    }
}

extension View {
    /// iOS 17+: the system's margins + the kit's background; iOS 15 / 16: the same background, the margins by hand
    @ViewBuilder func homeBackground(_ c: Color) -> some View {
        if #available(iOSApplicationExtension 17.0, *) { containerBackground(c, for: .widget) } else { padding(16).background(c) }
    }
    @ViewBuilder func lockBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) { containerBackground(.clear, for: .widget) } else { self }
    }
}

extension WidgetConfiguration {
    /// A-163 (1): Home Screen small / medium / large on every iOS; the Lock Screen's inline + rectangular from iOS 16 (iOS 15 has no such family)
    func inokFamilies() -> some WidgetConfiguration {
        if #available(iOSApplicationExtension 16.0, *) {
            return supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryInline, .accessoryRectangular])
        }
        return supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct LiveWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "info.inok.app.widget.live", provider: Provider()) { InokWidgetView(kind: .live, entry: $0) }
            .configurationDisplayName(Text("widget_live")).description(Text("widget_live_desc")).inokFamilies()
    }
}
struct UpcomingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "info.inok.app.widget.upcoming", provider: Provider()) { InokWidgetView(kind: .upcoming, entry: $0) }
            .configurationDisplayName(Text("widget_upcoming")).description(Text("widget_upcoming_desc")).inokFamilies()
    }
}
struct NewWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "info.inok.app.widget.new", provider: Provider()) { InokWidgetView(kind: .new, entry: $0) }
            .configurationDisplayName(Text("widget_new")).description(Text("widget_new_desc")).inokFamilies()
    }
}

@main
struct InokWidgetsBundle: WidgetBundle {
    var body: some Widget {
        LiveWidget(); UpcomingWidget(); NewWidget()
        // cloud_46 (A-173 (C)): the reminder's Live Activity UI (ActivityKit) - iOS 16.1+ only; below it the bundle is the three widgets of 1.0.18
        if #available(iOSApplicationExtension 16.1, *) { InokCountdownLive() }
    }
}
