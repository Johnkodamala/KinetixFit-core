import Capacitor
import UIKit

/// Alternate app icons (src/lib/appIcons.ts). Each one is an app icon set in Assets.xcassets (AppIcon-<Name>), listed
/// in the App target's ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES build setting. iOS shows its own
/// "You have changed the icon for KinetixFit" alert after a change. Same ids as Android's AppIconPlugin.java.
@objc(AppIconPlugin)
public class AppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppIconPlugin"
    public let jsName = "AppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)
    ]

    /// id → alternate icon name (nil = the main AppIcon)
    static let names: [String: String?] = [
        "classic": nil,
        "midnight": "AppIcon-Midnight",
        "aurora": "AppIcon-Aurora",
        "gold": "AppIcon-Gold",
        "ember": "AppIcon-Ember",
        "kx-track": "AppIcon-KXTrack",
        "kx-mono": "AppIcon-KXMono",
        "kx-pulse": "AppIcon-KXPulse",
        "kx-chrome": "AppIcon-KXChrome"
    ]

    @objc func get(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let current = UIApplication.shared.alternateIconName
            let id = Self.names.first { $0.value == current }?.key ?? "classic"
            call.resolve(["id": id, "pending": false])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let name = Self.names[id] else {
            call.reject("Unknown app icon")
            return
        }
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                call.reject("This iPhone can't change app icons")
                return
            }
            if UIApplication.shared.alternateIconName == name {
                call.resolve(["id": id, "pending": false])
                return
            }
            UIApplication.shared.setAlternateIconName(name) { error in
                if let error = error { call.reject(error.localizedDescription) } else { call.resolve(["id": id, "pending": false]) }
            }
        }
    }
}
