import Foundation
import UIKit
import Capacitor
import AppIntents

/// T11 (A-153 (4), iOS 16+; cloud_43): Siri / «Команди» - four App Shortcuts in ONE AppShortcutsProvider: «Трансляції зараз», «Обителі поруч»,
/// «Нове на сайті», «Знайти обитель» (an «Обитель» entity from the houses list the app wrote to the App Group for Spotlight). Each one opens
/// the app with a site / in-app address through the SAME path as a link (Capacitor's open-URL -> the app's ONE router) - no second router.
/// Siri has no Ukrainian: the phrases are en (+ ru in ru.lproj/AppShortcuts.strings); the titles x3 (Localizable.strings). iOS 15: none.
enum IntentOpen {
    @MainActor static func go(_ s: String) {
        guard let u = URL(string: s) else { return }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: u, options: [:])
    }
}

@available(iOS 16.0, *)
struct StreamsNowIntent: AppIntent {
    static var title: LocalizedStringResource = "intent_streams"
    static var openAppWhenRun: Bool = true
    @MainActor func perform() async throws -> some IntentResult { IntentOpen.go("inokapp://tab/streams"); return .result() }
}

@available(iOS 16.0, *)
struct NearIntent: AppIntent {
    static var title: LocalizedStringResource = "intent_near"
    static var openAppWhenRun: Bool = true
    @MainActor func perform() async throws -> some IntentResult { IntentOpen.go("inokapp://tab/home"); return .result() }
}

@available(iOS 16.0, *)
struct NewOnSiteIntent: AppIntent {
    static var title: LocalizedStringResource = "intent_new"
    static var openAppWhenRun: Bool = true
    @MainActor func perform() async throws -> some IntentResult { IntentOpen.go("https://inok.info/articles/"); return .result() }
}

/// «Обитель»: a house of the directory (the App Group list `houses`: id = its site address, title = the name, keywords = names x3, towns)
@available(iOS 16.0, *)
struct HouseEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "entity_house"
    static var defaultQuery = HouseQuery()
    let id: Int
    let name: String
    let place: String
    let words: [String]
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(place)") }

    static func all() -> [HouseEntity] {
        let items = InokShared.json("houses")?["items"] as? [[String: Any]] ?? []
        return items.compactMap { o in
            guard let url = o["id"] as? String, let code = Int(url.split(separator: "/").last.map(String.init) ?? "") else { return nil }
            return HouseEntity(id: code, name: o["title"] as? String ?? "", place: o["desc"] as? String ?? "", words: o["keywords"] as? [String] ?? [])
        }
    }
}

@available(iOS 16.0, *)
struct HouseQuery: EntityStringQuery {
    func entities(for identifiers: [Int]) async throws -> [HouseEntity] { HouseEntity.all().filter { identifiers.contains($0.id) } }
    func entities(matching string: String) async throws -> [HouseEntity] {
        let q = string.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
        return Array(HouseEntity.all().filter { h in ([h.name] + h.words).contains { $0.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil).contains(q) } }.prefix(20))
    }
    func suggestedEntities() async throws -> [HouseEntity] { Array(HouseEntity.all().prefix(20)) }
}

@available(iOS 16.0, *)
struct FindHouseIntent: AppIntent {
    static var title: LocalizedStringResource = "intent_find"
    static var openAppWhenRun: Bool = true
    @Parameter(title: "entity_house") var house: HouseEntity
    @MainActor func perform() async throws -> some IntentResult { IntentOpen.go("https://inok.info/monasteries/\(house.id)/"); return .result() }
}

@available(iOS 16.0, *)
struct InokShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: StreamsNowIntent(), phrases: ["Streams now in \(.applicationName)", "Live broadcasts in \(.applicationName)"])
        AppShortcut(intent: NearIntent(), phrases: ["Monasteries near me in \(.applicationName)"])
        AppShortcut(intent: NewOnSiteIntent(), phrases: ["New on the site in \(.applicationName)"])
        AppShortcut(intent: FindHouseIntent(), phrases: ["Find a monastery in \(.applicationName)"])
    }
}
