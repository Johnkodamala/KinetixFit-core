package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;

/**
 * What the water widgets share: today's numbers (glasses incl. ones added from a widget, goal, amount, next reminder),
 * the last 7 days, and swapping a layout's preview count TextView for the Archivo number bitmap. The styles are
 * HydrationWidget (the bottle), WaterLevelWidget, WaterRingWidget, WaterQuickWidget and WaterWeekWidget.
 */
final class WaterWidgets {
    private WaterWidgets() {}

    static final class Water {
        boolean hasData;
        int ml, goalMl, glassMl;
        double fill;
        /** "750 ml" → number "750", unit "ml"; "1.25 L" → "1.25", "L" */
        String number, unit, amount, goal, amountOfGoal, next, describe;
    }

    static Water today(Context context) {
        Water w = new Water();
        w.hasData = WidgetStore.prefs(context).contains("hydrationEnabled");
        w.ml = WidgetStore.mlToday(context);
        w.goalMl = WidgetStore.waterGoalMl(context);
        w.glassMl = WidgetStore.glassMl(context);
        w.fill = Math.min(1.0, w.ml / (double) Math.max(1, w.goalMl));
        w.amount = HydrationWidget.amount(w.ml);
        String[] parts = w.amount.split(" ");
        w.number = parts[0];
        w.unit = parts.length > 1 ? parts[1] : "";
        w.goal = HydrationWidget.amount(w.goalMl);
        w.amountOfGoal = w.amount + " of " + w.goal;
        w.describe = w.amountOfGoal + " of water today";
        WidgetStore.Hydration h = WidgetStore.hydration(context);
        w.next = !w.hasData ? ""
            : w.ml >= w.goalMl ? "Goal reached"
            : h.enabled && !h.doneForToday && h.next > 0 ? "Next " + WidgetStore.clock(h.next)
            : "";
        return w;
    }

    /** Short amount for a bar label: "750", "1.2" (litres, one decimal). */
    static String shortAmount(int ml) {
        return ml < 1000 ? String.valueOf(ml) : String.valueOf(Math.round(ml / 100.0) / 10.0).replaceAll("\\.0$", "");
    }

    /**
     * ml for the last 7 days, oldest first, today last (with any widget-added drinks). The app saves the week
     * on each open; days since then are shifted in as empty.
     */
    static int[] week(Context context) {
        SharedPreferences p = WidgetStore.prefs(context);
        int[] out = new int[7];
        try {
            JSONArray saved = new JSONArray(p.getString("waterWeek", "[]"));
            int shift = daysSince(p.getString("day", ""));
            for (int i = 0; i < 7; i++) {
                int from = i + shift - (7 - saved.length());
                if (from >= 0 && from < saved.length()) out[i] = saved.getInt(from);
            }
        } catch (Exception ignored) { /* no week saved yet */ }
        out[6] = WidgetStore.mlToday(context);
        return out;
    }

    /** Narrow day letters for the last 7 days, today last ("M T W T F S S"). */
    static String[] weekLetters() {
        String[] out = new String[7];
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_YEAR, -6);
        SimpleDateFormat f = new SimpleDateFormat("EEEEE", Locale.UK);
        for (int i = 0; i < 7; i++) { out[i] = f.format(c.getTime()); c.add(Calendar.DAY_OF_YEAR, 1); }
        return out;
    }

    private static int daysSince(String dayKey) {
        try {
            Date then = new SimpleDateFormat("yyyy-MM-dd", Locale.UK).parse(dayKey);
            Calendar a = Calendar.getInstance(), b = Calendar.getInstance();
            a.setTime(then);
            int days = 0;
            while (a.before(b) && days < 8 && !sameDay(a, b)) { a.add(Calendar.DAY_OF_YEAR, 1); days++; }
            return days;
        } catch (Exception e) {
            return 7;
        }
    }

    private static boolean sameDay(Calendar a, Calendar b) {
        return a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
    }

    /** Shows the amount ("750 ml": big number, small unit) in place of the layout's preview TextView. */
    static void setAmount(Context context, RemoteViews views, Water w, float sp, float maxWidthDp, boolean shadow) {
        views.setViewVisibility(R.id.count_text, View.GONE);
        views.setViewVisibility(R.id.count, View.VISIBLE);
        views.setImageViewBitmap(R.id.count, w.hasData
            ? WidgetArt.amount(context, w.number, w.unit, sp, WidgetStore.px(context, maxWidthDp), shadow)
            : WidgetArt.display(context, "—", sp, WidgetStore.px(context, maxWidthDp)));
        views.setContentDescription(R.id.count, w.describe);
    }

    static boolean dark(Context context) {
        return (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }
}
