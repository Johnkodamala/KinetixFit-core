package com.jnglobalventures.kinetixfit;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.util.Calendar;

/**
 * Movement breaks: every ~15 minutes during the person's active hours this reads the phone's step counter and whether
 * the screen is on. When the phone has been in use (screen on at most checks) and the steps haven't moved for the
 * chosen time, it posts one "time to move" notification and starts counting again.
 *
 * Screen-on is sampled, not tracked: Android only tells running apps about screen on/off, and reading other apps'
 * usage needs a special-access permission Play restricts. Sampling is enough for "sat with the phone for an hour".
 * Settings come from the app (MoveReminderPlugin); the alarm is re-armed after a reboot or an app update.
 */
public class MoveReminderReceiver extends BroadcastReceiver {
    static final String PREFS = "kx_move";
    static final String ACTION_CHECK = "com.jnglobalventures.kinetixfit.MOVE_CHECK";
    private static final String CHANNEL = "kx-move";
    private static final int NOTIFICATION_ID = 9300;
    private static final long CHECK_MS = AlarmManager.INTERVAL_FIFTEEN_MINUTES;
    /** More steps than this between two checks counts as getting up and moving. */
    private static final float MOVED_STEPS = 60;

    // title, short text, and the longer text shown when the notification is expanded (src/lib/notifications.ts MOVE_LINES)
    private static final String[][] LINES = {
        { "Time to stretch your legs", "You’ve been still for a while — two minutes on your feet?",
          "You’ve been still for a while. Stand up, roll your shoulders and walk for two minutes — your back and your focus will thank you." },
        { "Up you get", "A short walk now helps your back, your focus and your steps.",
          "A short walk now helps your back, your focus and your step count. Even a lap of the room counts." },
        { "Screen break", "Look away, stand tall and move for a couple of minutes.",
          "Look away from the screen, stand tall and move for a couple of minutes. Your eyes get a rest too." },
        { "Quick movement break", "Refill your water on the way — two birds, one walk.",
          "Stand up and go and refill your water — you’ll get a few steps in and top up your hydration at the same time." },
    };

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            schedule(context);
            return;
        }
        if (!ACTION_CHECK.equals(action)) return;
        if (!prefs(context).getBoolean("enabled", false)) {
            cancel(context);
            return;
        }
        PendingResult pending = goAsync();
        readSteps(context, steps -> {
            try {
                check(context, steps);
            } finally {
                pending.finish();
            }
        });
    }

    interface StepsCallback { void done(float steps); }

    /** The step counter's running total since boot, or -1 if there's no sensor, no permission or no answer within 4 s. */
    private static void readSteps(Context context, StepsCallback callback) {
        SensorManager sm = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        Sensor sensor = sm == null ? null : sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (sensor == null || !hasPermission(context)) {
            callback.done(-1);
            return;
        }
        Handler handler = new Handler(Looper.getMainLooper());
        final boolean[] answered = { false };
        SensorEventListener listener = new SensorEventListener() {
            @Override public void onSensorChanged(SensorEvent event) {
                if (answered[0]) return;
                answered[0] = true;
                sm.unregisterListener(this);
                callback.done(event.values[0]);
            }
            @Override public void onAccuracyChanged(Sensor s, int accuracy) {}
        };
        sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, handler);
        handler.postDelayed(() -> {
            if (answered[0]) return;
            answered[0] = true;
            sm.unregisterListener(listener);
            callback.done(-1);
        }, 4000);
    }

    static boolean hasPermission(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean hasSensor(Context context) {
        SensorManager sm = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        return sm != null && sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null;
    }

    private static void check(Context context, float steps) {
        SharedPreferences p = prefs(context);
        SharedPreferences.Editor e = p.edit();
        long now = System.currentTimeMillis();
        long limitMs = Math.max(30, p.getInt("minutes", 60)) * 60_000L;
        float lastSteps = p.getFloat("lastSteps", -1);
        long lastCheck = p.getLong("lastCheck", 0);
        e.putLong("lastCheck", now);

        // Outside the active hours, no reading, a reboot (the counter starts again) or a long gap since the last check
        // (the phone was idle): start counting again from now.
        boolean fresh = !inActiveHours(p) || steps < 0 || lastSteps < 0 || steps < lastSteps || now - lastCheck > 3 * CHECK_MS;
        if (steps >= 0) e.putFloat("lastSteps", steps);
        if (fresh || steps - lastSteps >= MOVED_STEPS) {
            e.putLong("stillSince", now);
            e.putInt("checks", 0);
            e.putInt("screenOnChecks", 0);
            e.apply();
            return;
        }

        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        boolean screenOn = pm != null && pm.isInteractive();
        int checks = p.getInt("checks", 0) + 1;
        int screenOnChecks = p.getInt("screenOnChecks", 0) + (screenOn ? 1 : 0);
        long stillSince = p.getLong("stillSince", now);
        e.putInt("checks", checks);
        e.putInt("screenOnChecks", screenOnChecks);

        // Still for the whole time, and the phone was in use for at least half of it (and right now)
        if (screenOn && now - stillSince >= limitMs && screenOnChecks * 2 >= checks) {
            notify(context, p.getInt("line", 0));
            e.putInt("line", p.getInt("line", 0) + 1);
            e.putLong("stillSince", now);
            e.putInt("checks", 0);
            e.putInt("screenOnChecks", 0);
        }
        e.apply();
    }

    /** Same rule as the app's reminders: an end before the start is an overnight window. */
    private static boolean inActiveHours(SharedPreferences p) {
        int start = p.getInt("startHour", 9);
        int end = p.getInt("endHour", 17);
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
    }

    private static void notify(Context context, int line) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(context);
        if (!nm.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Movement breaks", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("A nudge to get up when you’ve been sitting with your phone for a long time");
            context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        String[] copy = LINES[Math.floorMod(line, LINES.length)];
        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, NOTIFICATION_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            nm.notify(NOTIFICATION_ID, new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_kinetixfit)
                .setColor(0xFFE5532D)
                .setLargeIcon(android.graphics.BitmapFactory.decodeResource(context.getResources(), R.drawable.kx_notif_move))
                .setSubText("Movement break")
                .setContentTitle(copy[0])
                .setContentText(copy[1])
                .setStyle(new NotificationCompat.BigTextStyle().bigText(copy[2]))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .build());
        } catch (SecurityException ignored) {
            // notifications were turned off between the check and the post
        }
    }

    private static PendingIntent alarmIntent(Context context) {
        Intent intent = new Intent(context, MoveReminderReceiver.class).setAction(ACTION_CHECK);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Inexact on purpose: no exact-alarm permission needed, and Android batches it with other wake-ups. */
    static void schedule(Context context) {
        if (!prefs(context).getBoolean("enabled", false)) return;
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + CHECK_MS, CHECK_MS, alarmIntent(context));
    }

    static void cancel(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarmIntent(context));
    }
}
