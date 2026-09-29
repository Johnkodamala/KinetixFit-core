package com.jnglobalventures.kinetixfit;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Water bottle: the count, amount and next reminder beside a bottle that fills towards the goal, and a glossy
 * + Add a glass. Short (2x1) and wide (4x2) layouts too. Also the receiver for every water widget's + button: it logs
 * the glass(es) and gives a haptic tick — a double tick when that tap reaches the day's goal.
 */
public class HydrationWidget extends SizedWidget {
    static final String ACTION_ADD_GLASS = "com.jnglobalventures.kinetixfit.ADD_GLASS";
    /** how much one tap adds, in ml: the person's glass size, or a 500 ml bottle */
    static final String EXTRA_ML = "ml";

    /** Same as src/lib/water.ts waterAmount(): "750 ml", "2 L", "1.25 L". */
    static String amount(int ml) {
        if (ml < 1000) return ml + " ml";
        String l = String.format(java.util.Locale.UK, "%.2f", ml / 1000.0).replaceAll("0+$", "").replaceAll("\\.$", "");
        return l + " L";
    }

    /** The + button's action for any water widget (they all log through this receiver): one drink of `ml`. */
    static PendingIntent addGlasses(Context context, int ml) {
        Intent add = new Intent(context, HydrationWidget.class).setAction(ACTION_ADD_GLASS).putExtra(EXTRA_ML, ml)
            .setData(android.net.Uri.parse("kinetixfit://add/" + ml)); // distinct PendingIntent per amount
        return PendingIntent.getBroadcast(context, 1000 + ml, add, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** One glass of the person's own size. */
    static PendingIntent addGlass(Context context) {
        return addGlasses(context, WidgetStore.glassMl(context));
    }

    /** The bottle button: 500 ml, or 1 L when the glass itself is 500 ml. */
    static int bottleMl(Context context) {
        return WidgetStore.glassMl(context) >= 500 ? 1000 : 500;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_ADD_GLASS.equals(intent.getAction())) {
            int ml = Math.max(50, Math.min(1000, intent.getIntExtra(EXTRA_ML, WidgetStore.glassMl(context))));
            int before = WidgetStore.mlToday(context), goal = WidgetStore.waterGoalMl(context);
            WidgetStore.addPendingDrinks(context, 1, ml);
            haptic(context, before < goal && before + ml >= goal);
            WidgetStore.refreshAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    /**
     * A light click for a logged drink, a double click when it completes the goal. A widget tap runs while KinetixFit
     * is in the background, and Android drops background vibrations marked as touch feedback ("Ignoring incoming
     * vibration as process … is background") — so this uses the physical-emulation usage, which Android lets
     * background apps play, and checks the phone's own Touch feedback switch itself (off there = no vibration here).
     */
    @SuppressWarnings("deprecation") // VIBRATOR_SERVICE / vibrate(effect, AudioAttributes) are the pre-Android 12 / 13 paths
    static void haptic(Context context, boolean goalReached) {
        if (android.provider.Settings.System.getInt(context.getContentResolver(), android.provider.Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) == 0) return;
        Vibrator v = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? context.getSystemService(VibratorManager.class).getDefaultVibrator()
            : (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return;
        VibrationEffect effect = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? VibrationEffect.createPredefined(goalReached ? VibrationEffect.EFFECT_DOUBLE_CLICK : VibrationEffect.EFFECT_CLICK)
            : VibrationEffect.createOneShot(goalReached ? 40 : 18, VibrationEffect.DEFAULT_AMPLITUDE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            v.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_PHYSICAL_EMULATION));
        } else {
            v.vibrate(effect, new android.media.AudioAttributes.Builder()
                .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).build());
        }
    }

    @Override
    SizeF fallback() { return new SizeF(176, 212); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        WaterWidgets.Water w = WaterWidgets.today(context);
        float wd = size.getWidth(), ht = size.getHeight();
        boolean small = ht < 110;
        boolean wide = !small && wd >= ht * 1.45f;
        RemoteViews views = new RemoteViews(context.getPackageName(),
            small ? R.layout.widget_hydration_small : wide ? R.layout.widget_hydration_wide : R.layout.widget_hydration);
        float pad = small ? 14 : 16, inner = wd - 2 * pad;
        // bottle: the full inner height when short/wide; the body height (below the 30dp header, above the 54dp button) otherwise
        float bottleH = small || wide ? ht - 2 * pad : ht - 2 * pad - 30 - 54;
        bottleH = Math.max(40, Math.min(wide ? 170 : 150, bottleH));
        float bottleW = Math.min(bottleH * 0.5f, inner * (wide ? 0.22f : 0.36f));
        float column = small ? inner - bottleW - 20 - 48 : wide ? inner - bottleW - 26 - 56 : inner - bottleW - 6;
        float sp = small ? Math.min(28, Math.max(20, ht * 0.28f)) : Math.min(wide ? 46 : 40, Math.max(26, bottleH * 0.3f));
        views.setImageViewBitmap(R.id.bottle, WidgetArt.bottle(context, w.fill, Math.round(bottleW - 12), Math.round(bottleH - 12)));
        WaterWidgets.setAmount(context, views, w, sp, column, false);
        views.setTextViewText(R.id.sub, !w.hasData ? "Open Kinetix Fit" : "of " + w.goal);
        if (!small && !wide) views.setTextViewText(R.id.add_glass, "+  Add " + amount(w.glassMl));
        if (!small) {
            String next = w.next;
            views.setTextViewText(R.id.next, next);
            views.setViewVisibility(R.id.next, next.isEmpty() ? View.GONE : View.VISIBLE);
        }
        views.setOnClickPendingIntent(R.id.add_glass, addGlass(context));
        views.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://hydration", 20));
        return views;
    }
}
