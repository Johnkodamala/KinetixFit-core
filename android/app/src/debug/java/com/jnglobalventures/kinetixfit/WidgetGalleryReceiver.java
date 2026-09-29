package com.jnglobalventures.kinetixfit;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.util.SizeF;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;
import java.io.File;
import java.io.FileOutputStream;

/**
 * Debug builds only. Renders every widget (SizedWidget.all()) at 2x1, 2x2, 4x1 and 4x2 onto one PNG, with the
 * launcher's rounded corners, over a wallpaper-like background — for checking alignment, sizes and colours without
 * touching the phone's screen:
 *
 *   adb shell am broadcast -a com.jnglobalventures.kinetixfit.RENDER_WIDGETS -n com.jnglobalventures.kinetixfit/.WidgetGalleryReceiver \
 *       --es theme dark [--ei ml 1500]
 *   adb pull /sdcard/Android/data/com.jnglobalventures.kinetixfit/files/widgets-dark.png
 *
 * `ml` temporarily sets today's water for the render (restored afterwards). `--ez plus true|false` renders the Plus
 * widgets unlocked or locked (restored afterwards). `--ez haptic true [--ez goal true] [--es style light|firm]` instead
 * plays the widget haptic from the background, to check Android doesn't drop it.
 */
public class WidgetGalleryReceiver extends BroadcastReceiver {
    private static final SizeF[] SIZES = { new SizeF(176, 94), new SizeF(176, 212), new SizeF(376, 94), new SizeF(376, 212) };

    @Override
    public void onReceive(Context context, Intent intent) {
        // --ez haptic true: play the widget + haptic from the background (as a widget tap does), then stop
        if (intent.getBooleanExtra("haptic", false)) {
            String style = intent.getStringExtra("style");
            if (style != null) WidgetThemes.haptic(context, style, intent.getBooleanExtra("goal", false));
            else HydrationWidget.haptic(context, intent.getBooleanExtra("goal", false));
            return;
        }
        boolean dark = "dark".equals(intent.getStringExtra("theme"));
        // the Water glass widget reads the real wallpaper; in the gallery, match it to the gallery's own background
        GlassWidget.previewLightBehind = !dark;
        Configuration config = new Configuration(context.getResources().getConfiguration());
        config.uiMode = (config.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | (dark ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO);
        Context themed = context.createConfigurationContext(config);

        SharedPreferences p = WidgetStore.prefs(context);
        int ml = intent.getIntExtra("ml", -1);
        String savedDay = p.getString("waterDay", null);
        int savedMl = p.getInt("waterMl", 0);
        if (ml >= 0) p.edit().putString("waterDay", WidgetStore.dayKey(System.currentTimeMillis())).putInt("waterMl", ml).commit();
        boolean hadPlus = p.contains("plus"), savedPlus = p.getBoolean("plus", false);
        if (intent.hasExtra("plus")) p.edit().putBoolean("plus", intent.getBooleanExtra("plus", false)).commit();

        float d = context.getResources().getDisplayMetrics().density;
        int gap = Math.round(16 * d), colW = Math.round((176 + 376 + 16) * d) + gap * 2;
        SizedWidget[] widgets = SizedWidget.all();
        int rowH = Math.round((94 + 212 + 16) * d) + gap;
        Bitmap out = Bitmap.createBitmap(colW, rowH * widgets.length + gap, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(out);
        Paint bg = new Paint();
        bg.setShader(new LinearGradient(0, 0, colW, out.getHeight(),
            dark ? new int[] { 0xFF1D2A33, 0xFF3B4A52, 0xFF14181C } : new int[] { 0xFF8FA7B5, 0xFFC9D3D8, 0xFF6F7F88 },
            null, Shader.TileMode.CLAMP));
        cv.drawRect(0, 0, colW, out.getHeight(), bg);
        // a few soft colour blobs, like a photo wallpaper — so the frosted Water glass widget has something behind it
        Paint blob = new Paint(Paint.ANTI_ALIAS_FLAG);
        blob.setMaskFilter(new android.graphics.BlurMaskFilter(60 * context.getResources().getDisplayMetrics().density, android.graphics.BlurMaskFilter.Blur.NORMAL));
        int[] tints = { 0x99FF8A5C, 0x994F7BFF, 0x9944D6A0, 0x99FFD166 };
        for (int b = 0; b < 14; b++) {
            blob.setColor(tints[b % tints.length]);
            cv.drawCircle(colW * ((b * 37 % 100) / 100f), out.getHeight() * (b / 14f + 0.03f), 90 * context.getResources().getDisplayMetrics().density, blob);
        }

        float radius = context.getResources().getDimension(R.dimen.kx_widget_radius);
        for (int i = 0; i < widgets.length; i++) {
            float top = gap + i * rowH;
            // column 1: 2x1 over 2x2; column 2: 4x1 over 4x2
            float[][] spots = { { gap, top }, { gap, top + (94 + 16) * d }, { gap + (176 + 16) * d, top }, { gap + (176 + 16) * d, top + (94 + 16) * d } };
            for (int s = 0; s < SIZES.length; s++) {
                try {
                    RemoteViews rv = widgets[i].build(themed, SIZES[s]);
                    FrameLayout host = new FrameLayout(themed);
                    View v = rv.apply(themed, host);
                    int w = Math.round(SIZES[s].getWidth() * d), h = Math.round(SIZES[s].getHeight() * d);
                    v.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
                    v.layout(0, 0, w, h);
                    cv.save();
                    cv.translate(spots[s][0], spots[s][1]);
                    Path clip = new Path();
                    clip.addRoundRect(new RectF(0, 0, w, h), radius, radius, Path.Direction.CW);
                    cv.clipPath(clip);
                    v.draw(cv);
                    cv.restore();
                } catch (Exception e) {
                    Paint err = new Paint(Paint.ANTI_ALIAS_FLAG);
                    err.setColor(Color.RED);
                    err.setTextSize(12 * d);
                    cv.drawText(widgets[i].getClass().getSimpleName() + ": " + e.getMessage(), spots[s][0], spots[s][1] + 20 * d, err);
                }
            }
        }
        if (ml >= 0) p.edit().putString("waterDay", savedDay).putInt("waterMl", savedMl).commit();
        if (intent.hasExtra("plus")) {
            if (hadPlus) p.edit().putBoolean("plus", savedPlus).commit(); else p.edit().remove("plus").commit();
        }

        GlassWidget.previewLightBehind = null;
        String suffix = (ml >= 0 ? "-" + ml : "") + (intent.hasExtra("plus") ? (intent.getBooleanExtra("plus", false) ? "-plus" : "-free") : "");
        File file = new File(context.getExternalFilesDir(null), "widgets-" + (dark ? "dark" : "light") + suffix + ".png");
        try (FileOutputStream os = new FileOutputStream(file)) {
            out.compress(Bitmap.CompressFormat.PNG, 100, os);
        } catch (Exception ignored) { /* nothing to report to; the PNG just won't be there */ }
    }
}
