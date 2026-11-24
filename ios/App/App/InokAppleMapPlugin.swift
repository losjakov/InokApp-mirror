import Foundation
import Capacitor
import MapKit
import CoreLocation

/// cloud_46 (A-183): Apple's OWN map for an iPhone whose WebGL cannot draw our MapLibre map (iPhone 7 / iOS 15: «Program failed to link»).
/// An `MKMapView` laid over the web view at the rect the page reserves (src/components/AppleMapPane.tsx), the SAME houses as our map:
/// one `MKMarkerAnnotationView` per house in the app colour (the lavras gold), system clustering, the person's dot only when the location
/// is ALREADY granted (never a prompt from here); a pin's callout «›» = the event `open` {code} -> the house card. Hidden while a web
/// overlay is open (JS decides, `setVisible`). Standard Apple style; dark follows the system. No new target, no dependency beyond MapKit.
final class InokHouseAnnotation: NSObject, MKAnnotation {
    let code: Int
    let coordinate: CLLocationCoordinate2D
    let title: String?
    let lavra: Bool
    init(code: Int, lat: Double, lon: Double, title: String, lavra: Bool) {
        self.code = code; self.coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lon); self.title = title; self.lavra = lavra
    }
}

@objc(InokAppleMapPlugin)
public class InokAppleMapPlugin: CAPPlugin, CAPBridgedPlugin, MKMapViewDelegate {
    public let identifier = "InokAppleMapPlugin"
    public let jsName = "InokAppleMap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setHouses", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "destroy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selectForRing", returnType: CAPPluginReturnPromise),
    ]
    static let brand = UIColor(red: 0x0c / 255.0, green: 0x64 / 255.0, blue: 0x86 / 255.0, alpha: 1)
    static let gold = UIColor(red: 0xf5 / 255.0, green: 0xc8 / 255.0, blue: 0x42 / 255.0, alpha: 1)
    static let reuse = "inok.house"
    /// Ukraine as our own map frames it first (geojson.ts UKRAINE_BOUNDS: 22.1-40.2 E, 44.4-52.4 N)
    static let ukraine = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 48.4, longitude: 31.15),
                                            span: MKCoordinateSpan(latitudeDelta: 8.6, longitudeDelta: 18.6))
    /// a JS number as it reaches Swift (NSNumber)
    static func num(_ v: JSValue?) -> Double? { (v as? NSNumber)?.doubleValue }
    private var map: MKMapView?
    private var openLabel = "›"

    private func frame(_ call: CAPPluginCall, in web: UIView) -> CGRect? {
        guard let r = call.getObject("rect"), let x = InokAppleMapPlugin.num(r["x"]), let y = InokAppleMapPlugin.num(r["y"]),
              let w = InokAppleMapPlugin.num(r["width"]), let h = InokAppleMapPlugin.num(r["height"]), w > 0, h > 0 else { return nil }
        // the page's CSS pixels = the web view's points (Capacitor: no page zoom); the web view's own origin in its superview added
        return CGRect(x: web.frame.minX + x, y: web.frame.minY + y, width: w, height: h)
    }
    private func annotations(_ call: CAPPluginCall) -> [InokHouseAnnotation] {
        (call.getArray("houses", JSObject.self) ?? []).compactMap { h in
            guard let code = (h["code"] as? NSNumber)?.intValue, let lat = InokAppleMapPlugin.num(h["lat"]), let lon = InokAppleMapPlugin.num(h["lon"]) else { return nil }
            return InokHouseAnnotation(code: code, lat: lat, lon: lon, title: h["title"] as? String ?? "", lavra: h["lavra"] as? Bool ?? false)
        }
    }
    private func granted() -> Bool {
        let s = CLLocationManager().authorizationStatus
        return s == .authorizedWhenInUse || s == .authorizedAlways
    }

    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let web = self.bridge?.webView, let host = web.superview, let f = self.frame(call, in: web) else { call.reject("no web view / rect"); return }
            self.openLabel = call.getString("open") ?? "›"
            let m = self.map ?? MKMapView(frame: f)
            m.frame = f
            m.delegate = self
            m.register(MKMarkerAnnotationView.self, forAnnotationViewWithReuseIdentifier: InokAppleMapPlugin.reuse)
            m.showsUserLocation = self.granted()
            m.pointOfInterestFilter = .excludingAll // our houses, not Apple's places of interest
            m.accessibilityIdentifier = "inok-apple-map"
            if self.map == nil { host.addSubview(m); self.map = m }
            m.removeAnnotations(m.annotations.filter { $0 is InokHouseAnnotation })
            let hs = self.annotations(call)
            m.addAnnotations(hs)
            if let c = call.getObject("center"), let lat = InokAppleMapPlugin.num(c["lat"]), let lon = InokAppleMapPlugin.num(c["lon"]) {
                m.setRegion(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: lat, longitude: lon), latitudinalMeters: 4000, longitudinalMeters: 4000), animated: false)
            } else {
                m.setRegion(InokAppleMapPlugin.ukraine, animated: false)
            }
            m.isHidden = false
            call.resolve(["count": hs.count])
        }
    }
    @objc func setRect(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let web = self.bridge?.webView, let f = self.frame(call, in: web) { self.map?.frame = f }
            call.resolve()
        }
    }
    @objc func setVisible(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.map?.isHidden = !(call.getBool("visible") ?? true); call.resolve() }
    }
    @objc func setHouses(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let m = self.map else { call.reject("no map"); return }
            m.removeAnnotations(m.annotations.filter { $0 is InokHouseAnnotation })
            let hs = self.annotations(call)
            m.addAnnotations(hs)
            call.resolve(["count": hs.count])
        }
    }
    @objc func destroy(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.map?.delegate = nil; self.map?.removeFromSuperview(); self.map = nil; call.resolve() }
    }
    /// the ring's read (A-183 (8)): shown, the houses on it, the frame
    @objc func state(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let m = self.map else { call.resolve(["exists": false]); return }
            call.resolve(["exists": true, "hidden": m.isHidden, "houses": m.annotations.filter { $0 is InokHouseAnnotation }.count,
                          "width": Double(m.frame.width), "height": Double(m.frame.height)])
        }
    }

    /// the ring's hand (A-183 (8); a native callout has no DOM): the house's pin selected on the map, then the callout's own path (`opened`)
    @objc func selectForRing(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let code = call.getInt("code") ?? -1
            guard let m = self.map, let h = m.annotations.first(where: { ($0 as? InokHouseAnnotation)?.code == code }) as? InokHouseAnnotation else { call.resolve(["found": false]); return }
            m.selectAnnotation(h, animated: false)
            self.opened(h)
            call.resolve(["found": true])
        }
    }
    private func opened(_ h: InokHouseAnnotation) { notifyListeners("open", data: ["code": h.code]) }

    // MARK: MKMapViewDelegate
    public func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard let h = annotation as? InokHouseAnnotation else { return nil } // the person's dot, the clusters: the system's own views
        let v = mapView.dequeueReusableAnnotationView(withIdentifier: InokAppleMapPlugin.reuse, for: h) as? MKMarkerAnnotationView
            ?? MKMarkerAnnotationView(annotation: h, reuseIdentifier: InokAppleMapPlugin.reuse)
        v.annotation = h
        v.markerTintColor = h.lavra ? InokAppleMapPlugin.gold : InokAppleMapPlugin.brand
        v.glyphImage = UIImage(systemName: "building.columns.fill")
        v.clusteringIdentifier = h.lavra ? nil : "inok.houses" // the lavras are never clustered (A-21 (б), as our map)
        v.displayPriority = h.lavra ? .required : .defaultHigh
        v.canShowCallout = true
        let open = UIButton(type: .detailDisclosure)
        open.accessibilityLabel = openLabel // VoiceOver: «Відкрити картку» (A-183 (7))
        v.rightCalloutAccessoryView = open
        v.isAccessibilityElement = true
        v.accessibilityLabel = h.title // VoiceOver: the house's name on each pin
        return v
    }
    public func mapView(_ mapView: MKMapView, annotationView view: MKAnnotationView, calloutAccessoryControlTapped control: UIControl) {
        guard let h = view.annotation as? InokHouseAnnotation else { return }
        opened(h)
    }
}
