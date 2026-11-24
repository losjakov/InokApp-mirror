import UIKit
import Capacitor
import UserNotifications

/// cloud_38: the app's own Capacitor bridge (Main.storyboard) - registers the app's local plugins (Capacitor 8 + SPM: a plugin inside the
/// App target is registered here; the npm plugins come through CapApp-SPM).
class InokBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FcmTopicsPlugin())
        bridge?.registerPluginInstance(AppAttestPlugin()) // cloud_39: App Attest for iOS casts (A-127, R-53)
        bridge?.registerPluginInstance(InAppReviewPlugin()) // cloud_41: the store's own rating window (A-133 C2)
        bridge?.registerPluginInstance(InokWidgetsPlugin()) // cloud_43: the home-screen widgets' data (A-153 (2))
        bridge?.registerPluginInstance(InokAppleMapPlugin()) // cloud_46: Apple's map where our WebGL map cannot draw (A-183)
        bridge?.registerPluginInstance(InokCountdownPlugin()) // cloud_46: the reminder's Live Activity (A-173 (C))
        InokNotificationDelegate.install() // cloud_46 (A-171 A6): «Позначити прочитаним» handled natively, all else to Capacitor's router
    }
}

/// cloud_46 (A-171 A6 - WHICH delegate receives the action): UNUserNotificationCenter has ONE delegate; Capacitor's bridge makes it its
/// NotificationRouter (node_modules/@capacitor/ios/Capacitor/Capacitor/CapacitorBridge.swift: `notificationRouter.handleApplicationNotifications`),
/// which hands a push response to @capacitor/push-notifications (-> JS `pushNotificationActionPerformed`). This wrapper is installed after
/// the bridge: the action `INOK_MARK_READ` removes every delivered article notification HERE (the app may be only woken in the background,
/// no page), then EVERY call goes on to the router unchanged (src/native/push.ts ignores the action - it is not a tap).
final class InokNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = InokNotificationDelegate()
    private weak var next: UNUserNotificationCenterDelegate?
    static func install() {
        let c = UNUserNotificationCenter.current()
        guard !(c.delegate is InokNotificationDelegate) else { return }
        shared.next = c.delegate
        c.delegate = shared
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if let n = next, n.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
            n.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
        } else { completionHandler([]) }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let forward = { [weak self] in
            if let n = self?.next, n.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
                n.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
            } else { completionHandler() }
        }
        guard response.actionIdentifier == InokTray.markRead else { forward(); return }
        InokTray.removeArticles(nil) { _ in FcmTopicsPlugin.clearBadge(); DispatchQueue.main.async { forward() } }
    }
}
