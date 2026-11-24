import Foundation
import SwiftUI
import UIKit
import WidgetKit // cloud_46: AccessoryWidgetBackground, widgetAccentable (the Lock Screen kinds; E4: ios 45338200271 «cannot find in scope»)

/// 1.0.18 (A-160, A-161, A-163, A-155 (1); the CD kit reports/mockups/a1018/widgets/README.md): WHAT the three widgets show and HOW - the iOS
/// twin of Android's WidgetModel (the same rules, the same JSON; the words come from the app). In the widget extension AND the app (the
/// ring's review snapshots). Content: «Зараз в ефірі» = channels only (picture + live mark + name), «+N ще»; «Найближчі» = «<time> · <channel>»,
/// the day rides with the time; «Нове на сайті» = the newest of any kind by their placing on the site, the title + a dot per kind (the reader
/// hears the kind). ROWS = AS MANY AS FIT WHOLE: measured with the rows' own font (UIKit), the first that does not fit goes with the rest;
/// no «…» and no hyphenation at the normal text size (a larger Dynamic Type: at most 2 lines with «…», widgets only).
enum WKind: String, CaseIterable { case live, upcoming, new }
/// the drawn size: the three Home Screen families + the Lock Screen's two (iOS 16+)
enum WSize: String, CaseIterable { case small, medium, large, rect, inline }

struct WRow: Identifiable {
    let id: Int
    let text: String, time: String
    let image: String?
    let url: URL
    let say: String
    let dot: String?
    let live: Bool, bell: Bool
}

struct WView {
    var header = "", big = "", foot = "", updated = "", note = ""
    var headerURL = URL(string: WModel.streams)!
    var rows: [WRow] = []
    var total = 0
    var empty = false
}

struct WData {
    var words: [String: String] = [:]
    var channels: [Int: (name: String, image: String?)] = [:]
    var live: [(ch: Int, video: String)] = []
    var planned: [(ch: Int, video: String, at: Date)] = []
    var items: [(id: Int, kind: String, title: String, created: Date, url: String)] = []
    var reminders: Set<String> = []
    var updated: Date?
    var liveTotal = 0
    var sampleWhen: [String]? = nil
    /// A-162 (2) ui-config: «<light|dark>.<news|pub|video>» -> #RRGGBB
    var dots: [String: String] = [:]
    var maxRows = 0

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

    /// The app's JSON + the widget's own newer fetches (the newer wins); nil = the app never wrote its data.
    static func load() -> WData? {
        guard let a = InokShared.json(InokShared.appKey) else { return nil }
        var d = WData()
        d.words = a["words"] as? [String: String] ?? [:]
        for (k, v) in a["channels"] as? [String: [String: Any]] ?? [:] {
            if let id = Int(k) { d.channels[id] = (v["name"] as? String ?? "", InokShared.avatarPath(id)) }
        }
        for r in a["reminders"] as? [[String: Any]] ?? [] { d.reminders.insert("\(r["channel_id"] as? Int ?? 0)|\(r["video_id"] as? String ?? "")") }
        let lang = a["lang"] as? String ?? "uk"
        let appAt = iso(a["updated_at"])?.timeIntervalSince1970 ?? 0
        let own = InokShared.json(InokShared.liveKey)
        let ownAt = (own?["at"] as? Double ?? 0) / 1000
        let status = (own != nil && ownAt > appAt ? own?["status"] : a["status"]) as? [String: Any]
        for l in status?["live"] as? [[String: Any]] ?? [] { d.live.append((l["channel_id"] as? Int ?? 0, l["video_id"] as? String ?? "")) }
        for s in status?["scheduled"] as? [[String: Any]] ?? [] {
            if let at = iso(s["scheduled_at"]) { d.planned.append((s["channel_id"] as? Int ?? 0, s["video_id"] as? String ?? "", at)) }
        }
        let ownNew = InokShared.json(InokShared.newKey)
        let newAt = (ownNew?["at"] as? Double ?? 0) / 1000
        let items = (ownNew != nil && newAt > appAt && (ownNew?["lang"] as? String) == lang ? ownNew?["items"] : a["items"]) as? [[String: Any]] ?? []
        for i in items {
            let created = iso(i["created_at"]) ?? iso(i["published_at"]) ?? Date(timeIntervalSince1970: 0)
            d.items.append((i["id"] as? Int ?? 0, i["kind"] as? String ?? "", i["title"] as? String ?? "", created, i["site_url"] as? String ?? ""))
        }
        d.items.sort { $0.created > $1.created } // A-161 (1): by their placing on the site
        if let ui = a["ui"] as? [String: Any] {
            d.maxRows = max(0, ui["max_rows"] as? Int ?? 0)
            for (theme, v) in ui["dots"] as? [String: [String: String]] ?? [:] { for (k, hex) in v where hex.range(of: "^#[0-9A-Fa-f]{6}$", options: .regularExpression) != nil { d.dots["\(theme).\(k)"] = hex } }
        }
        let last = max(appAt, max(ownAt, newAt))
        d.updated = last > 0 ? Date(timeIntervalSince1970: last) : nil
        return d
    }

    /// the gallery's sample (A-160 (4), A-163): the kit's texts in the phone's language (widget_samples.json bundled with the widget and the app),
    /// the kit's channel pictures («av:<id>»), no «оновлено»; nil = the file is missing (never in a build: unit iosProject pins it)
    static func sample(_ lang: String = WData.phoneLang) -> WData? {
        guard let u = Bundle.main.url(forResource: "widget_samples", withExtension: "json"), let data = try? Data(contentsOf: u),
              let all = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let j = all[lang] as? [String: Any] else { return nil }
        var d = WData()
        let s = { (k: String) in j[k] as? String ?? "" }
        d.words = ["live_title": s("live_head") + " · {n}", "live_small": s("live_head_small") + " · {n}", "more": s("more_fmt"), "upcoming_title": s("up_title"),
                   "nearest": s("up_small"), "new_title": s("new_title"), "tomorrow": s("tomorrow"), "next": s("next") + " {time}",
                   "say_live": "{name}", "say_planned": "{name}, {time}", "say_news": "{title}", "say_pub": "{title}", "say_video": "{title}"]
        d.liveTotal = j["live_total"] as? Int ?? 0
        for c in j["live"] as? [[String: Any]] ?? [] {
            let id = c["id"] as? Int ?? 0
            d.channels[id] = (c["name"] as? String ?? "", "av:\(id)"); d.live.append((id, ""))
        }
        var when: [String] = []
        for (i, c) in (j["up"] as? [[String: Any]] ?? []).enumerated() {
            let id = c["id"] as? Int ?? 0
            if d.channels[id] == nil { d.channels[id] = (c["name"] as? String ?? "", "av:\(id)") }
            d.planned.append((id, "", Date(timeIntervalSince1970: Double(i)))); when.append(c["when"] as? String ?? "")
        }
        d.sampleWhen = when
        for (i, n) in (j["new"] as? [[String: Any]] ?? []).enumerated() {
            let k = n["kind"] as? String ?? ""
            d.items.append((i, k == "pub" ? "publication" : k, n["title"] as? String ?? "", Date(timeIntervalSince1970: Double(1000 - i)), ""))
        }
        return d
    }
    static var phoneLang: String {
        let l = String((Locale.preferredLanguages.first ?? "en").prefix(2))
        return l == "uk" || l == "ru" ? l : "en"
    }
}

enum WModel {
    static let streams = "inokapp://tab/streams"
    static func hhmm(_ d: Date) -> String { let f = DateFormatter(); f.dateFormat = "HH:mm"; return f.string(from: d) }
    static func fill(_ s: String, _ k: String, _ v: String) -> String { s.replacingOccurrences(of: "{\(k)}", with: v) }
    static func dot(_ kind: String) -> String { kind == "news" ? "news" : kind == "video" ? "video" : "pub" }
    /// A-161 (3): «Трансляції» first, the stream on top (the app's ONE link path); no video id = «Трансляції» alone
    static func liveURL(_ video: String) -> URL {
        let v = video.filter { $0.isLetter && $0.isASCII || $0.isNumber || $0 == "_" || $0 == "-" }
        return URL(string: v.isEmpty ? streams : streams + "?play=" + v)!
    }
    /// «17:00» today, «завтра 06:30» tomorrow, «24.11 08:00» later - the day ALWAYS with the time (REVIEW cloud_43 NOTE 1)
    static func when(_ d: WData, _ i: Int, _ at: Date, _ now: Date) -> String {
        if let s = d.sampleWhen, i < s.count { return s[i] }
        let cal = Calendar.current
        if cal.isDate(at, inSameDayAs: now) { return hhmm(at) }
        if let t = cal.date(byAdding: .day, value: 1, to: now), cal.isDate(at, inSameDayAs: t) { return d.w("tomorrow") + " " + hhmm(at) }
        let f = DateFormatter(); f.dateFormat = "dd.MM"
        return f.string(from: at) + " " + hhmm(at)
    }

    /// Every candidate row in order (the view keeps the ones that fit); `compact` = small and the Lock Screen (one entry, the short header).
    static func build(_ kind: WKind, compact: Bool, data: WData?, now: Date = Date()) -> WView {
        var v = WView()
        guard let d = data, !d.words.isEmpty else { v.empty = true; return v }
        if let u = d.updated { v.updated = fill(d.w("updated"), "time", hhmm(u)) }
        switch kind {
        case .live:
            let n = d.liveTotal > 0 ? d.liveTotal : d.live.count
            v.total = n
            v.header = fill(d.w(compact ? "live_small" : "live_title"), "n", "\(n)")
            if d.live.isEmpty { v.note = d.w("none_live"); return v }
            for (i, l) in d.live.enumerated() {
                let c = d.channels[l.ch] ?? ("", nil)
                v.rows.append(WRow(id: i, text: c.name, time: "", image: c.image, url: liveURL(l.video), say: fill(d.w("say_live"), "name", c.name), dot: nil, live: true, bell: false))
            }
        case .upcoming:
            v.header = d.w(compact ? "nearest" : "upcoming_title")
            let next = d.sampleWhen != nil ? d.planned : d.planned.filter { $0.at > now }.sorted { $0.at < $1.at }
            if next.isEmpty { v.note = d.w("none_upcoming"); return v }
            for (i, p) in next.enumerated() {
                let c = d.channels[p.ch] ?? ("", nil)
                let w = when(d, i, p.at, now)
                v.rows.append(WRow(id: i, text: w + " · " + c.name, time: w, image: c.image, url: URL(string: streams)!,
                                   say: fill(fill(d.w("say_planned"), "name", c.name), "time", w), dot: nil, live: false, bell: d.reminders.contains("\(p.ch)|\(p.video)")))
            }
            if compact { v.big = v.rows[0].time }
        case .new:
            v.header = d.w("new_title")
            v.headerURL = URL(string: "https://inok.info/articles/")!
            if d.items.isEmpty { v.note = d.w("none_new"); return v }
            for (i, it) in d.items.enumerated() {
                let k = dot(it.kind)
                v.rows.append(WRow(id: i, text: it.title, time: "", image: nil, url: URL(string: it.url) ?? v.headerURL,
                                   say: fill(d.w(k == "news" ? "say_news" : k == "video" ? "say_video" : "say_pub"), "title", it.title), dot: k, live: false, bell: false))
            }
        }
        return v
    }
}

/// The kit's measures (README «Measures», iPhone: pt) and colours; `scale` follows Dynamic Type (Large = 1).
enum WStyle {
    static let header: CGFloat = 11.3, row: CGFloat = 12.7, rowSmall: CGFloat = 11.7, big: CGFloat = 24, foot: CGFloat = 10
    static let picture: CGFloat = 30, dot: CGFloat = 10, gap: CGFloat = 8, lineHeight: CGFloat = 1.22, rowPad: CGFloat = 4
    static func color(_ hex: String) -> Color {
        let v = UInt64(hex.dropFirst(), radix: 16) ?? 0
        return Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
    static func pair(_ light: String, _ dark: String, _ s: ColorScheme) -> Color { color(s == .dark ? dark : light) }
    static func text(_ s: ColorScheme) -> Color { pair("#1B1F23", "#F1F3F5", s) }
    static func muted(_ s: ColorScheme) -> Color { pair("#5B6570", "#B3BCC5", s) }
    static func accent(_ s: ColorScheme) -> Color { pair("#0C6486", "#7CC6E4", s) }
    static func live(_ s: ColorScheme) -> Color { pair("#C62828", "#FF6B6B", s) }
    static func background(_ s: ColorScheme) -> Color { pair("#FFFFFF", "#1E2328", s) }
    static func dot(_ kind: String, _ s: ColorScheme, _ d: WData?) -> Color {
        if let hex = d?.dots["\(s == .dark ? "dark" : "light").\(kind)"] { return color(hex) }
        switch kind {
        case "news": return pair("#1F6FC5", "#5AA9F0", s)
        case "video": return pair("#7A4FC4", "#B48CF0", s)
        default: return pair("#A87A00", "#E6B437", s)
        }
    }
    /// Dynamic Type -> the size factor (Large = 1: the normal size, no «…»)
    static func scale(_ t: DynamicTypeSize) -> CGFloat {
        switch t {
        case .xSmall: return 0.82
        case .small: return 0.88
        case .medium: return 0.94
        case .large: return 1
        case .xLarge: return 1.12
        case .xxLarge: return 1.24
        case .xxxLarge: return 1.35
        default: return 1.6
        }
    }
    /// REVIEW cloud_43 NOTE 1 («Таєм-ниці»): a word is never broken - a WORD JOINER between its letters forbids a break (and a hyphen) inside it
    static func whole(_ s: String) -> String {
        s.split(separator: " ", omittingEmptySubsequences: false).map { w in w.map(String.init).joined(separator: "\u{2060}") }.joined(separator: " ")
    }
    /// the text's height in pt at that width - the SAME font and line height the row draws with
    static func height(_ s: String, width: CGFloat, size: CGFloat, lines: Int) -> CGFloat {
        let font = UIFont.systemFont(ofSize: size, weight: .semibold)
        let p = NSMutableParagraphStyle()
        p.lineSpacing = max(0, size * lineHeight - font.lineHeight); p.lineBreakMode = .byWordWrapping; p.hyphenationFactor = 0
        let r = (whole(s) as NSString).boundingRect(with: CGSize(width: max(20, width), height: .greatestFiniteMagnitude),
                                                     options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: font, .paragraphStyle: p], context: nil)
        let one = size * lineHeight
        let n = max(1, Int(((r.height + p.lineSpacing) / one).rounded()))
        return CGFloat(lines > 0 ? min(n, lines) : n) * one
    }
    /// a channel picture: the kit's («av:<id>», bundled) or the App Group copy the app made (A-163 (3)); nil = none
    static func image(_ ref: String?) -> UIImage? {
        guard let ref = ref else { return nil }
        if ref.hasPrefix("av:") {
            guard let u = Bundle.main.url(forResource: String(ref.dropFirst(3)), withExtension: "webp", subdirectory: "av") else { return nil }
            return small(UIImage(contentsOfFile: u.path))
        }
        return small(UIImage(contentsOfFile: ref))
    }
    static func small(_ i: UIImage?) -> UIImage? {
        guard let i = i else { return nil }
        let side: CGFloat = 96 // 30 pt at 3x, a widget's memory stays small
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { _ in i.draw(in: CGRect(x: 0, y: 0, width: side, height: side)) }
    }
}

/// ROWS = AS MANY AS FIT WHOLE (owner 22.11 08:39): in order; the first that does not fit goes with every row after it.
enum WFit {
    static func rowHeight(_ r: WRow, _ kind: WKind, width: CGFloat, small: Bool, scale: CGFloat, lines: Int) -> CGFloat {
        let size = (small ? WStyle.rowSmall : WStyle.row) * scale
        var w = width
        if kind == .new { w -= WStyle.dot + WStyle.gap } else if !small { w -= WStyle.picture * scale + WStyle.gap }
        if r.bell { w -= 18 }
        let h = WStyle.height(r.text, width: w, size: size, lines: lines) + WStyle.rowPad
        return kind == .new || small ? h : max(WStyle.picture * scale + WStyle.rowPad, h)
    }
    static func count(_ rows: [WRow], _ kind: WKind, width: CGFloat, room: CGFloat, small: Bool, scale: CGFloat, lines: Int, cap: Int) -> Int {
        var used: CGFloat = 0, k = 0
        for r in rows {
            if cap > 0 && k >= cap { break }
            let h = rowHeight(r, kind, width: width, small: small, scale: scale, lines: lines)
            if used + h > room + 0.5 { break }
            used += h; k += 1
        }
        return k
    }
}

/// THE drawing of the Home Screen sizes (the kit's iPhone frames): small / medium / large. `size` = the content box (after the system margins).
struct WidgetBody: View {
    let kind: WKind
    let family: WSize
    let view: WView
    let data: WData?
    let openApp: String
    let size: CGSize
    @Environment(\.dynamicTypeSize) private var type
    @Environment(\.colorScheme) private var scheme

    var scale: CGFloat { WStyle.scale(type) }
    var lines: Int { scale > 1 ? 2 : 0 }
    var small: Bool { family == .small }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            head.frame(height: (WStyle.header * scale * 1.3).rounded(.up) + 4, alignment: .top)
            if view.empty { Text(openApp).font(.system(size: 12 * scale)).foregroundColor(WStyle.muted(scheme)) }
            if !view.big.isEmpty && small {
                Text(WStyle.whole(view.big)).font(.system(size: WStyle.big * scale, weight: .bold)).foregroundColor(WStyle.text(scheme))
                    .lineLimit(1).minimumScaleFactor(0.5) // «завтра 06:30» whole: it shrinks, never «…» (NOTE 1)
            }
            ForEach(shown) { r in
                if small { row(r) } else { Link(destination: r.url) { row(r) } }
            }
            if !view.note.isEmpty { Text(view.note).font(.system(size: 11 * scale)).foregroundColor(WStyle.muted(scheme)).padding(.top, 2) }
            Spacer(minLength: 0)
            if !foot.isEmpty || (small && !view.updated.isEmpty) {
                HStack { Text(foot); Spacer(); if small { Text(view.updated) } }.font(.system(size: WStyle.foot * scale)).foregroundColor(WStyle.muted(scheme))
                    .frame(height: footH)
            }
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
    }

    var head: some View {
        HStack(spacing: 5) {
            if kind == .live && !view.rows.isEmpty { Circle().fill(WStyle.live(scheme)).frame(width: 7, height: 7).accessibilityHidden(true) }
            Text(view.empty ? openTitle : view.header).font(.system(size: WStyle.header * scale, weight: .semibold)).foregroundColor(WStyle.accent(scheme))
                .textCase(.uppercase).lineLimit(1)
            Spacer(minLength: 4)
            if !small && !view.updated.isEmpty { Text(view.updated).font(.system(size: WStyle.foot * scale)).foregroundColor(WStyle.muted(scheme)).lineLimit(1) }
        }
    }
    var footH: CGFloat { (WStyle.foot * scale * 1.3).rounded(.up) }
    var openTitle: String { NSLocalizedString(kind == .live ? "widget_live" : kind == .upcoming ? "widget_upcoming" : "widget_new", comment: "") }

    /// small live / upcoming: ONE channel (the name gets the width); everything else: the rows that fit
    var shown: [WRow] {
        if small && kind != .new {
            guard let r = view.rows.first else { return [] }
            return [WRow(id: 0, text: nameOf(r), time: "", image: nil, url: r.url, say: r.say, dot: nil, live: false, bell: r.bell)]
        }
        let headH = (WStyle.header * scale * 1.3).rounded(.up) + 4
        var room = size.height - headH - (view.note.isEmpty ? 0 : 16 * scale)
        if small && !view.updated.isEmpty { room -= footH }
        var k = WFit.count(view.rows, kind, width: size.width, room: room, small: small, scale: scale, lines: lines, cap: small ? 0 : (data?.maxRows ?? 0))
        if kind == .live && k < view.total { // «+N ще» takes its line
            k = WFit.count(view.rows, kind, width: size.width, room: room - footH, small: small, scale: scale, lines: lines, cap: data?.maxRows ?? 0)
        }
        return Array(view.rows.prefix(k))
    }
    func nameOf(_ r: WRow) -> String { r.time.isEmpty ? r.text : String(r.text.dropFirst(r.time.count + 3)) }
    var foot: String {
        if kind == .live && view.total > shown.count && !view.rows.isEmpty { return WModel.fill(data?.w("more") ?? "", "n", "\(view.total - shown.count)") }
        return ""
    }

    @ViewBuilder func row(_ r: WRow) -> some View {
        let size = (small ? WStyle.rowSmall : WStyle.row) * scale
        let font = Font.system(size: size, weight: .semibold)
        let spacing = max(0, size * WStyle.lineHeight - UIFont.systemFont(ofSize: size, weight: .semibold).lineHeight)
        HStack(alignment: kind == .new ? .top : .center, spacing: WStyle.gap) {
            if kind == .new, let d = r.dot { Circle().fill(WStyle.dot(d, scheme, data)).frame(width: WStyle.dot, height: WStyle.dot).padding(.top, (size * WStyle.lineHeight - WStyle.dot) / 2).accessibilityHidden(true) }
            if kind != .new && !small { picture(r) }
            (Text(r.time.isEmpty ? "" : WStyle.whole(r.time)).foregroundColor(WStyle.accent(scheme))
             + Text(WStyle.whole(r.time.isEmpty ? r.text : String(r.text.dropFirst(r.time.count)))).foregroundColor(WStyle.text(scheme)))
                .font(font).lineSpacing(spacing).lineLimit(lines > 0 ? lines : nil).truncationMode(.tail).multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: lines == 0)
                .frame(maxWidth: .infinity, alignment: .leading)
            if r.bell { Image(systemName: "bell.fill").font(.system(size: 11 * scale)).foregroundColor(WStyle.accent(scheme)).accessibilityHidden(true) }
        }
        .padding(.vertical, WStyle.rowPad / 2)
        .accessibilityElement(children: .ignore).accessibilityLabel(r.say)
    }

    @ViewBuilder func picture(_ r: WRow) -> some View {
        let side = WStyle.picture * scale
        ZStack(alignment: .topTrailing) {
            if let i = WStyle.image(r.image) { Image(uiImage: i).resizable().scaledToFill().frame(width: side, height: side).clipShape(Circle()) }
            else { Circle().fill(WStyle.muted(scheme).opacity(0.25)).frame(width: side, height: side) }
            if r.live { Circle().fill(WStyle.live(scheme)).frame(width: 9, height: 9).overlay(Circle().stroke(WStyle.background(scheme), lineWidth: 1.7)) }
        }
        .frame(width: side, height: side).accessibilityHidden(true)
    }
}

/// The Lock Screen (iOS 16+; Apple draws these in ONE colour - no pictures, no coloured dots): the inline line over the clock and the rectangle.
struct LockBody: View {
    let kind: WKind
    let inline: Bool
    let view: WView
    let data: WData?
    var body: some View {
        if inline { Text(line) }
        else {
            // cloud_46 (A-173 (A)): the system's own backing plate under the rectangle (iOS 16+; the system tints it to the wallpaper) +
            // the live one's first channel picture (accentable: the system renders it monochrome) beside the label / bold title / muted third line
            ZStack {
                LockPlate()
                HStack(spacing: 6) {
                    if kind == .live, let img = WStyle.image(view.rows.first?.image) {
                        Image(uiImage: img).resizable().scaledToFill().frame(width: 28, height: 28).clipShape(Circle()).accentable().accessibilityHidden(true)
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        Text((kind == .live && !view.rows.isEmpty ? "● " : "") + view.header).font(.caption2.weight(.semibold)).textCase(.uppercase).lineLimit(1)
                        Text(view.rows.first?.text ?? view.note).font(.headline.weight(.bold)).lineLimit(2).minimumScaleFactor(0.85)
                        if let t = third { Text(t).font(.caption2).opacity(0.7).lineLimit(1) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 6).padding(.vertical, 3)
            }
            .accessibilityElement(children: .combine)
        }
    }
    /// «+2 ще» (live) / «+2 нових» (new) / the next one's time (upcoming) - the muted third line
    var third: String? {
        switch kind {
        case .live: return view.total > 1 ? WModel.fill(data?.w("more") ?? "", "n", "\(view.total - 1)") : nil
        case .new: return view.rows.count > 1 ? String(format: NSLocalizedString("lock_more_new", comment: ""), view.rows.count - 1) : nil
        case .upcoming: return view.rows.count > 1 ? view.rows[1].text : nil
        }
    }
    /// «● Зараз в ефірі · 10 · наступна 17:00» / «17:00 · <channel>» / the newest title
    var line: String {
        switch kind {
        case .live:
            let next = data.map { d in WModel.build(.upcoming, compact: true, data: d).rows.first.map { WModel.fill(d.w("next"), "time", $0.time) } ?? "" } ?? ""
            return ["● " + view.header, next].filter { !$0.isEmpty && $0 != "● " }.joined(separator: " · ")
        case .upcoming: return view.rows.first?.text ?? view.note
        case .new: return view.rows.first?.text ?? view.note
        }
    }
}


// MARK: cloud_46 (A-173 (A) / (B)) - the Lock Screen's plate and the two CIRCULAR widgets («Ефір», «Найближча»), iOS 16+ (the app's floor 15.0)
struct LockPlate: View {
    var body: some View {
        if #available(iOS 16.0, *) { AccessoryWidgetBackground().clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous)) } else { Color.clear }
    }
}
extension View {
    /// the system's accent group on the Lock Screen (iOS 16+); a no-op below
    @ViewBuilder func accentable() -> some View { if #available(iOS 16.0, *) { widgetAccentable() } else { self } }
}
/// «Ефір»: the live count big, a gauge (count / 5), «ЕФІР»; «Найближча»: a short name above, the next time big, «через N год» below
struct RoundBody: View {
    let kind: WKind
    let data: WData?
    var now = Date()
    static let gaugeMax = 5.0
    var body: some View {
        ZStack {
            if #available(iOS 16.0, *) { AccessoryWidgetBackground() }
            if kind == .live { live } else { next }
        }
        .accessibilityElement(children: .combine)
    }
    @ViewBuilder var live: some View {
        let n = WModel.build(.live, compact: true, data: data, now: now).total
        if #available(iOS 16.0, *) {
            Gauge(value: min(Double(n), RoundBody.gaugeMax), in: 0...RoundBody.gaugeMax) { Text(NSLocalizedString("round_live", comment: "")).font(.system(size: 8, weight: .semibold)) }
                currentValueLabel: { Text("\(n)").font(.system(size: 20, weight: .bold).monospacedDigit()) }
                .gaugeStyle(.accessoryCircular).accentable()
        } else { Text("\(n)") }
    }
    var next: some View {
        let d = data
        let p = d.map { x in (x.sampleWhen != nil ? x.planned : x.planned.filter { $0.at > now }.sorted { $0.at < $1.at }).first } ?? nil
        let name = p.flatMap { d?.channels[$0.ch]?.name } ?? ""
        let short = name.split(separator: " ").first(where: { $0.count > 3 }).map(String.init) ?? name
        let hours = p.map { max(0, Int(($0.at.timeIntervalSince(now) / 3600).rounded(.down))) } ?? 0
        let mins = p.map { max(0, Int(($0.at.timeIntervalSince(now) / 60).rounded(.down))) } ?? 0
        let when = hours >= 1 ? String(format: NSLocalizedString("round_in_h", comment: ""), hours) : String(format: NSLocalizedString("round_in_m", comment: ""), mins)
        return VStack(spacing: 0) {
            Text(short).font(.system(size: 8, weight: .semibold)).textCase(.uppercase).lineLimit(1).minimumScaleFactor(0.7)
            Text(p.map { WModel.hhmm($0.at) } ?? "–").font(.system(size: 17, weight: .bold).monospacedDigit()).lineLimit(1).minimumScaleFactor(0.6).accentable()
            if p != nil { Text(when).font(.system(size: 8)).lineLimit(1).minimumScaleFactor(0.7) }
        }
        .padding(4)
    }
}
