package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * KinetixFit today: three equal columns — steps, calories left, quests — each a number (all the same size), a label
 * and a progress bar on the same lines, with today's water in the header.
 */
public class TodayWidget extends SizedWidget {
    static final int STEPS_FROM = 0xFF9DBBFF, STEPS_TO = 0xFF3F7BFF;
    static final int FOOD_FROM = 0xFFFFB08A, FOOD_TO = 0xFFF0602F;
    static final int QUEST_FROM = 0xFF7FE3B5, QUEST_TO = 0xFF1FA870;

    @Override
    SizeF fallback() { return new SizeF(376, 212); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        SharedPreferences p = WidgetStore.prefs(context);
        NumberFormat n = NumberFormat.getIntegerInstance(Locale.UK);
        // the numbers are from the last time the app was open today; after midnight they'd be yesterday's
        boolean fresh = p.getString("day", "").equals(new SimpleDateFormat("yyyy-MM-dd", Locale.UK).format(new Date()));
        int steps = fresh ? p.getInt("steps", -1) : -1;
        int goal = Math.max(1, p.getInt("stepsGoal", 10000));
        int questsDone = fresh ? p.getInt("questsDone", 0) : 0;
        int questsTotal = Math.max(1, p.getInt("questsTotal", 3));
        int kcalEaten = fresh ? p.getInt("kcalEaten", 0) : 0;
        int kcalTarget = p.getInt("kcalTarget", 0);
        long updated = p.getLong("updatedAt", 0);
        String stepsText = steps >= 0 ? n.format(steps) : "—";
        String kcal = fresh && p.contains("kcalLeft") ? n.format(Math.max(0, p.getInt("kcalLeft", 0))) : "—";
        String quests = fresh ? questsDone + "/" + questsTotal : "—";

        float w = size.getWidth(), h = size.getHeight();
        boolean narrow = w < 250, shortCard = h < 130;
        int cols = narrow ? 2 : 3;
        float inner = w - 32, gaps = 14 * (cols - 1);
        float colW = (inner - gaps) / cols;
        // one size for all three numbers, fitted to the widest of them in a column
        float sp = shortCard ? 20 : Math.min(32, Math.max(20, h * 0.15f));
        int maxPx = WidgetStore.px(context, colW);
        // every number at the same size: the one where the longest of them still fits (with a little air)
        sp = WidgetArt.fitSp(context, narrow ? new String[] { stepsText, kcal } : new String[] { stepsText, kcal, quests }, sp, Math.round(maxPx * 0.92f));
        int track = context.getColor(R.color.kx_glass_track);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);
        if (shortCard) { int pad = WidgetStore.px(context, 12); views.setViewPadding(android.R.id.background, pad + 4, pad, pad + 4, pad); }
        views.setTextViewText(R.id.date, new SimpleDateFormat(narrow ? "EEE d" : "EEE d MMM", Locale.UK).format(new Date()));
        views.setTextViewText(R.id.next_sip, HydrationWidget.amount(WidgetStore.mlToday(context)));
        views.setViewVisibility(R.id.quests_col, narrow ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.updated, shortCard ? View.GONE : View.VISIBLE);
        int barVis = shortCard ? View.GONE : View.VISIBLE;
        views.setViewVisibility(R.id.steps_bar, barVis);
        views.setViewVisibility(R.id.kcal_bar, barVis);
        views.setViewVisibility(R.id.quests_bar, barVis);

        views.setImageViewBitmap(R.id.steps, WidgetArt.display(context, stepsText, sp, maxPx));
        views.setContentDescription(R.id.steps, stepsText + " steps");
        views.setTextViewText(R.id.steps_label, narrow ? "steps" : "of " + n.format(goal) + " steps");
        views.setImageViewBitmap(R.id.kcal, WidgetArt.display(context, kcal, sp, maxPx));
        views.setContentDescription(R.id.kcal, kcal + " kcal left");
        views.setImageViewBitmap(R.id.quests, WidgetArt.display(context, quests, sp, maxPx));
        views.setContentDescription(R.id.quests, quests + " quests done");
        if (!shortCard) {
            views.setImageViewBitmap(R.id.steps_bar, WidgetArt.glowBar(context, steps > 0 ? steps / (double) goal : 0, maxPx, 6, STEPS_FROM, STEPS_TO, track));
            views.setImageViewBitmap(R.id.kcal_bar, WidgetArt.glowBar(context, kcalTarget > 0 ? kcalEaten / (double) kcalTarget : 0, maxPx, 6, FOOD_FROM, FOOD_TO, track));
            views.setImageViewBitmap(R.id.quests_bar, WidgetArt.glowBar(context, questsDone / (double) questsTotal, maxPx, 6, QUEST_FROM, QUEST_TO, track));
        }
        views.setTextViewText(R.id.updated, fresh && updated > 0 ? "Updated " + WidgetStore.clock(updated) : "Open Kinetix Fit to update");
        views.setOnClickPendingIntent(android.R.id.background, WidgetStore.openApp(context));
        return views;
    }
}
