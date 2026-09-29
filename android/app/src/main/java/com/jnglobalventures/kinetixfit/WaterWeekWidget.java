package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.util.SizeF;
import android.widget.RemoteViews;

/** Water this week: today's count and goal days beside seven bars in tracks (square: stacked). */
public class WaterWeekWidget extends SizedWidget {
    @Override
    SizeF fallback() { return new SizeF(376, 212); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        WaterWidgets.Water w = WaterWidgets.today(context);
        int[] week = WaterWidgets.week(context);
        int met = 0;
        for (int g : week) if (g >= w.goalMl) met++;
        float wd = size.getWidth(), ht = size.getHeight();
        boolean isShort = ht < 120;
        boolean square = wd < 260;
        RemoteViews views = new RemoteViews(context.getPackageName(),
            isShort ? R.layout.widget_water_week_short : square ? R.layout.widget_water_week_square : R.layout.widget_water_week);
        float barsW, barsH;
        if (isShort) {
            // bars only when there's width for them next to the count and the +
            boolean bars = wd >= 260;
            barsW = bars ? wd - 24 - 4 - 96 - 12 - 12 - 40 : 1;
            barsH = ht - 24;
            WaterWidgets.setAmount(context, views, w, Math.min(28, Math.max(20, ht * 0.25f)), 96, false);
            views.setTextViewText(R.id.streak, met + "/7 days met");
            views.setViewVisibility(R.id.bars, bars ? android.view.View.VISIBLE : android.view.View.INVISIBLE);
            if (!bars) {
                views.setOnClickPendingIntent(R.id.add_glass, HydrationWidget.addGlass(context));
                views.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://hydration", 33));
                return views;
            }
        } else if (square) {
            barsW = wd - 32;
            barsH = Math.max(48, ht - 32 - 36 - 42);
            WaterWidgets.setAmount(context, views, w, Math.min(32, Math.max(22, ht * 0.13f)), (wd - 32) * 0.6f, false);
            views.setTextViewText(R.id.streak, "· " + met + "/7 days");
        } else {
            float left = Math.min(128, wd * 0.33f);
            barsW = wd - 32 - left - 16;
            barsH = Math.max(56, ht - 32 - 44);
            WaterWidgets.setAmount(context, views, w, Math.min(44, Math.max(26, ht * 0.19f)), left, false);
            views.setTextViewText(R.id.sub, w.hasData ? "today · of " + w.goal : "Open Kinetix Fit");
            views.setTextViewText(R.id.streak, "Goal met " + met + "/7");
        }
        views.setImageViewBitmap(R.id.bars, WidgetArt.trackBars(context, week, WaterWidgets.weekLetters(), w.goalMl, WaterWidgets.shortAmount(week[6]),
            WidgetStore.px(context, barsW), WidgetStore.px(context, barsH),
            context.getColor(R.color.kx_glass_ink_3), context.getColor(R.color.kx_glass_track)));
        views.setOnClickPendingIntent(R.id.add_glass, HydrationWidget.addGlass(context));
        views.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://hydration", 33));
        return views;
    }
}
