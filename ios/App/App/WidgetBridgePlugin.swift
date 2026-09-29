import Capacitor
import WidgetKit

/// Lets the web app hand today's numbers to the home-screen widgets (src/lib/widgets.ts). They're saved in the
/// App Group's UserDefaults, which the widget extension reads (KinetixFitWidgets/WidgetStore.swift), so the
/// widgets keep working while the app is closed. Same keys as Android's WidgetBridgePlugin.java.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = {
        var methods: [CAPPluginMethod] = [
            CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "takeGlasses", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "takeCheckIns", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "takeWorkouts", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "installed", returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "pin", returnType: CAPPluginReturnPromise)
        ]
        #if DEBUG
        methods.append(CAPPluginMethod(name: "renderGallery", returnType: CAPPluginReturnPromise))
        #endif
        return methods
    }()

    static let appGroup = "group.com.jnglobalventures.kinetixfit"

    @objc func update(_ call: CAPPluginCall) {
        guard let d = UserDefaults(suiteName: Self.appGroup) else {
            call.reject("App Group \(Self.appGroup) is not available")
            return
        }
        d.set(call.getString("day") ?? "", forKey: "day")
        d.set(Date().timeIntervalSince1970 * 1000, forKey: "updatedAt")
        d.set(call.getBool("hydrationEnabled") ?? false, forKey: "hydrationEnabled")
        d.set(call.getInt("startHour") ?? 9, forKey: "startHour")
        d.set(call.getInt("endHour") ?? 17, forKey: "endHour")
        d.set(call.getInt("intervalHours") ?? 2, forKey: "intervalHours")
        d.set(call.getDouble("snoozedUntil") ?? 0, forKey: "snoozedUntil")
        d.set(call.getString("day") ?? "", forKey: "waterDay")
        d.set(call.getInt("waterGlasses") ?? 0, forKey: "waterGlasses")
        d.set(call.getInt("waterGoal") ?? 8, forKey: "waterGoal")
        if let ml = call.getInt("waterMl") { d.set(ml, forKey: "waterMl") } else { d.removeObject(forKey: "waterMl") }
        d.set(call.getInt("waterGoalMl") ?? 2000, forKey: "waterGoalMl")
        d.set(call.getInt("glassMl") ?? 250, forKey: "glassMl")
        d.set(call.getInt("kcalEaten") ?? 0, forKey: "kcalEaten")
        d.set(call.getInt("kcalTarget") ?? 0, forKey: "kcalTarget")
        d.set((call.getArray("waterWeek") ?? []).compactMap { ($0 as? NSNumber)?.intValue }, forKey: "waterWeek")
        if let steps = call.getInt("steps") { d.set(steps, forKey: "steps") } else { d.removeObject(forKey: "steps") }
        d.set(call.getInt("stepsGoal") ?? 10000, forKey: "stepsGoal")
        if let kcal = call.getInt("kcalLeft") { d.set(kcal, forKey: "kcalLeft") } else { d.removeObject(forKey: "kcalLeft") }
        d.set(call.getInt("questsDone") ?? 0, forKey: "questsDone")
        d.set(call.getInt("questsTotal") ?? 3, forKey: "questsTotal")
        // My stats + the check-in streak (Streak, Check-in)
        d.set(call.getInt("protein") ?? 0, forKey: "protein")
        d.set(call.getInt("proteinTarget") ?? 0, forKey: "proteinTarget")
        d.set(call.getInt("points") ?? 0, forKey: "points")
        d.set(call.getInt("workoutsWeek") ?? 0, forKey: "workoutsWeek")
        d.set(call.getInt("streakRun") ?? 0, forKey: "streakRun")
        d.set(call.getString("streakLastDay") ?? "", forKey: "streakLastDay")
        d.set(call.getInt("streakBest") ?? 0, forKey: "streakBest")
        d.set(call.getInt("energyToday") ?? 0, forKey: "energyToday")
        d.set((call.getArray("checkinDays") ?? []).compactMap { $0 as? String }, forKey: "checkinDays")
        // Plus (left out while the app doesn't know yet — the widgets keep what they were last told)
        if let plus = call.getBool("plus") { d.set(plus, forKey: "plus") }
        // the Plus widgets' settings (src/lib/widgets.ts flattenPrefs)
        for key in ["statsMetrics", "statsTheme", "quickActions", "quickTheme", "quickHaptic", "checkinTheme", "checkinHaptic"] {
            if let value = call.getString(key) { d.set(value, forKey: key) }
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    /// Drinks added with a widget's + (KinetixFitWidgets: AddGlassIntent / AddBottleIntent) since the last call: times
    /// (ms) and amounts (ml; older entries were bare times = one 250 ml glass). The app adds them to its own log.
    @objc func takeGlasses(_ call: CAPPluginCall) {
        let d = UserDefaults(suiteName: Self.appGroup)
        var times: [Double] = [], mls: [Int] = []
        for item in d?.array(forKey: "waterPending") ?? [] {
            if let pair = item as? [Double], pair.count >= 2 { times.append(pair[0]); mls.append(Int(pair[1])) }
            else if let t = item as? Double { times.append(t); mls.append(250) }
        }
        d?.removeObject(forKey: "waterPending")
        call.resolve(["times": times, "mls": mls])
    }

    /// Check-ins made on the Check-in widget since the last call: { items: [{ at, energy }] }.
    @objc func takeCheckIns(_ call: CAPPluginCall) {
        call.resolve(["items": WidgetStore.takePendingCheckIns().map { ["at": $0.t, "energy": $0.energy] as [String: Any] }])
    }

    /// Workouts logged with a Quick log button since the last call: { items: [{ at, type, minutes }] }.
    @objc func takeWorkouts(_ call: CAPPluginCall) {
        call.resolve(["items": WidgetStore.takePendingWorkouts().map { ["at": $0.t, "type": $0.type, "minutes": $0.minutes] as [String: Any] }])
    }

    /// Widget kinds (KinetixFitWidgets.swift) → the app's names for them (src/lib/widgets.ts WIDGETS).
    static let kinds = [
        "HydrationWidget": "hydration", "WaterLevelWidget": "waterLevel", "WaterRingWidget": "waterRing",
        "WaterQuickWidget": "waterQuick", "WaterWeekWidget": "waterWeek", "DailyRingsWidget": "rings", "StepsWidget": "steps",
        "TodayWidget": "today", "ScanWidget": "scan", "GlassWidget": "glass", "StreakWidget": "streak",
        "CheckInWidget": "checkin", "QuickLogWidget": "quick", "StatsWidget": "stats",
    ]

    /// { kinds } — the Kinetix Fit widgets on the home and lock screens now.
    @objc func installed(_ call: CAPPluginCall) {
        WidgetCenter.shared.getCurrentConfigurations { result in
            let kinds = Set(((try? result.get()) ?? []).compactMap { Self.kinds[$0.kind] })
            call.resolve(["kinds": Array(kinds)])
        }
    }

    /// iOS has no way for an app to place a widget: the app shows how to add one instead.
    @objc func pin(_ call: CAPPluginCall) {
        call.resolve(["supported": false, "requested": false])
    }

    #if DEBUG
    /// Debug builds only: renders every widget to a PNG (App/WidgetGallery.swift). { ml?: number, plus?: boolean } sets
    /// today's water and whether the Plus widgets are unlocked, for the render.
    @objc func renderGallery(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do { call.resolve(["path": try WidgetGallery.render(ml: call.getInt("ml"), plus: call.getBool("plus"))]) }
            catch { call.reject("\(error)") }
        }
    }
    #endif
}
