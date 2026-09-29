import SwiftUI
import WidgetKit

// The widget definitions (names, sizes, timeline). How each one looks is in WidgetViews.swift — the same set as
// Android: Water bottle, Water level, Water ring, Water quick add, Water this week, Daily rings, Steps, Kinetix Fit
// today, Quick scan, Water glass, Streak, and the Plus widgets Check-in, Quick log and My stats. Numbers come from the app through the App Group (WidgetStore.swift);
// taps open kinetixfit:// links (src/App.tsx) and the + buttons run App Intents (iOS 17+).

@main
struct KinetixFitWidgets: WidgetBundle {
    var body: some Widget {
        HydrationWidget()
        WaterLevelWidget()
        WaterRingWidget()
        WaterQuickWidget()
        WaterWeekWidget()
        DailyRingsWidget()
        StepsWidget()
        TodayWidget()
        ScanWidget()
        MoreWidgets().body
    }
}

/// A bundle's body takes at most ten widgets, so the rest are here.
struct MoreWidgets: WidgetBundle {
    var body: some Widget {
        GlassWidget()
        StreakWidget()
        CheckInWidget()
        QuickLogWidget()
        StatsWidget()
    }
}

// MARK: - Timeline

struct KXEntry: TimelineEntry {
    let date: Date
    var store: WidgetStore { WidgetStore(now: date) }
}

/// The next-reminder line moves on and the numbers go stale at midnight, so the timeline redraws every 15 minutes
/// for six hours, plus exactly at each reminder and at midnight. The app also reloads it whenever its numbers change.
struct KXProvider: TimelineProvider {
    func placeholder(in context: Context) -> KXEntry { KXEntry(date: Date()) }

    func getSnapshot(in context: Context, completion: @escaping (KXEntry) -> Void) {
        completion(KXEntry(date: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<KXEntry>) -> Void) {
        let now = Date()
        let horizon = now.addingTimeInterval(6 * 3600)
        var dates = stride(from: 0.0, to: 6 * 3600, by: 15 * 60).map { now.addingTimeInterval($0) }
        dates += WidgetStore(now: now).reminderTimes.filter { $0 > now && $0 < horizon }
        if let midnight = Calendar.current.nextDate(after: now, matching: DateComponents(hour: 0, minute: 0), matchingPolicy: .nextTime),
           midnight < horizon {
            dates.append(midnight)
        }
        let entries = Array(Set(dates)).sorted().map { KXEntry(date: $0) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

/// Reads the size from the environment and hands it to the view (views take it as a parameter for the app's gallery).
struct Sized<Content: View>: View {
    @Environment(\.widgetFamily) private var family
    let content: (WidgetFamily) -> Content
    init(@ViewBuilder content: @escaping (WidgetFamily) -> Content) { self.content = content }
    var body: some View { content(family) }
}

private let hydrationLink = URL(string: "kinetixfit://hydration")
private let todayLink = URL(string: "kinetixfit://today")

// MARK: - Water bottle (+ lock screen)

struct HydrationWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HydrationWidget", provider: KXProvider()) { entry in
            Sized { family in
                let store = entry.store
                switch family {
                case .accessoryCircular:
                    Gauge(value: store.waterFill) { Image(systemName: "drop.fill") } currentValueLabel: {
                        Text(WidgetStore.shortAmount(store.mlToday)).font(.kxText(12, bold: true)).minimumScaleFactor(0.6)
                    }
                    .gaugeStyle(.accessoryCircular).accessoryCard(plate: true).widgetURL(hydrationLink)
                case .accessoryRectangular:
                    VStack(alignment: .leading, spacing: 1) {
                        Label("Water", systemImage: "drop.fill").font(.kxText(12, bold: true)).widgetAccentable()
                        Text(WidgetStore.amount(store.mlToday)).font(.kxDisplay(20)).minimumScaleFactor(0.6).lineLimit(1)
                        Text("of " + WidgetStore.amount(store.waterGoalMl)).font(.kxText(12)).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).accessoryCard(plate: false).widgetURL(hydrationLink)
                case .accessoryInline:
                    Label("Water " + WidgetStore.amount(store.mlToday), systemImage: "drop.fill").widgetURL(hydrationLink)
                default:
                    WaterBottleView(store: store, family: family).widgetCard(CardBackground()).widgetURL(hydrationLink)
                }
            }
        }
        .configurationDisplayName("Water bottle")
        .description("A bottle that fills up with today's water, with a button to add a glass.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Water level

struct WaterLevelWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaterLevelWidget", provider: KXProvider()) { entry in
            Sized { family in
                WaterLevelView(store: entry.store, family: family).widgetCard(CardBackground()).widgetURL(hydrationLink)
            }
        }
        .contentMarginsDisabled()
        .configurationDisplayName("Water level")
        .description("The whole widget fills with water as you drink — tap + to add a glass.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Water ring

struct WaterRingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaterRingWidget", provider: KXProvider()) { entry in
            Sized { family in
                if family == .accessoryCircular {
                    Gauge(value: entry.store.waterFill) { Image(systemName: "drop.fill") } currentValueLabel: {
                        Text("\(Int((entry.store.waterFill * 100).rounded()))%").font(.kxText(12, bold: true))
                    }
                    .gaugeStyle(.accessoryCircularCapacity).accessoryCard(plate: true).widgetURL(hydrationLink)
                } else {
                    WaterRingView(store: entry.store, family: family).widgetCard(CardBackground()).widgetURL(hydrationLink)
                }
            }
        }
        .configurationDisplayName("Water ring")
        .description("A glowing ring towards today's water goal.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
    }
}

// MARK: - Water quick add

struct WaterQuickWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaterQuickWidget", provider: KXProvider()) { entry in
            Sized { family in
                WaterQuickView(store: entry.store, family: family).widgetCard(CardBackground()).widgetURL(hydrationLink)
            }
        }
        .configurationDisplayName("Water quick add")
        .description("Add a glass or a bottle in one tap, with today's progress.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Water this week

struct WaterWeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaterWeekWidget", provider: KXProvider()) { entry in
            Sized { family in
                WaterWeekView(store: entry.store, family: family).widgetCard(CardBackground()).widgetURL(hydrationLink)
            }
        }
        .configurationDisplayName("Water this week")
        .description("Today's water beside the last seven days and your goal.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Daily rings

struct DailyRingsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "DailyRingsWidget", provider: KXProvider()) { entry in
            Sized { family in
                DailyRingsView(store: entry.store, family: family).widgetCard(CardBackground()).widgetURL(todayLink)
            }
        }
        .configurationDisplayName("Daily rings")
        .description("Steps, water and food as three rings towards today's goals.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Steps (+ lock screen)

struct StepsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StepsWidget", provider: KXProvider()) { entry in
            Sized { family in
                switch family {
                case .accessoryCircular:
                    StepsView(store: entry.store, family: family).accessoryCard(plate: true).widgetURL(todayLink)
                case .accessoryRectangular:
                    StepsView(store: entry.store, family: family).accessoryCard(plate: false).widgetURL(todayLink)
                default:
                    StepsView(store: entry.store, family: family).widgetCard(CardBackground()).widgetURL(todayLink)
                }
            }
        }
        .configurationDisplayName("Steps")
        .description("Today's steps in a ring towards your goal.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

// MARK: - KinetixFit today

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TodayWidget", provider: KXProvider()) { entry in
            TodayView(store: entry.store).widgetCard(CardBackground()).widgetURL(todayLink)
        }
        .configurationDisplayName("Kinetix Fit today")
        .description("Steps, calories left, quests and today's water.")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - Quick scan

struct ScanWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ScanWidget", provider: KXProvider()) { _ in
            ScanView().widgetCard(CardBackground())
        }
        .configurationDisplayName("Quick scan")
        .description("Snap a meal or scan a barcode straight from your home screen.")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - Water glass (kind "GlassWidget" kept, so placed widgets stay)

struct GlassWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GlassWidget", provider: KXProvider()) { entry in
            Sized { family in
                GlassView(store: entry.store, family: family).widgetCard(LiquidGlassBackground()).widgetURL(hydrationLink)
            }
        }
        .configurationDisplayName("Water glass")
        .description("A glass that fills up with today's water on a frosted-glass card, with a button to add a glass.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Streak (free) and the Plus widgets (a locked card that opens Plus in the app without it)

private let checkInLink = URL(string: "kinetixfit://checkin")
private let plusLink = URL(string: "kinetixfit://plus")

struct StreakWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StreakWidget", provider: KXProvider()) { entry in
            Sized { family in
                StreakView(store: entry.store, family: family).widgetCard(CardBackground()).widgetURL(checkInLink)
            }
        }
        .configurationDisplayName("Streak")
        .description("Your check-in streak and the last seven days.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct CheckInWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "CheckInWidget", provider: KXProvider()) { entry in
            Sized { family in
                CheckInView(store: entry.store, family: family).widgetCard(CardBackground())
                    .widgetURL(entry.store.plus ? checkInLink : plusLink)
            }
        }
        .configurationDisplayName("Check-in")
        .description("Tap how your energy is and you're checked in. Kinetix Fit Plus.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct QuickLogWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "QuickLogWidget", provider: KXProvider()) { entry in
            Sized { family in
                QuickLogView(store: entry.store, family: family).widgetCard(CardBackground())
                    .widgetURL(entry.store.plus ? todayLink : plusLink)
            }
        }
        .configurationDisplayName("Quick log")
        .description("Up to four buttons you choose in the app — a glass, a bottle, your usual workout. Kinetix Fit Plus.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct StatsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "StatsWidget", provider: KXProvider()) { entry in
            Sized { family in
                StatsView(store: entry.store, family: family).widgetCard(CardBackground())
                    .widgetURL(entry.store.plus ? todayLink : plusLink)
            }
        }
        .configurationDisplayName("My stats")
        .description("The two to four numbers you pick in the app, in your colour. Kinetix Fit Plus.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
