package com.jnglobalventures.kinetixfit;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Check-in (Plus): "How's your energy?" with five pips; a tap checks you in from the home screen — it keeps the streak
 * and, when the app next opens, earns the day's check-in points (src/App.tsx takes it from WidgetStore). A haptic
 * confirms it (a double one when it completes a week). Once checked in: a tick, today's energy and the streak.
 * Colour and haptic are the person's settings (Account → Widgets). Locked card without Plus.
 */
public class CheckInWidget extends SizedWidget {
    static final String ACTION_CHECK_IN = "com.jnglobalventures.kinetixfit.CHECK_IN";
    static final String EXTRA_ENERGY = "energy";
    private static final int[] PIPS = { R.id.pip1, R.id.pip2, R.id.pip3, R.id.pip4, R.id.pip5 };
    private static final int[] DOTS = { R.id.pip1_dot, R.id.pip2_dot, R.id.pip3_dot, R.id.pip4_dot, R.id.pip5_dot };
    private static final int[] LABELS = { R.id.pip1_label, R.id.pip2_label, R.id.pip3_label, R.id.pip4_label, R.id.pip5_label };
    private static final String[] ENERGY = { "Drained", "Low", "Okay", "Good", "Full of energy" };

    static PendingIntent checkIn(Context context, int energy) {
        Intent i = new Intent(context, CheckInWidget.class).setAction(ACTION_CHECK_IN).putExtra(EXTRA_ENERGY, energy)
            .setData(Uri.parse("kinetixfit://checkin/" + energy)); // distinct PendingIntent per pip
        return PendingIntent.getBroadcast(context, 2000 + energy, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_CHECK_IN.equals(intent.getAction())) {
            if (WidgetStore.plus(context)) {
                int energy = Math.max(1, Math.min(5, intent.getIntExtra(EXTRA_ENERGY, 3)));
                if (WidgetStore.addPendingCheckIn(context, energy)) {
                    int streak = WidgetStore.streak(context).current;
                    WidgetThemes.haptic(context, WidgetStore.prefs(context).getString("checkinHaptic", "light"), streak > 0 && streak % 7 == 0);
                }
            }
            WidgetStore.refreshAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    SizeF fallback() { return new SizeF(376, 212); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        if (!WidgetStore.plus(context)) return PlusWidgets.locked(context, "Check-in", size);
        WidgetThemes.Theme t = WidgetThemes.of(WidgetStore.prefs(context).getString("checkinTheme", "violet"));
        WidgetStore.Streak s = WidgetStore.streak(context);
        float w = size.getWidth(), h = size.getHeight();
        boolean isShort = h < 120;
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_checkin);
        if (isShort) { int pad = WidgetStore.px(context, 12); v.setViewPadding(android.R.id.background, pad, pad, pad, pad); }
        v.setInt(R.id.chip, "setColorFilter", t.accent(context));
        v.setTextViewText(R.id.streak, String.valueOf(s.current));
        v.setViewVisibility(R.id.ask, s.today ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.done, s.today ? View.VISIBLE : View.GONE);
        if (s.today) {
            int energy = WidgetStore.energyToday(context);
            v.setImageViewBitmap(R.id.done_tick, WidgetArt.tickCircle(context, WidgetStore.px(context, 44), t.from, t.to));
            v.setTextViewText(R.id.done_sub, (energy > 0 ? "Energy " + energy + "/5 · " : "") + s.current + "-day streak");
            v.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://checkin", 42));
            return v;
        }
        boolean labels = !isShort && w >= 250 && h >= 150;
        v.setViewVisibility(R.id.question, isShort ? View.GONE : View.VISIBLE);
        // five pips across the width, and no taller than the space under the header allows
        float across = (w - 28) / 5f - 10;
        float down = h - 28 - 24 - (isShort ? 8 : 30) - (labels ? 16 : 0);
        int pipPx = WidgetStore.px(context, Math.max(20, Math.min(44, Math.min(across, down))));
        for (int i = 0; i < 5; i++) {
            v.setImageViewBitmap(DOTS[i], WidgetArt.pip(context, pipPx, i + 1, t.from, t.to));
            v.setViewVisibility(LABELS[i], labels ? View.VISIBLE : View.GONE);
            v.setOnClickPendingIntent(PIPS[i], checkIn(context, i + 1));
            v.setContentDescription(PIPS[i], "Check in: energy " + (i + 1) + " of 5, " + ENERGY[i]);
        }
        v.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://checkin", 42));
        return v;
    }
}
