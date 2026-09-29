package com.jnglobalventures.kinetixfit;

import android.app.WallpaperColors;
import android.app.WallpaperManager;
import android.content.Context;
import android.os.Build;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Water glass: a clear tumbler that fills with today's water (WidgetArt.waterGlass) on a frosted-glass card
 * (WidgetArt.liquidGlass, drawn for the exact size and tinted by the wallpaper's colour), with the amount beside it and
 * the glossy water +. Dark text over a light wallpaper, white over a dark one (like iOS). Android can't blur what's
 * behind a widget, so the card is a drawn take on frosted glass. The class keeps its old name (Liquid glass test) so
 * placed widgets stay.
 */
public class GlassWidget extends SizedWidget {
    /** Debug gallery only: pretend the wallpaper is light (true) or dark (false); null = read the real wallpaper. */
    static Boolean previewLightBehind = null;

    @Override
    SizeF fallback() { return new SizeF(176, 212); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        WaterWidgets.Water w = WaterWidgets.today(context);
        float wd = size.getWidth(), ht = size.getHeight();
        boolean isShort = ht < 120;
        boolean wide = !isShort && wd >= ht * 1.45f;
        RemoteViews views = new RemoteViews(context.getPackageName(),
            isShort ? R.layout.widget_glass_short : wide ? R.layout.widget_glass_wide : R.layout.widget_glass);

        // What Android lets a widget know about what's behind it: the wallpaper's colour, and whether it's light.
        int tint = 0xFF6E8A96;
        boolean lightBehind = !WaterWidgets.dark(context);
        try {
            WallpaperColors colors = WallpaperManager.getInstance(context).getWallpaperColors(WallpaperManager.FLAG_SYSTEM);
            if (colors != null) {
                tint = colors.getPrimaryColor().toArgb();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) lightBehind = (colors.getColorHints() & WallpaperColors.HINT_SUPPORTS_DARK_TEXT) != 0;
            }
        } catch (Exception ignored) { /* no wallpaper colours (some live wallpapers): theme-based glass */ }
        if (previewLightBehind != null) lightBehind = previewLightBehind;
        int ink = lightBehind ? 0xFF0E1A22 : 0xFFFFFFFF;
        int ink2 = lightBehind ? 0xCC0E1A22 : 0xE6FFFFFF;
        int water = lightBehind ? 0xFF0A7FA3 : 0xFF7BE8F7;

        float radius = context.getResources().getDimension(R.dimen.kx_widget_radius);
        views.setImageViewBitmap(R.id.glass, WidgetArt.liquidGlass(context, WidgetStore.px(context, wd), WidgetStore.px(context, ht), radius, tint, lightBehind));

        // the tumbler's box (the glass grows as tall as it allows): short = the height inside the padding; square = 46% of
        // the width beside the text, under the header; wide = the height under the header, a highball glass
        float tumblerW, tumblerH;
        if (isShort) { tumblerH = ht - 16; tumblerW = tumblerH * (wd < 250 ? 0.56f : 0.8f); } // 2x1: a slim highball, room for the amount
        else if (wide) { tumblerH = ht - 28 - 30; tumblerW = tumblerH * 0.62f; }
        else { tumblerH = ht - 28 - 30; tumblerW = (wd - 28) * 0.46f; }
        views.setImageViewBitmap(R.id.tumbler, WidgetArt.waterGlass(context, w.hasData ? w.fill : 0.5,
            WidgetStore.px(context, tumblerW), WidgetStore.px(context, tumblerH), !lightBehind));
        views.setContentDescription(R.id.tumbler, w.hasData ? "Glass " + Math.round(w.fill * 100) + "% full" : "Water glass");

        String percent = Math.round(w.fill * 100) + "%";
        String next = w.next;
        if (isShort) {
            float text = wd - 24 - tumblerW - 8 - 44 - 8;
            WaterWidgets.setAmount(context, views, w, Math.min(28, Math.max(20, ht * 0.28f)), text, !lightBehind);
            views.setTextViewText(R.id.sub, !w.hasData ? "Open app" : wd < 250 ? "of " + w.goal : "of " + w.goal + " · " + percent);
        } else if (wide) {
            float text = wd - 28 - tumblerW - 14 - 46 - 12;
            views.setTextViewText(R.id.percent, w.hasData ? percent : "");
            WaterWidgets.setAmount(context, views, w, Math.min(42, Math.max(26, ht * 0.2f)), text, !lightBehind);
            views.setTextViewText(R.id.sub, !w.hasData ? "Open Kinetix Fit" : "of " + w.goal + " · " + toGo(w));
            views.setTextViewText(R.id.next, next);
            views.setViewVisibility(R.id.next, next.isEmpty() || next.equals("Goal reached") ? View.GONE : View.VISIBLE);
            views.setTextColor(R.id.next, ink2);
        } else {
            float text = (wd - 28) * 0.54f - 8;
            views.setTextViewText(R.id.percent, w.hasData ? percent : "");
            WaterWidgets.setAmount(context, views, w, Math.min(34, Math.max(20, Math.min(text * 0.3f, ht * 0.16f))), text, !lightBehind);
            views.setTextViewText(R.id.sub, w.hasData ? "of " + w.goal : "Open app");
            views.setTextViewText(R.id.next, w.hasData ? (next.isEmpty() ? toGo(w) : next) : "");
            views.setTextColor(R.id.next, ink2);
        }
        views.setInt(R.id.count, "setColorFilter", ink);
        views.setTextColor(R.id.sub, ink2);
        if (!isShort) {
            views.setTextColor(R.id.label, ink2);
            views.setTextColor(R.id.percent, water);
            views.setInt(R.id.chip_icon, "setColorFilter", water);
        }
        views.setOnClickPendingIntent(R.id.add_glass, HydrationWidget.addGlass(context));
        views.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://hydration", 35));
        return views;
    }

    /** "3 glasses to go" in the person's glass size, "Goal reached" once there. */
    private static String toGo(WaterWidgets.Water w) {
        if (w.ml >= w.goalMl) return "Goal reached";
        int glasses = (int) Math.ceil((w.goalMl - w.ml) / (double) Math.max(50, w.glassMl));
        return glasses + (glasses == 1 ? " glass" : " glasses") + " to go";
    }
}
