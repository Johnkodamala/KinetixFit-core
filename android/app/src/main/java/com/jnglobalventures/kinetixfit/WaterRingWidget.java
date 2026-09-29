package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

/** Water ring: a glowing water-gradient ring with the count inside, amount + next and a glossy + (wide: ring | details). */
public class WaterRingWidget extends SizedWidget {
    static final int FROM = 0xFF8BEBF8, TO = 0xFF0E97C0;

    @Override
    SizeF fallback() { return new SizeF(176, 212); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        WaterWidgets.Water w = WaterWidgets.today(context);
        float wd = size.getWidth(), ht = size.getHeight();
        boolean isShort = ht < 120;
        boolean wide = !isShort && wd >= ht * 1.45f;
        int track = context.getColor(R.color.kx_glass_track);
        RemoteViews views = new RemoteViews(context.getPackageName(),
            isShort ? R.layout.widget_water_ring_short : wide ? R.layout.widget_water_ring_wide : R.layout.widget_water_ring);
        String next = w.next;
        if (isShort) {
            // under 230dp wide the ring would squeeze the numbers: count + amount + the + only
            boolean ringFits = wd >= 230;
            views.setViewVisibility(R.id.ring, ringFits ? View.VISIBLE : View.GONE);
            float ring = ringFits ? Math.max(48, ht - 24) : -12;
            views.setImageViewBitmap(R.id.ring, WidgetArt.gradientRing(context, w.fill, WidgetStore.px(context, ring), Math.max(7, ring * 0.12f), FROM, TO, track));
            WaterWidgets.setAmount(context, views, w, Math.min(30, Math.max(20, ht * 0.26f)), wd - 24 - ring - 20 - 44, false);
            views.setTextViewText(R.id.sub, w.hasData ? "of " + w.goal : "Open app");
        } else if (wide) {
            float ring = Math.max(64, ht - 32);
            views.setImageViewBitmap(R.id.ring, WidgetArt.gradientRing(context, w.fill, WidgetStore.px(context, ring), Math.max(9, ring * 0.1f), FROM, TO, track));
            views.setTextViewText(R.id.percent, Math.round(w.fill * 100) + "%");
            WaterWidgets.setAmount(context, views, w, Math.min(40, Math.max(26, ht * 0.19f)), wd - 32 - ring - 16, false);
            views.setTextViewText(R.id.sub, w.hasData ? "of " + w.goal + (next.isEmpty() ? "" : " · " + next) : "Open Kinetix Fit");
            views.setTextViewText(R.id.add_glass, "+  Add " + HydrationWidget.amount(w.glassMl));
        } else {
            // the ring gets the space above the 56dp bottom row, inside 16dp padding
            float ring = Math.max(64, Math.min(wd - 32, ht - 32 - 56));
            views.setImageViewBitmap(R.id.ring, WidgetArt.gradientRing(context, w.fill, WidgetStore.px(context, ring), Math.max(9, ring * 0.095f), FROM, TO, track));
            WaterWidgets.setAmount(context, views, w, Math.min(34, Math.max(20, ring * 0.22f)), ring * 0.64f, false);
            views.setTextViewText(R.id.of, "of " + w.goal);
            views.setTextViewText(R.id.sub, !w.hasData ? "Open app" : w.ml >= w.goalMl ? "Goal reached"
                : HydrationWidget.amount(w.goalMl - w.ml) + " to go");
            views.setTextViewText(R.id.next, next);
            views.setViewVisibility(R.id.next, next.isEmpty() ? View.GONE : View.VISIBLE);
        }
        views.setOnClickPendingIntent(R.id.add_glass, HydrationWidget.addGlass(context));
        views.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://hydration", 31));
        return views;
    }
}
