package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Shared by the Plus widgets (CheckInWidget, QuickLogWidget, StatsWidget): the locked card shown without KinetixFit
 * Plus — its name and "Tap to unlock", which opens Plus in the app (kinetixfit://plus) — and small helpers.
 */
final class PlusWidgets {
    private PlusWidgets() {}

    static RemoteViews locked(Context context, String name, SizeF size) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_locked);
        v.setTextViewText(R.id.name, name);
        boolean tiny = size.getHeight() < 120;
        v.setViewVisibility(R.id.sub, tiny ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.cta, tiny && size.getWidth() < 200 ? View.GONE : View.VISIBLE);
        v.setContentDescription(android.R.id.background, name + ", a Kinetix Fit Plus widget. Tap to unlock it in the app.");
        v.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://plus", 40));
        return v;
    }

    /** The numbers are from the last time the app was open today; after midnight they'd be yesterday's. */
    static boolean fresh(Context context) {
        return WidgetStore.prefs(context).getString("day", "").equals(new SimpleDateFormat("yyyy-MM-dd", Locale.UK).format(new Date()));
    }
}
