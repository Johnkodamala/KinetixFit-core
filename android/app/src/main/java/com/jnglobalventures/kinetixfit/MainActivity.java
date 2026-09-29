package com.jnglobalventures.kinetixfit;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // local plugins: must be registered before super.onCreate
        registerPlugin(SystemThemePlugin.class);
        registerPlugin(NativeFeedbackPlugin.class);
        registerPlugin(WidgetBridgePlugin.class);
        registerPlugin(MoveReminderPlugin.class);
        registerPlugin(AppIconPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
