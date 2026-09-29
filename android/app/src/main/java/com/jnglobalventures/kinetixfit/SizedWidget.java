package com.jnglobalventures.kinetixfit;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.util.SizeF;
import android.widget.RemoteViews;

/**
 * Base for every KinetixFit widget: `build` makes its views for one exact size (dp), and the widget is redrawn for
 * each size the launcher shows it at, whenever it's placed, resized or the data changes (WidgetStore.updateSized).
 * The debug widget gallery (src/debug/.../WidgetGalleryActivity) calls the same `build`, so what it shows is what
 * the home screen gets.
 */
abstract class SizedWidget extends AppWidgetProvider {
    abstract RemoteViews build(Context context, SizeF sizeDp);

    /** The size to draw before the launcher reports one (just placed). */
    abstract SizeF fallback();

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        renderIds(context, manager, ids);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        renderIds(context, manager, new int[] { id });
    }

    void renderIds(Context context, AppWidgetManager manager, int[] ids) {
        if (ids == null) return;
        for (int id : ids) WidgetStore.updateSized(manager, id, fallback(), size -> build(context, size));
    }

    void renderAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        renderIds(context, manager, manager.getAppWidgetIds(new ComponentName(context, getClass())));
    }

    /** Every widget, for WidgetStore.refreshAll and the gallery. */
    static SizedWidget[] all() {
        return new SizedWidget[] { new HydrationWidget(), new WaterLevelWidget(), new WaterRingWidget(), new WaterQuickWidget(),
            new WaterWeekWidget(), new RingsWidget(), new StepsWidget(), new TodayWidget(), new ScanWidget(), new GlassWidget(),
            new StreakWidget(), new CheckInWidget(), new QuickLogWidget(), new StatsWidget() };
    }
}
