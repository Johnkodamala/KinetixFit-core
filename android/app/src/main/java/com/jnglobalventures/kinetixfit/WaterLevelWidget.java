package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Water level: the glass card is the glass. The water is drawn for the exact size and rises with each glass; once it
 * reaches the text, the header, count and amount turn white. A glossy white + sits on the water.
 */
public class WaterLevelWidget extends SizedWidget {
    @Override
    SizeF fallback() { return new SizeF(176, 212); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        WaterWidgets.Water w = WaterWidgets.today(context);
        float wd = size.getWidth(), ht = size.getHeight();
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_water_level);
        views.setImageViewBitmap(R.id.water, WidgetArt.waterLevel(context, w.fill,
            WidgetStore.px(context, wd), WidgetStore.px(context, ht), WaterWidgets.dark(context)));
        float sp = Math.min(54, Math.max(28, Math.min(wd, ht) * 0.25f));
        // Each line turns white only once the water surface is above its middle (16dp padding, 24dp header, 8dp gap,
        // the number, the amount) — so near the goal the header can stay dark above the water while the number is white.
        double surfaceFromTop = ht * (1 - (0.07 + 0.88 * w.fill));
        boolean headerWet = surfaceFromTop < 16 + 12;
        boolean countWet = surfaceFromTop < 16 + 24 + 8 + sp * 0.62f;
        boolean subWet = surfaceFromTop < 16 + 24 + 8 + sp * 1.25f + 9;
        int ink = countWet ? 0xFFFFFFFF : context.getColor(R.color.kx_glass_ink);
        int ink2 = subWet ? 0xE6FFFFFF : context.getColor(R.color.kx_glass_ink_2);
        views.setViewVisibility(R.id.label, ht >= 120 ? View.VISIBLE : View.INVISIBLE);
        views.setTextColor(R.id.label, headerWet ? 0xE6FFFFFF : context.getColor(R.color.kx_glass_ink_2));
        views.setInt(R.id.chip, "setColorFilter", headerWet ? 0xFFFFFFFF : context.getColor(R.color.kx_glass_water));
        WaterWidgets.setAmount(context, views, w, sp, wd - 32, false);
        views.setInt(R.id.count, "setColorFilter", ink);
        views.setTextViewText(R.id.sub, w.hasData ? "of " + w.goal : "Open Kinetix Fit");
        views.setTextColor(R.id.sub, ink2);
        views.setOnClickPendingIntent(R.id.add_glass, HydrationWidget.addGlass(context));
        views.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://hydration", 30));
        return views;
    }
}
