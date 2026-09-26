// Touch feedback: haptics (Capacitor Haptics in the apps, navigator.vibrate on Android web) and tiny
// synthesised sounds (Web Audio — no audio files). Used by the rulers and the onboarding moments.
//
// - tick(major): a ruler step. Rate-limited so a fast fling doesn't turn into a buzz.
// - tap(): choosing an option — haptic only, never a sound.
// - selection(): moving to another tab or page — the subtlest tick there is, no sound.
// - success(): a plan/result appears — a soft three-note chime and a success haptic.
// Sounds can be switched off (stored in localStorage 'kx_sounds'); haptics follow the phone's settings.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const SOUND_KEY = 'kx_sounds';
const native = Capacitor.isNativePlatform();
// On Android, @capacitor/haptics only does raw vibrations (50–100 ms buzzes), so the light touches use the
// system's own ticks via a local plugin (android/.../NativeFeedbackPlugin.java). iOS keeps Haptics.
const android = Capacitor.getPlatform() === 'android';
// iOS: a UISelectionFeedbackGenerator session is open (between selectionStart and selectionEnd)
let selecting = false;
const NativeFeedback = registerPlugin<{ tick(): Promise<void>; selection(): Promise<void> }>('NativeFeedback');

let soundOn = (() => {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
})();

export const isSoundOn = () => soundOn;
export function setSoundOn(on: boolean) {
  soundOn = on;
  try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}

// --- Web Audio: one shared context, created on first use (after a touch, as browsers require) ---
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (!soundOn) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, durationMs: number, volume: number, when = 0, type: OscillatorType = 'sine') {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + when;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + durationMs / 1000 + 0.02);
}

function vibrate(ms: number) {
  if (!native && 'vibrate' in navigator) {
    try { navigator.vibrate(ms); } catch { /* not allowed */ }
  }
}

// --- Public API ---

let lastTick = 0;
export function tick(major = false) {
  const now = performance.now();
  if (now - lastTick < 28) return; // ~35 ticks a second at most
  lastTick = now;
  if (android) {
    void (major ? NativeFeedback.selection() : NativeFeedback.tick()).catch(() => {});
  } else if (native) {
    // iOS: selectionChanged is silent unless a selection session is open (keyboard arrows, a tap on the ruler)
    if (!selecting) selectionStart();
    void (major ? Haptics.impact({ style: ImpactStyle.Light }) : Haptics.selectionChanged()).catch(() => {});
  } else {
    vibrate(major ? 8 : 4);
  }
  // a woody click: short triangle blip, a touch lower and louder on the labelled ticks
  blip(major ? 1250 : 1900, major ? 38 : 22, major ? 0.07 : 0.035, 0, 'triangle');
}

export function tap() {
  if (android) void NativeFeedback.selection().catch(() => {});
  else if (native) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  else vibrate(6);
}

export function selection() {
  if (android) void NativeFeedback.selection().catch(() => {});
  else if (native) {
    // iOS: UISelectionFeedbackGenerator — the tick a tab bar or picker gives
    void Haptics.selectionStart().then(() => Haptics.selectionChanged()).then(() => Haptics.selectionEnd()).catch(() => {});
  }
  // web: nothing — a vibration on every page change is too much in a browser
}

export function success() {
  if (native) void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  else vibrate(12);
  // C6 – E6 – G6, soft and quick
  blip(1046.5, 180, 0.05, 0);
  blip(1318.5, 180, 0.045, 0.09);
  blip(1568.0, 320, 0.04, 0.18);
}

// Picker ruler sessions: iOS/Android selection haptics want start/end around a drag
export function selectionStart() { if (native) { selecting = true; void Haptics.selectionStart().catch(() => {}); } }
export function selectionEnd() { if (native) { selecting = false; void Haptics.selectionEnd().catch(() => {}); } }
