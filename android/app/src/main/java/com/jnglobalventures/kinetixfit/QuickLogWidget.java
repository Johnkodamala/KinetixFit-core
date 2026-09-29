package com.jnglobalventures.kinetixfit;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.util.List;

/**
 * Quick log (Plus): up to four buttons the person picks in the app (Account → Widgets): a drink of any size, or a
 * workout ("Walk 30 min"). A tap logs it with a haptic — a double one when a drink reaches the day's water goal. Drinks
 * go to the same place as the water widgets' + (waterPending); workouts to workoutPending (the app files them as
 * workouts added by hand). Two rows when square, one row when wide. Locked card without Plus.
 */
public class QuickLogWidget extends SizedWidget {
    static final String ACTION_LOG = "com.jnglobalventures.kinetixfit.QUICK_LOG";
    static final String EXTRA_INDEX = "index";
    private static final int[] BTN = { R.id.btn1, R.id.btn2, R.id.btn3, R.id.btn4 };
    private static final int[] ICON = { R.id.btn1_icon, R.id.btn2_icon, R.id.btn3_icon, R.id.btn4_icon };
    private static final int[] LABEL = { R.id.btn1_label, R.id.btn2_label, R.id.btn3_label, R.id.btn4_label };

    static PendingIntent log(Context context, int index) {
        Intent i = new Intent(context, QuickLogWidget.class).setAction(ACTION_LOG).putExtra(EXTRA_INDEX, index)
            .setData(Uri.parse("kinetixfit://quick/" + index));
        return PendingIntent.getBroadcast(context, 3000 + index, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_LOG.equals(intent.getAction())) {
            List<WidgetStore.QuickAction> actions = WidgetStore.quickActions(context);
            int index = intent.getIntExtra(EXTRA_INDEX, -1);
            if (WidgetStore.plus(context) && index >= 0 && index < actions.size()) {
                WidgetStore.QuickAction a = actions.get(index);
                String haptic = WidgetStore.prefs(context).getString("quickHaptic", "light");
                if (a.water) {
                    int before = WidgetStore.mlToday(context), goal = WidgetStore.waterGoalMl(context);
                    WidgetStore.addPendingDrinks(context, 1, a.ml);
                    WidgetStore.noteLogged(context, HydrationWidget.amount(a.ml) + " of water");
                    WidgetThemes.haptic(context, haptic, before < goal && before + a.ml >= goal);
                } else {
                    WidgetStore.addPendingWorkout(context, a.type, a.minutes);
                    WidgetThemes.haptic(context, haptic, false);
                }
            }
            WidgetStore.refreshAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    SizeF fallback() { return new SizeF(176, 212); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        if (!WidgetStore.plus(context)) return PlusWidgets.locked(context, "Quick log", size);
        SharedPreferences p = WidgetStore.prefs(context);
        WidgetThemes.Theme t = WidgetThemes.of(p.getString("quickTheme", "ocean"));
        List<WidgetStore.QuickAction> actions = WidgetStore.quickActions(context);
        float w = size.getWidth(), h = size.getHeight();
        boolean wide = w >= 250 || h < 150;
        RemoteViews v = new RemoteViews(context.getPackageName(), wide ? R.layout.widget_quick_log_wide : R.layout.widget_quick_log);
        if (h < 120) { int pad = WidgetStore.px(context, 12); v.setViewPadding(android.R.id.background, pad, pad, pad, pad); }
        v.setInt(R.id.chip, "setColorFilter", t.accent(context));
        v.setTextViewText(R.id.water, HydrationWidget.amount(WidgetStore.mlToday(context)));
        // a short row has no room for the icon above the label (it cut the label off): label only there; narrow
        // buttons get the short label ("250", "Walk") so it isn't cut to "25…"
        int count = Math.min(4, actions.size());
        float column = wide ? (w - 28 - 6 * (count - 1)) / count : (w - 28 - 6) / 2f;
        // button height: inside the padding, under the header (+8), above the "last logged" line (wide, 130dp+); two
        // rows when square and there are more than two buttons
        float buttons = h - (h < 120 ? 24 : 28) - 32 - (wide && h >= 130 ? 21 : 0);
        float row = !wide && actions.size() > 2 ? (buttons - 6) / 2 : buttons;
        boolean iconRoom = row >= 46; // 4 + 20 icon + 2 + 16 label + 4
        boolean narrow = column < 50;
        // four buttons on a 2x1 (~34dp each): a workout's name won't fit ("W…"), so it shows its icon instead
        boolean tiny = column < 40;
        for (int i = 0; i < 4; i++) {
            boolean on = i < actions.size();
            v.setViewVisibility(BTN[i], on ? View.VISIBLE : View.GONE);
            if (!on) continue;
            WidgetStore.QuickAction a = actions.get(i);
            v.setInt(BTN[i], "setBackgroundResource", t.button);
            v.setImageViewResource(ICON[i], a.water ? R.drawable.ic_widget_drop
                : a.type.matches("(?i).*(run|walk|hike).*") ? R.drawable.ic_widget_steps : R.drawable.ic_widget_dumbbell);
            boolean iconOnly = tiny && !a.water && !iconRoom;
            v.setViewVisibility(ICON[i], iconRoom || iconOnly ? View.VISIBLE : View.GONE);
            v.setViewVisibility(LABEL[i], iconOnly ? View.GONE : View.VISIBLE);
            v.setTextViewText(LABEL[i], narrow ? (a.water ? (a.ml < 1000 ? String.valueOf(a.ml) : HydrationWidget.amount(a.ml)) : a.type) : a.label);
            v.setContentDescription(BTN[i], "Log " + (a.water ? HydrationWidget.amount(a.ml) + " of water" : a.type + ", " + a.minutes + " minutes"));
            v.setOnClickPendingIntent(BTN[i], log(context, i));
        }
        if (!wide) v.setViewVisibility(R.id.row2, actions.size() > 2 ? View.VISIBLE : View.GONE);
        if (wide) {
            long at = p.getLong("lastLoggedAt", 0);
            boolean today = at > 0 && WidgetStore.sameDay(at, System.currentTimeMillis());
            v.setTextViewText(R.id.last, today ? "Logged " + p.getString("lastLogged", "") + " · " + WidgetStore.clock(at) : "Tap a button to log it");
            v.setViewVisibility(R.id.last, h >= 130 ? View.VISIBLE : View.GONE);
        }
        v.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://today", 43));
        return v;
    }
}
