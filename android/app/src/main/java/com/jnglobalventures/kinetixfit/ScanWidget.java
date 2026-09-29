package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.util.SizeF;
import android.widget.RemoteViews;

/**
 * Quick scan: "Snap food" opens the camera and "Scan barcode" the barcode scanner, straight from the home screen
 * (kinetixfit://scan/photo and kinetixfit://scan/barcode, handled in src/App.tsx).
 */
public class ScanWidget extends SizedWidget {
    @Override
    SizeF fallback() { return new SizeF(176, 94); }

    @Override
    RemoteViews build(Context context, SizeF size) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_scan);
        views.setOnClickPendingIntent(R.id.scan_photo, WidgetStore.deepLink(context, "kinetixfit://scan/photo", 11));
        views.setOnClickPendingIntent(R.id.scan_barcode, WidgetStore.deepLink(context, "kinetixfit://scan/barcode", 12));
        return views;
    }
}
