package com.jnglobalventures.kinetixfit;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Turns movement breaks on or off (src/lib/moveReminders.ts); the checks themselves run in MoveReminderReceiver.
 * Reading the step counter needs "Physical activity" (ACTIVITY_RECOGNITION) on Android 10+, asked when turning it on.
 */
@CapacitorPlugin(
    name = "MoveReminder",
    permissions = { @Permission(alias = "activity", strings = { Manifest.permission.ACTIVITY_RECOGNITION }) }
)
public class MoveReminderPlugin extends Plugin {

    @PluginMethod
    public void configure(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        MoveReminderReceiver.prefs(getContext()).edit()
            .putBoolean("enabled", enabled)
            .putInt("startHour", call.getInt("startHour", 9))
            .putInt("endHour", call.getInt("endHour", 17))
            .putInt("minutes", call.getInt("minutes", 60))
            .apply();
        if (!enabled) {
            MoveReminderReceiver.cancel(getContext());
            resolve(call);
            return;
        }
        boolean ask = Boolean.TRUE.equals(call.getBoolean("askPermission", false));
        if (ask && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("activity") != PermissionState.GRANTED) {
            requestPermissionForAlias("activity", call, "permissionAnswered");
            return;
        }
        MoveReminderReceiver.schedule(getContext());
        resolve(call);
    }

    @PermissionCallback
    private void permissionAnswered(PluginCall call) {
        MoveReminderReceiver.schedule(getContext());
        resolve(call);
    }

    private void resolve(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", MoveReminderReceiver.hasPermission(getContext()));
        result.put("sensor", MoveReminderReceiver.hasSensor(getContext()));
        call.resolve(result);
    }
}
