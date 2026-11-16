import UIKit
import Capacitor

/// cloud_38: the app's own Capacitor bridge (Main.storyboard) - registers the app's local plugins (Capacitor 8 + SPM: a plugin inside the
/// App target is registered here; the npm plugins come through CapApp-SPM).
class InokBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FcmTopicsPlugin())
    }
}
