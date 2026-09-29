// Alternate app icons (Account → App icon). Two are free; the rest are a KinetixFit Plus perk: everyone can see them,
// only Plus members can switch to one, and a Plus icon goes back to Classic if Plus ends.
// Android: one launcher activity-alias per icon in AndroidManifest.xml, switched by AppIconPlugin.java.
// iOS: alternate icons in Assets.xcassets (AppIcon-<Name>.appiconset), switched by App/AppIconPlugin.swift.
// The artwork is rendered from scripts/app-icons/ (see its README), which also writes the previews used here.
import { Capacitor, registerPlugin } from '@capacitor/core';

export type AppIconId = 'classic' | 'midnight' | 'aurora' | 'gold' | 'ember' | 'kx-track' | 'kx-mono' | 'kx-pulse' | 'kx-chrome';

export interface AppIconInfo {
  id: AppIconId;
  name: string;
  /** one line under the name */
  hint: string;
  plus: boolean;
  /** the KinetixFit symbol, or the "KX" lettering */
  style: 'symbol' | 'kx';
}

export const APP_ICONS: AppIconInfo[] = [
  { id: 'classic', name: 'Classic', hint: 'The Kinetix Fit symbol on white', plus: false, style: 'symbol' },
  { id: 'midnight', name: 'Midnight', hint: 'The symbol glowing on deep ink', plus: false, style: 'symbol' },
  { id: 'aurora', name: 'Aurora', hint: 'Pearl on a northern-lights sky', plus: true, style: 'symbol' },
  { id: 'gold', name: 'Gold', hint: 'Polished gold on black', plus: true, style: 'symbol' },
  { id: 'ember', name: 'Ember', hint: 'White on Kinetix Fit orange', plus: true, style: 'symbol' },
  { id: 'kx-track', name: 'KX Track', hint: 'Wide KX on the race track', plus: true, style: 'kx' },
  { id: 'kx-mono', name: 'KX Monogram', hint: 'K and X interlocked, gold on emerald', plus: true, style: 'kx' },
  { id: 'kx-pulse', name: 'KX Pulse', hint: 'Coral KX over a heartbeat', plus: true, style: 'kx' },
  { id: 'kx-chrome', name: 'KX Chrome', hint: 'Brushed chrome on graphite', plus: true, style: 'kx' },
];

export const DEFAULT_APP_ICON: AppIconId = 'classic';
export const appIconInfo = (id: AppIconId) => APP_ICONS.find(i => i.id === id) ?? APP_ICONS[0];
export const isAppIconId = (id: unknown): id is AppIconId => APP_ICONS.some(i => i.id === id);

/** Can this person use the icon? Free icons always; Plus icons with Plus. */
export const canUseIcon = (id: AppIconId, isPlus: boolean) => !appIconInfo(id).plus || isPlus;

/**
 * Whether a Plus icon in use should go back to Classic: only once the plan is known (RevenueCat or the server has
 * answered) and it's not Plus — never while the plan is still loading, or the icon would flip back on every start.
 */
export const shouldRevertIcon = (current: AppIconId, planKnown: boolean, isPlus: boolean) =>
  planKnown && !isPlus && appIconInfo(current).plus;

const AppIcon = registerPlugin<{
  get(): Promise<{ id: string }>;
  set(options: { id: AppIconId }): Promise<{ id: string }>;
}>('AppIcon');

/** Only the apps have an icon to change. */
export const appIconSupported = () => Capacitor.isNativePlatform();

export async function currentAppIcon(): Promise<AppIconId> {
  if (!appIconSupported()) return DEFAULT_APP_ICON;
  try {
    const { id } = await AppIcon.get();
    return isAppIconId(id) ? id : DEFAULT_APP_ICON;
  } catch {
    return DEFAULT_APP_ICON;
  }
}

/** Switches the icon; resolves with the icon now in use (unchanged if the phone refused). */
export async function changeAppIcon(id: AppIconId): Promise<AppIconId> {
  const { id: now } = await AppIcon.set({ id });
  return isAppIconId(now) ? now : DEFAULT_APP_ICON;
}

// Previews for the picker (264 px WebP, written by scripts/app-icons/render.mjs).
const previews = import.meta.glob('../assets/app-icons/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const appIconPreview = (id: AppIconId) => previews[`../assets/app-icons/${id}.webp`] ?? '';
