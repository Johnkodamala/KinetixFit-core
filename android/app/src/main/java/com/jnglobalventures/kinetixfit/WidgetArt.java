package com.jnglobalventures.kinetixfit;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.SweepGradient;
import android.graphics.Typeface;

/**
 * The widgets' artwork, drawn into bitmaps because RemoteViews can't draw shapes: the glossy bottle, the steps ring, the lane progress bar and the quest pips. Mirrors the
 * iOS widgets (ios/App/KinetixFitWidgets). Colours read on both the light and the dark widget backgrounds, so a theme
 * switch never leaves a stale bitmap behind.
 */
final class WidgetArt {
    static final int WATER = 0xFF1BA3C6;
    static final int WATER_DEEP = 0xFF0A6F8E;
    static final int ACCENT = 0xFFFF6A3D;
    static final int STEPS_BRIGHT = 0xFF6E9EFF;

    private WidgetArt() {}

    private static float dp(Context c) {
        return c.getResources().getDisplayMetrics().density;
    }

    private static Paint paint() {
        return new Paint(Paint.ANTI_ALIAS_FLAG);
    }

    private static Path bottlePath(float x, float y, float w, float h) {
        Path p = new Path();
        p.moveTo(x + w * 0.34f, y + h * 0.10f);
        p.lineTo(x + w * 0.34f, y + h * 0.20f);
        p.quadTo(x + w * 0.06f, y + h * 0.23f, x + w * 0.06f, y + h * 0.36f);
        p.lineTo(x + w * 0.06f, y + h * 0.86f);
        p.quadTo(x + w * 0.06f, y + h, x + w * 0.22f, y + h);
        p.lineTo(x + w * 0.78f, y + h);
        p.quadTo(x + w * 0.94f, y + h, x + w * 0.94f, y + h * 0.86f);
        p.lineTo(x + w * 0.94f, y + h * 0.36f);
        p.quadTo(x + w * 0.94f, y + h * 0.23f, x + w * 0.66f, y + h * 0.20f);
        p.lineTo(x + w * 0.66f, y + h * 0.10f);
        p.close();
        return p;
    }

    private static Path waterPath(float x, float y, float w, float h, double level, double phase) {
        float top = (float) (y + h - h * level);
        float amp = Math.min(3, h * 0.03f);
        Path p = new Path();
        p.moveTo(x, y + h);
        p.lineTo(x, top);
        for (int i = 0; i <= 24; i++) {
            float px = x + w * i / 24f;
            p.lineTo(px, (float) (top + amp * Math.sin(phase + i / 24.0 * Math.PI * 3)));
        }
        p.lineTo(x + w, y + h);
        p.close();
        return p;
    }

    /** A glass bottle, filled to `fill` (0..1) with a wave on top. Size in dp. */
    static Bitmap bottle(Context c, double fill, int wDp, int hDp) {
        float d = dp(c);
        int pad = Math.round(6 * d);
        float w = wDp * d, h = hDp * d;
        Bitmap bmp = Bitmap.createBitmap(Math.round(w) + pad * 2, Math.round(h) + pad * 2, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        float x = pad, y = pad;
        Path body = bottlePath(x, y, w, h);
        double phase = System.currentTimeMillis() / 900_000.0;

        // soft glow under the bottle
        Paint glow = paint();
        glow.setColor(WATER);
        glow.setAlpha(70);
        glow.setMaskFilter(new BlurMaskFilter(5 * d, BlurMaskFilter.Blur.NORMAL));
        cv.drawPath(body, glow);

        cv.save();
        cv.clipPath(body);
        Paint glass = paint();
        glass.setColor(WATER);
        glass.setAlpha(28);
        cv.drawRect(x, y, x + w, y + h, glass);
        Paint back = paint();
        back.setColor(WATER);
        back.setAlpha(90);
        cv.drawPath(waterPath(x, y, w, h, 0.12 + 0.78 * fill, phase + 1.4), back);
        Paint water = paint();
        water.setShader(new LinearGradient(0, y + h * 0.3f, 0, y + h, 0xCC1BA3C6, WATER_DEEP, Shader.TileMode.CLAMP));
        cv.drawPath(waterPath(x, y, w, h, 0.10 + 0.78 * fill, phase), water);
        cv.restore();

        Paint outline = paint();
        outline.setStyle(Paint.Style.STROKE);
        outline.setStrokeWidth(1.6f * d);
        outline.setColor(WATER);
        outline.setAlpha(200);
        cv.drawPath(body, outline);

        Paint shine = paint();
        shine.setColor(Color.WHITE);
        shine.setAlpha(150);
        float sx = x + w * 0.16f, sy = y + h * 0.44f;
        cv.drawRoundRect(new RectF(sx, sy, sx + w * 0.08f, sy + h * 0.34f), w * 0.04f, w * 0.04f, shine);

        Paint cap = paint();
        cap.setShader(new LinearGradient(0, y, 0, y + h * 0.1f, WATER, WATER_DEEP, Shader.TileMode.CLAMP));
        cv.drawRoundRect(new RectF(x + w * 0.28f, y, x + w * 0.72f, y + h * 0.1f), 3 * d, 3 * d, cap);
        return bmp;
    }

    /** A glowing white ring towards the steps goal, for the steps-blue card. Size in dp. */
    static Bitmap ring(Context c, double value, int sizeDp) {
        float d = dp(c);
        int size = Math.round(sizeDp * d);
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        float line = 9 * d, r = size / 2f - line / 2 - 3 * d, cx = size / 2f;
        RectF oval = new RectF(cx - r, cx - r, cx + r, cx + r);

        Paint track = paint();
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(line);
        track.setColor(Color.WHITE);
        track.setAlpha(40);
        cv.drawCircle(cx, cx, r, track);

        float sweep = (float) (360 * Math.min(1, Math.max(0, value)));
        if (sweep > 0) {
            Paint glow = paint();
            glow.setStyle(Paint.Style.STROKE);
            glow.setStrokeWidth(line);
            glow.setStrokeCap(Paint.Cap.ROUND);
            glow.setColor(Color.WHITE);
            glow.setAlpha(110);
            glow.setMaskFilter(new BlurMaskFilter(4 * d, BlurMaskFilter.Blur.NORMAL));
            cv.drawArc(oval, -90, sweep, false, glow);

            Paint arc = paint();
            arc.setStyle(Paint.Style.STROKE);
            arc.setStrokeWidth(line);
            arc.setStrokeCap(Paint.Cap.ROUND);
            SweepGradient g = new SweepGradient(cx, cx, new int[] { 0x8CFFFFFF, 0xFFFFFFFF }, new float[] { 0f, Math.max(0.05f, sweep / 360f) });
            android.graphics.Matrix m = new android.graphics.Matrix();
            m.setRotate(-90, cx, cx);
            g.setLocalMatrix(m);
            arc.setShader(g);
            cv.drawArc(oval, -90, sweep, false, arc);
        }
        return bmp;
    }

    /** Progress drawn like a lane: clay running into steps blue, with a glow. Width in px, height 6dp. */
    static Bitmap laneBar(Context c, double value, int widthPx) {
        float d = dp(c);
        int h = Math.round(12 * d), w = Math.max(Math.round(40 * d), widthPx);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        float bar = 3 * d, mid = h / 2f, left = 3 * d, right = w - 3 * d;
        Paint track = paint();
        track.setColor(Color.WHITE);
        track.setAlpha(30);
        cv.drawRoundRect(new RectF(left, mid - bar, right, mid + bar), bar, bar, track);
        float end = left + (right - left) * (float) Math.min(1, Math.max(0, value));
        if (end > left + 2 * bar) {
            Paint glow = paint();
            glow.setColor(STEPS_BRIGHT);
            glow.setAlpha(120);
            glow.setMaskFilter(new BlurMaskFilter(3 * d, BlurMaskFilter.Blur.NORMAL));
            cv.drawRoundRect(new RectF(left, mid - bar, end, mid + bar), bar, bar, glow);
            Paint fill = paint();
            fill.setShader(new LinearGradient(left, 0, end, 0, ACCENT, STEPS_BRIGHT, Shader.TileMode.CLAMP));
            cv.drawRoundRect(new RectF(left, mid - bar, end, mid + bar), bar, bar, fill);
        }
        return bmp;
    }

    /**
     * The Water level widget's water: fills the bottom of a `wPx` × `hPx` card to `fill` (a little always shows), two
     * waves, a light crest line and a few bubbles. Transparent above the water; the card colour shows there.
     */
    static Bitmap waterLevel(Context c, double fill, int wPx, int hPx, boolean dark) {
        float d = dp(c);
        int w = Math.max(1, wPx), h = Math.max(1, hPx);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        double level = 0.07 + 0.88 * Math.min(1, Math.max(0, fill));
        double phase = System.currentTimeMillis() / 600_000.0;
        float amp = Math.min(7 * d, h * 0.035f);

        Paint back = paint();
        back.setColor(dark ? 0xFF1E7F9B : 0xFF7FD6EA);
        back.setAlpha(dark ? 150 : 170);
        cv.drawPath(wave(w, h, level + 0.025, amp, phase + 1.9, 1.3), back);

        Path front = wave(w, h, level, amp, phase, 1.0);
        Paint water = paint();
        water.setShader(new LinearGradient(0, (float) (h * (1 - level)), 0, h,
            dark ? 0xFF2BB5D6 : 0xFF3CC7E6, dark ? 0xFF073B4C : 0xFF0A7FA3, Shader.TileMode.CLAMP));
        cv.drawPath(front, water);

        // crest highlight: the top edge of the front wave
        Paint crest = paint();
        crest.setStyle(Paint.Style.STROKE);
        crest.setStrokeWidth(1.6f * d);
        crest.setColor(Color.WHITE);
        crest.setAlpha(dark ? 70 : 120);
        Path edge = new Path();
        float top = (float) (h - h * level);
        for (int i = 0; i <= 48; i++) {
            float x = w * i / 48f, y = (float) (top + amp * Math.sin(phase + i / 48.0 * Math.PI * 2.2));
            if (i == 0) edge.moveTo(x, y); else edge.lineTo(x, y);
        }
        cv.drawPath(edge, crest);

        // a few bubbles, only where there's water
        Paint bubble = paint();
        bubble.setColor(Color.WHITE);
        float waterH = (float) (h * level);
        float[][] spots = { { 0.18f, 0.35f, 3f }, { 0.42f, 0.7f, 2f }, { 0.63f, 0.25f, 2.5f }, { 0.8f, 0.55f, 1.8f } };
        for (float[] sp : spots) {
            float by = h - waterH * sp[1];
            if (waterH < 18 * d || by < top + 6 * d) continue;
            bubble.setAlpha(dark ? 45 : 70);
            cv.drawCircle(w * sp[0], by, sp[2] * d, bubble);
        }
        return bmp;
    }

    private static Path wave(int w, int h, double level, float amp, double phase, double cycles) {
        float top = (float) (h - h * Math.min(1.02, level));
        Path p = new Path();
        p.moveTo(0, h);
        for (int i = 0; i <= 48; i++) {
            float x = w * i / 48f;
            p.lineTo(x, (float) (top + amp * Math.sin(phase + i / 48.0 * Math.PI * 2.2 * cycles)));
        }
        p.lineTo(w, h);
        p.close();
        return p;
    }

    /**
     * A progress ring in white (track at low alpha) — tint the ImageView to colour it, e.g. with Material You's
     * system accent, so it follows the wallpaper without redrawing.
     */
    static Bitmap tintRing(Context c, double value, int sizePx, float strokeDp) {
        float d = dp(c);
        int size = Math.max(1, sizePx);
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        float line = strokeDp * d, r = size / 2f - line / 2 - d, cx = size / 2f;
        Paint track = paint();
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(line);
        track.setColor(Color.WHITE);
        track.setAlpha(52);
        cv.drawCircle(cx, cx, r, track);
        float sweep = (float) (360 * Math.min(1, Math.max(0, value)));
        if (sweep > 0) {
            Paint arc = paint();
            arc.setStyle(Paint.Style.STROKE);
            arc.setStrokeWidth(line);
            arc.setStrokeCap(Paint.Cap.ROUND);
            arc.setColor(Color.WHITE);
            cv.drawArc(new RectF(cx - r, cx - r, cx + r, cx + r), -90, Math.max(sweep, 1), false, arc);
        }
        return bmp;
    }

    /**
     * Rings inside each other, outermost first (like activity rings): each value 0..1+ in its own colour, over a
     * faint track of the same colour. For a dark card.
     */
    static Bitmap rings(Context c, double[] values, int[] colors, int sizePx) {
        float d = dp(c);
        int size = Math.max(1, sizePx);
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        float cx = size / 2f;
        float line = Math.max(6 * d, size * 0.105f), gap = Math.max(2 * d, size * 0.02f);
        for (int i = 0; i < values.length; i++) {
            float r = cx - line / 2 - i * (line + gap) - d;
            if (r <= line / 2) break;
            RectF oval = new RectF(cx - r, cx - r, cx + r, cx + r);
            Paint track = paint();
            track.setStyle(Paint.Style.STROKE);
            track.setStrokeWidth(line);
            track.setColor(colors[i]);
            track.setAlpha(48);
            cv.drawCircle(cx, cx, r, track);
            float sweep = (float) (360 * Math.min(1, Math.max(0, values[i])));
            if (sweep > 0) {
                Paint arc = paint();
                arc.setStyle(Paint.Style.STROKE);
                arc.setStrokeWidth(line);
                arc.setStrokeCap(Paint.Cap.ROUND);
                arc.setShader(new SweepGradient(cx, cx, new int[] { blend(colors[i], Color.WHITE, 0.25f), colors[i], colors[i] },
                    new float[] { 0f, Math.max(0.05f, sweep / 360f), 1f }));
                cv.save();
                cv.rotate(-90, cx, cx);
                cv.drawArc(oval, 0, Math.max(sweep, 1), false, arc);
                cv.restore();
            }
        }
        return bmp;
    }

    private static int blend(int a, int b, float t) {
        return Color.argb(255,
            Math.round(Color.red(a) + (Color.red(b) - Color.red(a)) * t),
            Math.round(Color.green(a) + (Color.green(b) - Color.green(a)) * t),
            Math.round(Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t));
    }

    /**
     * Seven days of glasses as bars, today last and brightest, with a dashed goal line and the day letters under
     * them. Colours read on both the light and the dark card.
     */
    static Bitmap weekBars(Context c, int[] values, String[] letters, int goal, int wPx, int hPx) {
        float d = dp(c);
        int w = Math.max(1, wPx), h = Math.max(1, hPx);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        int n = values.length;
        float labelH = 16 * d, valueH = 14 * d;
        float chartTop = valueH, chartBottom = h - labelH;
        int max = Math.max(goal, 1);
        for (int v : values) max = Math.max(max, v);
        float slot = w / (float) n, barW = Math.min(slot * 0.56f, 22 * d);

        Paint text = paint();
        text.setTypeface(textFont(c));
        text.setTextAlign(Paint.Align.CENTER);
        text.setTextSize(android.util.TypedValue.applyDimension(android.util.TypedValue.COMPLEX_UNIT_SP, 11, c.getResources().getDisplayMetrics()));

        // goal line
        float gy = chartBottom - (chartBottom - chartTop) * goal / (float) max;
        Paint dash = paint();
        dash.setStyle(Paint.Style.STROKE);
        dash.setStrokeWidth(1.3f * d);
        dash.setColor(WATER);
        dash.setAlpha(150);
        dash.setPathEffect(new android.graphics.DashPathEffect(new float[] { 4 * d, 4 * d }, 0));
        Path line = new Path();
        line.moveTo(0, gy);
        line.lineTo(w, gy);
        cv.drawPath(line, dash);

        for (int i = 0; i < n; i++) {
            boolean today = i == n - 1;
            float cx = slot * i + slot / 2;
            float bh = values[i] <= 0 ? 3 * d : Math.max(6 * d, (chartBottom - chartTop) * values[i] / (float) max);
            RectF bar = new RectF(cx - barW / 2, chartBottom - bh, cx + barW / 2, chartBottom);
            Paint p = paint();
            if (today) p.setShader(new LinearGradient(0, bar.top, 0, bar.bottom, 0xFF4FC3E0, WATER_DEEP, Shader.TileMode.CLAMP));
            else { p.setColor(WATER); p.setAlpha(values[i] >= goal ? 190 : 85); }
            cv.drawRoundRect(bar, barW * 0.35f, barW * 0.35f, p);
            text.setColor(today ? WATER : 0xFF8A94A0);
            text.setFakeBoldText(today);
            cv.drawText(letters[i], cx, h - 3 * d, text);
            if (today && values[i] > 0) cv.drawText(String.valueOf(values[i]), cx, bar.top - 3 * d, text);
        }
        return bmp;
    }

    /** A rounded progress bar: `color` over a faint track of the same colour. */
    static Bitmap bar(Context c, double value, int wPx, float heightDp, int color) {
        float d = dp(c);
        int w = Math.max(1, wPx), h = Math.max(1, Math.round(heightDp * d));
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint track = paint();
        track.setColor(color);
        track.setAlpha(45);
        cv.drawRoundRect(new RectF(0, 0, w, h), h / 2f, h / 2f, track);
        float end = (float) (w * Math.min(1, Math.max(0, value)));
        if (end > 0) {
            Paint fill = paint();
            fill.setShader(new LinearGradient(0, 0, Math.max(end, h), 0, blend(color, Color.WHITE, 0.3f), color, Shader.TileMode.CLAMP));
            cv.drawRoundRect(new RectF(0, 0, Math.max(end, h), h), h / 2f, h / 2f, fill);
        }
        return bmp;
    }

    /**
     * A premium progress ring: a gradient arc (`from` → `to`) with a soft glow and a bright cap at its end, over a faint
     * track. Size and stroke in px/dp; the glow stays inside the bitmap.
     */
    static Bitmap gradientRing(Context c, double value, int sizePx, float strokeDp, int from, int to, int track) {
        float d = dp(c);
        int size = Math.max(1, sizePx);
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        float line = strokeDp * d, r = size / 2f - line / 2 - 4 * d, cx = size / 2f;
        RectF oval = new RectF(cx - r, cx - r, cx + r, cx + r);
        Paint t = paint();
        t.setStyle(Paint.Style.STROKE);
        t.setStrokeWidth(line);
        t.setColor(track);
        cv.drawCircle(cx, cx, r, t);
        float sweep = (float) (360 * Math.min(1, Math.max(0, value)));
        if (sweep <= 0) return bmp;
        cv.save();
        cv.rotate(-90, cx, cx);
        SweepGradient g = new SweepGradient(cx, cx, new int[] { from, to, to }, new float[] { 0f, Math.max(0.08f, sweep / 360f), 1f });
        Paint glow = paint();
        glow.setStyle(Paint.Style.STROKE);
        glow.setStrokeWidth(line);
        glow.setStrokeCap(Paint.Cap.ROUND);
        glow.setShader(g);
        glow.setAlpha(120);
        glow.setMaskFilter(new BlurMaskFilter(3.5f * d, BlurMaskFilter.Blur.NORMAL));
        cv.drawArc(oval, 0, Math.max(sweep, 2), false, glow);
        Paint arc = paint();
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeWidth(line);
        arc.setStrokeCap(Paint.Cap.ROUND);
        arc.setShader(g);
        cv.drawArc(oval, 0, Math.max(sweep, 2), false, arc);
        cv.restore();
        // a bright cap at the end of the arc
        double end = Math.toRadians(sweep - 90);
        Paint cap = paint();
        cap.setColor(Color.WHITE);
        cap.setAlpha(235);
        cv.drawCircle(cx + (float) (r * Math.cos(end)), cx + (float) (r * Math.sin(end)), line * 0.22f, cap);
        return bmp;
    }

    /**
     * Seven days as bars inside full-height rounded tracks (so empty days still read as days), today last in the
     * bright water gradient with its number above, goal days in solid water, the rest in soft water; a dashed goal
     * line; day letters under the bars. `ink3` colours the letters, `track` the tracks.
     */
    static Bitmap trackBars(Context c, int[] values, String[] letters, int goal, String todayLabel, int wPx, int hPx, int ink3, int track) {
        float d = dp(c);
        int w = Math.max(1, wPx), h = Math.max(1, hPx);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        int n = values.length;
        float labelH = 18 * d, topPad = 16 * d;
        float top = topPad, bottom = h - labelH;
        int max = Math.max(goal, 1);
        for (int v : values) max = Math.max(max, v);
        float slot = w / (float) n, barW = Math.min(slot * 0.5f, 18 * d), rad = barW / 2;
        Paint text = paint();
        text.setTypeface(textFont(c));
        text.setTextAlign(Paint.Align.CENTER);
        text.setTextSize(android.util.TypedValue.applyDimension(android.util.TypedValue.COMPLEX_UNIT_SP, 11, c.getResources().getDisplayMetrics()));
        for (int i = 0; i < n; i++) {
            boolean today = i == n - 1;
            float cx = slot * i + slot / 2;
            Paint tr = paint();
            tr.setColor(track);
            cv.drawRoundRect(new RectF(cx - barW / 2, top, cx + barW / 2, bottom), rad, rad, tr);
            if (values[i] > 0) {
                float bh = Math.max(barW, (bottom - top) * Math.min(1f, values[i] / (float) max));
                RectF bar = new RectF(cx - barW / 2, bottom - bh, cx + barW / 2, bottom);
                Paint p = paint();
                if (today || values[i] >= goal) p.setShader(new LinearGradient(0, bar.top, 0, bar.bottom, 0xFF6BE3F4, 0xFF0E86AB, Shader.TileMode.CLAMP));
                else { p.setColor(WATER); p.setAlpha(120); }
                cv.drawRoundRect(bar, rad, rad, p);
                if (today) {
                    text.setColor(WATER);
                    cv.drawText(todayLabel, cx, bar.top - 4 * d, text);
                }
            }
            text.setColor(today ? WATER : ink3);
            cv.drawText(letters[i], cx, h - 4 * d, text);
        }
        // goal line on top of the tracks
        float gy = bottom - (bottom - top) * Math.min(1f, goal / (float) max);
        Paint dash = paint();
        dash.setStyle(Paint.Style.STROKE);
        dash.setStrokeWidth(1.2f * d);
        dash.setColor(WATER);
        dash.setAlpha(170);
        dash.setPathEffect(new android.graphics.DashPathEffect(new float[] { 3 * d, 4 * d }, 0));
        Path line = new Path();
        line.moveTo(0, gy);
        line.lineTo(w, gy);
        cv.drawPath(line, dash);
        return bmp;
    }

    /** A glowing gradient progress bar (`from` → `to`) over a rounded track. */
    static Bitmap glowBar(Context c, double value, int wPx, float heightDp, int from, int to, int track) {
        float d = dp(c);
        float pad = 3 * d;
        int w = Math.max(1, wPx), barH = Math.max(1, Math.round(heightDp * d)), h = Math.round(barH + pad * 2);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        RectF full = new RectF(pad, pad, w - pad, pad + barH);
        Paint t = paint();
        t.setColor(track);
        cv.drawRoundRect(full, barH / 2f, barH / 2f, t);
        float end = (float) (full.left + full.width() * Math.min(1, Math.max(0, value)));
        if (value > 0) {
            end = Math.max(end, full.left + barH);
            RectF fill = new RectF(full.left, full.top, end, full.bottom);
            LinearGradient g = new LinearGradient(full.left, 0, end, 0, from, to, Shader.TileMode.CLAMP);
            Paint glow = paint();
            glow.setShader(g);
            glow.setAlpha(130);
            glow.setMaskFilter(new BlurMaskFilter(pad, BlurMaskFilter.Blur.NORMAL));
            cv.drawRoundRect(fill, barH / 2f, barH / 2f, glow);
            Paint f = paint();
            f.setShader(g);
            cv.drawRoundRect(fill, barH / 2f, barH / 2f, f);
        }
        return bmp;
    }

    /** One pill per quest, clay when done. */
    static Bitmap pips(Context c, int done, int total) {
        float d = dp(c);
        int n = Math.max(1, total);
        float pw = 12 * d, ph = 5 * d, gap = 3 * d;
        Bitmap bmp = Bitmap.createBitmap(Math.round(n * pw + (n - 1) * gap), Math.round(ph), Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        for (int i = 0; i < n; i++) {
            Paint p = paint();
            p.setColor(i < done ? ACCENT : Color.argb(46, 255, 255, 255));
            float x = i * (pw + gap);
            cv.drawRoundRect(new RectF(x, 0, x + pw, ph), ph / 2, ph / 2, p);
        }
        return bmp;
    }

    /**
     * Text in the app's display face (Archivo Expanded), as a white bitmap: launchers ignore custom fonts in widget
     * layouts, so the big numbers are drawn here. Shrinks to fit `maxWidthPx`. Tint the ImageView to colour it.
     */
    static Bitmap display(Context c, String text, float sizeSp, int maxWidthPx) {
        Paint p = paint();
        p.setTypeface(font(c));
        p.setColor(Color.WHITE);
        float px = android.util.TypedValue.applyDimension(android.util.TypedValue.COMPLEX_UNIT_SP, sizeSp, c.getResources().getDisplayMetrics());
        p.setTextSize(px);
        float w = p.measureText(text);
        if (maxWidthPx > 0 && w > maxWidthPx) {
            p.setTextSize(px * maxWidthPx / w);
            w = p.measureText(text);
        }
        Paint.FontMetrics fm = p.getFontMetrics();
        Bitmap bmp = Bitmap.createBitmap(Math.max(1, (int) Math.ceil(w) + 2), (int) Math.ceil(fm.bottom - fm.top), Bitmap.Config.ARGB_8888);
        new Canvas(bmp).drawText(text, 1, -fm.top, p);
        return bmp;
    }

    /**
     * An amount as the hero: the number in the display face and the unit ("ml", "L") at 45% size on the same baseline,
     * e.g. "750 ml", "1.25 L". White — tint the ImageView. `shadow` adds a soft dark shadow (for text over a wallpaper).
     */
    static Bitmap amount(Context c, String number, String unit, float sizeSp, int maxWidthPx, boolean shadow) {
        float d = dp(c);
        Paint big = paint();
        big.setTypeface(font(c));
        big.setColor(Color.WHITE);
        float px = android.util.TypedValue.applyDimension(android.util.TypedValue.COMPLEX_UNIT_SP, sizeSp, c.getResources().getDisplayMetrics());
        big.setTextSize(px);
        Paint small = paint();
        small.setTypeface(textFont(c));
        small.setColor(Color.WHITE);
        small.setTextSize(px * 0.42f);
        float gap = px * 0.12f;
        float w = big.measureText(number) + gap + small.measureText(unit);
        if (maxWidthPx > 0 && w > maxWidthPx) {
            float k = maxWidthPx / w;
            big.setTextSize(px * k);
            small.setTextSize(px * 0.42f * k);
            gap *= k;
            w = big.measureText(number) + gap + small.measureText(unit);
        }
        float pad = shadow ? 4 * d : 1;
        if (shadow) {
            big.setShadowLayer(3 * d, 0, d, 0x59000000);
            small.setShadowLayer(3 * d, 0, d, 0x59000000);
        }
        Paint.FontMetrics fm = big.getFontMetrics();
        Bitmap bmp = Bitmap.createBitmap(Math.max(1, (int) Math.ceil(w + pad * 2)), (int) Math.ceil(fm.bottom - fm.top + pad * 2), Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        float base = pad - fm.top;
        cv.drawText(number, pad, base, big);
        cv.drawText(unit, pad + big.measureText(number) + gap, base, small);
        return bmp;
    }

    /**
     * The Water glass widget's frosted card, at the exact size. Android widgets can't blur or refract what's behind
     * them (and since Android 13 apps can't read the wallpaper image), so the glass is built from what they can know:
     * the wallpaper's own colour (`tint`) and whether it's light (`lightBehind`). Layers: a frosted fill tinted by the
     * wallpaper, fine frost grain, light from the top and depth at the bottom, a thick bright lens band just inside the
     * edge, a darker inner rim bottom-right, a curved specular highlight along the top-left, and a rim that's brightest
     * where the light hits (top-left) and faint on the far side.
     */
    static Bitmap liquidGlass(Context c, int wPx, int hPx, float radiusPx, int tint, boolean lightBehind) {
        float d = dp(c);
        int w = Math.max(1, wPx), h = Math.max(1, hPx);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        RectF card = new RectF(0.8f * d, 0.8f * d, w - 0.8f * d, h - 0.8f * d);
        Path shape = new Path();
        shape.addRoundRect(card, radiusPx, radiusPx, Path.Direction.CW);
        cv.save();
        cv.clipPath(shape);

        // frosted fill: the wallpaper's colour, lighter glass over a light wallpaper, smoky glass over a dark one
        Paint fill = paint();
        fill.setColor(lightBehind ? 0x4DFFFFFF : 0x2B0A0F14);
        cv.drawRect(card, fill);
        Paint tinted = paint();
        tinted.setColor(tint);
        tinted.setAlpha(lightBehind ? 34 : 46);
        cv.drawRect(card, tinted);

        // frost grain (fixed seed: the same grain on every redraw)
        java.util.Random rnd = new java.util.Random(7);
        Paint grain = paint();
        int dots = Math.min(12000, w * h / 70);
        for (int i = 0; i < dots; i++) {
            grain.setColor(rnd.nextBoolean() ? Color.WHITE : Color.BLACK);
            grain.setAlpha(6 + rnd.nextInt(10));
            float x = rnd.nextInt(w), y = rnd.nextInt(h);
            cv.drawRect(x, y, x + d * 0.7f, y + d * 0.7f, grain);
        }

        // light from above, depth below
        Paint light = paint();
        light.setShader(new LinearGradient(0, card.top, 0, card.bottom,
            new int[] { lightBehind ? 0x73FFFFFF : 0x40FFFFFF, 0x00FFFFFF, 0x00000000, lightBehind ? 0x1F000000 : 0x38000000 },
            new float[] { 0f, 0.42f, 0.62f, 1f }, Shader.TileMode.CLAMP));
        cv.drawRect(card, light);

        // lens band: a thick soft glow just inside the edge — the glass looks like it has thickness
        Paint band = paint();
        band.setStyle(Paint.Style.STROKE);
        band.setStrokeWidth(12 * d);
        band.setColor(Color.WHITE);
        band.setAlpha(lightBehind ? 70 : 52);
        band.setMaskFilter(new BlurMaskFilter(7 * d, BlurMaskFilter.Blur.NORMAL));
        cv.drawRoundRect(card, radiusPx, radiusPx, band);

        // darker inner rim bottom-right (the glass curving away from the light)
        Paint inner = paint();
        inner.setStyle(Paint.Style.STROKE);
        inner.setStrokeWidth(8 * d);
        inner.setShader(new LinearGradient(0, 0, w, h, new int[] { 0x00000000, 0x00000000, lightBehind ? 0x1A000000 : 0x40000000 },
            new float[] { 0f, 0.55f, 1f }, Shader.TileMode.CLAMP));
        inner.setMaskFilter(new BlurMaskFilter(5 * d, BlurMaskFilter.Blur.NORMAL));
        cv.drawRoundRect(card, radiusPx, radiusPx, inner);

        // specular highlight: a curved streak hugging the top-left corner, fading along the top edge and down the side
        Path streak = new Path();
        float inset = 3.2f * d, r = Math.max(0, radiusPx - inset);
        RectF corner = new RectF(card.left + inset, card.top + inset, card.left + inset + 2 * r, card.top + inset + 2 * r);
        streak.moveTo(card.left + inset, card.top + inset + r + Math.min(h * 0.1f, r * 0.8f));
        streak.lineTo(card.left + inset, card.top + inset + r);
        streak.arcTo(corner, 180, 90, false);
        streak.lineTo(card.left + inset + r + w * 0.4f, card.top + inset);
        Paint spec = paint();
        spec.setStyle(Paint.Style.STROKE);
        spec.setStrokeWidth(2.2f * d);
        spec.setStrokeCap(Paint.Cap.ROUND);
        spec.setShader(new android.graphics.RadialGradient(card.left + radiusPx, card.top + radiusPx, Math.max(1, Math.max(w * 0.45f, h * 0.35f)),
            new int[] { 0xF2FFFFFF, 0x66FFFFFF, 0x00FFFFFF }, new float[] { 0f, 0.55f, 1f }, Shader.TileMode.CLAMP));
        spec.setMaskFilter(new BlurMaskFilter(0.8f * d, BlurMaskFilter.Blur.NORMAL));
        cv.drawPath(streak, spec);
        Paint glint = paint();
        glint.setColor(Color.WHITE);
        glint.setAlpha(lightBehind ? 90 : 70);
        glint.setMaskFilter(new BlurMaskFilter(16 * d, BlurMaskFilter.Blur.NORMAL));
        cv.drawOval(new RectF(w * 0.05f, h * 0.03f, w * 0.42f, h * 0.17f), glint);
        cv.restore();

        // the rim: bright where the light hits (top-left), faint on the right, a little light again bottom-right
        Paint rim = paint();
        rim.setStyle(Paint.Style.STROKE);
        rim.setStrokeWidth(1.3f * d);
        rim.setShader(new LinearGradient(card.left, card.top, card.right, card.bottom,
            new int[] { 0xFFFFFFFF, 0x8CFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x80FFFFFF },
            new float[] { 0f, 0.22f, 0.5f, 0.78f, 1f }, Shader.TileMode.CLAMP));
        cv.drawRoundRect(card, radiusPx, radiusPx, rim);
        return bmp;
    }

    /**
     * The Water glass widget's tumbler: a clear glass, narrower at the base, with a thick bottom, filled to `fill` (0..1)
     * with aqua water — a flat surface seen from just above (an ellipse), rounded shading, a light shaft and a few
     * bubbles — bright edges where the glass is thickest, a rim, a soft shadow and an aqua caustic on what it stands on
     * (light through water). Transparent around it, so the card shows through. Fits a `wPx` × `hPx` box.
     */
    static Bitmap waterGlass(Context c, double fill, int wPx, int hPx, boolean dark) {
        float d = dp(c);
        int w = Math.max(1, wPx), h = Math.max(1, hPx);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        // as tall as the box allows, from a tumbler (1.25 × its width) to a highball (1.8 ×); the rim and the base are
        // ellipses (seen from a little above)
        float ratio = Math.max(1.25f, Math.min(1.8f, h / (float) w));
        float gw = Math.min(w * 0.92f, h * 0.88f / ratio);
        float gh = gw * ratio;
        float cx = w / 2f;
        float topR = gw / 2f, botR = gw * 0.38f;
        float rimH = gw * 0.2f, botH = rimH * botR / topR;
        float rimY = (h - gh) / 2f + rimH / 2f;        // centre line of the rim ellipse
        float botY = rimY + gh - rimH / 2f - botH / 2f; // centre line of the outer base ellipse
        float wall = Math.max(1.4f * d, gw * 0.04f);
        float base = gh * 0.12f;
        float innerBotY = botY - base;
        Path outer = tumbler(cx, rimY, botY, topR, botR, rimH, botH);
        float innerBotR = halfWidth(innerBotY, rimY, botY, topR, botR) - wall;
        Path cavity = tumbler(cx, rimY, innerBotY, topR - wall, innerBotR, rimH * (topR - wall) / topR, botH * innerBotR / botR);

        // what it stands on: a soft shadow and, with water in it, an aqua caustic
        double f = fill <= 0 ? 0 : Math.max(0.07, Math.min(1, fill));
        Paint shadow = paint();
        shadow.setColor(dark ? 0x66000000 : 0x2E0B2A36);
        shadow.setMaskFilter(new BlurMaskFilter(Math.max(1, 3 * d), BlurMaskFilter.Blur.NORMAL));
        cv.drawOval(new RectF(cx - botR * 1.15f, botY - botH * 0.3f, cx + botR * 1.15f, botY + botH * 0.75f), shadow);
        if (f > 0) {
            Paint caustic = paint();
            caustic.setColor(dark ? 0x8C2FC6E4 : 0x732FC6E4);
            caustic.setMaskFilter(new BlurMaskFilter(Math.max(1, 4 * d), BlurMaskFilter.Blur.NORMAL));
            cv.drawOval(new RectF(cx - botR * 0.25f, botY - botH * 0.1f, cx + botR * 1.35f, botY + botH * 0.9f), caustic);
        }

        // the glass itself: faintly brighter than the card, a little more at the top
        Paint body = paint();
        body.setShader(new LinearGradient(0, rimY, 0, botY, dark ? 0x2EFFFFFF : 0x59FFFFFF, dark ? 0x0FFFFFFF : 0x26FFFFFF, Shader.TileMode.CLAMP));
        cv.drawPath(outer, body);

        // the water
        if (f > 0) {
            float topLimit = rimY + (innerBotY - rimY) * 0.1f;
            float level = (float) (innerBotY - (innerBotY - topLimit) * f);
            float lr = halfWidth(level, rimY, botY, topR, botR) - wall;
            float le = lr * (rimH / 2f) / topR;
            cv.save();
            cv.clipPath(cavity);
            Paint water = paint();
            water.setShader(new LinearGradient(0, level, 0, innerBotY + botH / 2f,
                new int[] { 0xF25AD6EE, 0xF52FC6E4, 0xFF0E8FB8 }, new float[] { 0f, 0.45f, 1f }, Shader.TileMode.CLAMP));
            cv.drawRect(0, level, w, h, water);
            // rounded: darker towards both sides, a light shaft left of centre
            Paint round = paint();
            round.setShader(new LinearGradient(cx - topR, 0, cx + topR, 0,
                new int[] { 0x40062F3D, 0x00062F3D, 0x00062F3D, 0x55062F3D }, new float[] { 0f, 0.3f, 0.62f, 1f }, Shader.TileMode.CLAMP));
            cv.drawRect(0, level, w, h, round);
            Paint shaft = paint();
            shaft.setColor(Color.WHITE);
            shaft.setAlpha(60);
            shaft.setMaskFilter(new BlurMaskFilter(Math.max(1, gw * 0.05f), BlurMaskFilter.Blur.NORMAL));
            cv.drawRect(cx - lr * 0.5f, level + le, cx - lr * 0.3f, innerBotY, shaft);
            // bubbles (fixed places, so a redraw doesn't move them)
            float depth = innerBotY - level;
            if (depth > 16 * d) {
                float[][] spots = { { -0.35f, 0.32f, 1.5f }, { 0.22f, 0.55f, 1.1f }, { -0.1f, 0.78f, 1.9f }, { 0.42f, 0.24f, 0.9f }, { -0.5f, 0.64f, 1f } };
                Paint ring = paint();
                ring.setStyle(Paint.Style.STROKE);
                ring.setStrokeWidth(Math.max(0.8f, 0.6f * d));
                ring.setColor(0xB3FFFFFF);
                Paint dot = paint();
                dot.setColor(0x40FFFFFF);
                for (float[] s : spots) {
                    float by = level + le + (depth - le) * s[1];
                    float bx = cx + halfWidth(by, rimY, botY, topR, botR) * s[0];
                    float br = s[2] * d * Math.min(1.4f, gw / (60 * d));
                    cv.drawCircle(bx, by, br, dot);
                    cv.drawCircle(bx, by, br, ring);
                }
            }
            // the surface: an ellipse, lighter, with a bright front edge (the meniscus)
            RectF surface = new RectF(cx - lr, level - le, cx + lr, level + le);
            Paint top = paint();
            top.setShader(new LinearGradient(0, level - le, 0, level + le, 0xFFC4F6FC, 0xFF5AD6EE, Shader.TileMode.CLAMP));
            cv.drawOval(surface, top);
            Paint edge = paint();
            edge.setStyle(Paint.Style.STROKE);
            edge.setStrokeWidth(Math.max(1, 1.1f * d));
            edge.setColor(Color.WHITE);
            edge.setAlpha(210);
            cv.drawArc(surface, 10, 160, false, edge);
            cv.restore();
        }

        // the glass's thickness: the walls and the heavy base, brighter than the open glass
        Path solid = new Path();
        solid.op(outer, cavity, Path.Op.DIFFERENCE);
        Paint thick = paint();
        thick.setShader(new LinearGradient(0, rimY, 0, botY + botH / 2f,
            new int[] { dark ? 0x40FFFFFF : 0x80FFFFFF, dark ? 0x33FFFFFF : 0x66FFFFFF, f > 0 ? 0x802FC6E4 : (dark ? 0x40FFFFFF : 0x80FFFFFF) },
            new float[] { 0f, 0.8f, 1f }, Shader.TileMode.CLAMP));
        cv.drawPath(solid, thick);

        // over a light wallpaper, a faint dark outline, or clear glass disappears
        if (!dark) {
            Paint outline = paint();
            outline.setStyle(Paint.Style.STROKE);
            outline.setStrokeWidth(Math.max(1, 2.4f * d));
            outline.setColor(0x3D0B2A36);
            cv.drawPath(outer, outline);
        }

        // highlights: a broad streak down the left, a thin one on the right, parallel to the walls
        float streakTop = rimY + rimH * 0.9f, streakBot = innerBotY - botH * 0.4f;
        Paint streak = paint();
        streak.setStyle(Paint.Style.STROKE);
        streak.setStrokeCap(Paint.Cap.ROUND);
        streak.setStrokeWidth(Math.max(1.5f * d, gw * 0.075f));
        streak.setShader(new LinearGradient(0, streakTop, 0, streakBot, 0xC8FFFFFF, 0x10FFFFFF, Shader.TileMode.CLAMP));
        cv.drawLine(cx - halfWidth(streakTop, rimY, botY, topR, botR) + gw * 0.15f, streakTop,
            cx - halfWidth(streakBot, rimY, botY, topR, botR) + gw * 0.15f, streakBot, streak);
        streak.setStrokeWidth(Math.max(1, gw * 0.028f));
        streak.setShader(new LinearGradient(0, streakTop, 0, streakBot, 0x9CFFFFFF, 0x1AFFFFFF, Shader.TileMode.CLAMP));
        cv.drawLine(cx + halfWidth(streakTop, rimY, botY, topR, botR) - gw * 0.11f, streakTop + rimH * 0.4f,
            cx + halfWidth(streakBot, rimY, botY, topR, botR) - gw * 0.11f, streakBot, streak);

        // edges: bright outer walls, the base's lower edge, the top of the base seen through the glass
        Paint line = paint();
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(Math.max(1, 1.15f * d));
        line.setShader(new LinearGradient(0, rimY, 0, botY, 0xF2FFFFFF, dark ? 0x80FFFFFF : 0xB3FFFFFF, Shader.TileMode.CLAMP));
        cv.drawLine(cx - topR, rimY, cx - botR, botY, line);
        cv.drawLine(cx + topR, rimY, cx + botR, botY, line);
        cv.drawArc(new RectF(cx - botR, botY - botH / 2f, cx + botR, botY + botH / 2f), 0, 180, false, line);
        Paint innerLine = paint();
        innerLine.setStyle(Paint.Style.STROKE);
        innerLine.setStrokeWidth(Math.max(1, 0.9f * d));
        innerLine.setColor(Color.WHITE);
        innerLine.setAlpha(dark ? 90 : 140);
        float ibh = botH * innerBotR / botR;
        cv.drawOval(new RectF(cx - innerBotR, innerBotY - ibh / 2f, cx + innerBotR, innerBotY + ibh / 2f), innerLine);

        // the rim: the far side fainter, the near side bright, and the inner edge of the glass's lip
        RectF rim = new RectF(cx - topR, rimY - rimH / 2f, cx + topR, rimY + rimH / 2f);
        Paint lip = paint();
        lip.setStyle(Paint.Style.STROKE);
        lip.setStrokeWidth(Math.max(1, 1.2f * d));
        lip.setColor(Color.WHITE);
        lip.setAlpha(dark ? 120 : 160);
        cv.drawArc(rim, 180, 180, false, lip);
        lip.setAlpha(245);
        lip.setStrokeWidth(Math.max(1, 1.5f * d));
        cv.drawArc(rim, 0, 180, false, lip);
        float ir = topR - wall, irh = rimH * ir / topR;
        lip.setStrokeWidth(Math.max(1, 0.8f * d));
        lip.setAlpha(dark ? 70 : 100);
        cv.drawOval(new RectF(cx - ir, rimY - irh / 2f, cx + ir, rimY + irh / 2f), lip);
        return bmp;
    }

    /** A tapered glass outline: rim ellipse centred on `rimY`, base ellipse centred on `botY`. */
    private static Path tumbler(float cx, float rimY, float botY, float topR, float botR, float rimH, float botH) {
        Path p = new Path();
        p.moveTo(cx - topR, rimY);
        p.lineTo(cx - botR, botY);
        p.arcTo(new RectF(cx - botR, botY - botH / 2f, cx + botR, botY + botH / 2f), 180, -180, false);
        p.lineTo(cx + topR, rimY);
        p.arcTo(new RectF(cx - topR, rimY - rimH / 2f, cx + topR, rimY + rimH / 2f), 0, -180, false);
        p.close();
        return p;
    }

    /** The glass's outer half-width at height `y` (it narrows in a straight line from the rim to the base). */
    private static float halfWidth(float y, float rimY, float botY, float topR, float botR) {
        float t = Math.max(0, Math.min(1, (y - rimY) / (botY - rimY)));
        return topR + (botR - topR) * t;
    }

    /**
     * The Streak widget's last 7 days: a dot per day, flame orange with a glow when checked in, a faint track when not,
     * today ringed if it isn't done yet; the day letters under them when `letters` is given. Fits `wPx` (dots at most
     * `maxDotDp`).
     */
    static Bitmap streakDots(Context c, boolean[] week, String[] letters, int wPx, float maxDotDp, int track, int letterInk, boolean dark) {
        float d = dp(c);
        int n = week.length;
        float gap = 5 * d;
        float dot = Math.min(maxDotDp * d, (wPx - gap * (n - 1)) / n);
        float textSize = Math.max(9 * d, dot * 0.46f);
        float textGap = letters != null ? 4 * d + textSize : 0;
        float glow = 4 * d;
        int w = Math.max(1, wPx), h = Math.round(dot + glow * 2 + textGap);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        float rowW = n * dot + (n - 1) * gap, x0 = (w - rowW) / 2f, cy = glow + dot / 2f;
        int from = dark ? 0xFFFFB08A : 0xFFFF9A6B, to = dark ? 0xFFFF6A3D : 0xFFF0602F;
        Paint text = paint();
        text.setTypeface(textFont(c));
        text.setTextSize(textSize);
        text.setTextAlign(Paint.Align.CENTER);
        for (int i = 0; i < n; i++) {
            float cx = x0 + i * (dot + gap) + dot / 2f;
            if (week[i]) {
                LinearGradient g = new LinearGradient(0, cy - dot / 2, 0, cy + dot / 2, from, to, Shader.TileMode.CLAMP);
                Paint halo = paint();
                halo.setShader(g);
                halo.setAlpha(110);
                halo.setMaskFilter(new BlurMaskFilter(glow, BlurMaskFilter.Blur.NORMAL));
                cv.drawCircle(cx, cy, dot / 2, halo);
                Paint f = paint();
                f.setShader(g);
                cv.drawCircle(cx, cy, dot / 2, f);
            } else {
                Paint t = paint();
                t.setColor(track);
                cv.drawCircle(cx, cy, dot / 2, t);
                if (i == n - 1) {
                    Paint ring = paint();
                    ring.setStyle(Paint.Style.STROKE);
                    ring.setStrokeWidth(Math.max(1.5f * d, dot * 0.08f));
                    ring.setColor(to);
                    cv.drawCircle(cx, cy, dot / 2 - ring.getStrokeWidth() / 2, ring);
                }
            }
            if (letters != null) {
                text.setColor(i == n - 1 ? (dark ? 0xFFF4F8FA : 0xFF0E1A22) : letterInk);
                cv.drawText(letters[i], cx, cy + dot / 2 + 4 * d + textSize * 0.85f, text);
            }
        }
        return bmp;
    }

    /** An energy pip on the Check-in widget: a glossy disc in the theme gradient, fuller for more energy (1–5). */
    static Bitmap pip(Context c, int sizePx, int level, int from, int to) {
        int s = Math.max(1, sizePx);
        Bitmap bmp = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint f = paint();
        f.setShader(new LinearGradient(0, 0, 0, s, from, to, Shader.TileMode.CLAMP));
        f.setAlpha(Math.round(255 * (0.35f + level * 0.13f)));
        cv.drawCircle(s / 2f, s / 2f, s / 2f - 1, f);
        Paint sheen = paint();
        sheen.setShader(new LinearGradient(0, 0, 0, s / 2f, 0x73FFFFFF, 0x00FFFFFF, Shader.TileMode.CLAMP));
        cv.drawCircle(s / 2f, s / 2f, s / 2f - 1, sheen);
        return bmp;
    }

    /** The Check-in widget's "done": a theme-gradient disc with a white tick. */
    static Bitmap tickCircle(Context c, int sizePx, int from, int to) {
        float d = dp(c);
        int s = Math.max(1, sizePx);
        Bitmap bmp = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        Paint f = paint();
        f.setShader(new LinearGradient(0, 0, 0, s, from, to, Shader.TileMode.CLAMP));
        cv.drawCircle(s / 2f, s / 2f, s / 2f - 1, f);
        Paint tick = paint();
        tick.setStyle(Paint.Style.STROKE);
        tick.setStrokeCap(Paint.Cap.ROUND);
        tick.setStrokeJoin(Paint.Join.ROUND);
        tick.setStrokeWidth(Math.max(2 * d, s * 0.1f));
        tick.setColor(Color.WHITE);
        Path p = new Path();
        p.moveTo(s * 0.29f, s * 0.52f);
        p.lineTo(s * 0.44f, s * 0.67f);
        p.lineTo(s * 0.72f, s * 0.36f);
        cv.drawPath(p, tick);
        return bmp;
    }

    /** The largest size ≤ `sizeSp` at which every one of `texts` fits `maxWidthPx` in the display face — so a row of
     *  numbers can share one size instead of each shrinking on its own. */
    static float fitSp(Context c, String[] texts, float sizeSp, int maxWidthPx) {
        Paint p = paint();
        p.setTypeface(font(c));
        p.setTextSize(android.util.TypedValue.applyDimension(android.util.TypedValue.COMPLEX_UNIT_SP, sizeSp, c.getResources().getDisplayMetrics()));
        float widest = 0;
        for (String t : texts) widest = Math.max(widest, p.measureText(t));
        return widest <= maxWidthPx || widest == 0 ? sizeSp : sizeSp * maxWidthPx / widest;
    }

    private static Typeface display;
    private static Typeface text;

    private static Typeface textFont(Context c) {
        if (text == null) text = c.getResources().getFont(R.font.kx_text_bold);
        return text;
    }

    private static Typeface font(Context c) {
        if (display == null) display = c.getResources().getFont(R.font.kx_display);
        return display;
    }
}
