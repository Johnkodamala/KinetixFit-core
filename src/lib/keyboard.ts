// On-screen keyboard (native apps only): while it's up, <html> gets .kx-keyboard-open (the floating tab bar
// and camera button step aside — see responsive.css), and the focused field is scrolled into view once the
// WebView has resized (iOS: capacitor.config.ts Keyboard.resize = 'native'; Android: adjustResize).
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

export function setupKeyboard() {
  if (!Capacitor.isNativePlatform()) return;
  const root = document.documentElement;

  const focusedField = () => {
    const el = document.activeElement;
    return root.classList.contains('kx-keyboard-open') && el instanceof HTMLElement && el.matches('input, textarea, [contenteditable="true"]') ? el : null;
  };
  // Centre the field above the keyboard. keyboardDidShow can arrive before the WebView has finished shrinking
  // (iOS), and iOS's own focus scrolling can cancel a smooth scroll — so scroll smoothly once the new size has
  // landed, then check shortly after and snap the field into view if it still isn't clear of the keyboard.
  const reveal = () => {
    focusedField()?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    window.setTimeout(() => {
      const el = focusedField();
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight - 16) el.scrollIntoView({ block: 'center' });
    }, 450);
  };
  void Keyboard.addListener('keyboardWillShow', () => root.classList.add('kx-keyboard-open'));
  void Keyboard.addListener('keyboardWillHide', () => root.classList.remove('kx-keyboard-open'));
  void Keyboard.addListener('keyboardDidShow', () => window.setTimeout(reveal, 100));
}
