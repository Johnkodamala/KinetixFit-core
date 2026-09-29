package com.jnglobalventures.kinetixfit;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Alternate app icons (src/lib/appIcons.ts). Each icon is a launcher activity-alias of MainActivity in
 * AndroidManifest.xml (.IconClassic is the one enabled by default); switching enables the chosen alias and disables
 * the rest. It's applied when the person leaves the app (handleOnStop) rather than at once: disabling the alias the
 * running task was started from can close the app on some phones, and the home screen is only seen after leaving
 * anyway. Anything still pending is applied on the next start too. Some launchers take a few seconds to redraw, and
 * a few move the icon from the home screen to the apps list.
 */
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
    /** The icon ids (src/lib/appIcons.ts), in manifest order; the first is the default. */
    static final String[] IDS = { "classic", "midnight", "aurora", "gold", "ember", "kx-track", "kx-mono", "kx-pulse", "kx-chrome" };
    private static final String PREFS = "kx_app_icon";
    private static final String PENDING = "pending";

    /** "kx-track" → ".IconKxTrack" */
    static String alias(String id) {
        StringBuilder name = new StringBuilder("Icon");
        for (String part : id.split("-")) name.append(Character.toUpperCase(part.charAt(0))).append(part.substring(1));
        return name.toString();
    }

    static ComponentName component(Context context, String id) {
        return new ComponentName(context.getPackageName(), context.getPackageName() + "." + alias(id));
    }

    static boolean known(String id) {
        for (String i : IDS) if (i.equals(id)) return true;
        return false;
    }

    /** The icon in use: the enabled alias (by default only Classic is enabled). */
    static String current(Context context) {
        PackageManager pm = context.getPackageManager();
        for (String id : IDS) {
            int state = pm.getComponentEnabledSetting(component(context, id));
            boolean on = state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                || (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && id.equals(IDS[0]));
            if (on) return id;
        }
        return IDS[0];
    }

    /** Switches the launcher entry to `id`: the new alias first, so there's never a moment without one. */
    static void apply(Context context, String id) {
        if (!known(id) || id.equals(current(context))) return;
        PackageManager pm = context.getPackageManager();
        pm.setComponentEnabledSetting(component(context, id), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        for (String other : IDS) {
            if (other.equals(id)) continue;
            pm.setComponentEnabledSetting(component(context, other), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * A choice left over from before (normally applied on leaving) that's already in use is dropped; others wait for
     * onStop. And if no icon is switched on — the one in use was removed in an update (KX Luxe and KX Neon, 28 Sep
     * 2026), which leaves Classic switched off — Classic comes back, or the app would have no launcher entry.
     */
    @Override
    public void load() {
        String pending = prefs().getString(PENDING, null);
        if (pending != null && pending.equals(current(getContext()))) prefs().edit().remove(PENDING).apply();
        if (!anyEnabled(getContext())) {
            getContext().getPackageManager().setComponentEnabledSetting(component(getContext(), IDS[0]),
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        }
    }

    /** Whether any icon alias is switched on (Classic counts when it's left at its manifest default). */
    static boolean anyEnabled(Context context) {
        PackageManager pm = context.getPackageManager();
        for (String id : IDS) {
            int state = pm.getComponentEnabledSetting(component(context, id));
            if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                || (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && id.equals(IDS[0]))) return true;
        }
        return false;
    }

    @Override
    protected void handleOnStop() {
        super.handleOnStop();
        String pending = prefs().getString(PENDING, null);
        if (pending == null) return;
        try {
            apply(getContext(), pending);
        } finally {
            prefs().edit().remove(PENDING).apply();
        }
    }

    /** { id } — the icon chosen: a pending choice, else the one in use. */
    @PluginMethod
    public void get(PluginCall call) {
        String pending = prefs().getString(PENDING, null);
        JSObject result = new JSObject();
        result.put("id", pending != null && known(pending) ? pending : current(getContext()));
        result.put("pending", pending != null);
        call.resolve(result);
    }

    /** { id } — switches to that icon when the person leaves the app; resolves with it straight away. */
    @PluginMethod
    public void set(PluginCall call) {
        String id = call.getString("id", "");
        if (!known(id)) {
            call.reject("Unknown app icon: " + id);
            return;
        }
        if (id.equals(current(getContext()))) prefs().edit().remove(PENDING).apply();
        else prefs().edit().putString(PENDING, id).apply();
        JSObject result = new JSObject();
        result.put("id", id);
        result.put("pending", !id.equals(current(getContext())));
        call.resolve(result);
    }
}
