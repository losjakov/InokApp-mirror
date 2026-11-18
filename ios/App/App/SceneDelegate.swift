import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // cloud_40 (A1): THE app's own bridge - it registers the local plugins (AppAttest, FcmTopics). Capacitor 8.5 (UIScene): the root view
        // controller is made HERE, Main.storyboard no longer provides it; 1.0.12 / 1.0.13 made Capacitor's own one, so on every iPhone App
        // Attest answered «not implemented» (casts refused: `cast.ios`) and the FCM topics were never subscribed. The ring proves it
        // (scripts/ios_sim_tour.sh «local plugins answer»), unit iosProject pins it.
        window?.rootViewController = InokBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        // cloud_41 (A-133 C1): a quick action that STARTED the app = its launch URL (Capacitor's `getLaunchUrl`), read by the app's router
        if let item = connectionOptions.shortcutItem { _ = Self.openQuickAction(item) }
    }

    /// cloud_41 (A-133 C1): a quick action while the app runs (from the background) = `appUrlOpen` with the same address
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        completionHandler(Self.openQuickAction(shortcutItem))
    }

    /// THE hand-over of a quick action: `info.inok.app.tab.<id>` -> `inokapp://tab/<id>`, through Capacitor's own URL path (lastURL + the
    /// open-URL notification), so ONE router in the app (src/app/quickActions.ts) decides the screen, as for a link
    static func openQuickAction(_ item: UIApplicationShortcutItem) -> Bool {
        let prefix = "info.inok.app.tab."
        guard item.type.hasPrefix(prefix), let url = URL(string: "inokapp://tab/" + item.type.dropFirst(prefix.count)) else { return false }
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
