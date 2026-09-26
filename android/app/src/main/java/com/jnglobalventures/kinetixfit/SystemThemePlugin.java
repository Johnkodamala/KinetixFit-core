package com.jnglobalventures.kinetixfit;

import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells the web app whether the phone is in dark mode. The WebView's CSS prefers-color-scheme
 * kept reporting light on a phone in night mode (checked on the Galaxy S21 FE, WebView 154, even
 * with a DayNight theme and android:isLightTheme set), so the "System" theme in
 * src/lib/theme.ts asks Android directly instead. Fires "change" when the phone switches.
 */
@CapacitorPlugin(name = "SystemTheme")
public class SystemThemePlugin extends Plugin {

    private boolean isDark(Configuration config) {
        return (config.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject result = new JSObject();
        result.put("dark", isDark(getContext().getResources().getConfiguration()));
        call.resolve(result);
    }

    // uiMode is in the activity's configChanges, so a theme switch arrives here instead of recreating it
    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        JSObject result = new JSObject();
        result.put("dark", isDark(newConfig));
        notifyListeners("change", result);
    }
}
