import UserNotifications
import WidgetKit

/// T13 (A-155 (2), (4), (5); cloud_43): the iPhone's «Зараз в ефірі» changes AT ONCE on a stream push. The site's `stream_live` alert carries
/// `mutable-content: 1` (contract §4, ruling 405): this extension writes the payload's channel / video / title into the App Group live data
/// and reloads the widgets (best-effort), then delivers the notification UNCHANGED (title, sound, tap route). Any error or the time limit ->
/// the ORIGINAL content: a notification is never lost or altered.
class NotificationService: UNNotificationServiceExtension {
    private var handler: ((UNNotificationContent) -> Void)?
    private var original: UNNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        handler = contentHandler
        original = request.content
        if InokShared.applyStreamPush(request.content.userInfo), #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: "info.inok.app.widget.live")
        }
        // cloud_46 (A-171 A4 b): ANY visible push that arrives also clears the «ефір» of channels the App Group (fresh, ≤ 60 min) no longer
        // lists as live - never the notification being delivered, never an article; unknown / stale live data = nothing removed
        // the notification is delivered AT ONCE (never kept waiting for the tray's answer); the prune is best-effort beside it
        if let live = InokTray.liveKnown() { InokTray.keepLive(live, except: request.identifier) }
        deliver()
    }

    override func serviceExtensionTimeWillExpire() { deliver() }

    private func deliver() {
        guard let h = handler, let c = original else { return }
        handler = nil
        h(c) // the very content that arrived - never modified
    }
}
