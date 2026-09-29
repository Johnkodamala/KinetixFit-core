package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.SizeF;
import android.widget.RemoteViews;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Steps: a glowing blue gradient ring with today's steps inside (wide: ring | details). */
public class StepsWidget extends SizedWidget {
    static final int FROM = 0xFFA9C4FF, TO = 0xFF3F7BFF;

    @Override
    SizeF fallback() { return new SizeF(176, 212); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        SharedPreferences p = WidgetStore.prefs(context);
        NumberFormat n = NumberFormat.getIntegerInstance(Locale.UK);
        // steps are from the last time the app was open today; after midnight they'd be yesterday's
        boolean fresh = p.getString("day", "").equals(new SimpleDateFormat("yyyy-MM-dd", Locale.UK).format(new Date()));
        int steps = fresh ? p.getInt("steps", -1) : -1;
        int goal = Math.max(1, p.getInt("stepsGoal", 10000));
        double value = steps > 0 ? steps / (double) goal : 0;
        String stepsText = steps >= 0 ? n.format(steps) : "—";
        long updated = p.getLong("updatedAt", 0);
        int track = context.getColor(R.color.kx_glass_track);

        float w = size.getWidth(), h = size.getHeight();
        boolean isShort = h < 120;
        boolean wide = !isShort && w >= h * 1.45f;
        RemoteViews views = new RemoteViews(context.getPackageName(),
            isShort ? R.layout.widget_steps_short : wide ? R.layout.widget_steps_wide : R.layout.widget_steps);
        if (isShort) {
            float ring = Math.max(48, h - 24);
            views.setImageViewBitmap(R.id.ring, WidgetArt.gradientRing(context, value, WidgetStore.px(context, ring), Math.max(7, ring * 0.12f), FROM, TO, track));
            views.setImageViewBitmap(R.id.steps, WidgetArt.display(context, stepsText, Math.min(30, Math.max(20, h * 0.27f)), WidgetStore.px(context, w - 24 - ring - 20)));
            views.setTextViewText(R.id.goal, "of " + n.format(goal));
        } else if (wide) {
            float ring = Math.max(64, h - 32);
            views.setImageViewBitmap(R.id.ring, WidgetArt.gradientRing(context, value, WidgetStore.px(context, ring), Math.max(9, ring * 0.1f), FROM, TO, track));
            views.setImageViewBitmap(R.id.steps, WidgetArt.display(context, stepsText, Math.min(40, Math.max(24, h * 0.2f)), WidgetStore.px(context, w - 32 - ring - 16)));
            views.setTextViewText(R.id.goal, "of " + n.format(goal) + " steps");
        } else {
            float ring = Math.max(64, Math.min(w - 28, h - 28 - 28 - 20));
            views.setImageViewBitmap(R.id.ring, WidgetArt.gradientRing(context, value, WidgetStore.px(context, ring), Math.max(9, ring * 0.095f), FROM, TO, track));
            views.setImageViewBitmap(R.id.steps, WidgetArt.display(context, stepsText, Math.min(30, Math.max(18, ring * 0.2f)), WidgetStore.px(context, ring * 0.6f)));
            views.setTextViewText(R.id.goal, "of " + n.format(goal));
        }
        views.setContentDescription(R.id.steps, stepsText + " steps");
        views.setTextViewText(R.id.percent, steps >= goal ? "Goal ✓" : steps > 0 ? Math.min(100, steps * 100 / goal) + "%" : isShort ? "0%" : "");
        if (!isShort) views.setTextViewText(R.id.updated, fresh && updated > 0 ? "Updated " + WidgetStore.clock(updated) : "Open Kinetix Fit to update");
        views.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://today", 13));
        return views;
    }
}
