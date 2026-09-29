package com.jnglobalventures.kinetixfit;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Lets the web app hand today's numbers to the home-screen widgets (src/lib/widgets.ts). */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        SharedPreferences.Editor e = WidgetStore.prefs(getContext()).edit();
        e.putString("day", call.getString("day", ""));
        e.putLong("updatedAt", System.currentTimeMillis());
        e.putBoolean("hydrationEnabled", Boolean.TRUE.equals(call.getBoolean("hydrationEnabled", false)));
        e.putInt("startHour", call.getInt("startHour", 9));
        e.putInt("endHour", call.getInt("endHour", 17));
        e.putInt("intervalHours", call.getInt("intervalHours", 2));
        Double snooze = call.getDouble("snoozedUntil");
        e.putLong("snoozedUntil", snooze != null ? snooze.longValue() : 0);
        e.putString("waterDay", call.getString("day", ""));
        e.putInt("waterGlasses", call.getInt("waterGlasses", 0));
        e.putInt("waterGoal", call.getInt("waterGoal", 8));
        Integer ml = call.getInt("waterMl");
        if (ml != null) e.putInt("waterMl", ml); else e.remove("waterMl");
        e.putInt("waterGoalMl", call.getInt("waterGoalMl", 2000));
        e.putInt("glassMl", call.getInt("glassMl", 250));
        Integer steps = call.getInt("steps");
        if (steps != null) e.putInt("steps", steps); else e.remove("steps");
        e.putInt("stepsGoal", call.getInt("stepsGoal", 10000));
        Integer kcal = call.getInt("kcalLeft");
        if (kcal != null) e.putInt("kcalLeft", kcal); else e.remove("kcalLeft");
        e.putInt("kcalEaten", call.getInt("kcalEaten", 0));
        e.putInt("kcalTarget", call.getInt("kcalTarget", 0));
        JSArray week = call.getArray("waterWeek");
        e.putString("waterWeek", week != null ? week.toString() : "[]");
        e.putInt("questsDone", call.getInt("questsDone", 0));
        e.putInt("questsTotal", call.getInt("questsTotal", 3));
        // My stats + the check-in streak (Streak, Check-in)
        e.putInt("protein", call.getInt("protein", 0));
        e.putInt("proteinTarget", call.getInt("proteinTarget", 0));
        e.putInt("points", call.getInt("points", 0));
        e.putInt("workoutsWeek", call.getInt("workoutsWeek", 0));
        e.putInt("streakRun", call.getInt("streakRun", 0));
        e.putString("streakLastDay", call.getString("streakLastDay", ""));
        e.putInt("streakBest", call.getInt("streakBest", 0));
        e.putInt("energyToday", call.getInt("energyToday", 0));
        JSArray days = call.getArray("checkinDays");
        StringBuilder joined = new StringBuilder();
        if (days != null) for (int i = 0; i < days.length(); i++) { if (i > 0) joined.append(','); joined.append(days.optString(i)); }
        e.putString("checkinDays", joined.toString());
        // Plus (left out while the app doesn't know yet — the widgets keep what they were last told)
        Boolean plus = call.getBoolean("plus");
        if (plus != null) e.putBoolean("plus", plus);
        // the Plus widgets' settings (src/lib/widgets.ts flattenPrefs)
        for (String key : new String[] { "statsMetrics", "statsTheme", "quickActions", "quickTheme", "quickHaptic", "checkinTheme", "checkinHaptic" }) {
            String value = call.getString(key);
            if (value != null) e.putString(key, value);
        }
        e.apply();
        WidgetStore.refreshAll(getContext());
        call.resolve();
    }

    /** Check-ins made on the Check-in widget since the last call: { items: [{ at, energy }] }. */
    @PluginMethod
    public void takeCheckIns(PluginCall call) {
        JSArray items = new JSArray();
        for (long[] c : WidgetStore.takePendingCheckIns(getContext())) {
            JSObject o = new JSObject();
            o.put("at", c[0]);
            o.put("energy", c[1]);
            items.put(o);
        }
        JSObject result = new JSObject();
        result.put("items", items);
        call.resolve(result);
    }

    /** Workouts logged with a Quick log button since the last call: { items: [{ at, type, minutes }] }. */
    @PluginMethod
    public void takeWorkouts(PluginCall call) {
        JSArray items = new JSArray();
        for (WidgetStore.PendingWorkout w : WidgetStore.takePendingWorkouts(getContext())) {
            JSObject o = new JSObject();
            o.put("at", w.t);
            o.put("type", w.type);
            o.put("minutes", w.minutes);
            items.put(o);
        }
        JSObject result = new JSObject();
        result.put("items", items);
        call.resolve(result);
    }

    /** The widget class for each kind in src/lib/widgets.ts WIDGETS. */
    static Class<?> provider(String kind) {
        switch (kind == null ? "" : kind) {
            case "hydration": return HydrationWidget.class;
            case "waterLevel": return WaterLevelWidget.class;
            case "waterRing": return WaterRingWidget.class;
            case "waterQuick": return WaterQuickWidget.class;
            case "waterWeek": return WaterWeekWidget.class;
            case "rings": return RingsWidget.class;
            case "steps": return StepsWidget.class;
            case "today": return TodayWidget.class;
            case "scan": return ScanWidget.class;
            case "glass": return GlassWidget.class;
            case "streak": return StreakWidget.class;
            case "checkin": return CheckInWidget.class;
            case "quick": return QuickLogWidget.class;
            case "stats": return StatsWidget.class;
            default: return null;
        }
    }

    private static final String[] KINDS = { "hydration", "waterLevel", "waterRing", "waterQuick", "waterWeek", "rings", "steps", "today",
        "scan", "glass", "streak", "checkin", "quick", "stats" };

    /** { kind } — asks the launcher to place that widget (it shows its own "Add to home screen" dialog). */
    @PluginMethod
    public void pin(PluginCall call) {
        Class<?> cls = provider(call.getString("kind"));
        AppWidgetManager manager = getContext().getSystemService(AppWidgetManager.class);
        JSObject result = new JSObject();
        boolean supported = cls != null && manager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.isRequestPinAppWidgetSupported();
        result.put("supported", supported);
        result.put("requested", supported && manager.requestPinAppWidget(new ComponentName(getContext(), cls), null, null));
        call.resolve(result);
    }

    /** { kinds } — the KinetixFit widgets on the home screen now. */
    @PluginMethod
    public void installed(PluginCall call) {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        JSArray kinds = new JSArray();
        for (String kind : KINDS) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(getContext(), provider(kind)));
            if (ids != null && ids.length > 0) kinds.put(kind);
        }
        JSObject result = new JSObject();
        result.put("kinds", kinds);
        call.resolve(result);
    }

    /** Drinks added with a water widget's + since the last call (ms times + ml each); the app adds them to its log. */
    @PluginMethod
    public void takeGlasses(PluginCall call) {
        JSArray times = new JSArray(), mls = new JSArray();
        for (WidgetStore.Drink d : WidgetStore.takePendingDrinks(getContext())) { times.put(d.t); mls.put(d.ml); }
        JSObject result = new JSObject();
        result.put("times", times);
        result.put("mls", mls);
        call.resolve(result);
    }
}
