import Foundation
import Capacitor
import StoreKit

/// cloud_41 (A-133 C2): THE store's own rating window on iOS - StoreKit `SKStoreReviewController.requestReview(in:)` (iOS 14+, the app's floor
/// is 15). Never our window, never from a button: src/state/reviewAsk.ts decides WHEN. Apple decides whether it shows (at most three times a
/// year) and tells nothing - the answer is «asked» / «unavailable», never «shown».
@objc(InAppReviewPlugin)
public class InAppReviewPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InAppReviewPlugin"
    public let jsName = "InAppReview"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)]

    @objc func request(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene else {
                call.resolve(["state": "unavailable"]); return
            }
            SKStoreReviewController.requestReview(in: scene)
            call.resolve(["state": "asked"])
        }
    }
}
