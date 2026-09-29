package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.os.Build;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

/**
 * What the person can change on the Plus widgets: the colour (the same five as src/lib/widgets.ts THEMES and the
 * app's previews, .kx-wp-theme-* in src/styles/widgets.css) and the haptic their buttons give (Off / Light / Firm).
 */
final class WidgetThemes {
    private WidgetThemes() {}

    static final class Theme {
        final int from, to, accentLight, accentDark, button;
        Theme(int from, int to, int accentLight, int accentDark, int button) {
            this.from = from; this.to = to; this.accentLight = accentLight; this.accentDark = accentDark; this.button = button;
        }
        /** The theme's text / icon colour on the light or dark card. */
        int accent(Context context) { return WaterWidgets.dark(context) ? accentDark : accentLight; }
    }

    static Theme of(String id) {
        switch (id == null ? "" : id) {
            case "ember": return new Theme(0xFFFFB08A, 0xFFF0602F, 0xFFE5532D, 0xFFFF8A5E, R.drawable.widget_btn_theme_ember);
            case "forest": return new Theme(0xFF7FE3B5, 0xFF1FA870, 0xFF16895A, 0xFF5ED6A0, R.drawable.widget_btn_theme_forest);
            case "violet": return new Theme(0xFFC4B5FF, 0xFF7B61FF, 0xFF6A4FD6, 0xFFB3A2FF, R.drawable.widget_btn_theme_violet);
            case "mono": return new Theme(0xFF9AA7AF, 0xFF4E5E67, 0xFF4E5E67, 0xFFC3CDD3, R.drawable.widget_btn_theme_mono);
            default: return new Theme(0xFF62DDF1, 0xFF1190B5, 0xFF0C8FB5, 0xFF5AD8EE, R.drawable.widget_btn_theme_ocean);
        }
    }

    /**
     * The widget's haptic: "light" a click, "firm" a heavy click, "off" nothing; `strong` (the goal reached, the streak
     * kept) makes it a double click. Played from a widget tap, i.e. while KinetixFit is in the background — so it uses
     * the physical-emulation usage Android lets background apps play (touch feedback from the background is dropped),
     * and follows the phone's own Touch feedback switch. Same approach as HydrationWidget.haptic.
     */
    @SuppressWarnings("deprecation") // VIBRATOR_SERVICE / vibrate(effect, AudioAttributes): the pre-Android 12 / 13 paths
    static void haptic(Context context, String style, boolean strong) {
        if ("off".equals(style)) return;
        if (android.provider.Settings.System.getInt(context.getContentResolver(), android.provider.Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) == 0) return;
        Vibrator v = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? context.getSystemService(VibratorManager.class).getDefaultVibrator()
            : (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return;
        boolean firm = "firm".equals(style);
        int effect = strong ? VibrationEffect.EFFECT_DOUBLE_CLICK : firm ? VibrationEffect.EFFECT_HEAVY_CLICK : VibrationEffect.EFFECT_CLICK;
        VibrationEffect e = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? VibrationEffect.createPredefined(effect)
            : VibrationEffect.createOneShot(strong ? 40 : firm ? 30 : 18, VibrationEffect.DEFAULT_AMPLITUDE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            v.vibrate(e, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_PHYSICAL_EMULATION));
        } else {
            v.vibrate(e, new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).build());
        }
    }
}
