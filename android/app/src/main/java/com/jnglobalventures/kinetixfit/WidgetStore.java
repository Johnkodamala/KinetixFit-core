package com.jnglobalventures.kinetixfit;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.widget.RemoteViews;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.LinkedHashMap;
import org.json.JSONArray;

/**
 * What the home-screen widgets show, saved by the app (WidgetBridgePlugin) so the widgets work while the app
 * is closed. The next water reminder is worked out here from the schedule, so it stays right between app opens.
 * Glasses added with the water widget's + button wait in "waterPending" until the app takes them (takeGlasses);
 * check-ins from the Check-in widget wait in "checkinPending" and workouts from Quick log in "workoutPending"
 * (takeCheckIns / takeWorkouts). The check-in streak is worked out here too (streak()), so it stays right — and
 * breaks — between app opens.
 */
final class WidgetStore {
    static final String PREFS = "kx_widgets";

    private WidgetStore() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The next water reminder. */
    static final class Hydration {
        boolean enabled;
        /** Between reminder windows, after one that ended today. */
        boolean doneForToday;
        /** Next reminder to show, including a "Remind me in 30 min" snooze; -1 if none. */
        long next;
        /** Next scheduled reminder, ignoring any snooze. */
        long nextScheduled;
    }

    /**
     * Same logic as hydrationWindow() in src/lib/notifications.ts: windows start every day at startHour, and an end
     * before the start is an overnight window that runs on past midnight, so the one running now may have started
     * yesterday.
     */
    static Hydration hydration(Context context) {
        SharedPreferences p = prefs(context);
        Hydration h = new Hydration();
        h.enabled = p.getBoolean("hydrationEnabled", false);
        int start = p.getInt("startHour", 9);
        int end = p.getInt("endHour", 17);
        int every = Math.max(1, p.getInt("intervalHours", 2));
        int count = ((end < start ? end + 24 : end) - start) / every + 1;
        long now = System.currentTimeMillis();

        long[][] windows = new long[3][count];
        long prev = -1;
        h.nextScheduled = -1;
        long[] running = null;
        for (int d = 0; d < 3; d++) {
            for (int k = 0; k < count; k++) windows[d][k] = atHour(start + k * every, d - 1);
            for (long t : windows[d]) {
                if (t <= now) prev = Math.max(prev, t);
                else if (h.nextScheduled < 0 || t < h.nextScheduled) h.nextScheduled = t;
            }
            if (windows[d][0] <= now && now <= windows[d][count - 1]) running = windows[d];
        }
        boolean endedToday = prev > 0 && sameDay(prev, now);
        boolean done = running == null && endedToday;

        h.next = h.nextScheduled;
        long snooze = p.getLong("snoozedUntil", 0);
        boolean snoozeFirst = snooze > now && (h.next < 0 || snooze < h.next);
        if (snoozeFirst) h.next = snooze;
        h.doneForToday = h.enabled && done && !snoozeFirst;
        return h;
    }

    /** A drink added on a widget and not yet taken by the app: its time and amount. */
    static final class Drink {
        final long t;
        final int ml;
        Drink(long t, int ml) { this.t = t; this.ml = ml; }
    }

    /** Drinks logged today: the app's count (if it's from today) plus any added on a widget since. */
    static int glassesToday(Context context) {
        SharedPreferences p = prefs(context);
        long now = System.currentTimeMillis();
        int n = dayKey(now).equals(p.getString("waterDay", "")) ? p.getInt("waterGlasses", 0) : 0;
        for (Drink d : pendingDrinks(p)) if (sameDay(d.t, now)) n++;
        return n;
    }

    /** Water today in ml: the app's total (if it's from today) plus drinks added on a widget since. */
    static int mlToday(Context context) {
        SharedPreferences p = prefs(context);
        long now = System.currentTimeMillis();
        boolean today = dayKey(now).equals(p.getString("waterDay", ""));
        // an older app build only sent glasses: count those as 250 ml
        int ml = !today ? 0 : p.contains("waterMl") ? p.getInt("waterMl", 0) : p.getInt("waterGlasses", 0) * 250;
        for (Drink d : pendingDrinks(p)) if (sameDay(d.t, now)) ml += d.ml;
        return ml;
    }

    static int waterGoalMl(Context context) {
        SharedPreferences p = prefs(context);
        return Math.max(250, p.contains("waterGoalMl") ? p.getInt("waterGoalMl", 2000) : p.getInt("waterGoal", 8) * 250);
    }

    /** The person's glass size (50–500 ml), set on the app's Hydration page. */
    static int glassMl(Context context) {
        return Math.max(50, prefs(context).getInt("glassMl", 250));
    }

    /** Adds widget drinks of `ml` each, 1 ms apart: the app's log removes a drink by its time, so times must differ. */
    static synchronized void addPendingDrinks(Context context, int count, int ml) {
        SharedPreferences p = prefs(context);
        JSONArray list = new JSONArray();
        long last = 0;
        for (Drink d : pendingDrinks(p)) { list.put(new JSONArray().put(d.t).put(d.ml)); last = Math.max(last, d.t); }
        long now = Math.max(System.currentTimeMillis(), last + 1);
        for (int i = 0; i < count; i++) list.put(new JSONArray().put(now + i).put(ml));
        p.edit().putString("waterPending", list.toString()).apply();
    }

    /** The widget-added drinks, removed from the store: the app files them in its own log. */
    static synchronized Drink[] takePendingDrinks(Context context) {
        SharedPreferences p = prefs(context);
        Drink[] drinks = pendingDrinks(p);
        p.edit().remove("waterPending").apply();
        return drinks;
    }

    // Stored as [[time, ml], …]; older builds stored bare times (one 250 ml glass each).
    private static Drink[] pendingDrinks(SharedPreferences p) {
        try {
            JSONArray list = new JSONArray(p.getString("waterPending", "[]"));
            Drink[] out = new Drink[list.length()];
            for (int i = 0; i < out.length; i++) {
                JSONArray pair = list.optJSONArray(i);
                out[i] = pair != null ? new Drink(pair.getLong(0), pair.optInt(1, 250)) : new Drink(list.getLong(i), 250);
            }
            return out;
        } catch (Exception e) {
            return new Drink[0];
        }
    }

    // --- KinetixFit Plus + the Plus widgets' settings (the app writes them; src/lib/widgets.ts WidgetPrefs) ---

    /** Whether the app last said this person has Plus (false until it knows). */
    static boolean plus(Context context) {
        return prefs(context).getBoolean("plus", false);
    }

    /** One Quick log button: a drink of `ml`, or a workout of `type` for `minutes`; `label` is what the button says. */
    static final class QuickAction {
        final boolean water;
        final int ml;
        final String type;
        final int minutes;
        final String label;
        QuickAction(boolean water, int ml, String type, int minutes, String label) {
            this.water = water; this.ml = ml; this.type = type; this.minutes = minutes; this.label = label;
        }
    }

    /** The Quick log buttons (1–4); the default three before the app has sent any. */
    static List<QuickAction> quickActions(Context context) {
        List<QuickAction> out = new ArrayList<>();
        try {
            JSONArray list = new JSONArray(prefs(context).getString("quickActions", "[]"));
            for (int i = 0; i < list.length() && out.size() < 4; i++) {
                org.json.JSONObject a = list.getJSONObject(i);
                if ("water".equals(a.optString("k"))) {
                    int ml = a.optInt("ml", 250);
                    if (ml >= 50 && ml <= 1000) out.add(new QuickAction(true, ml, "", 0, HydrationWidget.amount(ml)));
                } else if ("workout".equals(a.optString("k"))) {
                    String type = a.optString("t", "").trim();
                    int minutes = a.optInt("m", 30);
                    if (!type.isEmpty() && minutes >= 1 && minutes <= 600) out.add(new QuickAction(false, 0, type, minutes, type + " " + minutes));
                }
            }
        } catch (Exception ignored) { /* the default below */ }
        if (out.isEmpty()) {
            out.add(new QuickAction(true, 250, "", 0, "250 ml"));
            out.add(new QuickAction(true, 500, "", 0, "500 ml"));
            out.add(new QuickAction(false, 0, "Walk", 30, "Walk 30"));
        }
        return out;
    }

    /** A workout logged with a Quick log button, not yet taken by the app. */
    static final class PendingWorkout {
        final long t;
        final String type;
        final int minutes;
        PendingWorkout(long t, String type, int minutes) { this.t = t; this.type = type; this.minutes = minutes; }
    }

    static synchronized void addPendingWorkout(Context context, String type, int minutes) {
        SharedPreferences p = prefs(context);
        JSONArray list;
        try { list = new JSONArray(p.getString("workoutPending", "[]")); } catch (Exception e) { list = new JSONArray(); }
        list.put(new JSONArray().put(System.currentTimeMillis()).put(type).put(minutes));
        p.edit().putString("workoutPending", list.toString())
            .putString("lastLogged", type + " " + minutes + " min").putLong("lastLoggedAt", System.currentTimeMillis()).apply();
    }

    static synchronized PendingWorkout[] takePendingWorkouts(Context context) {
        SharedPreferences p = prefs(context);
        List<PendingWorkout> out = new ArrayList<>();
        try {
            JSONArray list = new JSONArray(p.getString("workoutPending", "[]"));
            for (int i = 0; i < list.length(); i++) {
                JSONArray w = list.getJSONArray(i);
                out.add(new PendingWorkout(w.getLong(0), w.getString(1), w.getInt(2)));
            }
        } catch (Exception ignored) { /* nothing readable */ }
        p.edit().remove("workoutPending").apply();
        return out.toArray(new PendingWorkout[0]);
    }

    /** Remembers a drink logged with a Quick log button, for the widget's "last logged" line. */
    static void noteLogged(Context context, String what) {
        prefs(context).edit().putString("lastLogged", what).putLong("lastLoggedAt", System.currentTimeMillis()).apply();
    }

    // --- The check-in streak (same rules as src/lib/streak.ts) ---

    /** Check-ins made on the Check-in widget and not yet taken by the app: [time, energy]. */
    private static List<long[]> pendingCheckIns(SharedPreferences p) {
        List<long[]> out = new ArrayList<>();
        try {
            JSONArray list = new JSONArray(p.getString("checkinPending", "[]"));
            for (int i = 0; i < list.length(); i++) {
                JSONArray c = list.getJSONArray(i);
                out.add(new long[] { c.getLong(0), c.getInt(1) });
            }
        } catch (Exception ignored) { /* none */ }
        return out;
    }

    /** Days with a check-in: the app's last 14 days plus any made on the widget since. */
    static java.util.Set<String> checkInDays(Context context) {
        SharedPreferences p = prefs(context);
        java.util.Set<String> days = new java.util.HashSet<>();
        for (String d : p.getString("checkinDays", "").split(",")) if (!d.isEmpty()) days.add(d);
        for (long[] c : pendingCheckIns(p)) days.add(dayKey(c[0]));
        return days;
    }

    /** Today's energy (1–5) if checked in today — from the widget or the app — else 0. */
    static int energyToday(Context context) {
        SharedPreferences p = prefs(context);
        long now = System.currentTimeMillis();
        for (long[] c : pendingCheckIns(p)) if (sameDay(c[0], now)) return (int) c[1];
        return dayKey(now).equals(p.getString("day", "")) ? p.getInt("energyToday", 0) : 0;
    }

    /** A check-in tapped on the widget. False (nothing saved) when today already has one. */
    static synchronized boolean addPendingCheckIn(Context context, int energy) {
        SharedPreferences p = prefs(context);
        if (checkInDays(context).contains(dayKey(System.currentTimeMillis()))) return false;
        JSONArray list;
        try { list = new JSONArray(p.getString("checkinPending", "[]")); } catch (Exception e) { list = new JSONArray(); }
        list.put(new JSONArray().put(System.currentTimeMillis()).put(energy));
        p.edit().putString("checkinPending", list.toString()).apply();
        return true;
    }

    static synchronized long[][] takePendingCheckIns(Context context) {
        SharedPreferences p = prefs(context);
        List<long[]> out = pendingCheckIns(p);
        p.edit().remove("checkinPending").apply();
        return out.toArray(new long[0][]);
    }

    static final class Streak {
        /** days in a row ending today (if checked in) or yesterday; 0 when broken */
        int current;
        boolean today;
        int best;
        /** the last 7 days, oldest first, today last */
        boolean[] week = new boolean[7];
    }

    /**
     * The streak now. The app sends the run of days ending on the last day it saw a check-in (streakRun, streakLastDay);
     * days since then come from checkInDays (the app's recent days + widget check-ins), so a widget check-in extends it
     * and a missed day breaks it without the app being opened.
     */
    static Streak streak(Context context) {
        SharedPreferences p = prefs(context);
        java.util.Set<String> days = checkInDays(context);
        String last = p.getString("streakLastDay", "");
        int run = p.getInt("streakRun", 0);
        Calendar c = Calendar.getInstance();
        String today = dayKey(c.getTimeInMillis());
        Streak s = new Streak();
        s.today = days.contains(today);
        // walk back from today (or yesterday) through days with a check-in; at the app's last day, add its run
        Calendar d = Calendar.getInstance();
        if (!s.today) d.add(Calendar.DAY_OF_YEAR, -1);
        int n = 0;
        for (int guard = 0; guard < 400; guard++) {
            String k = dayKey(d.getTimeInMillis());
            if (k.equals(last) && run > 0) { n += run; break; }
            if (!days.contains(k)) break;
            n++;
            d.add(Calendar.DAY_OF_YEAR, -1);
        }
        s.current = n;
        s.best = Math.max(p.getInt("streakBest", 0), n);
        Calendar w = Calendar.getInstance();
        w.add(Calendar.DAY_OF_YEAR, -6);
        for (int i = 0; i < 7; i++) { s.week[i] = days.contains(dayKey(w.getTimeInMillis())); w.add(Calendar.DAY_OF_YEAR, 1); }
        return s;
    }

    static String dayKey(long millis) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(millis);
        return String.format(Locale.UK, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    static boolean sameDay(long a, long b) {
        Calendar x = Calendar.getInstance(), y = Calendar.getInstance();
        x.setTimeInMillis(a);
        y.setTimeInMillis(b);
        return x.get(Calendar.YEAR) == y.get(Calendar.YEAR) && x.get(Calendar.DAY_OF_YEAR) == y.get(Calendar.DAY_OF_YEAR);
    }

    static String clock(long millis) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(millis);
        return String.format(Locale.UK, "%02d:%02d", c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE));
    }

    static String until(long millis) {
        long min = Math.max(1, Math.round((millis - System.currentTimeMillis()) / 60000.0));
        if (min < 60) return "in " + min + " min";
        long h = min / 60, m = min % 60;
        return m == 0 ? "in " + h + " h" : "in " + h + " h " + m + " min";
    }

    /** `hour` o'clock, `dayOffset` days from today; hours past 23 roll into the next day (overnight windows). */
    private static long atHour(int hour, int dayOffset) {
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_MONTH, dayOffset + hour / 24);
        c.set(Calendar.HOUR_OF_DAY, hour % 24);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    /** Tapping a widget opens the app. */
    static PendingIntent openApp(Context context) {
        Intent intent = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Opens a kinetixfit:// link in the app (handled in src/App.tsx). */
    static PendingIntent deepLink(Context context, String url, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url), context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Builds the widget's views for one exact size (in dp). */
    interface SizedViews {
        RemoteViews build(SizeF sizeDp);
    }

    /**
     * The sizes a placed widget is actually shown at, in dp — usually one for portrait and one for landscape. Android 12+
     * reports them exactly; older launchers only give min/max width and height (portrait = min width × max height).
     */
    @SuppressWarnings("deprecation") // the typed getParcelableArrayList is Android 13+; Android 12 needs the old one
    static List<SizeF> sizes(AppWidgetManager manager, int id) {
        Bundle o = manager.getAppWidgetOptions(id);
        List<SizeF> out = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ArrayList<SizeF> exact = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? o.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES, SizeF.class)
                : o.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            if (exact != null) for (SizeF s : exact) if (s.getWidth() > 0 && s.getHeight() > 0) out.add(s);
        }
        if (out.isEmpty()) {
            int minW = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0), maxW = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0);
            int minH = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0), maxH = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            if (minW > 0 && maxH > 0) out.add(new SizeF(minW, maxH));
            if (maxW > 0 && minH > 0 && (maxW != minW || maxH != minH)) out.add(new SizeF(maxW, minH));
        }
        return out;
    }

    /**
     * Shows a widget drawn for each size it's displayed at, so resizing it (or turning the phone) swaps to a layout and
     * artwork made for that size instead of stretching or clipping one fixed layout. `fallback` is used when the
     * launcher reports no size yet (just placed).
     */
    static void updateSized(AppWidgetManager manager, int id, SizeF fallback, SizedViews views) {
        List<SizeF> sizes = sizes(manager, id);
        if (sizes.isEmpty()) sizes.add(fallback);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Map<SizeF, RemoteViews> map = new LinkedHashMap<>();
            for (SizeF s : sizes) if (map.size() < 8 && !map.containsKey(s)) map.put(s, views.build(s));
            manager.updateAppWidget(id, new RemoteViews(map));
        } else {
            manager.updateAppWidget(id, views.build(sizes.get(0)));
        }
    }

    static int px(Context context, float dp) {
        return Math.round(dp * context.getResources().getDisplayMetrics().density);
    }

    /** Redraw every placed KinetixFit widget. */
    static void refreshAll(Context context) {
        for (SizedWidget widget : SizedWidget.all()) widget.renderAll(context);
    }
}
