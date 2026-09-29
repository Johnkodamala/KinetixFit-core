import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jnglobalventures.kinetixfit',
  appName: 'Kinetix Fit',
  webDir: 'dist',
  // Matches the launch intro and native splash, so the WebView never flashes white on start
  backgroundColor: '#16181F',
  ios: {
    // Every screen scrolls inside its own panel (.app-scroll-body, .ob-container), so the WebView itself must
    // not: otherwise the whole app rubber-bands, and focusing an input shoves the page (and tab bar) upwards.
    scrollEnabled: false
  },
  plugins: {
    // Android status-bar icon + tint for any notification that doesn't set its own (src/lib/notifications.ts)
    LocalNotifications: {
      smallIcon: 'ic_stat_kinetixfit',
      iconColor: '#E5532D'
    },
    Keyboard: {
      // iOS: shrink the WebView above the keyboard, so 100dvh screens end at the keyboard and the focused
      // field can scroll into view (src/lib/keyboard.ts). Android keeps its default adjustResize behaviour.
      resize: 'native'
    }
  }
};

export default config;
