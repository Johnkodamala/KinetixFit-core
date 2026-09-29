package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Streak (free): the check-in streak (WidgetStore.streak — same rules as src/lib/streak.ts) as a big flame-orange
 * number, "Done today" once checked in, and the last 7 days as dots. Short (one row), square and wide layouts.
 * A tap opens Today at the check-in card (kinetixfit://checkin).
 */
public class StreakWidget extends SizedWidget {
    @Override
    SizeF fallback() { return new SizeF(176, 212); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        WidgetStore.Streak s = WidgetStore.streak(context);
        float w = size.getWidth(), h = size.getHeight();
        boolean isShort = h < 120;
        boolean wide = !isShort && w >= h * 1.45f;
        RemoteViews v = new RemoteViews(context.getPackageName(),
            isShort ? R.layout.widget_streak_short : wide ? R.layout.widget_streak_wide : R.layout.widget_streak);
        boolean dark = WaterWidgets.dark(context);
        int track = context.getColor(R.color.kx_glass_track), ink3 = context.getColor(R.color.kx_glass_ink_3);
        String n = String.valueOf(s.current);
        String[] letters = WaterWidgets.weekLetters();
        if (isShort) {
            v.setImageViewBitmap(R.id.count, WidgetArt.display(context, n, Math.min(30, Math.max(20, h * 0.3f)), WidgetStore.px(context, w * 0.22f)));
            boolean dots = w >= 250;
            v.setViewVisibility(R.id.dots, dots ? View.VISIBLE : View.GONE);
            if (dots) v.setImageViewBitmap(R.id.dots, WidgetArt.streakDots(context, s.week, null, WidgetStore.px(context, w * 0.45f), 18, track, ink3, dark));
        } else if (wide) {
            v.setImageViewBitmap(R.id.count, WidgetArt.display(context, n, Math.min(46, Math.max(30, h * 0.24f)), WidgetStore.px(context, w * 0.3f)));
            v.setTextViewText(R.id.best, "Best " + s.best + (s.best == 1 ? " day" : " days"));
            v.setImageViewBitmap(R.id.dots, WidgetArt.streakDots(context, s.week, letters, WidgetStore.px(context, w * 0.55f), 24, track, ink3, dark));
        } else {
            v.setImageViewBitmap(R.id.count, WidgetArt.display(context, n, Math.min(44, Math.max(28, h * 0.22f)), WidgetStore.px(context, w - 28)));
            v.setImageViewBitmap(R.id.dots, WidgetArt.streakDots(context, s.week, letters, WidgetStore.px(context, w - 28), 20, track, ink3, dark));
        }
        v.setTextViewText(R.id.label, s.current == 1 ? "day streak" : "day streak");
        if (!isShort) {
            v.setTextViewText(R.id.status, s.today ? "Done today" : s.current > 0 ? "Check in today" : "Start today");
            v.setTextColor(R.id.status, context.getColor(s.today ? R.color.kx_good : R.color.kx_glass_ink_3));
        }
        v.setContentDescription(R.id.count, s.current + "-day check-in streak" + (s.today ? ", checked in today" : ""));
        v.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://checkin", 41));
        return v;
    }
}
