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
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
