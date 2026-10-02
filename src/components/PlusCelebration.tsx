import { useEffect, useRef } from 'react';
import { success } from '../lib/feedback';
import { PLUS_BENEFITS } from '../lib/plus';

// Shown once, right after Plus starts (a purchase or a promo code): a burst of confetti behind the infinity mark, a
// thank-you, and what is now unlocked. Plays the success haptic and chime. With "reduce motion" on, the confetti and the
// glow are left out (plus.css) and only the card shows.

const PIECES = 28;
// Same infinity path as the opening screen's mark (viewBox 0 0 100 50)
const MARK_PATH = 'M25 45C35 45 45 35 50 25C55 15 65 5 75 5C85 5 95 15 95 25C95 35 85 45 75 45C65 45 55 35 50 25C45 15 35 5 25 5C15 5 5 15 5 25C5 35 15 45 25 45Z';

// Each piece flies out from the middle at its own angle, distance and delay: worked out from its number, so it looks
// scattered but is the same every time (and nothing is random while rendering).
const confetti = Array.from({ length: PIECES }, (_, i) => ({
  angle: (i * 360) / PIECES + (i % 3) * 7,
  distance: 120 + ((i * 37) % 120),
  delay: (i % 7) * 40,
  spin: ((i * 53) % 540) - 270,
  tone: i % 4,
}));

export default function PlusCelebration({ onClose }: { onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const played = useRef(false);

  useEffect(() => {
    if (!played.current) { played.current = true; success(); }
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="kx-plus-celebration" role="dialog" aria-modal="true" aria-labelledby="kx-plus-title" onClick={onClose}>
      <div className="kx-plus-confetti" aria-hidden="true">
        {confetti.map((c, i) => (
          <span key={i} className={`kx-plus-piece kx-plus-piece-${c.tone}`}
            style={{ ['--angle' as string]: `${c.angle}deg`, ['--distance' as string]: `${c.distance}px`, ['--delay' as string]: `${c.delay}ms`, ['--spin' as string]: `${c.spin}deg` }} />
        ))}
      </div>
      <div className="kx-plus-card" onClick={e => e.stopPropagation()}>
        <svg className="kx-plus-mark" viewBox="-6 -6 112 62" fill="none" aria-hidden="true">
          <path d={MARK_PATH} pathLength={1} />
        </svg>
        <span className="kx-plus-kicker">PLUS</span>
        <h2 id="kx-plus-title" className="kx-plus-title">Welcome to Plus</h2>
        <p className="kx-plus-sub">Thank you for backing Kinetix Fit. All of this is yours now:</p>
        <ul className="kx-plus-list">
          {PLUS_BENEFITS.map(b => <li key={b}>{b}</li>)}
        </ul>
        <button ref={button} type="button" className="primary-btn kx-plus-cta" onClick={onClose}>Let’s go</button>
      </div>
    </div>
  );
}
