package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

/** Water quick add: header, count and a glowing bar, then glossy + Glass (250 ml) and glass + Bottle (500 ml). */
public class WaterQuickWidget extends SizedWidget {
    @Override
    SizeF fallback() { return new SizeF(376, 94); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        WaterWidgets.Water w = WaterWidgets.today(context);
        float wd = size.getWidth(), ht = size.getHeight();
        boolean bottle = wd >= 280;
        boolean narrow = wd < 230; // no room for the Glass pill: a round + instead, and no amount / "glasses"
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_water_quick);
        views.setViewVisibility(R.id.add_glass, narrow ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.add_round, narrow ? View.VISIBLE : View.GONE);
        views.setViewVisibility(R.id.sub, narrow ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.of, narrow ? View.GONE : View.VISIBLE);
        float buttons = narrow ? 48 : bottle ? 86 * 2 + 8 : 86;
        float column = wd - 28 - 12 - buttons;
        WaterWidgets.setAmount(context, views, w, Math.min(30, Math.max(20, ht * 0.24f)), narrow ? column : column * 0.6f, false);
        views.setTextViewText(R.id.sub, w.hasData ? Math.round(w.fill * 100) + "%" : "");
        views.setTextViewText(R.id.of, "of " + w.goal);
        int bottleMl = HydrationWidget.bottleMl(context);
        views.setTextViewText(R.id.glass_ml, HydrationWidget.amount(w.glassMl));
        views.setTextViewText(R.id.bottle_ml, HydrationWidget.amount(bottleMl));
        views.setImageViewBitmap(R.id.bar, WidgetArt.glowBar(context, w.fill, WidgetStore.px(context, column), 7,
            0xFF7BE8F7, 0xFF0E97C0, context.getColor(R.color.kx_glass_track)));
        views.setViewVisibility(R.id.add_bottle, bottle ? View.VISIBLE : View.GONE);
        views.setOnClickPendingIntent(R.id.add_glass, HydrationWidget.addGlass(context));
        views.setOnClickPendingIntent(R.id.add_round, HydrationWidget.addGlass(context));
        views.setOnClickPendingIntent(R.id.add_bottle, HydrationWidget.addGlasses(context, bottleMl));
        views.setOnClickPendingIntent(android.R.id.background, WidgetStore.deepLink(context, "kinetixfit://hydration", 32));
        return views;
    }
}
