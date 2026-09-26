// Form controls that replace the browser's number inputs and <select> pop-ups.
//
// - MeasureField: a big typeable number with a scrollable ruler under it (height, weight, age…). Typing keeps
//   its own text, so a field can be emptied, and "72." keeps its dot while you type the decimal.
// - Segmented: 2–4 short options side by side.
// - ChoiceCards: tappable option cards (with an optional hint and icon) that spring when chosen.
// - Sheet: a bottom sheet (slides up on phones, centred card on wide screens).
// - SheetRow: a settings row showing the current value; tapping opens a Sheet.
// Styles live in src/styles/pickers.css.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronIcon } from './Icons';
import * as feedback from '../lib/feedback';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const roundTo = (n: number, decimals: number) => Number(n.toFixed(decimals));

/* ------------------------------------------------------------------------------------------------ */
/* MeasureField                                                                                       */
/* ------------------------------------------------------------------------------------------------ */

interface MeasureFieldProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  /** a labelled tick every N steps */
  labelEvery?: number;
  onChange: (value: number) => void;
}

export function MeasureField({ label, value, unit, min, max, step = 1, decimals = 0, labelEvery = 10, onChange }: MeasureFieldProps) {
  const id = useId();
  const format = (n: number) => n.toFixed(decimals);
  // While typing, the field shows the person's own text; otherwise it follows the value (ruler etc.)
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const text = editing ? draft : format(value);
  const setText = setDraft;

  const parsed = parseFloat(text);
  const outOfRange = text !== '' && (!Number.isFinite(parsed) || parsed < min || parsed > max);

  const handleType = (raw: string) => {
    const cleaned = raw.replace(',', '.');
    const pattern = decimals > 0 ? new RegExp(`^\\d{0,3}(\\.\\d{0,${decimals}})?$`) : /^\d{0,3}$/;
    if (!pattern.test(cleaned)) return; // ignore letters, a second dot, too many decimals
    setText(cleaned);
    const n = parseFloat(cleaned);
    if (Number.isFinite(n) && n >= min && n <= max) onChange(roundTo(n, decimals));
  };

  const finishTyping = () => {
    setEditing(false);
    const n = parseFloat(text);
    const next = Number.isFinite(n) ? roundTo(clamp(n, min, max), decimals) : value;
    if (next !== value) onChange(next);
  };

  return (
    <div className="kx-measure">
      <label className="kx-field-label" htmlFor={id}>{label}</label>
      <div className="kx-measure-readout">
        <input
          id={id}
          className="kx-measure-input"
          type="text"
          inputMode={decimals > 0 ? 'decimal' : 'numeric'}
          enterKeyHint="done"
          autoComplete="off"
          value={text}
          onFocus={e => { setDraft(format(value)); setEditing(true); const el = e.currentTarget; requestAnimationFrame(() => el.select()); }}
          onChange={e => handleType(e.target.value)}
          onBlur={finishTyping}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          style={{ width: `${Math.max(text.length, 2) + 0.4}ch` }}
          aria-invalid={outOfRange || undefined}
          aria-describedby={outOfRange ? `${id}-hint` : undefined}
        />
        <span className="kx-measure-unit">{unit}</span>
      </div>
      {outOfRange && editing && (
        <p id={`${id}-hint`} className="kx-field-hint">Enter {format(min)}–{format(max)} {unit}</p>
      )}
      <Ruler value={value} min={min} max={max} step={step} decimals={decimals} labelEvery={labelEvery} label={label} unit={unit} onChange={onChange} />
    </div>
  );
}

interface RulerProps {
  value: number; min: number; max: number; step: number; decimals: number; labelEvery: number;
  label: string; unit: string; onChange: (value: number) => void;
}

function Ruler({ value, min, max, step, decimals, labelEvery, label, unit, onChange }: RulerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const PX = step < 1 ? 8 : 12; // distance between ticks
  const steps = Math.round((max - min) / step);
  const index = clamp(Math.round((value - min) / step), 0, steps);
  // Labels and long ticks sit on round values (age 20, 30, 40…) even when the range starts at 13
  const labelSpan = labelEvery * step;
  const labelOffset = Math.round((Math.ceil(min / labelSpan - 1e-9) * labelSpan - min) / step);

  // Scroll to the value when it changes from outside. While someone is flinging the ruler the value
  // is derived from the scroll position, so it's already within half a tick and this leaves it alone.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && Math.abs(el.scrollLeft - index * PX) > PX / 2) el.scrollLeft = index * PX;
  }, [index, PX]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = clamp(Math.round(el.scrollLeft / PX), 0, steps);
    const next = roundTo(min + i * step, decimals);
    if (next !== value) {
      onChange(next);
      feedback.tick((i - labelOffset) % labelEvery === 0); // a firmer click on the labelled marks
    }
    // once scrolling stops, settle exactly on the nearest tick
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      if (Math.abs(el.scrollLeft - i * PX) > 0.5) el.scrollTo({ left: i * PX, behavior: 'smooth' });
      feedback.selectionEnd();
    }, 140);
  };

  const nudge = (by: number) => {
    const next = roundTo(clamp(value + by * step, min, max), decimals);
    if (next !== value) { onChange(next); feedback.tick(); }
  };
  const labels = [];
  for (let i = labelOffset; i <= steps; i += labelEvery) labels.push(i);

  return (
    <div className="kx-ruler">
      <div
        ref={ref}
        className="kx-ruler-scroll"
        onScroll={handleScroll}
        onPointerDown={() => feedback.selectionStart()}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value.toFixed(decimals)} ${unit}`}
        onKeyDown={e => {
          const map: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: labelEvery, PageDown: -labelEvery };
          if (e.key in map) { e.preventDefault(); nudge(map[e.key]); }
        }}
      >
        <div
          className="kx-ruler-track"
          style={{ width: steps * PX + 1, '--tick': `${PX}px`, '--major': `${PX * labelEvery}px`, '--major-offset': `${labelOffset * PX}px` } as CSSProperties}
        >
          {labels.map(i => (
            <span key={i} className="kx-ruler-label" style={{ left: i * PX }}>
              {Math.round(min + i * step)}
            </span>
          ))}
        </div>
      </div>
      <span className="kx-ruler-needle" aria-hidden="true" />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Segmented + ChoiceCards                                                                          */
/* ------------------------------------------------------------------------------------------------ */

export interface Choice<T> { value: T; label: string; hint?: string; icon?: ReactNode; }

export function Segmented<T extends string | number | null>({ label, options, value, onChange }: {
  label: string; options: Choice<T>[]; value: T; onChange: (value: T) => void;
}) {
  const index = Math.max(0, options.findIndex(o => o.value === value));
  return (
    <div className="kx-segmented-wrap">
      <span className="kx-field-label">{label}</span>
      <div
        className="kx-segmented"
        role="radiogroup"
        aria-label={label}
        style={{ '--count': options.length, '--index': index } as CSSProperties}
      >
        <span className="kx-segmented-thumb" aria-hidden="true" />
        {options.map(o => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? 'is-on' : undefined}
            onClick={() => { if (o.value !== value) feedback.tap(); onChange(o.value); }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChoiceCards<T extends string | number>({ label, options, value, onChange, columns = 1, hideLabel = false, compact = false }: {
  label: string; options: Choice<T>[]; value: T; onChange: (value: T) => void; columns?: 1 | 2 | 4; hideLabel?: boolean;
  /** short single-line options in a grid (e.g. regions) */
  compact?: boolean;
}) {
  return (
    <div className="kx-choices-wrap">
      {!hideLabel && <span className="kx-field-label">{label}</span>}
      <div className={`kx-choices kx-choices-${columns}${compact ? ' kx-choices-compact' : ''}`} role="radiogroup" aria-label={label}>
        {options.map(o => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={on}
              className={`kx-choice${on ? ' is-on' : ''}`}
              onClick={() => { if (!on) feedback.tap(); onChange(o.value); }}
            >
              {o.icon && <span className="kx-choice-icon">{o.icon}</span>}
              <span className="kx-choice-text">
                <span className="kx-choice-label">{o.label}</span>
                {o.hint && <span className="kx-choice-hint">{o.hint}</span>}
              </span>
              <span className="kx-choice-check" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Sheet + SheetRow                                                                                 */
/* ------------------------------------------------------------------------------------------------ */

const SHEET_EXIT_MS = 200;

export function Sheet({ open, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  // Stays mounted briefly after closing so it can slide away
  const [mounted, setMounted] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMounted(true);
  }
  const closing = mounted && !open;
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Held in a ref so a parent re-render (e.g. every keystroke in a field inside the sheet) doesn't
  // re-run the open/close effect and pull focus back to the panel.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => setMounted(false), SHEET_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [closing]);

  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); returnTo?.focus?.(); };
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <div
      className={`kx-sheet-root${closing ? ' is-closing' : ''}`}
      onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={panelRef} className="kx-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <span className="kx-sheet-handle" aria-hidden="true" />
        <div className="kx-sheet-head">
          <h3 id={titleId} className="kx-sheet-title">{title}</h3>
          <button type="button" className="kx-sheet-done" onClick={onClose}>Done</button>
        </div>
        <div className="kx-sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/** A settings row: label on the left, current value on the right; opens its sheet on tap. */
export function SheetRow({ label, value, sheetTitle, children }: {
  label: string; value: string; sheetTitle?: string; children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className="kx-row" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className="kx-row-label">{label}</span>
        <span className="kx-row-value">{value}</span>
        <ChevronIcon className="kx-row-chevron" />
      </button>
      <Sheet open={open} title={sheetTitle ?? label} onClose={close}>
        {children(close)}
      </Sheet>
    </>
  );
}
