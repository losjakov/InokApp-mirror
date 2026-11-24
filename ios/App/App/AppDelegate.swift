import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging
import WidgetKit
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // cloud_38 (A2): Firebase Messaging for the site's FCM topics - only when the CI put GoogleService-Info.plist into the bundle
        // (never in git); without it the app runs as before and src/native/push.ts says why the topics are not kept
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil { FirebaseApp.configure() }
        AppDelegate.registerArticleCategory()
        return true
    }

    /// cloud_46 (A-171 A6): the site's article alert carries `category: INOK_ARTICLE` - its «Позначити прочитаним» action (no foreground
    /// launch), registered at every launch BESIDE any category another part of the app registered (never replacing them)
    static func registerArticleCategory() {
        let read = UNNotificationAction(identifier: InokTray.markRead, title: NSLocalizedString("INOK_MARK_READ", comment: "the article notification's action"), options: [])
        let cat = UNNotificationCategory(identifier: InokTray.articleCategory, actions: [read], intentIdentifiers: [], options: [])
        let c = UNUserNotificationCenter.current()
        c.getNotificationCategories { have in
            c.setNotificationCategories(have.filter { $0.identifier != InokTray.articleCategory }.union([cat]))
        }
    }

    // cloud_38 (A2): the APNs token - to Firebase (FirebaseAppDelegateProxyEnabled = NO in Info.plist: no swizzling) and to
    // @capacitor/push-notifications, whose `registration` event src/native/push.ts waits for (1.0.11 had neither: no iOS registration ever ended)
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        if FirebaseApp.app() != nil { Messaging.messaging().apnsToken = deviceToken }
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    /// T13 (A-155 (2), cloud_43): a BACKGROUND push (`stream_ended`: apns-push-type background, content-available 1, contract §4 ruling 405)
    /// wakes the app (unless force-quit): the widgets' live data changes at once + the widgets reload.
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        let changed = InokShared.applyStreamPush(userInfo)
        // cloud_46 (A-171 A4 a): a broadcast ended - its delivered «ефір» leaves Notification Center (when iOS delivers this push at all)
        if userInfo["type"] as? String == "stream_ended", let ch = InokTray.str(userInfo["channel_id"]) { InokTray.removeLive(channel: ch) }
        if changed, #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        completionHandler(changed ? .newData : .noData)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
