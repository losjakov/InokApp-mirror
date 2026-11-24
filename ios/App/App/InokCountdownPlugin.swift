import Foundation
import UIKit
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

/// cloud_46 (A-173 (C)): THE native side of src/native/countdown.ts on iPhone - `sync` makes the reminder Live Activities equal to the reminders
/// inside the 8 h window: a new one is REQUESTED only while the app is in the foreground (ActivityKit's own rule, and A-7: no push token, no
/// server), a moved time updates it, a cancelled / dropped / past one ends at once. iOS < 16.1 (or Live Activities off in Settings): nothing,
/// the plain reminder stays. `state` = what the ring reads (`Activity.activities` count 1 -> 0).
@objc(InokCountdownPlugin)
public class InokCountdownPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InokCountdownPlugin"
    public let jsName = "InokCountdown"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise),
    ]

    @objc func sync(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) { DispatchQueue.main.async { self.syncActivities(call) }; return }
        #endif
        call.resolve(["active": 0, "supported": false])
    }

    @objc func state(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            let live = Activity<InokCountdownAttributes>.activities.filter { $0.activityState == .active }
            call.resolve(["active": live.count, "ids": live.map { $0.attributes.id }, "enabled": ActivityAuthorizationInfo().areActivitiesEnabled])
            return
        }
        #endif
        call.resolve(["active": 0, "ids": [String](), "enabled": false])
    }

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private func syncActivities(_ call: CAPPluginCall) {
        let words = call.getObject("words") ?? [:]
        let items = call.getArray("items", JSObject.self) ?? []
        let foreground = UIApplication.shared.applicationState == .active
        let enabled = ActivityAuthorizationInfo().areActivitiesEnabled
        var keep = Set<String>()
        Task { @MainActor in
            for it in items {
                guard let id = it["id"] as? String, let atMs = (it["at"] as? NSNumber)?.doubleValue else { continue }
                keep.insert(id)
                let start = Date(timeIntervalSince1970: atMs / 1000)
                let state = InokCountdownAttributes.ContentState(start: start, title: it["title"] as? String ?? "", monastery: it["monastery"] as? String ?? "")
                if let a = Activity<InokCountdownAttributes>.activities.first(where: { $0.attributes.id == id }) {
                    if a.contentState != state { await InokCountdownPlugin.update(a, state) } // a moved time
                    continue
                }
                guard foreground, enabled else { continue } // a reminder set earlier starts at the first foreground inside the window
                let attrs = InokCountdownAttributes(id: id, channelId: (it["channel_id"] as? NSNumber)?.intValue ?? 0, videoId: it["video_id"] as? String ?? "",
                    label: words["label"] as? String ?? "", startsIn: words["in"] as? String ?? "", started: words["started"] as? String ?? "")
                do {
                    if #available(iOS 16.2, *) { _ = try Activity.request(attributes: attrs, content: ActivityContent(state: state, staleDate: start), pushType: nil) }
                    else { _ = try Activity.request(attributes: attrs, contentState: state, pushType: nil) }
                } catch { CAPLog.print("InokCountdown: request refused \(error.localizedDescription)") }
            }
            for a in Activity<InokCountdownAttributes>.activities where !keep.contains(a.attributes.id) {
                if #available(iOS 16.2, *) { await a.end(nil, dismissalPolicy: .immediate) } else { await a.end(dismissalPolicy: .immediate) }
            }
            call.resolve(["active": Activity<InokCountdownAttributes>.activities.filter { $0.activityState == .active }.count, "supported": true, "enabled": enabled])
        }
    }

    @available(iOS 16.1, *)
    private static func update(_ a: Activity<InokCountdownAttributes>, _ s: InokCountdownAttributes.ContentState) async {
        if #available(iOS 16.2, *) { await a.update(ActivityContent(state: s, staleDate: s.start)) } else { await a.update(using: s) }
    }
    #endif
}
