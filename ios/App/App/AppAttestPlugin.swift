import Foundation
import Capacitor
import DeviceCheck

/// cloud_39 (A-127, contract §3 R-53): Apple App Attest for the casts of an iPhone / iPad (stars, comment votes, reports, a view).
/// A thin layer over DCAppAttestService: every hash comes from JS as standard base64 (made by the ONE line builder,
/// src/data/repo/castLine.ts - the same 32 bytes Android's requestHash is the hex of), the answers go back as standard base64.
/// A refusal carries Apple's reason as its code, so the JS side decides (a new key, retry later, the honest line).
@objc(AppAttestPlugin)
public class AppAttestPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppAttestPlugin"
    public let jsName = "AppAttest"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generateKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "attestKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generateAssertion", returnType: CAPPluginReturnPromise)
    ]

    private var service: DCAppAttestService { DCAppAttestService.shared }

    /// Apple's DCError -> the code the JS side reads (src/native/appAttest.ts).
    private func code(_ error: Error) -> String {
        guard let e = error as? DCError else { return "unknown" }
        switch e.code {
        case .invalidKey: return "invalidKey"
        case .serverUnavailable: return "serverUnavailable"
        case .featureUnsupported: return "unsupported"
        case .invalidInput: return "invalidInput"
        default: return "unknown"
        }
    }

    /// The key id + the hash of a call; nil = refused already (no App Attest here, or a malformed argument).
    private func args(_ call: CAPPluginCall) -> (String, Data)? {
        guard service.isSupported else { call.reject("App Attest is not supported on this device", "unsupported"); return nil }
        guard let keyId = call.getString("keyId"), !keyId.isEmpty,
              let b64 = call.getString("clientDataHash"), let hash = Data(base64Encoded: b64), hash.count == 32 else {
            call.reject("keyId / clientDataHash missing or not 32 bytes", "invalidInput"); return nil
        }
        return (keyId, hash)
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": service.isSupported])
    }

    @objc func generateKey(_ call: CAPPluginCall) {
        guard service.isSupported else { call.reject("App Attest is not supported on this device", "unsupported"); return }
        service.generateKey { keyId, error in
            if let error = error { call.reject(error.localizedDescription, self.code(error)); return }
            guard let keyId = keyId else { call.reject("no key id", "unknown"); return }
            call.resolve(["keyId": keyId])
        }
    }

    @objc func attestKey(_ call: CAPPluginCall) {
        guard let a = args(call) else { return }
        let (keyId, hash) = a
        service.attestKey(keyId, clientDataHash: hash) { attestation, error in
            if let error = error { call.reject(error.localizedDescription, self.code(error)); return }
            guard let attestation = attestation else { call.reject("no attestation", "unknown"); return }
            call.resolve(["attestation": attestation.base64EncodedString()])
        }
    }

    @objc func generateAssertion(_ call: CAPPluginCall) {
        guard let a = args(call) else { return }
        let (keyId, hash) = a
        service.generateAssertion(keyId, clientDataHash: hash) { assertion, error in
            if let error = error { call.reject(error.localizedDescription, self.code(error)); return }
            guard let assertion = assertion else { call.reject("no assertion", "unknown"); return }
            call.resolve(["assertion": assertion.base64EncodedString()])
        }
    }
}
