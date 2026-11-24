import Foundation
import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging
import UserNotifications

/// cloud_38 (A-124, A2): the iOS twin of android/.../FcmTopicsPlugin.java - the SAME JS name and methods (src/native/push.ts), so the topics
/// of a device are kept by ONE code path on both platforms. Firebase Messaging subscribes the device to the site's FCM topics (contract §4);
/// it needs the APNs token (AppDelegate hands it over) and GoogleService-Info.plist in the bundle (CI only, never in git) - without it
/// every call is refused with a reason and the app works on.
@objc(FcmTopicsPlugin)
public class FcmTopicsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FcmTopicsPlugin"
    public let jsName = "FcmTopics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "subscribe", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unsubscribe", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumedArticles", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "liveChannels", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "trayState", returnType: CAPPluginReturnPromise)
    ]

    private func topic(_ call: CAPPluginCall) -> String? {
        guard FirebaseApp.app() != nil else { call.reject("Firebase is not configured (no GoogleService-Info.plist)"); return nil }
        guard let t = call.getString("topic"), !t.isEmpty else { call.reject("no topic"); return nil }
        return t
    }

    @objc func subscribe(_ call: CAPPluginCall) {
        guard let t = topic(call) else { return }
        Messaging.messaging().subscribe(toTopic: t) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func unsubscribe(_ call: CAPPluginCall) {
        guard let t = topic(call) else { return }
        Messaging.messaging().unsubscribe(fromTopic: t) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    /// the app's own page of the Settings app (a refused permission is changed only there)
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            call.resolve()
        }
    }

    /// cloud_46 (A-171 A2 / A5 / A7): the article notifications the app has SHOWN (Home's «Нове на сайті» seen = all; an opened article =
    /// its own) leave Notification Center - by their real identifiers; the app badge back to 0 (the site sends none: a safety net)
    @objc func consumedArticles(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self).map { Set($0) }
        InokTray.removeArticles(ids) { _ in
            FcmTopicsPlugin.clearBadge()
            call.resolve()
        }
    }
    /// cloud_46 (A-171 A3 / A4 c): a FRESH live-status lists the live channels; every delivered «ефір» of another channel goes
    @objc func liveChannels(_ call: CAPPluginCall) {
        guard let ids = call.getArray("ids", String.self) else { call.reject("ids required"); return }
        InokTray.keepLive(Set(ids)) { _ in call.resolve() }
    }
    /// cloud_46 (the ring's read, §5): the registered categories and the delivered notifications by type (never their texts)
    @objc func trayState(_ call: CAPPluginCall) {
        let c = UNUserNotificationCenter.current()
        c.getNotificationCategories { cats in
            c.getDeliveredNotifications { ns in
                var by: [String: Int] = [:]
                for n in ns { by[n.request.content.userInfo["type"] as? String ?? "other", default: 0] += 1 }
                call.resolve(["categories": cats.map { $0.identifier }.sorted(), "actions": cats.flatMap { $0.actions.map { $0.identifier } }.sorted(), "delivered": by])
            }
        }
    }
    static func clearBadge() {
        if #available(iOS 16.0, *) { UNUserNotificationCenter.current().setBadgeCount(0) }
        else { DispatchQueue.main.async { UIApplication.shared.applicationIconBadgeNumber = 0 } }
    }
}
