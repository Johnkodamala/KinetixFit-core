package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.SizeF;
import android.widget.RemoteViews;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Daily rings: steps (blue), water (cyan) and food (clay) as gradient rings inside each other, with each ring's number
 * and goal (legend below when square, beside when wide). Food is calories eaten of the day's target.
 */
public class RingsWidget extends SizedWidget {
    static final int STEPS = 0xFF5B8CFF, WATER = 0xFF2FC6E4, FOOD = 0xFFFF7A45;

    @Override
    SizeF fallback() { return new SizeF(176, 212); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        SharedPreferences p = WidgetStore.prefs(context);
        NumberFormat n = NumberFormat.getIntegerInstance(Locale.UK);
        boolean fresh = p.getString("day", "").equals(new SimpleDateFormat("yyyy-MM-dd", Locale.UK).format(new Date()));
        int steps = fresh ? p.getInt("steps", -1) : -1;
        int stepsGoal = Math.max(1, p.getInt("stepsGoal", 10000));
        WaterWidgets.Water w = WaterWidgets.today(context);
        int kcal = fresh ? p.getInt("kcalEaten", 0) : 0;
        int kcalTarget = p.getInt("kcalTarget", 0);
        double[] values = { steps > 0 ? steps / (double) stepsGoal : 0, w.fill, kcalTarget > 0 ? kcal / (double) kcalTarget : 0 };

        float wd = size.getWidth(), ht = size.getHeight();
        boolean isShort = ht < 120;
        boolean wide = !isShort && wd >= ht * 1.45f;
        RemoteViews views = new RemoteViews(context.getPackageName(),
            isShort ? R.layout.widget_rings_short : wide ? R.layout.widget_rings_wide : R.layout.widget_rings);
        float ring = isShort ? Math.max(48, ht - 24) : wide ? Math.max(64, ht - 32) : Math.max(64, Math.min(wd - 28, ht - 28 - 8 - 3 * 20));
        views.setImageViewBitmap(R.id.rings, WidgetArt.rings(context, values, new int[] { STEPS, WATER, FOOD }, WidgetStore.px(context, ring)));
        views.setContentDescription(R.id.rings, "Steps " + Math.round(values[0] * 100) + "%, water " + w.amountOfGoal
            + ", food " + (kcalTarget > 0 ? Math.round(values[2] * 100) + "%" : "not set"));
        views.setTextViewText(R.id.steps_value, steps >= 0 ? n.format(steps) : "—");
        views.setTextViewText(R.id.steps_goal, stepsGoal % 1000 == 0 ? "/ " + stepsGoal / 1000 + "k" : "/ " + n.format(stepsGoal));
        views.setTextViewText(R.id.water_value, w.amount);
        views.setTextViewText(R.id.water_goal, "/ " + w.goal);
        views.setTextViewText(R.id.food_value, fresh ? n.format(kcal) : "—");
        views.setTextViewText(R.id.food_goal, kcalTarget > 0 ? "/ " + n.format(kcalTarget) + (isShort ? "" : " kcal") : "kcal");
        views.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://today", 34));
        return views;
    }
}
