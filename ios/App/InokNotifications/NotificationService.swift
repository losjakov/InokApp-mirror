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
        deliver()
    }

    override func serviceExtensionTimeWillExpire() { deliver() }

    private func deliver() {
        guard let h = handler, let c = original else { return }
        handler = nil
        h(c) // the very content that arrived - never modified
    }
}
