package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * My stats (Plus): the two to four numbers the person picks in the app (steps, water, calories left, protein, streak,
 * points, quests, workouts this week), each with a bar towards its goal where it has one, in their colour. Two per row
 * when square, one row when wide. A tap opens Today. Locked card without Plus.
 */
public class StatsWidget extends SizedWidget {
    private static final int[] CELL = { R.id.cell1, R.id.cell2, R.id.cell3, R.id.cell4 };
    private static final int[] NUM = { R.id.cell1_num, R.id.cell2_num, R.id.cell3_num, R.id.cell4_num };
    private static final int[] LABEL = { R.id.cell1_label, R.id.cell2_label, R.id.cell3_label, R.id.cell4_label };
    private static final int[] BAR = { R.id.cell1_bar, R.id.cell2_bar, R.id.cell3_bar, R.id.cell4_bar };

    private static final class Stat {
        String number, unit = "", label;
        /** 0–1 towards a goal, or -1 when it has none */
        double progress = -1;
    }

    static List<String> metrics(SharedPreferences p) {
        List<String> out = new ArrayList<>();
        for (String m : p.getString("statsMetrics", "steps,water,kcalLeft,streak").split(",")) {
            if (!m.isEmpty() && out.size() < 4 && !out.contains(m)) out.add(m);
        }
        if (out.size() < 2) { out.clear(); out.add("steps"); out.add("water"); out.add("kcalLeft"); out.add("streak"); }
        return out;
    }

    private static Stat stat(Context context, String id) {
        SharedPreferences p = WidgetStore.prefs(context);
        NumberFormat n = NumberFormat.getIntegerInstance(Locale.UK);
        boolean fresh = PlusWidgets.fresh(context);
        Stat s = new Stat();
        switch (id) {
            case "water": {
                int ml = WidgetStore.mlToday(context);
                String[] parts = HydrationWidget.amount(ml).split(" ");
                s.number = parts[0]; s.unit = parts.length > 1 ? parts[1] : ""; s.label = "water";
                s.progress = ml / (double) WidgetStore.waterGoalMl(context);
                break;
            }
            case "kcalLeft": {
                s.number = fresh && p.contains("kcalLeft") ? n.format(Math.max(0, p.getInt("kcalLeft", 0))) : "—";
                s.label = "kcal left";
                int target = p.getInt("kcalTarget", 0);
                if (target > 0) s.progress = (fresh ? p.getInt("kcalEaten", 0) : 0) / (double) target;
                break;
            }
            case "protein": {
                s.number = fresh ? n.format(p.getInt("protein", 0)) : "0"; s.unit = "g"; s.label = "protein";
                int target = p.getInt("proteinTarget", 0);
                if (target > 0) s.progress = (fresh ? p.getInt("protein", 0) : 0) / (double) target;
                break;
            }
            case "streak": {
                int days = WidgetStore.streak(context).current;
                s.number = String.valueOf(days); s.label = "day streak";
                break;
            }
            case "points":
                s.number = n.format(p.getInt("points", 0)); s.label = "points";
                break;
            case "quests": {
                int done = fresh ? p.getInt("questsDone", 0) : 0, total = Math.max(1, p.getInt("questsTotal", 3));
                s.number = done + "/" + total; s.label = "quests"; s.progress = done / (double) total;
                break;
            }
            case "workouts":
                s.number = String.valueOf(p.getInt("workoutsWeek", 0)); s.label = "workouts";
                break;
            default: { // steps
                int steps = fresh ? p.getInt("steps", -1) : -1;
                int goal = Math.max(1, p.getInt("stepsGoal", 10000));
                s.number = steps >= 0 ? n.format(steps) : "—"; s.label = "steps";
                s.progress = steps > 0 ? steps / (double) goal : 0;
            }
        }
        return s;
    }

    @Override
    SizeF fallback() { return new SizeF(176, 212); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        if (!WidgetStore.plus(context)) return PlusWidgets.locked(context, "My stats", size);
        SharedPreferences p = WidgetStore.prefs(context);
        WidgetThemes.Theme t = WidgetThemes.of(p.getString("statsTheme", "ocean"));
        List<String> ids = metrics(p);
        float w = size.getWidth(), h = size.getHeight();
        boolean wide = w >= 250 || h < 150;
        boolean isShort = h < 120;
        // a 2x1 has room for two numbers side by side: the first two chosen
        if (isShort && w < 250 && ids.size() > 2) ids = ids.subList(0, 2);
        RemoteViews v = new RemoteViews(context.getPackageName(), wide ? R.layout.widget_stats_wide : R.layout.widget_stats);
        if (isShort) { int pad = WidgetStore.px(context, 12); v.setViewPadding(android.R.id.background, pad, pad, pad, pad); }
        v.setInt(R.id.chip, "setColorFilter", t.accent(context));
        int perRow = wide ? ids.size() : 2;
        float colDp = (w - 28 - 10 * (perRow - 1)) / perRow;
        int colPx = WidgetStore.px(context, colDp);
        List<Stat> stats = new ArrayList<>();
        String[] numbers = new String[ids.size()];
        for (int i = 0; i < ids.size(); i++) { Stat s = stat(context, ids.get(i)); stats.add(s); numbers[i] = s.number + (s.unit.isEmpty() ? "" : " " + s.unit); }
        // one size for every number: the one at which the longest still fits its column
        float sp = WidgetArt.fitSp(context, numbers, isShort ? 20 : wide ? Math.min(30, Math.max(20, h * 0.16f)) : 26, Math.round(colPx * 0.95f));
        int track = context.getColor(R.color.kx_glass_track);
        for (int i = 0; i < 4; i++) {
            boolean on = i < stats.size();
            v.setViewVisibility(CELL[i], on ? View.VISIBLE : View.GONE);
            if (!on) continue;
            Stat s = stats.get(i);
            Bitmap num = s.unit.isEmpty() || s.number.equals("—")
                ? WidgetArt.display(context, s.number, sp, colPx)
                : WidgetArt.amount(context, s.number, s.unit, sp, colPx, false);
            v.setImageViewBitmap(NUM[i], num);
            v.setContentDescription(NUM[i], s.number + " " + s.unit + " " + s.label);
            v.setTextViewText(LABEL[i], s.label);
            boolean bar = s.progress >= 0 && !isShort;
            v.setViewVisibility(BAR[i], bar ? View.VISIBLE : View.INVISIBLE);
            if (bar) v.setImageViewBitmap(BAR[i], WidgetArt.glowBar(context, Math.min(1, s.progress), colPx, 5, t.from, t.to, track));
        }
        if (!wide) v.setViewVisibility(R.id.row2, stats.size() > 2 ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://today", 44));
        return v;
    }
}
