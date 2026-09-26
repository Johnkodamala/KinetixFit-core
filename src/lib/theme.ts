import { Capacitor, SystemBars, SystemBarsStyle, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

// Light / dark / follow the phone. The choice is resolved to <html data-theme="light|dark">, which
// is the only thing the dark tokens in index.css key off. index.html sets it before first paint
// (same logic, inline) so the app never flashes the wrong theme; this module keeps it current.
export type ThemePref = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'kx_theme';
// Last dark/light answer from Android, so the inline script in index.html can use it before JS loads.
const SYSTEM_DARK_KEY = 'kx_system_dark';
const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

// On Android the WebView's prefers-color-scheme kept saying "light" on a phone in night mode, so
// "System" asks Android directly (android/.../SystemThemePlugin.java). Web and iOS use the media query.
interface SystemThemePlugin {
  get(): Promise<{ dark: boolean }>;
  addListener(event: 'change', cb: (e: { dark: boolean }) => void): Promise<PluginListenerHandle>;
}
const SystemTheme = registerPlugin<SystemThemePlugin>('SystemTheme');
const useNativeSystemTheme = Capacitor.getPlatform() === 'android';
let nativeSystemDark: boolean | null = null;

function systemIsDark(): boolean {
  return nativeSystemDark ?? systemDarkQuery.matches;
}

export function getThemePref(): ThemePref {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(pref: ThemePref = getThemePref()) {
  const theme = pref === 'system' ? (systemIsDark() ? 'dark' : 'light') : pref;
  document.documentElement.dataset.theme = theme;
  // Status/navigation bar icons: light icons on the dark theme, dark icons on the light one.
  // The launch intro sets its own (it's always dark) and calls this again when it finishes.
  if (Capacitor.isNativePlatform() && document.documentElement.dataset.intro !== 'run') {
    const style = theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
    SystemBars.setStyle({ style }).catch(() => { /* older shells: ignore */ });
  }
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch { /* private mode: applies for this session only */ }
  applyTheme(pref);
}

function setNativeSystemDark(dark: boolean) {
  nativeSystemDark = dark;
  try { localStorage.setItem(SYSTEM_DARK_KEY, dark ? '1' : '0'); } catch { /* ignore */ }
  if (getThemePref() === 'system') applyTheme('system');
}

/** Keep "System" in step with the phone when it switches between light and dark (e.g. at sunset). */
export function followSystemTheme() {
  if (useNativeSystemTheme) {
    SystemTheme.get().then(r => setNativeSystemDark(r.dark)).catch(() => { /* old build without the plugin */ });
    SystemTheme.addListener('change', r => setNativeSystemDark(r.dark)).catch(() => {});
    return;
  }
  systemDarkQuery.addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system');
  });
}
