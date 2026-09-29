import AppIntents
import SwiftUI
import WidgetKit

// Every KinetixFit widget's look, the iOS twins of the Android widgets (android/.../res/layout/widget_*.xml): solid
// cards (white → pale aqua / deep ink), a header chip + small-caps label, Archivo numbers, glossy water buttons,
// gradient rings, bars in tracks — plus the Water glass widget on a frosted card. Views take their `family` as a parameter (not
// only from the environment) so the debug gallery in the app (App/WidgetGallery.swift) can render any size. This file
// is in both the widget extension and, for that gallery, the app. KinetixFitWidgets.swift has the widget definitions.

// MARK: - Tokens (android/.../res/values*/widget_glass_colors.xml)

extension Color {
    static func kx(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(rgb: dark) : UIColor(rgb: light) })
    }
    init(rgb: UInt32, alpha: Double = 1) { self.init(UIColor(rgb: rgb).withAlphaComponent(alpha)) }

    static let kxInk = kx(0x0E1A22, 0xF4F8FA)
    static let kxInk2 = kx(0x4E5E67, 0xAAB8C0)
    static let kxInk3 = kx(0x7A8A93, 0x7F8E97)
    static let kxWater = kx(0x0C8FB5, 0x5AD8EE)
    static let kxCardTop = kx(0xFFFFFF, 0x1C262D)
    static let kxCardBottom = kx(0xEDF5F8, 0x10171C)
    static let kxEdge = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor.white.withAlphaComponent(0.15) : UIColor(rgb: 0xDDE7EB) })
    static let kxChip = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(rgb: 0x4FD1E8).withAlphaComponent(0.17) : UIColor(rgb: 0x1BA3C6).withAlphaComponent(0.10) })
    static let kxTrack = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor.white.withAlphaComponent(0.12) : UIColor(rgb: 0x0E1A22).withAlphaComponent(0.08) })
    static let kxAccent = Color(rgb: 0xFF6A3D)
    static let kxStepsBlue = Color(rgb: 0x5B8CFF)
    static let kxFood = Color(rgb: 0xFF7A45)
    static let kxRingWater = Color(rgb: 0x2FC6E4)
    static let kxWaterBright = Color(rgb: 0x62DDF1)
    static let kxWaterDeep = Color(rgb: 0x1190B5)
    /// the streak's flame orange, and "done" green (kx_streak / kx_good on Android)
    static let kxFlame = kx(0xF0602F, 0xFF8A5E)
    static let kxGood = kx(0x1FA870, 0x3CC98A)
}

extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(red: CGFloat((rgb >> 16) & 0xFF) / 255, green: CGFloat((rgb >> 8) & 0xFF) / 255,
                  blue: CGFloat(rgb & 0xFF) / 255, alpha: 1)
    }
}

extension Font {
    /// Archivo, wide cut, extra bold — the app's display face, for numbers and headlines only.
    static func kxDisplay(_ size: CGFloat) -> Font { .custom("KXArchivoExpanded-ExtraBold", fixedSize: size) }
    static func kxText(_ size: CGFloat, bold: Bool = false) -> Font {
        .custom(bold ? "KXHankenGrotesk-Bold" : "KXHankenGrotesk-Medium", fixedSize: size)
    }
}

extension View {
    /// iOS 17 draws the widget background itself (and pads the content); iOS 16 needs both done by hand.
    @ViewBuilder func widgetCard<Background: View>(_ background: Background) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(for: .widget) { background }
        } else {
            padding(16).background(background)
        }
    }

    /// Lock-screen widgets: the system's translucent plate behind circular ones, nothing behind the rest.
    @ViewBuilder func accessoryCard(plate: Bool) -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(for: .widget) { if plate { AccessoryWidgetBackground() } }
        } else if plate {
            background(AccessoryWidgetBackground())
        } else {
            self
        }
    }
}

// MARK: - Buttons (iOS 17 widgets run App Intents; the app picks the drinks up next open — no haptics: iOS doesn't let
// widgets play them)

/// + on the water widgets: one glass of the person's own size.
struct AddGlassIntent: AppIntent {
    static var title: LocalizedStringResource = "Add a glass of water"
    static var description = IntentDescription("Logs a glass of water (your glass size) in Kinetix Fit.")
    func perform() async throws -> some IntentResult {
        WidgetStore.addPendingDrink(ml: WidgetStore(now: Date()).glassMl)
        return .result()
    }
}

/// Water quick add's second button: a 500 ml bottle (1 L when the glass is 500 ml).
struct AddBottleIntent: AppIntent {
    static var title: LocalizedStringResource = "Add a bottle of water"
    static var description = IntentDescription("Logs a bottle of water in Kinetix Fit.")
    func perform() async throws -> some IntentResult {
        WidgetStore.addPendingDrink(ml: WidgetStore(now: Date()).bottleMl)
        return .result()
    }
}

/// A button that runs `intent` on iOS 17+ and falls back to plain content (the widget's own link) on iOS 16.
struct IntentButton<Label: View, I: AppIntent>: View {
    let intent: I
    @ViewBuilder let label: () -> Label
    var body: some View {
        if #available(iOS 17.0, *) {
            Button(intent: intent) { label() }.buttonStyle(.plain)
        } else {
            label()
        }
    }
}

// MARK: - Shared pieces

/// Solid card: white fading to a whisper of aqua (deep ink in dark), a soft water glow top-left, a crisp edge.
struct CardBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(colors: [.kxCardTop, .kxCardBottom], startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [Color.kxWater.opacity(0.18), .clear], center: .topLeading, startRadius: 0, endRadius: 190)
            ContainerRelativeShape().strokeBorder(Color.kxEdge, lineWidth: 1)
        }
    }
}

struct Header: View {
    let symbol: String
    let label: String
    var tint: Color = .kxWater
    var ink: Color = .kxInk2
    var chip: Color = .kxChip
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: symbol).font(.system(size: 11, weight: .bold)).foregroundStyle(tint)
                .frame(width: 24, height: 24).background(Circle().fill(chip))
            Text(label).font(.kxText(11, bold: true)).kerning(1.3).foregroundStyle(ink).lineLimit(1)
        }
    }
}

/// "750 ml" / "1.25 L": the number in the display face, the unit smaller on the same baseline.
struct AmountText: View {
    let ml: Int
    let size: CGFloat
    var color: Color = .kxInk
    var body: some View {
        let parts = WidgetStore.amount(ml).split(separator: " ")
        HStack(alignment: .firstTextBaseline, spacing: size * 0.12) {
            Text(String(parts.first ?? "")).font(.kxDisplay(size))
            Text(String(parts.count > 1 ? parts[1] : "")).font(.kxText(size * 0.42, bold: true))
        }
        .foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.5).widgetAccentable()
    }
}

struct StatusPill: View {
    let text: String
    var body: some View {
        Text(text).font(.kxText(11, bold: true)).foregroundStyle(Color.kxWater)
            .padding(.horizontal, 9).padding(.vertical, 3).background(Capsule().fill(Color.kxChip)).lineLimit(1)
    }
}

/// Glossy water button: one gradient, lighter at the top, a hairline edge.
struct GlossyFill: View {
    var shape: AnyShape = AnyShape(Capsule())
    var body: some View {
        shape.fill(LinearGradient(colors: [.kxWaterBright, .kxWaterDeep], startPoint: .top, endPoint: .bottom))
            .overlay(shape.stroke(Color.white.opacity(0.25), lineWidth: 1))
    }
}

struct RoundPlus: View {
    var size: CGFloat = 46
    var white = false
    var body: some View {
        Image(systemName: "plus").font(.system(size: size * 0.42, weight: .bold))
            .foregroundStyle(white ? Color.kxWaterDeep : .white)
            .frame(width: size, height: size)
            .background {
                if white {
                    Circle().fill(LinearGradient(colors: [.white, Color(rgb: 0xEAF6FA)], startPoint: .top, endPoint: .bottom))
                        .overlay(Circle().stroke(Color.white.opacity(0.5), lineWidth: 1))
                } else {
                    GlossyFill(shape: AnyShape(Circle()))
                }
            }
            .accessibilityLabel("Add a glass of water")
    }
}

/// A gradient ring with a soft glow and a bright cap at its end.
struct GradientRing: View {
    let value: Double
    var line: CGFloat = 12
    var from: Color = Color(rgb: 0x8BEBF8)
    var to: Color = Color(rgb: 0x0E97C0)
    var body: some View {
        let v = min(1, max(0, value))
        ZStack {
            Circle().stroke(Color.kxTrack, lineWidth: line)
            if v > 0 {
                Circle().trim(from: 0, to: v)
                    .stroke(AngularGradient(colors: [from, to], center: .center, startAngle: .degrees(0), endAngle: .degrees(360 * max(0.08, v))),
                            style: StrokeStyle(lineWidth: line, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .shadow(color: to.opacity(0.45), radius: 4)
                GeometryReader { g in
                    let r = min(g.size.width, g.size.height) / 2
                    let a = Angle.degrees(360 * v - 90).radians
                    Circle().fill(Color.white.opacity(0.92)).frame(width: line * 0.44, height: line * 0.44)
                        .position(x: g.size.width / 2 + r * cos(a), y: g.size.height / 2 + r * sin(a))
                }
            }
        }
        .padding(line / 2)
    }
}

struct GlowBar: View {
    let value: Double
    var height: CGFloat = 7
    var from: Color = Color(rgb: 0x7BE8F7)
    var to: Color = Color(rgb: 0x0E97C0)
    var track: Color = .kxTrack
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                if value > 0 {
                    Capsule().fill(LinearGradient(colors: [from, to], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(height, g.size.width * min(1, value)))
                        .shadow(color: to.opacity(0.5), radius: 3)
                }
            }
        }
        .frame(height: height)
    }
}

/// Seven days as bars inside full-height tracks, today last in the bright gradient with its amount above, goal days
/// solid, the rest soft; a dashed goal line; day letters underneath.
struct TrackBars: View {
    let values: [Int]
    let goal: Int
    var body: some View {
        let letters = WeekLetters.last7
        let maxV = max(goal, values.max() ?? 0, 1)
        GeometryReader { g in
            let labelH: CGFloat = 16, top: CGFloat = 14
            let chartH = g.size.height - labelH - top
            let slot = g.size.width / CGFloat(values.count)
            let barW = min(slot * 0.5, 18)
            ZStack(alignment: .topLeading) {
                ForEach(values.indices, id: \.self) { i in
                    let today = i == values.count - 1
                    let v = values[i]
                    let h = v > 0 ? max(barW, chartH * CGFloat(min(1, Double(v) / Double(maxV)))) : 0
                    let x = slot * CGFloat(i) + slot / 2
                    Capsule().fill(Color.kxTrack).frame(width: barW, height: chartH).position(x: x, y: top + chartH / 2)
                    if v > 0 {
                        Capsule()
                            .fill(today || v >= goal
                                  ? AnyShapeStyle(LinearGradient(colors: [Color(rgb: 0x6BE3F4), Color(rgb: 0x0E86AB)], startPoint: .top, endPoint: .bottom))
                                  : AnyShapeStyle(Color.kxWater.opacity(0.45)))
                            .frame(width: barW, height: h).position(x: x, y: top + chartH - h / 2)
                        if today {
                            Text(WidgetStore.shortAmount(v)).font(.kxText(10, bold: true)).foregroundStyle(Color.kxWater)
                                .position(x: x, y: top + chartH - h - 7)
                        }
                    }
                    Text(letters[i]).font(.kxText(10, bold: today)).foregroundStyle(today ? Color.kxWater : .kxInk3)
                        .position(x: x, y: g.size.height - 6)
                }
                Path { p in
                    let y = top + chartH - chartH * CGFloat(min(1, Double(goal) / Double(maxV)))
                    p.move(to: CGPoint(x: 0, y: y)); p.addLine(to: CGPoint(x: g.size.width, y: y))
                }
                .stroke(Color.kxWater.opacity(0.7), style: StrokeStyle(lineWidth: 1.2, dash: [3, 4]))
            }
        }
    }
}

enum WeekLetters {
    static var last7: [String] {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_GB"); f.dateFormat = "EEEEE"
        return (0..<7).map { f.string(from: Calendar.current.date(byAdding: .day, value: $0 - 6, to: Date()) ?? Date()) }
    }
}

/// Rings inside each other, outermost first, each in its colour over a faint track of the same colour.
struct Rings: View {
    let values: [Double]
    let colors: [Color]
    var body: some View {
        GeometryReader { g in
            let size = min(g.size.width, g.size.height)
            let line = max(7, size * 0.105), gap = max(2, size * 0.02)
            ZStack {
                ForEach(values.indices, id: \.self) { i in
                    let inset = CGFloat(i) * (line + gap) + line / 2
                    let v = min(1, max(0, values[i]))
                    ZStack {
                        Circle().stroke(colors[i].opacity(0.2), lineWidth: line)
                        if v > 0 {
                            Circle().trim(from: 0, to: v)
                                .stroke(AngularGradient(colors: [colors[i].opacity(0.75), colors[i]], center: .center,
                                                        startAngle: .degrees(0), endAngle: .degrees(360 * max(0.08, v))),
                                        style: StrokeStyle(lineWidth: line, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                        }
                    }
                    .padding(inset)
                }
            }
            .frame(width: size, height: size)
            .position(x: g.size.width / 2, y: g.size.height / 2)
        }
    }
}

// MARK: - Bottle + water shapes

struct BottleShape: Shape {
    func path(in r: CGRect) -> Path {
        let w = r.width, h = r.height
        var p = Path()
        p.move(to: CGPoint(x: r.minX + w * 0.34, y: r.minY + h * 0.1))
        p.addLine(to: CGPoint(x: r.minX + w * 0.34, y: r.minY + h * 0.2))
        p.addQuadCurve(to: CGPoint(x: r.minX + w * 0.06, y: r.minY + h * 0.36), control: CGPoint(x: r.minX + w * 0.06, y: r.minY + h * 0.23))
        p.addLine(to: CGPoint(x: r.minX + w * 0.06, y: r.minY + h * 0.86))
        p.addQuadCurve(to: CGPoint(x: r.minX + w * 0.22, y: r.maxY), control: CGPoint(x: r.minX + w * 0.06, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX + w * 0.78, y: r.maxY))
        p.addQuadCurve(to: CGPoint(x: r.minX + w * 0.94, y: r.minY + h * 0.86), control: CGPoint(x: r.minX + w * 0.94, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX + w * 0.94, y: r.minY + h * 0.36))
        p.addQuadCurve(to: CGPoint(x: r.minX + w * 0.66, y: r.minY + h * 0.2), control: CGPoint(x: r.minX + w * 0.94, y: r.minY + h * 0.23))
        p.addLine(to: CGPoint(x: r.minX + w * 0.66, y: r.minY + h * 0.1))
        p.closeSubpath()
        return p
    }
}

/// Water up to `level` (0...1 of the height) with a wave; `phase` moves the wave between redraws.
struct WaveShape: Shape {
    var level: Double
    var phase: Double
    var amplitude: CGFloat = 3
    var cycles: Double = 1.1
    func path(in r: CGRect) -> Path {
        let top = r.maxY - r.height * min(1.02, level)
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX, y: top))
        for i in 0...40 {
            let x = r.minX + r.width * CGFloat(i) / 40
            p.addLine(to: CGPoint(x: x, y: top + amplitude * sin(phase + Double(i) / 40 * .pi * 2 * cycles)))
        }
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.closeSubpath()
        return p
    }
}

struct BottleArt: View {
    let fill: Double
    var phase: Double = 0
    var body: some View {
        GeometryReader { g in
            let r = CGRect(origin: .zero, size: g.size)
            ZStack(alignment: .top) {
                ZStack {
                    BottleShape().fill(Color.kxWater.opacity(0.10))
                    WaveShape(level: 0.12 + 0.78 * fill, phase: phase + 1.4, amplitude: min(3, r.height * 0.03)).fill(Color.kxWater.opacity(0.35))
                    WaveShape(level: 0.10 + 0.78 * fill, phase: phase, amplitude: min(3, r.height * 0.03))
                        .fill(LinearGradient(colors: [Color(rgb: 0x1BA3C6).opacity(0.85), Color(rgb: 0x0A6F8E)], startPoint: .top, endPoint: .bottom))
                }
                .clipShape(BottleShape())
                BottleShape().stroke(Color.kxWater.opacity(0.8), lineWidth: 1.6)
                Capsule().fill(Color.white.opacity(0.6)).frame(width: r.width * 0.08, height: r.height * 0.34)
                    .offset(x: -r.width * 0.28, y: r.height * 0.44)
                RoundedRectangle(cornerRadius: 3, style: .continuous)
                    .fill(LinearGradient(colors: [Color(rgb: 0x1BA3C6), Color(rgb: 0x0A6F8E)], startPoint: .top, endPoint: .bottom))
                    .frame(width: r.width * 0.44, height: r.height * 0.1)
            }
            .shadow(color: Color.kxWater.opacity(0.35), radius: 6, y: 3)
        }
        .aspectRatio(0.5, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

/// Water filling a card from the bottom (Water level): two waves, a light crest, a few bubbles.
struct WaterLevelArt: View {
    let fill: Double
    var phase: Double = 0
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        GeometryReader { g in
            let level = 0.07 + 0.88 * min(1, max(0, fill))
            let amp = min(7, g.size.height * 0.035)
            let dark = scheme == .dark
            ZStack {
                WaveShape(level: level + 0.025, phase: phase + 1.9, amplitude: amp, cycles: 1.4)
                    .fill(Color(rgb: dark ? 0x1E7F9B : 0x7FD6EA, alpha: dark ? 0.6 : 0.67))
                WaveShape(level: level, phase: phase, amplitude: amp)
                    .fill(LinearGradient(colors: [Color(rgb: dark ? 0x2BB5D6 : 0x3CC7E6), Color(rgb: dark ? 0x073B4C : 0x0A7FA3)],
                                         startPoint: UnitPoint(x: 0.5, y: 1 - level), endPoint: .bottom))
                ForEach(0..<4, id: \.self) { i in
                    let spots: [(CGFloat, CGFloat, CGFloat)] = [(0.18, 0.35, 3), (0.42, 0.7, 2), (0.63, 0.25, 2.5), (0.8, 0.55, 1.8)]
                    let waterH = g.size.height * level
                    if waterH > 18 {
                        Circle().fill(Color.white.opacity(dark ? 0.18 : 0.28)).frame(width: spots[i].2 * 2, height: spots[i].2 * 2)
                            .position(x: g.size.width * spots[i].0, y: g.size.height - waterH * spots[i].1)
                    }
                }
            }
        }
    }
}

// MARK: - Water bottle

struct WaterBottleView: View {
    let store: WidgetStore
    let family: WidgetFamily
    var body: some View {
        let fill = store.waterFill
        let next = nextLine(store)
        switch family {
        case .systemMedium:
            HStack(spacing: 14) {
                BottleArt(fill: fill, phase: store.now.timeIntervalSince1970 / 900).frame(maxHeight: .infinity)
                VStack(alignment: .leading, spacing: 2) {
                    Header(symbol: "drop.fill", label: "WATER")
                    Spacer(minLength: 4)
                    AmountText(ml: store.mlToday, size: 38)
                    Text("of " + WidgetStore.amount(store.waterGoalMl)).font(.kxText(13, bold: true)).foregroundStyle(Color.kxInk2)
                    if !next.isEmpty { StatusPill(text: next).padding(.top, 6) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                IntentButton(intent: AddGlassIntent()) { RoundPlus(size: 56) }
            }
        default:
            VStack(alignment: .leading, spacing: 0) {
                Header(symbol: "drop.fill", label: "WATER")
                HStack(alignment: .bottom, spacing: 6) {
                    VStack(alignment: .leading, spacing: 1) {
                        Spacer(minLength: 0)
                        AmountText(ml: store.mlToday, size: 30)
                        Text("of " + WidgetStore.amount(store.waterGoalMl)).font(.kxText(12, bold: true)).foregroundStyle(Color.kxInk2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    BottleArt(fill: fill, phase: store.now.timeIntervalSince1970 / 900)
                }
                .padding(.top, 4)
                IntentButton(intent: AddGlassIntent()) {
                    HStack(spacing: 5) {
                        Image(systemName: "plus").font(.system(size: 12, weight: .heavy))
                        Text("Add " + WidgetStore.amount(store.glassMl)).font(.kxText(13, bold: true))
                    }
                    .foregroundStyle(.white).frame(maxWidth: .infinity, minHeight: 36).background(GlossyFill())
                }
                .padding(.top, 10)
            }
        }
    }
}

func nextLine(_ store: WidgetStore) -> String {
    guard store.hasData else { return "" }
    if store.mlToday >= store.waterGoalMl { return "Goal reached" }
    let h = store.hydration
    if h.enabled, !h.doneForToday, let next = h.next { return "Next " + WidgetStore.clock(next) }
    return ""
}

// MARK: - Water level

/// The card is the glass: water fills it from the bottom, and the text is drawn twice — dark above the water, white
/// below it, masked by the wave itself — so the number changes colour exactly at the waterline. Draws edge to edge
/// (the widget turns content margins off) and pads its own text by 16.
struct WaterLevelView: View {
    let store: WidgetStore
    let family: WidgetFamily
    var body: some View {
        let fill = store.waterFill
        let level = 0.07 + 0.88 * min(1, max(0, fill))
        let phase = store.now.timeIntervalSince1970 / 600
        ZStack {
            WaterLevelArt(fill: fill, phase: phase)
            text(ink: .kxInk, ink2: .kxInk2, tint: .kxWater)
            text(ink: .white, ink2: .white.opacity(0.9), tint: .white)
                .mask(GeometryReader { g in
                    WaveShape(level: level, phase: phase, amplitude: min(7, g.size.height * 0.035)).fill(Color.black)
                })
            IntentButton(intent: AddGlassIntent()) { RoundPlus(size: 48, white: true) }
                .padding(14).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
    }

    private func text(ink: Color, ink2: Color, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Header(symbol: "drop.fill", label: "WATER", tint: tint, ink: ink2)
            AmountText(ml: store.mlToday, size: family == .systemMedium ? 44 : 34, color: ink).padding(.top, 6)
            Text("of " + WidgetStore.amount(store.waterGoalMl)).font(.kxText(13, bold: true)).foregroundStyle(ink2)
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .allowsHitTesting(false)
    }
}

// MARK: - Water ring

struct WaterRingView: View {
    let store: WidgetStore
    let family: WidgetFamily
    var body: some View {
        let fill = store.waterFill
        let next = nextLine(store)
        switch family {
        case .systemMedium:
            HStack(spacing: 16) {
                ZStack {
                    GradientRing(value: fill, line: 13)
                    Text("\(Int((fill * 100).rounded()))%").font(.kxText(17, bold: true)).foregroundStyle(Color.kxInk)
                }
                .aspectRatio(1, contentMode: .fit)
                VStack(alignment: .leading, spacing: 2) {
                    Header(symbol: "drop.fill", label: "WATER")
                    AmountText(ml: store.mlToday, size: 32).padding(.top, 4)
                    Text("of " + WidgetStore.amount(store.waterGoalMl) + (next.isEmpty ? "" : " · " + next))
                        .font(.kxText(12, bold: true)).foregroundStyle(Color.kxInk2).lineLimit(1)
                    IntentButton(intent: AddGlassIntent()) {
                        HStack(spacing: 5) {
                            Image(systemName: "plus").font(.system(size: 12, weight: .heavy))
                            Text("Add " + WidgetStore.amount(store.glassMl)).font(.kxText(13, bold: true))
                        }
                        .foregroundStyle(.white).padding(.horizontal, 16).frame(minHeight: 36).background(GlossyFill())
                    }
                    .padding(.top, 8)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        default:
            VStack(spacing: 8) {
                ZStack {
                    GradientRing(value: fill, line: 11)
                    VStack(spacing: 0) {
                        AmountText(ml: store.mlToday, size: 22)
                        Text("of " + WidgetStore.amount(store.waterGoalMl)).font(.kxText(10, bold: true)).foregroundStyle(Color.kxInk3)
                    }
                    .padding(.horizontal, 18)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                HStack {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(store.mlToday >= store.waterGoalMl ? "Goal reached" : WidgetStore.amount(store.waterGoalMl - store.mlToday) + " to go")
                            .font(.kxText(13, bold: true)).foregroundStyle(Color.kxInk).lineLimit(1).minimumScaleFactor(0.8)
                        if !next.isEmpty, store.mlToday < store.waterGoalMl {
                            Text(next).font(.kxText(11)).foregroundStyle(Color.kxInk3).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 4)
                    IntentButton(intent: AddGlassIntent()) { RoundPlus(size: 40) }
                }
            }
        }
    }
}

// MARK: - Water quick add

struct WaterQuickView: View {
    let store: WidgetStore
    let family: WidgetFamily
    var body: some View {
        if family == .systemSmall {
            VStack(alignment: .leading, spacing: 6) {
                Header(symbol: "drop.fill", label: "WATER")
                Spacer(minLength: 0)
                AmountText(ml: store.mlToday, size: 30)
                GlowBar(value: store.waterFill)
                HStack {
                    Text("of " + WidgetStore.amount(store.waterGoalMl)).font(.kxText(12, bold: true)).foregroundStyle(Color.kxInk2)
                    Spacer()
                    IntentButton(intent: AddGlassIntent()) { RoundPlus(size: 40) }
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Header(symbol: "drop.fill", label: "WATER")
                    Spacer()
                    Text("\(Int((store.waterFill * 100).rounded()))%").font(.kxText(12, bold: true)).foregroundStyle(Color.kxInk2)
                }
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    AmountText(ml: store.mlToday, size: 30)
                    Text("of " + WidgetStore.amount(store.waterGoalMl)).font(.kxText(12)).foregroundStyle(Color.kxInk3)
                }
                GlowBar(value: store.waterFill)
                HStack(spacing: 10) {
                    IntentButton(intent: AddGlassIntent()) {
                        quickLabel(symbol: "drop.fill", title: "Glass", ml: store.glassMl, primary: true)
                    }
                    IntentButton(intent: AddBottleIntent()) {
                        quickLabel(symbol: "waterbottle.fill", title: "Bottle", ml: store.bottleMl, primary: false)
                    }
                }
            }
        }
    }

    private func quickLabel(symbol: String, title: String, ml: Int, primary: Bool) -> some View {
        HStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 13, weight: .bold))
            Text("+ " + title).font(.kxText(13, bold: true))
            Text(WidgetStore.amount(ml)).font(.kxText(11)).opacity(0.8)
        }
        .foregroundStyle(primary ? Color.white : .kxWater)
        .frame(maxWidth: .infinity, minHeight: 40)
        .background {
            if primary { GlossyFill() } else { Capsule().fill(Color.kxChip).overlay(Capsule().stroke(Color.kxEdge, lineWidth: 1)) }
        }
    }
}

// MARK: - Water this week

struct WaterWeekView: View {
    let store: WidgetStore
    let family: WidgetFamily
    var body: some View {
        let week = store.waterWeek
        let met = week.filter { $0 >= store.waterGoalMl }.count
        switch family {
        case .systemMedium:
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Header(symbol: "drop.fill", label: "WATER · THIS WEEK")
                    Spacer()
                    IntentButton(intent: AddGlassIntent()) { RoundPlus(size: 34) }
                }
                HStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 2) {
                        AmountText(ml: store.mlToday, size: 30)
                        Text("today · of " + WidgetStore.amount(store.waterGoalMl)).font(.kxText(11, bold: true)).foregroundStyle(Color.kxInk2)
                        StatusPill(text: "Goal met \(met)/7").padding(.top, 6)
                    }
                    .fixedSize()
                    TrackBars(values: week, goal: store.waterGoalMl)
                }
            }
        default:
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Header(symbol: "drop.fill", label: "WEEK")
                    Spacer()
                    IntentButton(intent: AddGlassIntent()) { RoundPlus(size: 32) }
                }
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    AmountText(ml: store.mlToday, size: 22)
                    Text("\(met)/7 days").font(.kxText(11)).foregroundStyle(Color.kxInk3)
                }
                TrackBars(values: week, goal: store.waterGoalMl)
            }
        }
    }
}

// MARK: - Daily rings

struct DailyRingsView: View {
    let store: WidgetStore
    let family: WidgetFamily
    var body: some View {
        let steps = store.steps
        let values = [Double(steps ?? 0) / Double(store.stepsGoal), store.waterFill,
                      store.kcalTarget > 0 ? Double(store.kcalEaten) / Double(store.kcalTarget) : 0]
        let colors = [Color.kxStepsBlue, .kxRingWater, .kxFood]
        let stepsGoal = store.stepsGoal % 1000 == 0 ? "/ \(store.stepsGoal / 1000)k" : "/ " + WidgetStore.number(store.stepsGoal)
        let rows: [(String, String, Color, String, String)] = [
            ("figure.walk", "STEPS", .kxStepsBlue, steps.map(WidgetStore.number) ?? "—", stepsGoal),
            ("drop.fill", "WATER", .kxRingWater, WidgetStore.amount(store.mlToday), "/ " + WidgetStore.amount(store.waterGoalMl)),
            ("flame.fill", "FOOD", .kxFood, store.fresh ? WidgetStore.number(store.kcalEaten) : "—",
             store.kcalTarget > 0 ? "/ " + WidgetStore.number(store.kcalTarget) + " kcal" : "kcal"),
        ]
        switch family {
        case .systemMedium:
            HStack(spacing: 18) {
                Rings(values: values, colors: colors).aspectRatio(1, contentMode: .fit)
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(rows.indices, id: \.self) { i in
                        HStack(spacing: 10) {
                            Image(systemName: rows[i].0).font(.system(size: 11, weight: .bold)).foregroundStyle(rows[i].2)
                                .frame(width: 26, height: 26).background(Circle().fill(Color.kxChip))
                            VStack(alignment: .leading, spacing: 0) {
                                Text(rows[i].1).font(.kxText(9, bold: true)).kerning(1).foregroundStyle(Color.kxInk3)
                                HStack(alignment: .firstTextBaseline, spacing: 3) {
                                    Text(rows[i].3).font(.kxText(16, bold: true)).foregroundStyle(Color.kxInk)
                                    Text(rows[i].4).font(.kxText(11)).foregroundStyle(Color.kxInk3)
                                }
                                .lineLimit(1).minimumScaleFactor(0.7)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        default:
            VStack(alignment: .leading, spacing: 6) {
                Rings(values: values, colors: colors).frame(maxWidth: .infinity, maxHeight: .infinity)
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(rows.indices, id: \.self) { i in
                        HStack(spacing: 5) {
                            Image(systemName: rows[i].0).font(.system(size: 10, weight: .bold)).foregroundStyle(rows[i].2).frame(width: 14)
                            Text(rows[i].3).font(.kxText(11, bold: true)).foregroundStyle(Color.kxInk)
                            Text(rows[i].4).font(.kxText(10)).foregroundStyle(Color.kxInk3)
                        }
                        .lineLimit(1).minimumScaleFactor(0.7)
                    }
                }
            }
        }
    }
}

// MARK: - Steps

struct StepsView: View {
    let store: WidgetStore
    let family: WidgetFamily
    var body: some View {
        let steps = store.steps, goal = store.stepsGoal
        let value = Double(steps ?? 0) / Double(goal)
        let percent = steps.map { $0 >= goal ? "Goal ✓" : "\(min(100, Int(value * 100)))%" } ?? ""
        let updated = store.updatedAt.map { "Updated " + WidgetStore.clock($0) } ?? "Open Kinetix Fit to update"
        let ring = GradientRing(value: value, line: family == .systemMedium ? 13 : 11, from: Color(rgb: 0xA9C4FF), to: Color(rgb: 0x3F7BFF))
        switch family {
        case .accessoryCircular:
            Gauge(value: min(1, value)) { Image(systemName: "figure.walk") } currentValueLabel: {
                Text(steps.map { $0 >= 1000 ? String(format: "%.1fk", Double($0) / 1000) : "\($0)" } ?? "—").font(.kxText(12, bold: true)).minimumScaleFactor(0.6)
            }
            .gaugeStyle(.accessoryCircularCapacity)
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Label("Steps", systemImage: "figure.walk").font(.kxText(12, bold: true)).widgetAccentable()
                Text(steps.map(WidgetStore.number) ?? "—").font(.kxDisplay(20)).lineLimit(1).minimumScaleFactor(0.6)
                Gauge(value: min(1, value)) { EmptyView() }.gaugeStyle(.accessoryLinearCapacity)
            }
        case .systemMedium:
            HStack(spacing: 16) {
                ring.aspectRatio(1, contentMode: .fit)
                VStack(alignment: .leading, spacing: 2) {
                    HStack { Header(symbol: "figure.walk", label: "STEPS", tint: .kxStepsBlue); Spacer(); Text(percent).font(.kxText(12, bold: true)).foregroundStyle(Color.kxStepsBlue) }
                    Text(steps.map(WidgetStore.number) ?? "—").font(.kxDisplay(34)).foregroundStyle(Color.kxInk).lineLimit(1).minimumScaleFactor(0.5).padding(.top, 6).widgetAccentable()
                    Text("of \(WidgetStore.number(goal)) steps").font(.kxText(13, bold: true)).foregroundStyle(Color.kxInk2)
                    Text(updated).font(.kxText(10)).foregroundStyle(Color.kxInk3).padding(.top, 6)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        default:
            VStack(spacing: 4) {
                HStack { Header(symbol: "figure.walk", label: "STEPS", tint: .kxStepsBlue); Spacer(); Text(percent).font(.kxText(11, bold: true)).foregroundStyle(Color.kxStepsBlue) }
                ZStack {
                    ring
                    VStack(spacing: 0) {
                        Text(steps.map(WidgetStore.number) ?? "—").font(.kxDisplay(20)).foregroundStyle(Color.kxInk).lineLimit(1).minimumScaleFactor(0.5).widgetAccentable()
                        Text("of \(WidgetStore.number(goal))").font(.kxText(10)).foregroundStyle(Color.kxInk3)
                    }
                    .padding(.horizontal, 18)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                Text(updated).font(.kxText(9)).foregroundStyle(Color.kxInk3).lineLimit(1)
            }
        }
    }
}

// MARK: - Today: three equal columns — steps, calories left, quests — number, label and bar on the same lines

struct TodayView: View {
    let store: WidgetStore
    var body: some View {
        let steps = store.steps
        let kcalLeft = store.kcalLeft.map { WidgetStore.number(max(0, $0)) } ?? "—"
        let quests = store.fresh ? "\(store.questsDone)/\(store.questsTotal)" : "—"
        let cols: [(String, String, Double, Color, Color)] = [
            (steps.map(WidgetStore.number) ?? "—", "of \(WidgetStore.number(store.stepsGoal)) steps", Double(steps ?? 0) / Double(store.stepsGoal), Color(rgb: 0x9DBBFF), Color(rgb: 0x3F7BFF)),
            (kcalLeft, "kcal left", store.kcalTarget > 0 ? Double(store.kcalEaten) / Double(store.kcalTarget) : 0, Color(rgb: 0xFFB08A), Color(rgb: 0xF0602F)),
            (quests, "quests", Double(store.fresh ? store.questsDone : 0) / Double(max(1, store.questsTotal)), Color(rgb: 0x7FE3B5), Color(rgb: 0x1FA870)),
        ]
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text("TODAY").font(.kxText(11, bold: true)).kerning(1.5).foregroundStyle(Color.kxAccent)
                Text(store.now.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated).locale(Locale(identifier: "en_GB"))))
                    .font(.kxText(12)).foregroundStyle(Color.kxInk3)
                Spacer()
                HStack(spacing: 4) {
                    Image(systemName: "drop.fill").font(.system(size: 10, weight: .bold))
                    Text(WidgetStore.amount(store.mlToday)).font(.kxText(12, bold: true))
                }
                .foregroundStyle(Color.kxWater).padding(.horizontal, 9).padding(.vertical, 3).background(Capsule().fill(Color.kxChip))
            }
            Spacer(minLength: 6)
            HStack(alignment: .top, spacing: 14) {
                ForEach(cols.indices, id: \.self) { i in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(cols[i].0).font(.kxDisplay(24)).foregroundStyle(Color.kxInk).lineLimit(1).minimumScaleFactor(0.5).widgetAccentable()
                        Text(cols[i].1).font(.kxText(11)).foregroundStyle(Color.kxInk3).lineLimit(1).minimumScaleFactor(0.8)
                        GlowBar(value: cols[i].2, height: 6, from: cols[i].3, to: cols[i].4).padding(.top, 6)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            Spacer(minLength: 6)
            Text(store.updatedAt.map { "Updated " + WidgetStore.clock($0) } ?? "Open Kinetix Fit to update")
                .font(.kxText(10)).foregroundStyle(Color.kxInk3)
        }
    }
}

// MARK: - Quick scan

struct ScanView: View {
    var body: some View {
        HStack(spacing: 10) {
            button("Snap food", symbol: "camera.fill", link: "kinetixfit://scan/photo", primary: true)
            button("Scan barcode", symbol: "barcode.viewfinder", link: "kinetixfit://scan/barcode", primary: false)
        }
    }

    private func button(_ title: String, symbol: String, link: String, primary: Bool) -> some View {
        Link(destination: URL(string: link)!) {
            VStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 22, weight: .semibold))
                Text(title).font(.kxText(13, bold: true)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(primary ? Color.white : .kxAccent)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background {
                let shape = RoundedRectangle(cornerRadius: 20, style: .continuous)
                if primary {
                    shape.fill(LinearGradient(colors: [Color(rgb: 0xFF9A6E), Color(rgb: 0xE8542A)], startPoint: .top, endPoint: .bottom))
                        .overlay(shape.stroke(Color.white.opacity(0.25), lineWidth: 1))
                } else {
                    shape.fill(Color.kxChip).overlay(shape.stroke(Color.kxEdge, lineWidth: 1))
                }
            }
        }
    }
}

// MARK: - Water glass

/// A frosted-glass card. In iOS 26's Clear / Tinted home-screen styles the system turns widget backgrounds into real
/// Liquid Glass; in the full-colour style (where widgets can't see the wallpaper) this draws a frosted-glass look:
/// a cool frosted fill, light from above, a thick soft lens band inside the edge, a curved highlight on the top-left
/// corner and a rim brightest where the light hits.
struct LiquidGlassBackground: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let dark = scheme == .dark
        ZStack {
            LinearGradient(colors: dark ? [Color(rgb: 0x2A3A44), Color(rgb: 0x16222A)] : [Color(rgb: 0xE9F3F7), Color(rgb: 0xC9DCE4)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [Color(rgb: 0x2FC6E4, alpha: dark ? 0.24 : 0.2), .clear], center: UnitPoint(x: 0.2, y: 0.75), startRadius: 0, endRadius: 200)
            LinearGradient(stops: [.init(color: .white.opacity(dark ? 0.22 : 0.55), location: 0), .init(color: .clear, location: 0.45),
                                   .init(color: .clear, location: 0.62), .init(color: .black.opacity(dark ? 0.22 : 0.08), location: 1)],
                           startPoint: .top, endPoint: .bottom)
            ContainerRelativeShape().strokeBorder(Color.white.opacity(dark ? 0.2 : 0.35), lineWidth: 12).blur(radius: 7)
            ContainerRelativeShape().strokeBorder(
                LinearGradient(stops: [.init(color: .white, location: 0), .init(color: .white.opacity(0.55), location: 0.22),
                                       .init(color: .white.opacity(0.12), location: 0.5), .init(color: .white.opacity(0.12), location: 0.78),
                                       .init(color: .white.opacity(0.5), location: 1)],
                               startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1.3)
            GeometryReader { g in
                Ellipse().fill(Color.white.opacity(dark ? 0.25 : 0.45)).frame(width: g.size.width * 0.37, height: g.size.height * 0.14)
                    .blur(radius: 14).position(x: g.size.width * 0.24, y: g.size.height * 0.1)
            }
        }
    }
}

/// Glass outlines for WaterGlassArt: the rim an ellipse centred on `rimY`, the base one centred on `botY`.
enum Tumbler {
    static func outline(cx: CGFloat, rimY: CGFloat, botY: CGFloat, topR: CGFloat, botR: CGFloat, rimH: CGFloat, botH: CGFloat) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: cx - topR, y: rimY))
        p.addLine(to: CGPoint(x: cx - botR, y: botY))
        for pt in points(in: CGRect(x: cx - botR, y: botY - botH / 2, width: botR * 2, height: botH), from: .pi, to: 0) { p.addLine(to: pt) }
        p.addLine(to: CGPoint(x: cx + topR, y: rimY))
        for pt in points(in: CGRect(x: cx - topR, y: rimY - rimH / 2, width: topR * 2, height: rimH), from: 0, to: -.pi) { p.addLine(to: pt) }
        p.closeSubpath()
        return p
    }

    /// Points along the ellipse in `r`, from angle `from` to `to` (radians; 0 = right, π/2 = the near side, at the bottom).
    static func points(in r: CGRect, from: Double, to: Double) -> [CGPoint] {
        (0...32).map { i in
            let a = from + (to - from) * Double(i) / 32
            return CGPoint(x: r.midX + r.width / 2 * CGFloat(cos(a)), y: r.midY + r.height / 2 * CGFloat(sin(a)))
        }
    }

    /// That part of the ellipse as a line to stroke.
    static func arc(in r: CGRect, from: Double, to: Double) -> Path {
        var p = Path()
        for (i, pt) in points(in: r, from: from, to: to).enumerated() { if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) } }
        return p
    }
}

/// The Water glass widget's glass (WidgetArt.waterGlass on Android): clear, narrower at the base, a thick bottom, filled
/// to `fill` with aqua water — a flat surface seen from just above, rounded shading, a light shaft, a few bubbles — bright
/// edges, a rim, a soft shadow and an aqua caustic under it. As tall as its frame allows (a tumbler to a highball).
struct WaterGlassArt: View {
    let fill: Double
    var dark = false
    var body: some View {
        Canvas { ctx, size in
            let w = size.width, h = size.height
            let ratio = max(1.25, min(1.8, h / max(1, w)))
            let gw = min(w * 0.92, h * 0.88 / ratio), gh = gw * ratio, cx = w / 2
            let topR = gw / 2, botR = gw * 0.38, rimH = gw * 0.2, botH = rimH * botR / topR
            let rimY = (h - gh) / 2 + rimH / 2, botY = rimY + gh - rimH / 2 - botH / 2
            let wall = max(1.4, gw * 0.04), innerBotY = botY - gh * 0.12
            func half(_ y: CGFloat) -> CGFloat { topR + (botR - topR) * max(0, min(1, (y - rimY) / (botY - rimY))) }
            let innerBotR = half(innerBotY) - wall
            let outer = Tumbler.outline(cx: cx, rimY: rimY, botY: botY, topR: topR, botR: botR, rimH: rimH, botH: botH)
            let cavity = Tumbler.outline(cx: cx, rimY: rimY, botY: innerBotY, topR: topR - wall, botR: innerBotR,
                                         rimH: rimH * (topR - wall) / topR, botH: botH * innerBotR / botR)
            let f = fill <= 0 ? 0 : max(0.07, min(1, fill))
            let vertical = { (colors: [Color], from: CGFloat, to: CGFloat) in
                GraphicsContext.Shading.linearGradient(Gradient(colors: colors), startPoint: CGPoint(x: 0, y: from), endPoint: CGPoint(x: 0, y: to))
            }

            // what it stands on: a soft shadow and, with water in it, an aqua caustic
            var soft = ctx
            soft.addFilter(.blur(radius: 3))
            soft.fill(Path(ellipseIn: CGRect(x: cx - botR * 1.15, y: botY - botH * 0.3, width: botR * 2.3, height: botH * 1.05)),
                      with: .color(dark ? .black.opacity(0.4) : Color(rgb: 0x0B2A36, alpha: 0.18)))
            if f > 0 {
                var glow = ctx
                glow.addFilter(.blur(radius: 4))
                glow.fill(Path(ellipseIn: CGRect(x: cx - botR * 0.25, y: botY - botH * 0.1, width: botR * 1.6, height: botH)),
                          with: .color(Color(rgb: 0x2FC6E4, alpha: dark ? 0.55 : 0.45)))
            }

            // the glass itself, faintly brighter than the card
            ctx.fill(outer, with: vertical([.white.opacity(dark ? 0.18 : 0.35), .white.opacity(dark ? 0.06 : 0.15)], rimY, botY))

            // the water
            if f > 0 {
                let topLimit = rimY + (innerBotY - rimY) * 0.1
                let level = innerBotY - (innerBotY - topLimit) * f
                let lr = half(level) - wall, le = lr * (rimH / 2) / topR
                var water = ctx
                water.clip(to: cavity)
                let body = Path(CGRect(x: 0, y: level, width: w, height: h - level))
                water.fill(body, with: .linearGradient(Gradient(stops: [.init(color: Color(rgb: 0x5AD6EE, alpha: 0.95), location: 0),
                                                                        .init(color: Color(rgb: 0x2FC6E4, alpha: 0.96), location: 0.45),
                                                                        .init(color: Color(rgb: 0x0E8FB8), location: 1)]),
                                                      startPoint: CGPoint(x: 0, y: level), endPoint: CGPoint(x: 0, y: innerBotY + botH / 2)))
                water.fill(body, with: .linearGradient(Gradient(stops: [.init(color: Color(rgb: 0x062F3D, alpha: 0.25), location: 0),
                                                                        .init(color: .clear, location: 0.3), .init(color: .clear, location: 0.62),
                                                                        .init(color: Color(rgb: 0x062F3D, alpha: 0.33), location: 1)]),
                                                      startPoint: CGPoint(x: cx - topR, y: 0), endPoint: CGPoint(x: cx + topR, y: 0)))
                var shaft = water
                shaft.addFilter(.blur(radius: max(1, gw * 0.05)))
                shaft.fill(Path(CGRect(x: cx - lr * 0.5, y: level + le, width: lr * 0.2, height: max(0, innerBotY - level - le))), with: .color(.white.opacity(0.24)))
                let depth = innerBotY - level
                if depth > 16 {
                    let spots: [(CGFloat, CGFloat, CGFloat)] = [(-0.35, 0.32, 1.5), (0.22, 0.55, 1.1), (-0.1, 0.78, 1.9), (0.42, 0.24, 0.9), (-0.5, 0.64, 1)]
                    for s in spots {
                        let by = level + le + (depth - le) * s.1
                        let bx = cx + half(by) * s.0
                        let br = s.2 * min(1.4, gw / 60)
                        let bubble = Path(ellipseIn: CGRect(x: bx - br, y: by - br, width: br * 2, height: br * 2))
                        water.fill(bubble, with: .color(.white.opacity(0.25)))
                        water.stroke(bubble, with: .color(.white.opacity(0.7)), lineWidth: 0.7)
                    }
                }
                let surface = CGRect(x: cx - lr, y: level - le, width: lr * 2, height: le * 2)
                water.fill(Path(ellipseIn: surface), with: vertical([Color(rgb: 0xC4F6FC), Color(rgb: 0x5AD6EE)], surface.minY, surface.maxY))
                water.stroke(Tumbler.arc(in: surface, from: .pi / 18, to: .pi * 17 / 18), with: .color(.white.opacity(0.82)), lineWidth: 1.1)
            }

            // the glass's thickness: walls and the heavy base (the outline minus the inside)
            var solid = outer
            solid.addPath(cavity)
            ctx.fill(solid, with: .linearGradient(Gradient(stops: [.init(color: .white.opacity(dark ? 0.25 : 0.5), location: 0),
                                                                   .init(color: .white.opacity(dark ? 0.2 : 0.4), location: 0.8),
                                                                   .init(color: f > 0 ? Color(rgb: 0x2FC6E4, alpha: 0.5) : .white.opacity(dark ? 0.25 : 0.5), location: 1)]),
                                                 startPoint: CGPoint(x: 0, y: rimY), endPoint: CGPoint(x: 0, y: botY + botH / 2)),
                     style: FillStyle(eoFill: true))
            // over a light wallpaper, a faint dark outline, or clear glass disappears
            if !dark { ctx.stroke(outer, with: .color(Color(rgb: 0x0B2A36, alpha: 0.24)), lineWidth: 2.4) }

            // highlights parallel to the walls
            let st = rimY + rimH * 0.9, sb = innerBotY - botH * 0.4
            var streak = Path()
            streak.move(to: CGPoint(x: cx - half(st) + gw * 0.15, y: st)); streak.addLine(to: CGPoint(x: cx - half(sb) + gw * 0.15, y: sb))
            ctx.stroke(streak, with: vertical([.white.opacity(0.78), .white.opacity(0.06)], st, sb), style: StrokeStyle(lineWidth: max(1.5, gw * 0.075), lineCap: .round))
            var thin = Path()
            thin.move(to: CGPoint(x: cx + half(st) - gw * 0.11, y: st + rimH * 0.4)); thin.addLine(to: CGPoint(x: cx + half(sb) - gw * 0.11, y: sb))
            ctx.stroke(thin, with: vertical([.white.opacity(0.61), .white.opacity(0.1)], st, sb), style: StrokeStyle(lineWidth: max(1, gw * 0.028), lineCap: .round))

            // edges, the top of the base, the rim
            var edges = Path()
            edges.move(to: CGPoint(x: cx - topR, y: rimY)); edges.addLine(to: CGPoint(x: cx - botR, y: botY))
            edges.move(to: CGPoint(x: cx + topR, y: rimY)); edges.addLine(to: CGPoint(x: cx + botR, y: botY))
            edges.addPath(Tumbler.arc(in: CGRect(x: cx - botR, y: botY - botH / 2, width: botR * 2, height: botH), from: 0, to: .pi))
            ctx.stroke(edges, with: vertical([.white.opacity(0.95), .white.opacity(dark ? 0.5 : 0.7)], rimY, botY), lineWidth: 1.15)
            let ibh = botH * innerBotR / botR
            ctx.stroke(Path(ellipseIn: CGRect(x: cx - innerBotR, y: innerBotY - ibh / 2, width: innerBotR * 2, height: ibh)),
                       with: .color(.white.opacity(dark ? 0.35 : 0.55)), lineWidth: 0.9)
            let rim = CGRect(x: cx - topR, y: rimY - rimH / 2, width: topR * 2, height: rimH)
            ctx.stroke(Tumbler.arc(in: rim, from: .pi, to: 2 * .pi), with: .color(.white.opacity(dark ? 0.47 : 0.63)), lineWidth: 1.2)
            ctx.stroke(Tumbler.arc(in: rim, from: 0, to: .pi), with: .color(.white.opacity(0.96)), lineWidth: 1.5)
            let ir = topR - wall, irh = rimH * ir / topR
            ctx.stroke(Path(ellipseIn: CGRect(x: cx - ir, y: rimY - irh / 2, width: ir * 2, height: irh)),
                       with: .color(.white.opacity(dark ? 0.27 : 0.4)), lineWidth: 0.8)
        }
        .accessibilityHidden(true)
    }
}

/// Water glass: the glass filling with today's water beside the amount, on the frosted card; dark text in light mode,
/// white in dark (the card follows the system look, it can't see the wallpaper).
struct GlassView: View {
    let store: WidgetStore
    let family: WidgetFamily
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let dark = scheme == .dark
        let ink: Color = dark ? .white : .kxInk
        let ink2: Color = dark ? .white.opacity(0.85) : .kxInk.opacity(0.75)
        let water = Color(rgb: dark ? 0x7BE8F7 : 0x0A7FA3)
        let fill = store.waterFill
        let next = nextLine(store)
        let toGo = store.mlToday >= store.waterGoalMl ? "Goal reached"
            : { let n = Int(ceil(Double(store.waterGoalMl - store.mlToday) / Double(max(50, store.glassMl)))); return "\(n) \(n == 1 ? "glass" : "glasses") to go" }()
        let glass = WaterGlassArt(fill: store.hasData ? fill : 0.5, dark: dark)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "drop.fill").font(.system(size: 11, weight: .bold)).foregroundStyle(water)
                    .frame(width: 24, height: 24).background(Circle().fill(Color.white.opacity(0.22)).overlay(Circle().stroke(Color.white.opacity(0.5), lineWidth: 0.8)))
                Text("WATER").font(.kxText(11, bold: true)).kerning(1.3).foregroundStyle(ink2)
                Spacer(minLength: 4)
                if store.hasData { Text("\(Int((fill * 100).rounded()))%").font(.kxText(12, bold: true)).foregroundStyle(water) }
            }
            if family == .systemMedium {
                HStack(spacing: 14) {
                    glass.aspectRatio(0.62, contentMode: .fit)
                    VStack(alignment: .leading, spacing: 2) {
                        AmountText(ml: store.mlToday, size: 40, color: ink)
                        Text("of " + WidgetStore.amount(store.waterGoalMl) + " · " + toGo).font(.kxText(13, bold: true)).foregroundStyle(ink2).lineLimit(1).minimumScaleFactor(0.8)
                        if !next.isEmpty, next != "Goal reached" { Text(next).font(.kxText(12)).foregroundStyle(ink2) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    IntentButton(intent: AddGlassIntent()) { RoundPlus(size: 46) }
                }
            } else {
                HStack(spacing: 8) {
                    glass.aspectRatio(0.56, contentMode: .fit)
                    VStack(alignment: .leading, spacing: 1) {
                        Spacer(minLength: 0)
                        AmountText(ml: store.mlToday, size: 24, color: ink)
                        Text("of " + WidgetStore.amount(store.waterGoalMl)).font(.kxText(12, bold: true)).foregroundStyle(ink2)
                        Text(next.isEmpty ? toGo : next).font(.kxText(11)).foregroundStyle(ink2).lineLimit(1).minimumScaleFactor(0.8)
                        Spacer(minLength: 4)
                        HStack { Spacer(minLength: 0); IntentButton(intent: AddGlassIntent()) { RoundPlus(size: 38) } }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}


// MARK: - Streak (free) and the Plus widgets: Check-in, Quick log, My stats (the iOS twins of StreakWidget,
// CheckInWidget, QuickLogWidget and StatsWidget.java). The Plus ones show a locked card unless the app last said the
// person has Kinetix Fit Plus. iOS widgets can't vibrate, so the haptic setting is Android's only.

/// The Plus widgets' colours — the same five as src/lib/widgets.ts THEMES, WidgetThemes.java and the app's previews.
struct WidgetTheme {
    let from: Color
    let to: Color
    /// text and icons in the theme's colour, on the light or dark card
    let accent: Color

    static func named(_ id: String?) -> WidgetTheme {
        switch id ?? "" {
        case "ember": return WidgetTheme(from: Color(rgb: 0xFFB08A), to: Color(rgb: 0xF0602F), accent: .kx(0xE5532D, 0xFF8A5E))
        case "forest": return WidgetTheme(from: Color(rgb: 0x7FE3B5), to: Color(rgb: 0x1FA870), accent: .kx(0x16895A, 0x5ED6A0))
        case "violet": return WidgetTheme(from: Color(rgb: 0xC4B5FF), to: Color(rgb: 0x7B61FF), accent: .kx(0x6A4FD6, 0xB3A2FF))
        case "mono": return WidgetTheme(from: Color(rgb: 0x9AA7AF), to: Color(rgb: 0x4E5E67), accent: .kx(0x4E5E67, 0xC3CDD3))
        default: return WidgetTheme(from: Color(rgb: 0x62DDF1), to: Color(rgb: 0x1190B5), accent: .kx(0x0C8FB5, 0x5AD8EE))
        }
    }

    var gradient: LinearGradient { LinearGradient(colors: [from, to], startPoint: .top, endPoint: .bottom) }
}

/// Check-in widget: one of the five energy pips. Checks the person in for today; the app gives the day's points and
/// keeps the streak when it next opens (WidgetBridgePlugin.takeCheckIns).
struct CheckInIntent: AppIntent {
    static var title: LocalizedStringResource = "Check in"
    static var description = IntentDescription("Checks you in for today in Kinetix Fit with how your energy is.")
    @Parameter(title: "Energy (1–5)") var energy: Int
    init() { energy = 3 }
    init(energy: Int) { self.energy = energy }
    func perform() async throws -> some IntentResult {
        WidgetStore.addPendingCheckIn(energy: energy)
        return .result()
    }
}

/// Quick log widget: button `index` — the drink or workout the person set up in the app (Account → Widgets).
struct QuickLogIntent: AppIntent {
    static var title: LocalizedStringResource = "Quick log"
    static var description = IntentDescription("Logs one of your Quick log buttons in Kinetix Fit.")
    @Parameter(title: "Button") var index: Int
    init() { index = 0 }
    init(index: Int) { self.index = index }
    func perform() async throws -> some IntentResult {
        let store = WidgetStore(now: Date())
        let actions = store.quickActions
        guard store.plus, actions.indices.contains(index) else { return .result() }
        let a = actions[index]
        if a.water {
            WidgetStore.addPendingDrink(ml: a.ml)
            WidgetStore.noteLogged(WidgetStore.amount(a.ml) + " of water")
        } else {
            WidgetStore.addPendingWorkout(type: a.type, minutes: a.minutes)
        }
        return .result()
    }
}

/// A Plus widget for someone without Plus: its name and "Tap to unlock" (the widget opens kinetixfit://plus).
struct LockedWidgetView: View {
    let name: String
    let family: WidgetFamily
    var body: some View {
        let plus = LinearGradient(colors: [Color(rgb: 0xFF8A5E), Color(rgb: 0x7B61FF)], startPoint: .topLeading, endPoint: .bottomTrailing)
        VStack(spacing: 6) {
            Image(systemName: "lock.fill").font(.system(size: 14, weight: .bold)).foregroundStyle(.white)
                .frame(width: 38, height: 38).background(Circle().fill(plus))
            Text(name).font(.kxText(15, bold: true)).foregroundStyle(Color.kxInk).lineLimit(1)
            if family == .systemMedium {
                Text("A Kinetix Fit Plus widget").font(.kxText(11)).foregroundStyle(Color.kxInk3).lineLimit(1)
            }
            Text("Tap to unlock").font(.kxText(11, bold: true)).foregroundStyle(.white)
                .padding(.horizontal, 12).padding(.vertical, 4).background(Capsule().fill(plus))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), a Kinetix Fit Plus widget. Tap to unlock it in the app.")
    }
}

/// The last 7 days as dots: flame orange with a glow when checked in, a faint track when not, today ringed if it isn't
/// done yet; the day letters under them.
struct StreakDots: View {
    let week: [Bool]
    var dot: CGFloat = 16
    var letters = true
    var body: some View {
        let days = WeekLetters.last7
        HStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { i in
                VStack(spacing: 4) {
                    ZStack {
                        if week[i] {
                            Circle().fill(LinearGradient(colors: [Color(rgb: 0xFFB08A), Color(rgb: 0xF0602F)], startPoint: .top, endPoint: .bottom))
                                .shadow(color: Color(rgb: 0xF0602F).opacity(0.45), radius: 3)
                        } else {
                            Circle().fill(Color.kxTrack)
                            if i == 6 { Circle().strokeBorder(Color.kxFlame.opacity(0.75), lineWidth: 1.5) }
                        }
                    }
                    .frame(width: dot, height: dot)
                    if letters {
                        Text(days[i]).font(.kxText(10, bold: i == 6)).foregroundStyle(i == 6 ? Color.kxFlame : .kxInk3)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityHidden(true)
    }
}

struct StreakView: View {
    let store: WidgetStore
    let family: WidgetFamily
    var body: some View {
        let s = store.streak
        let status = s.today ? "Done today" : s.current > 0 ? "Check in today" : "Start today"
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Header(symbol: "flame.fill", label: "STREAK", tint: .kxFlame, chip: Color.kxFlame.opacity(0.14))
                Spacer(minLength: 4)
                if s.today { Text("Done today").font(.kxText(11, bold: true)).foregroundStyle(Color.kxGood).lineLimit(1) }
            }
            if family == .systemMedium {
                HStack(alignment: .center, spacing: 16) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(s.current)").font(.kxDisplay(44)).foregroundStyle(Color.kxFlame).lineLimit(1).minimumScaleFactor(0.5)
                        Text("day streak").font(.kxText(13, bold: true)).foregroundStyle(Color.kxInk2)
                        Text(s.today ? "Best \(s.best) \(s.best == 1 ? "day" : "days")" : status).font(.kxText(11)).foregroundStyle(Color.kxInk3)
                    }
                    .fixedSize()
                    StreakDots(week: s.week, dot: 20)
                }
                .frame(maxHeight: .infinity)
            } else {
                Spacer(minLength: 0)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(s.current)").font(.kxDisplay(36)).foregroundStyle(Color.kxFlame).lineLimit(1).minimumScaleFactor(0.5)
                    Text("day streak").font(.kxText(12, bold: true)).foregroundStyle(Color.kxInk2).lineLimit(1)
                }
                if !s.today { Text(status).font(.kxText(11)).foregroundStyle(Color.kxInk3) }
                Spacer(minLength: 0)
                StreakDots(week: s.week, dot: 14)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(s.current)-day check-in streak" + (s.today ? ", checked in today" : ""))
    }
}

struct CheckInView: View {
    let store: WidgetStore
    let family: WidgetFamily
    static let energy = ["Drained", "Low", "Okay", "Good", "Full"]
    var body: some View {
        if !store.plus {
            LockedWidgetView(name: "Check-in", family: family)
        } else {
            let t = WidgetTheme.named(store.defaults.string(forKey: "checkinTheme") ?? "violet")
            let s = store.streak
            let medium = family == .systemMedium
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Header(symbol: "target", label: "CHECK-IN", tint: t.accent, chip: t.accent.opacity(0.14))
                    Spacer(minLength: 4)
                    HStack(spacing: 3) {
                        Image(systemName: "flame.fill").font(.system(size: 10, weight: .bold))
                        Text("\(s.current)").font(.kxText(12, bold: true))
                    }
                    .foregroundStyle(Color.kxFlame)
                }
                Spacer(minLength: 0)
                if s.today {
                    let e = store.energyToday
                    HStack(spacing: 12) {
                        Image(systemName: "checkmark").font(.system(size: 18, weight: .heavy)).foregroundStyle(.white)
                            .frame(width: 44, height: 44).background(Circle().fill(t.gradient))
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Checked in").font(.kxDisplay(medium ? 20 : 15)).foregroundStyle(Color.kxInk).lineLimit(1).minimumScaleFactor(0.7)
                            Text((e > 0 ? "Energy \(e)/5 · " : "") + "\(s.current)-day streak").font(.kxText(11)).foregroundStyle(Color.kxInk3).lineLimit(2)
                        }
                    }
                    Spacer(minLength: 0)
                } else {
                    Text("How’s your energy?").font(.kxText(medium ? 15 : 13, bold: true)).foregroundStyle(Color.kxInk)
                        .lineLimit(1).minimumScaleFactor(0.8)
                    HStack(spacing: medium ? 10 : 5) {
                        ForEach(1...5, id: \.self) { level in
                            IntentButton(intent: CheckInIntent(energy: level)) {
                                VStack(spacing: 4) {
                                    Circle().fill(t.gradient).opacity(0.35 + Double(level) * 0.13)
                                        .overlay(Circle().fill(LinearGradient(colors: [.white.opacity(0.45), .clear], startPoint: .top, endPoint: .center)))
                                        .aspectRatio(1, contentMode: .fit)
                                        .frame(maxWidth: 40)
                                    if medium {
                                        Text(Self.energy[level - 1]).font(.kxText(10, bold: true)).foregroundStyle(Color.kxInk3).lineLimit(1).minimumScaleFactor(0.8)
                                    }
                                }
                                .frame(maxWidth: .infinity)
                            }
                            .accessibilityLabel("Check in: energy \(level) of 5, \(Self.energy[level - 1])")
                        }
                    }
                }
            }
        }
    }
}

struct QuickLogView: View {
    let store: WidgetStore
    let family: WidgetFamily
    var body: some View {
        if !store.plus {
            LockedWidgetView(name: "Quick log", family: family)
        } else {
            let t = WidgetTheme.named(store.defaults.string(forKey: "quickTheme"))
            let actions = store.quickActions
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Header(symbol: "plus", label: "QUICK LOG", tint: t.accent, chip: t.accent.opacity(0.14))
                    Spacer(minLength: 4)
                    // today's water too when there's room (on the small size it squeezed the label to "QUICK…")
                    if family == .systemMedium {
                        HStack(spacing: 3) {
                            Image(systemName: "drop.fill").font(.system(size: 10, weight: .bold))
                            Text(WidgetStore.amount(store.mlToday)).font(.kxText(12, bold: true))
                        }
                        .foregroundStyle(t.accent)
                    }
                }
                if family == .systemMedium {
                    HStack(spacing: 8) { ForEach(actions.indices, id: \.self) { i in button(actions[i], i, t) } }
                    Text(store.lastLoggedLine).font(.kxText(11)).foregroundStyle(Color.kxInk3).lineLimit(1)
                } else {
                    VStack(spacing: 8) {
                        ForEach(Array(stride(from: 0, to: actions.count, by: 2)), id: \.self) { r in
                            HStack(spacing: 8) { ForEach(r..<min(r + 2, actions.count), id: \.self) { i in button(actions[i], i, t) } }
                        }
                    }
                }
            }
        }
    }

    private func button(_ a: WidgetStore.QuickAction, _ i: Int, _ t: WidgetTheme) -> some View {
        let walking = a.type.range(of: "run|walk|hike", options: [.regularExpression, .caseInsensitive]) != nil
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        return IntentButton(intent: QuickLogIntent(index: i)) {
            VStack(spacing: 3) {
                Image(systemName: a.water ? "drop.fill" : walking ? "figure.walk" : "dumbbell.fill").font(.system(size: 15, weight: .bold))
                Text(a.label).font(.kxText(12, bold: true)).lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundStyle(.white)
            .padding(4)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(shape.fill(t.gradient).overlay(shape.stroke(Color.white.opacity(0.25), lineWidth: 1)))
        }
        .accessibilityLabel("Log " + (a.water ? WidgetStore.amount(a.ml) + " of water" : "\(a.type), \(a.minutes) minutes"))
    }
}

struct StatsView: View {
    let store: WidgetStore
    let family: WidgetFamily

    struct Stat {
        let number: String
        var unit = ""
        let label: String
        /// 0–1 towards a goal, or nil when it has none
        var progress: Double?
    }

    private func stat(_ id: String) -> Stat {
        switch id {
        case "water":
            let parts = WidgetStore.amount(store.mlToday).split(separator: " ").map(String.init)
            return Stat(number: parts[0], unit: parts.count > 1 ? parts[1] : "", label: "water", progress: store.waterFill)
        case "kcalLeft":
            return Stat(number: store.kcalLeft.map { WidgetStore.number(max(0, $0)) } ?? "—", label: "kcal left",
                        progress: store.kcalTarget > 0 ? Double(store.kcalEaten) / Double(store.kcalTarget) : nil)
        case "protein":
            return Stat(number: WidgetStore.number(store.protein), unit: "g", label: "protein",
                        progress: store.proteinTarget > 0 ? Double(store.protein) / Double(store.proteinTarget) : nil)
        case "streak":
            return Stat(number: "\(store.streak.current)", label: "day streak")
        case "points":
            return Stat(number: WidgetStore.number(store.points), label: "points")
        case "quests":
            let done = store.fresh ? store.questsDone : 0, total = max(1, store.questsTotal)
            return Stat(number: "\(done)/\(total)", label: "quests", progress: Double(done) / Double(total))
        case "workouts":
            return Stat(number: "\(store.workoutsWeek)", label: "workouts")
        default:
            return Stat(number: store.steps.map(WidgetStore.number) ?? "—", label: "steps",
                        progress: Double(store.steps ?? 0) / Double(store.stepsGoal))
        }
    }

    var body: some View {
        if !store.plus {
            LockedWidgetView(name: "My stats", family: family)
        } else {
            let t = WidgetTheme.named(store.defaults.string(forKey: "statsTheme"))
            let stats = store.statsMetrics.map(stat)
            VStack(alignment: .leading, spacing: 8) {
                Header(symbol: "trophy.fill", label: "MY STATS", tint: t.accent, chip: t.accent.opacity(0.14))
                Spacer(minLength: 0)
                if family == .systemMedium {
                    HStack(alignment: .bottom, spacing: 12) { ForEach(stats.indices, id: \.self) { i in cell(stats[i], t) } }
                } else {
                    VStack(spacing: 10) {
                        ForEach(Array(stride(from: 0, to: stats.count, by: 2)), id: \.self) { r in
                            HStack(alignment: .bottom, spacing: 10) { ForEach(r..<min(r + 2, stats.count), id: \.self) { i in cell(stats[i], t) } }
                        }
                    }
                }
            }
        }
    }

    private func cell(_ s: Stat, _ t: WidgetTheme) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(s.number).font(.kxDisplay(22)).foregroundStyle(Color.kxInk)
                if !s.unit.isEmpty { Text(s.unit).font(.kxText(10, bold: true)).foregroundStyle(Color.kxInk3) }
            }
            .lineLimit(1).minimumScaleFactor(0.5)
            Text(s.label).font(.kxText(10)).foregroundStyle(Color.kxInk3).lineLimit(1)
            if let p = s.progress {
                GlowBar(value: min(1, max(0, p)), height: 5, from: t.from, to: t.to).padding(.top, 3)
            } else {
                Color.clear.frame(height: 8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
