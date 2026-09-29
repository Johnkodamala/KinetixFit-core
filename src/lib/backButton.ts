// Android's back button, most recent screen first: an open sheet or pop-up closes, an onboarding step goes back one
// step, and only when nothing has claimed it does App.tsx fall back to the browser history (tabs, account pages) and
// then leave the app. Without this, back during onboarding left the app (the steps aren't in the history), and back
// with a sheet open changed tabs underneath it.
import { useEffect, useRef } from 'react';

type Handler = () => void;
const stack: Handler[] = [];

/** Claims the back button until the returned function is called. The latest claim wins. */
export function pushBackHandler(handler: Handler): () => void {
  stack.push(handler);
  return () => {
    const i = stack.lastIndexOf(handler);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Runs the latest claim. false = nothing claimed it, so the default behaviour applies. */
export function handleBack(): boolean {
  const handler = stack[stack.length - 1];
  if (!handler) return false;
  handler();
  return true;
}

/** While `active`, the back button calls `onBack` (the latest version of it, so callers can pass inline functions). */
export function useBackHandler(active: boolean, onBack: () => void) {
  const latest = useRef(onBack);
  useEffect(() => { latest.current = onBack; });
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => latest.current());
  }, [active]);
}
