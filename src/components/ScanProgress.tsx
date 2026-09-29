// The moment between a food scan and its result: a frosted overlay with pulsing rings, a spinning arc and a scan line
// sweeping over the scan's icon, and a line that changes every ~1.5 s ("Counting every crumb…") with a soft haptic tick
// each time. When the result is in, the icon turns into a tick, "Got it" + the food, a success haptic and chime, then
// it fades away and the result shows. Styles: src/styles/app.css (.kx-scanfx).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as feedback from '../lib/feedback';

export type ScanKind = 'photo' | 'barcode' | 'text';

const LINES: Record<ScanKind, string[]> = {
  photo: ['Looking at your plate…', 'Spotting what’s on it…', 'Sizing up the portion…', 'Counting every crumb…', 'Checking your allergens…', 'Plating up the numbers…'],
  barcode: ['Reading the barcode…', 'Finding the pack…', 'Reading the label…', 'Weighing up the protein…', 'Checking your allergens…', 'Nearly there…'],
  text: ['Looking it up…', 'Asking the food database nicely…', 'Crunching the numbers…', 'Sorting protein from carbs…', 'Nearly there…'],
};

const DONE_MS = 950;

function Icon({ kind }: { kind: ScanKind }) {
  const common = { width: 34, height: 34, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (kind === 'photo') return <svg {...common}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
  if (kind === 'barcode') return <svg {...common}><path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12" strokeWidth="1.8" /></svg>;
  return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2" /></svg>;
}

export default function ScanProgress({ kind, phase, doneLabel, onDone }: {
  kind: ScanKind;
  phase: 'working' | 'done';
  /** e.g. the food's name, shown under "Got it" */
  doneLabel?: string;
  onDone: () => void;
}) {
  const [line, setLine] = useState(0);
  const lines = LINES[kind];

  // a light tap to start, then a soft tick with every new line while it works
  useEffect(() => { feedback.tap(); }, []);
  useEffect(() => {
    if (phase !== 'working') return;
    const t = window.setInterval(() => {
      setLine(i => (i + 1) % lines.length);
      feedback.selection();
    }, 1500);
    return () => window.clearInterval(t);
  }, [phase, lines.length]);

  // done: success haptic + chime, hold the tick for a moment, then hand over to the result
  useEffect(() => {
    if (phase !== 'done') return;
    feedback.success();
    const t = window.setTimeout(onDone, DONE_MS);
    return () => window.clearTimeout(t);
  }, [phase, onDone]);

  return createPortal(
    <div className={`kx-scanfx${phase === 'done' ? ' is-done' : ''}`} role="status" aria-live="polite">
      <div className="kx-scanfx-card">
        <div className="kx-scanfx-stage" aria-hidden="true">
          <span className="kx-scanfx-ring" />
          <span className="kx-scanfx-ring" style={{ animationDelay: '0.6s' }} />
          <span className="kx-scanfx-ring" style={{ animationDelay: '1.2s' }} />
          <span className="kx-scanfx-arc" />
          <span className="kx-scanfx-core">
            {phase === 'done' ? (
              <svg className="kx-scanfx-check" width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            ) : (
              <>
                <Icon kind={kind} />
                <span className="kx-scanfx-beam" />
              </>
            )}
          </span>
          {[0, 1, 2, 3, 4].map(i => <span key={i} className="kx-scanfx-spark" style={{ ['--i' as string]: i }} />)}
        </div>
        {phase === 'done' ? (
          <div className="kx-scanfx-text" key="done">
            <strong>Got it</strong>
            {doneLabel && <span>{doneLabel}</span>}
          </div>
        ) : (
          <div className="kx-scanfx-text" key={line}>
            <strong>{lines[line]}</strong>
          </div>
        )}
        {phase === 'working' && (
          <div className="kx-scanfx-dots" aria-hidden="true"><i /><i /><i /></div>
        )}
      </div>
    </div>,
    document.body
  );
}
