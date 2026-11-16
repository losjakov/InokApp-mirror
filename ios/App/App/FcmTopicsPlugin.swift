import Foundation
import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

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
        CAPPluginMethod(name: "liveChannels", returnType: CAPPluginReturnPromise)
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

    /// Android's tray bookkeeping (A-84 b, c) - the iOS tray is the system's: nothing to do
    @objc func consumedArticles(_ call: CAPPluginCall) { call.resolve() }
    @objc func liveChannels(_ call: CAPPluginCall) { call.resolve() }
}
