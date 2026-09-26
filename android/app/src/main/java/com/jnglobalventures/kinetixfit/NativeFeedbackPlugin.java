package com.jnglobalventures.kinetixfit;

import android.os.Build;
import android.view.HapticFeedbackConstants;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android's own subtle haptics (the ticks the system uses for sliders, clocks and segmented controls).
 * @capacitor/haptics only has raw vibrations on Android — its "selection" is a 100 ms buzz and "light" a
 * 50 ms one — which felt heavy for tab switches and ruler notches. performHapticFeedback is crisp and
 * follows the phone's own touch-feedback setting. Used by src/lib/feedback.ts.
 */
@CapacitorPlugin(name = "NativeFeedback")
public class NativeFeedbackPlugin extends Plugin {

    /** A ruler notch or other fast, repeated step. */
    @PluginMethod
    public void tick(PluginCall call) {
        perform(Build.VERSION.SDK_INT >= 34 ? HapticFeedbackConstants.SEGMENT_FREQUENT_TICK : HapticFeedbackConstants.CLOCK_TICK, call);
    }

    /** Moving to another tab, page or option. */
    @PluginMethod
    public void selection(PluginCall call) {
        perform(Build.VERSION.SDK_INT >= 34 ? HapticFeedbackConstants.SEGMENT_TICK : HapticFeedbackConstants.CLOCK_TICK, call);
    }

    private void perform(int constant, PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getBridge().getWebView().performHapticFeedback(constant);
            call.resolve();
        });
    }
}
