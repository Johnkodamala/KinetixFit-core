#if DEBUG
import SwiftUI
import WidgetKit
import CoreText

/// Debug builds only: renders every widget (KinetixFitWidgets/WidgetViews.swift, compiled into the app for this) at
/// the small and medium sizes, light and dark, into one PNG in the app's Documents — for checking the iOS widgets
/// without adding them to a home screen. Run from the WebView (scripts/ios-sim/wi.mjs):
///   Capacitor.Plugins.WidgetBridge.renderGallery({ ml: 1250 })
/// then read …/data/Containers/Data/Application/<id>/Documents/widgets-ios.png (the call resolves with the path).
enum WidgetGallery {
    static let small = CGSize(width: 170, height: 170)
    static let medium = CGSize(width: 364, height: 170)

    static func registerFonts() {
        guard let plugins = Bundle.main.builtInPlugInsURL else { return }
        let fonts = plugins.appendingPathComponent("KinetixFitWidgets.appex/Fonts")
        for name in ["KXArchivoExpanded-ExtraBold", "KXHankenGrotesk-Bold", "KXHankenGrotesk-Medium"] {
            let url = fonts.appendingPathComponent(name + ".ttf")
            let alt = plugins.appendingPathComponent("KinetixFitWidgets.appex/" + name + ".ttf")
            CTFontManagerRegisterFontsForURL((FileManager.default.fileExists(atPath: url.path) ? url : alt) as CFURL, .process, nil)
        }
    }

    struct Tile<Content: View, Background: View>: View {
        let size: CGSize
        let content: Content
        let background: Background
        /// false for widgets that turn content margins off and pad themselves (Water level)
        var padded = true
        var body: some View {
            ZStack {
                background
                content.padding(padded ? 16 : 0)
            }
            .frame(width: size.width, height: size.height)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .containerShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
    }

    @MainActor static func sheet(store: WidgetStore, scheme: ColorScheme) -> some View {
        let s = small, m = medium
        func row<A: View, B: View, BG: View>(_ a: A, _ b: B, _ bg: BG) -> some View {
            HStack(alignment: .top, spacing: 16) { Tile(size: s, content: a, background: bg); Tile(size: m, content: b, background: bg) }
        }
        return VStack(alignment: .leading, spacing: 16) {
            row(WaterBottleView(store: store, family: .systemSmall), WaterBottleView(store: store, family: .systemMedium), CardBackground())
            HStack(alignment: .top, spacing: 16) {
                Tile(size: s, content: WaterLevelView(store: store, family: .systemSmall), background: CardBackground(), padded: false)
                Tile(size: m, content: WaterLevelView(store: store, family: .systemMedium), background: CardBackground(), padded: false)
            }
            row(WaterRingView(store: store, family: .systemSmall), WaterRingView(store: store, family: .systemMedium), CardBackground())
            row(WaterQuickView(store: store, family: .systemSmall), WaterQuickView(store: store, family: .systemMedium), CardBackground())
            row(WaterWeekView(store: store, family: .systemSmall), WaterWeekView(store: store, family: .systemMedium), CardBackground())
            row(DailyRingsView(store: store, family: .systemSmall), DailyRingsView(store: store, family: .systemMedium), CardBackground())
            row(StepsView(store: store, family: .systemSmall), StepsView(store: store, family: .systemMedium), CardBackground())
            HStack(spacing: 16) {
                Tile(size: s, content: GlassView(store: store, family: .systemSmall), background: LiquidGlassBackground())
                Tile(size: m, content: TodayView(store: store), background: CardBackground())
            }
            HStack(spacing: 16) {
                Tile(size: s, content: Color.clear, background: Color.clear)
                Tile(size: m, content: ScanView(), background: CardBackground())
            }
            HStack(spacing: 16) {
                Tile(size: s, content: Color.clear, background: Color.clear)
                Tile(size: m, content: GlassView(store: store, family: .systemMedium), background: LiquidGlassBackground())
            }
            Group {
                row(StreakView(store: store, family: .systemSmall), StreakView(store: store, family: .systemMedium), CardBackground())
                row(CheckInView(store: store, family: .systemSmall), CheckInView(store: store, family: .systemMedium), CardBackground())
                row(QuickLogView(store: store, family: .systemSmall), QuickLogView(store: store, family: .systemMedium), CardBackground())
                row(StatsView(store: store, family: .systemSmall), StatsView(store: store, family: .systemMedium), CardBackground())
            }
        }
        .padding(20)
        .background(LinearGradient(colors: scheme == .dark ? [Color(rgb: 0x1D2A33), Color(rgb: 0x0F1418)] : [Color(rgb: 0x9FB6C4), Color(rgb: 0xD5DEE3)],
                                   startPoint: .top, endPoint: .bottom))
        .environment(\.colorScheme, scheme)
    }

    /// Renders both themes side by side and saves them; returns the file path.
    @MainActor static func render(ml: Int?, plus: Bool? = nil) throws -> String {
        registerFonts()
        let d = UserDefaults(suiteName: WidgetStore.appGroup)
        let saved = (d?.object(forKey: "waterMl"), d?.string(forKey: "waterDay"), d?.object(forKey: "plus"))
        if let ml {
            d?.set(ml, forKey: "waterMl")
            d?.set(WidgetStore.dayKey(Date()), forKey: "waterDay")
        }
        if let plus { d?.set(plus, forKey: "plus") }
        defer {
            if ml != nil {
                if let v = saved.0 { d?.set(v, forKey: "waterMl") } else { d?.removeObject(forKey: "waterMl") }
                if let v = saved.1 { d?.set(v, forKey: "waterDay") } else { d?.removeObject(forKey: "waterDay") }
            }
            if plus != nil {
                if let v = saved.2 { d?.set(v, forKey: "plus") } else { d?.removeObject(forKey: "plus") }
            }
        }
        let store = WidgetStore(now: Date())
        let view = HStack(spacing: 0) { sheet(store: store, scheme: .light); sheet(store: store, scheme: .dark) }
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2
        guard let image = renderer.uiImage, let png = image.pngData() else { throw NSError(domain: "WidgetGallery", code: 1) }
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("widgets-ios.png")
        try png.write(to: url)
        return url.path
    }
}
#endif
