import Foundation

/// What the home-screen widgets show, saved by the app (App/WidgetBridgePlugin.swift) in the App Group so the
/// widgets work while the app is closed. The next water reminder is worked out here from the schedule, so it stays
/// right between app opens. Drinks added with a widget's + wait in "waterPending" (as [time, ml]), check-ins from the
/// Check-in widget in "checkinPending" ([time, energy]) and workouts from Quick log in "workoutPending", until the app
/// takes them (WidgetBridgePlugin.takeGlasses / takeCheckIns / takeWorkouts). Port of Android's WidgetStore.java.
struct WidgetStore {
    static let appGroup = "group.com.jnglobalventures.kinetixfit"

    let defaults = UserDefaults(suiteName: WidgetStore.appGroup) ?? .standard
    let now: Date

    /// Whether the app has ever handed the widgets any numbers.
    var hasData: Bool { defaults.object(forKey: "hydrationEnabled") != nil }

    /// The numbers are from the last time the app was open today; after midnight they'd be yesterday's.
    var fresh: Bool { defaults.string(forKey: "day") == Self.dayKey(now) }

    var steps: Int? { fresh ? defaults.object(forKey: "steps") as? Int : nil }
    var stepsGoal: Int { max(1, defaults.object(forKey: "stepsGoal") as? Int ?? 10000) }
    var kcalLeft: Int? { fresh ? defaults.object(forKey: "kcalLeft") as? Int : nil }
    var questsDone: Int { defaults.integer(forKey: "questsDone") }
    var questsTotal: Int { defaults.object(forKey: "questsTotal") as? Int ?? 3 }
    var updatedAt: Date? {
        let ms = defaults.double(forKey: "updatedAt")
        return fresh && ms > 0 ? Date(timeIntervalSince1970: ms / 1000) : nil
    }

    var kcalEaten: Int { fresh ? defaults.integer(forKey: "kcalEaten") : 0 }
    var kcalTarget: Int { defaults.integer(forKey: "kcalTarget") }

    // MARK: Water, in ml (src/lib/water.ts): the person's glass size, a goal amount, drinks with their amounts

    /// A drink added on a widget and not yet taken by the app: time (ms) and ml.
    struct Drink { let t: Double; let ml: Int }

    /// Stored as [[time, ml], …]; older builds stored bare times (one 250 ml glass each).
    var pendingDrinks: [Drink] {
        (defaults.array(forKey: "waterPending") ?? []).compactMap { item in
            if let pair = item as? [Double], pair.count >= 2 { return Drink(t: pair[0], ml: Int(pair[1])) }
            if let t = item as? Double { return Drink(t: t, ml: 250) }
            return nil
        }
    }

    private func isToday(_ ms: Double) -> Bool { Calendar.current.isDate(Date(timeIntervalSince1970: ms / 1000), inSameDayAs: now) }
    private var waterFromToday: Bool { defaults.string(forKey: "waterDay") == Self.dayKey(now) }

    /// Water today in ml: the app's total (if it's from today) plus drinks added on a widget since. An older app
    /// build only sent glasses: those count as 250 ml.
    var mlToday: Int {
        let fromApp = !waterFromToday ? 0
            : defaults.object(forKey: "waterMl") != nil ? defaults.integer(forKey: "waterMl") : defaults.integer(forKey: "waterGlasses") * 250
        return fromApp + pendingDrinks.filter { isToday($0.t) }.reduce(0) { $0 + $1.ml }
    }
    var waterGoalMl: Int {
        max(250, defaults.object(forKey: "waterGoalMl") as? Int ?? (defaults.object(forKey: "waterGoal") as? Int ?? 8) * 250)
    }
    /// The person's glass size (50–500 ml), set on the app's Hydration page.
    var glassMl: Int { max(50, defaults.object(forKey: "glassMl") as? Int ?? 250) }
    /// The bottle button: 500 ml, or 1 L when the glass itself is 500 ml.
    var bottleMl: Int { glassMl >= 500 ? 1000 : 500 }
    var waterFill: Double { min(1, Double(mlToday) / Double(waterGoalMl)) }

    /// ml for the last 7 days, oldest first, today last. The app saves the week on each open; days since then shift in empty.
    var waterWeek: [Int] {
        let saved = defaults.array(forKey: "waterWeek") as? [Int] ?? []
        var shift = 7
        if let key = defaults.string(forKey: "day"), let then = Self.date(fromKey: key) {
            shift = min(7, max(0, Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: then),
                                                                    to: Calendar.current.startOfDay(for: now)).day ?? 7))
        }
        var out = [Int](repeating: 0, count: 7)
        for i in 0..<7 {
            let from = i + shift - (7 - saved.count)
            if from >= 0 && from < saved.count { out[i] = saved[from] }
        }
        out[6] = mlToday
        return out
    }

    /// Adds a drink of `ml` from a widget button, 1 ms after any other: the app removes a drink by its time.
    static func addPendingDrink(ml: Int) {
        guard let d = UserDefaults(suiteName: appGroup) else { return }
        let list = d.array(forKey: "waterPending") ?? []
        let last = list.compactMap { ($0 as? [Double])?.first ?? ($0 as? Double) }.max() ?? 0
        let t = max(Date().timeIntervalSince1970 * 1000, last + 1)
        d.set(list + [[t, Double(ml)]], forKey: "waterPending")
    }

    // MARK: KinetixFit Plus + the Plus widgets' settings (the app writes them; src/lib/widgets.ts WidgetPrefs)

    /// Whether the app last said this person has Plus (false until it knows).
    var plus: Bool { defaults.bool(forKey: "plus") }

    var protein: Int { fresh ? defaults.integer(forKey: "protein") : 0 }
    var proteinTarget: Int { defaults.integer(forKey: "proteinTarget") }
    var points: Int { defaults.integer(forKey: "points") }
    var workoutsWeek: Int { defaults.integer(forKey: "workoutsWeek") }

    /// My stats: the two to four numbers chosen in the app, in order.
    var statsMetrics: [String] {
        var out: [String] = []
        for m in (defaults.string(forKey: "statsMetrics") ?? "").split(separator: ",").map(String.init) where out.count < 4 && !out.contains(m) {
            out.append(m)
        }
        return out.count >= 2 ? out : ["steps", "water", "kcalLeft", "streak"]
    }

    /// One Quick log button: a drink of `ml`, or a workout of `type` for `minutes`; `label` is what the button says.
    struct QuickAction { let water: Bool; let ml: Int; let type: String; let minutes: Int; let label: String }

    /// The Quick log buttons (1–4); the default three before the app has sent any.
    var quickActions: [QuickAction] {
        var out: [QuickAction] = []
        if let data = defaults.string(forKey: "quickActions")?.data(using: .utf8),
           let list = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] {
            for a in list where out.count < 4 {
                if a["k"] as? String == "water", let ml = (a["ml"] as? NSNumber)?.intValue, (50...1000).contains(ml) {
                    out.append(QuickAction(water: true, ml: ml, type: "", minutes: 0, label: Self.amount(ml)))
                } else if a["k"] as? String == "workout", let type = (a["t"] as? String)?.trimmingCharacters(in: .whitespaces), !type.isEmpty,
                          let minutes = (a["m"] as? NSNumber)?.intValue, (1...600).contains(minutes) {
                    out.append(QuickAction(water: false, ml: 0, type: type, minutes: minutes, label: "\(type) \(minutes)"))
                }
            }
        }
        return out.isEmpty ? [QuickAction(water: true, ml: 250, type: "", minutes: 0, label: "250 ml"),
                              QuickAction(water: true, ml: 500, type: "", minutes: 0, label: "500 ml"),
                              QuickAction(water: false, ml: 0, type: "Walk", minutes: 30, label: "Walk 30")] : out
    }

    /// Quick log's last line: what was logged last, today.
    var lastLoggedLine: String {
        let at = defaults.double(forKey: "lastLoggedAt")
        guard at > 0, isToday(at), let what = defaults.string(forKey: "lastLogged") else { return "Tap a button to log it" }
        return "Logged \(what) · " + Self.clock(Date(timeIntervalSince1970: at / 1000))
    }

    /// A workout logged with a Quick log button, not yet taken by the app.
    struct PendingWorkout { let t: Double; let type: String; let minutes: Int }

    static func addPendingWorkout(type: String, minutes: Int) {
        guard let d = UserDefaults(suiteName: appGroup) else { return }
        let item: [String: Any] = ["at": Date().timeIntervalSince1970 * 1000, "type": type, "minutes": minutes]
        d.set((d.array(forKey: "workoutPending") ?? []) + [item], forKey: "workoutPending")
        noteLogged("\(type) \(minutes) min")
    }

    static func takePendingWorkouts() -> [PendingWorkout] {
        guard let d = UserDefaults(suiteName: appGroup) else { return [] }
        let out = (d.array(forKey: "workoutPending") ?? []).compactMap { item -> PendingWorkout? in
            guard let w = item as? [String: Any], let t = (w["at"] as? NSNumber)?.doubleValue, let type = w["type"] as? String,
                  let minutes = (w["minutes"] as? NSNumber)?.intValue else { return nil }
            return PendingWorkout(t: t, type: type, minutes: minutes)
        }
        d.removeObject(forKey: "workoutPending")
        return out
    }

    /// Remembers what a Quick log button logged, for its "Logged … · 14:05" line.
    static func noteLogged(_ what: String) {
        guard let d = UserDefaults(suiteName: appGroup) else { return }
        d.set(what, forKey: "lastLogged")
        d.set(Date().timeIntervalSince1970 * 1000, forKey: "lastLoggedAt")
    }

    // MARK: The check-in streak (same rules as src/lib/streak.ts and WidgetStore.java)

    /// A check-in made on the Check-in widget and not yet taken by the app.
    struct PendingCheckIn { let t: Double; let energy: Int }

    var pendingCheckIns: [PendingCheckIn] {
        (defaults.array(forKey: "checkinPending") ?? []).compactMap { item in
            guard let pair = item as? [Double], pair.count >= 2 else { return nil }
            return PendingCheckIn(t: pair[0], energy: Int(pair[1]))
        }
    }

    /// Days with a check-in: the app's last 14 days plus any made on the widget since.
    var checkInDays: Set<String> {
        var days = Set(defaults.stringArray(forKey: "checkinDays") ?? [])
        for c in pendingCheckIns { days.insert(Self.dayKey(Date(timeIntervalSince1970: c.t / 1000))) }
        return days
    }

    /// Today's energy (1–5) if checked in today — on the widget or in the app — else 0.
    var energyToday: Int {
        if let c = pendingCheckIns.first(where: { isToday($0.t) }) { return c.energy }
        return fresh ? defaults.integer(forKey: "energyToday") : 0
    }

    struct Streak {
        /// days in a row ending today (if checked in) or yesterday; 0 once broken
        var current = 0
        var today = false
        var best = 0
        /// the last 7 days, oldest first, today last
        var week = [Bool](repeating: false, count: 7)
    }

    /// The streak now. The app sends the run of days ending on the last day it saw a check-in (streakRun,
    /// streakLastDay); days since then come from checkInDays, so a widget check-in extends it and a missed day breaks
    /// it without the app being opened.
    var streak: Streak {
        let days = checkInDays
        let last = defaults.string(forKey: "streakLastDay") ?? ""
        let run = defaults.integer(forKey: "streakRun")
        let cal = Calendar.current
        var s = Streak()
        s.today = days.contains(Self.dayKey(now))
        var d = s.today ? now : cal.date(byAdding: .day, value: -1, to: now) ?? now
        var n = 0
        for _ in 0..<400 {
            let k = Self.dayKey(d)
            if k == last && run > 0 { n += run; break }
            if !days.contains(k) { break }
            n += 1
            d = cal.date(byAdding: .day, value: -1, to: d) ?? d
        }
        s.current = n
        s.best = max(defaults.integer(forKey: "streakBest"), n)
        s.week = (0..<7).map { i in days.contains(Self.dayKey(cal.date(byAdding: .day, value: i - 6, to: now) ?? now)) }
        return s
    }

    /// A check-in tapped on the widget. False (nothing saved) without Plus, or when today already has one.
    @discardableResult static func addPendingCheckIn(energy: Int) -> Bool {
        let store = WidgetStore(now: Date())
        guard store.plus, !store.checkInDays.contains(dayKey(store.now)) else { return false }
        let item = [store.now.timeIntervalSince1970 * 1000, Double(max(1, min(5, energy)))]
        store.defaults.set((store.defaults.array(forKey: "checkinPending") ?? []) + [item], forKey: "checkinPending")
        return true
    }

    static func takePendingCheckIns() -> [PendingCheckIn] {
        let store = WidgetStore(now: Date())
        let out = store.pendingCheckIns
        store.defaults.removeObject(forKey: "checkinPending")
        return out
    }

    static func date(fromKey key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    /// "750 ml", "2 L", "1.25 L" — same as src/lib/water.ts waterAmount().
    static func amount(_ ml: Int) -> String {
        if ml < 1000 { return "\(ml) ml" }
        var l = String(format: "%.2f", Double(ml) / 1000)
        while l.hasSuffix("0") { l.removeLast() }
        if l.hasSuffix(".") { l.removeLast() }
        return l + " L"
    }

    /// Short bar label: "750", "1.2".
    static func shortAmount(_ ml: Int) -> String {
        ml < 1000 ? "\(ml)" : String(format: "%.1f", Double(ml) / 1000).replacingOccurrences(of: ".0", with: "")
    }

    /// The next water reminder.
    struct Hydration {
        var enabled = false
        /// Between reminder windows, after one that ended today.
        var doneForToday = false
        /// Next reminder to show, including a "Remind me in 30 min" snooze.
        var next: Date?
        /// Next scheduled reminder, ignoring any snooze.
        var nextScheduled: Date?
    }

    /// Yesterday's, today's and tomorrow's reminder windows. Same logic as hydrationWindow() in
    /// src/lib/notifications.ts: an end before the start is an overnight window that runs on past midnight.
    var windows: [[Date]] {
        let start = defaults.object(forKey: "startHour") as? Int ?? 9
        let end = defaults.object(forKey: "endHour") as? Int ?? 17
        let every = max(1, defaults.object(forKey: "intervalHours") as? Int ?? 2)
        let hours = Array(stride(from: start, through: end < start ? end + 24 : end, by: every))
        let midnight = Calendar.current.startOfDay(for: now)
        return (-1...1).map { d in
            hours.compactMap { h in
                Calendar.current.date(byAdding: .day, value: d + h / 24, to: midnight)
                    .flatMap { Calendar.current.date(bySettingHour: h % 24, minute: 0, second: 0, of: $0) }
            }
        }
    }

    var hydration: Hydration {
        var h = Hydration()
        h.enabled = defaults.bool(forKey: "hydrationEnabled")
        let windows = self.windows
        let all = windows.flatMap { $0 }
        let prev = all.filter { $0 <= now }.max()
        h.nextScheduled = all.filter { $0 > now }.min()
        let running = windows.first { w in w.first.map { $0 <= now } == true && w.last.map { now <= $0 } == true }
        let done = running == nil && prev.map { Calendar.current.isDate($0, inSameDayAs: now) } == true

        h.next = h.nextScheduled
        let snoozeMs = defaults.double(forKey: "snoozedUntil")
        let snooze = Date(timeIntervalSince1970: snoozeMs / 1000)
        let snoozeFirst = snoozeMs > 0 && snooze > now && h.next.map { snooze < $0 } ?? true
        if snoozeFirst { h.next = snooze }
        h.doneForToday = h.enabled && done && !snoozeFirst
        return h
    }

    /// Every reminder time around now, so the timeline can redraw the next-reminder line right then.
    var reminderTimes: [Date] { windows.flatMap { $0 } }

    static func dayKey(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static func clock(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    static func until(_ date: Date, from now: Date) -> String {
        let min = max(1, Int((date.timeIntervalSince(now) / 60).rounded()))
        if min < 60 { return "in \(min) min" }
        let h = min / 60, m = min % 60
        return m == 0 ? "in \(h) h" : "in \(h) h \(m) min"
    }

    static func number(_ n: Int) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "en_GB")
        return f.string(from: NSNumber(value: n)) ?? "\(n)"
    }
}
