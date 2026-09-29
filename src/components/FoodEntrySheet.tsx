// The sheet for one food on today's log: how much (quantity + unit), how much of it was eaten, and the numbers
// that follow — all worked out on the phone from the food's per-100 g values (src/lib/foodLog.ts), no server call.
// Used to change or remove a logged entry, and to log a saved food again.
import { useState } from 'react';
import { Sheet, Segmented } from './Pickers';
import { fmtNumber } from '../lib/countries';
import * as feedback from '../lib/feedback';
import {
  GRAMS, EATEN_OPTIONS, EATEN_LABELS, EXTRAS, extraAmountText, entryGrams, entryNutrients, portionText, foodTitle, withExtra,
  type FoodUnit, type LogEntry, type ExtraId,
} from '../lib/foodLog';

/**
 * Add-ons for one food: "+ Sugar" chips, and a − 2 tsp sugar + stepper for each one added. Used in this sheet and on
 * the Check a food result card (src/App.tsx).
 */
export function ExtrasPicker({ entry, onChange }: { entry: LogEntry; onChange: (id: ExtraId, dir: 1 | -1) => void }) {
  const counts = Object.fromEntries((entry.extras ?? []).map(x => [x.id, x.count]));
  return (
    <div className="kx-extras" role="group" aria-label="Added to it">
      {EXTRAS.map(x => {
        const count = counts[x.id] ?? 0;
        return count > 0 ? (
          <span key={x.id} className="kx-extra is-on">
            <button type="button" onClick={() => onChange(x.id, -1)} aria-label={`Less ${x.label.toLowerCase()}`}>−</button>
            <span>{extraAmountText(x, count)}</span>
            <button type="button" onClick={() => onChange(x.id, 1)} aria-label={`More ${x.label.toLowerCase()}`}>+</button>
          </span>
        ) : (
          <button key={x.id} type="button" className="kx-extra" onClick={() => onChange(x.id, 1)}>+ {x.label}</button>
        );
      })}
    </div>
  );
}

interface FoodEntrySheetProps {
  /** the entry being changed, or a draft for a food being logged again; null = closed */
  entry: LogEntry | null;
  mode: 'edit' | 'add';
  /** portion units known for this food (from the pack, the photo or a typical weight) */
  units: FoodUnit[];
  onSave: (entry: LogEntry) => void;
  onRemove: (id: string) => void;
  /** a past day's food: log the same food and amount again today */
  onLogAgain?: (entry: LogEntry) => void;
  onClose: () => void;
}

const MAX_GRAMS = 5000;
const MAX_UNITS = 50;

function StepIcon({ plus }: { plus?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14" />{plus && <path d="M12 5v14" />}
    </svg>
  );
}

// "Slices" for the unit picker; grams stay "g"
const unitLabel = (label: string, liquid?: boolean) => (label === GRAMS ? (liquid ? 'ml' : 'g') : label.charAt(0).toUpperCase() + label.slice(1) + (/s$/.test(label) ? '' : 's'));

export default function FoodEntrySheet({ entry, mode, units, onSave, onRemove, onLogAgain, onClose }: FoodEntrySheetProps) {
  // The sheet edits its own copy; a new entry (another food, or reopened) starts a fresh copy.
  const [draft, setDraft] = useState<LogEntry | null>(entry);
  const [draftFor, setDraftFor] = useState<string | null>(entry?.id ?? null);
  const [qtyText, setQtyText] = useState<string | null>(null);
  if ((entry?.id ?? null) !== draftFor) {
    setDraftFor(entry?.id ?? null);
    if (entry) setDraft(entry);
    setQtyText(null);
  }
  const current = entry ? draft : null;

  // Units on offer: the entry's own, the food's known ones, and grams when the food has a gram basis (max 4 fit).
  const options: FoodUnit[] = [];
  if (current) {
    if (current.unit !== GRAMS) options.push({ label: current.unit, grams: current.unitGrams });
    for (const u of units) if (!options.some(o => o.label === u.label)) options.push(u);
    if (current.gramsKnown) options.push({ label: GRAMS, grams: 1 });
  }
  const shown = options.length > 4 ? [...options.slice(0, 3), options[options.length - 1]] : options;

  const isGrams = current?.unit === GRAMS;
  const step = isGrams ? 10 : (current?.unitGrams ?? 0) >= 200 ? 0.5 : 1;
  // 1 g: a spoon of pickle or ghee can be a few grams
  const min = isGrams ? 1 : 0.5;
  const max = isGrams ? MAX_GRAMS : MAX_UNITS;
  const clampQty = (q: number) => Math.min(max, Math.max(min, Math.round(q * 100) / 100));

  const update = (changes: Partial<LogEntry>) => setDraft(d => (d ? { ...d, ...changes } : d));
  const stepQty = (dir: 1 | -1) => {
    if (!current) return;
    // snap to the step first, so 72 g → 80 g rather than 82 g
    const snapped = dir > 0 ? Math.floor(current.qty / step) * step + step : Math.ceil(current.qty / step) * step - step;
    feedback.tick(false);
    setQtyText(null);
    update({ qty: clampQty(snapped) });
  };
  const typeQty = (raw: string) => {
    const cleaned = raw.replace(',', '.');
    if (!/^\d{0,4}(\.\d{0,2})?$/.test(cleaned)) return;
    setQtyText(cleaned);
    const n = parseFloat(cleaned);
    // what's typed is what's saved, kept within the limits — never silently the old amount (a typed "2" g used to leave 100 g)
    if (Number.isFinite(n)) update({ qty: clampQty(n) });
  };
  // Switching unit keeps the amount eaten about the same: 2 slices (72 g) → 72 g; 72 g → 2 slices.
  const switchUnit = (label: string) => {
    if (!current || label === current.unit) return;
    const unit = options.find(o => o.label === label);
    if (!unit) return;
    const grams = current.qty * current.unitGrams;
    let qty: number;
    if (label === GRAMS) qty = Math.max(5, Math.round(grams / 5) * 5);
    else {
      const count = grams / unit.grams;
      qty = count >= 0.5 ? Math.round(count * 2) / 2 : 1;
    }
    setQtyText(null);
    update({ unit: label, unitGrams: unit.grams, qty: Math.min(label === GRAMS ? MAX_GRAMS : MAX_UNITS, qty) });
  };

  const n = current ? entryNutrients(current) : null;
  const estimatedUnit = current && !isGrams && units.find(u => u.label === current.unit)?.estimated;

  return (
    <Sheet open={!!entry} title={current ? foodTitle(current.name) : ''} onClose={onClose}>
      {current && n && (
        <div className="kx-fe">
          <div className="kx-fe-total" aria-live="polite">
            <strong>{fmtNumber(Math.round(n.kcal))}<small> kcal</small></strong>
            <span>{portionText(current)}</span>
          </div>
          <div className="kx-food-macros kx-fe-macros">
            <span><strong>{Math.round(n.carbs)}g</strong>carbs</span>
            <span><strong>{Math.round(n.protein)}g</strong>protein</span>
            <span><strong>{Math.round(n.fiber)}g</strong>fibre</span>
            <span><strong>{Math.round(n.fat)}g</strong>fat</span>
          </div>

          <div className="kx-fe-amount">
            <span className="kx-field-label" id="kx-fe-amount-label">How much</span>
            <div className="kx-fe-stepper" role="group" aria-labelledby="kx-fe-amount-label">
              <button type="button" className="kx-fe-step" onClick={() => stepQty(-1)} disabled={current.qty <= min} aria-label="Less">
                <StepIcon />
              </button>
              <label className="kx-fe-qty">
                <input
                  type="text"
                  inputMode="decimal"
                  enterKeyHint="done"
                  autoComplete="off"
                  aria-label={`Amount in ${isGrams ? (current.liquid ? 'millilitres' : 'grams') : unitLabel(current.unit).toLowerCase()}`}
                  value={qtyText ?? String(current.qty)}
                  placeholder={String(current.qty)}
                  // an empty box to type into, the amount showing as its placeholder: on a phone the tap can undo a
                  // "select all", and a typed 5 then joined the old 100. Left empty, the amount stays as it was.
                  onFocus={() => setQtyText('')}
                  onChange={e => typeQty(e.target.value)}
                  onBlur={() => { setQtyText(null); update({ qty: clampQty(current.qty) }); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
                <span>{isGrams ? (current.liquid ? 'ml' : 'g') : current.qty === 1 || /s$/.test(current.unit) ? current.unit : `${current.unit}s`}</span>
              </label>
              <button type="button" className="kx-fe-step" onClick={() => stepQty(1)} disabled={current.qty >= max} aria-label="More">
                <StepIcon plus />
              </button>
            </div>
            {shown.length > 1 && (
              <Segmented label="Measured in" value={current.unit} onChange={switchUnit}
                options={shown.map(u => ({ value: u.label, label: unitLabel(u.label, current.liquid) }))} />
            )}
          </div>

          <Segmented label="How much of it did you eat?" value={current.eaten}
            onChange={v => update({ eaten: v })}
            options={EATEN_OPTIONS.map(v => ({ value: v as number, label: EATEN_LABELS[v] }))} />

          <div className="kx-fe-extras">
            <span className="kx-field-label">Anything added to it?</span>
            <ExtrasPicker entry={current} onChange={(id, dir) => setDraft(d => (d ? withExtra(d, id, dir) : d))} />
          </div>

          <label className="kx-fe-note">
            <span className="kx-field-label">Note</span>
            <input
              type="text"
              className="auth-input"
              maxLength={120}
              placeholder="e.g. unsweetened, homemade, extra chilli"
              value={current.note ?? ''}
              onChange={e => update({ note: e.target.value })}
              autoCapitalize="sentences"
              autoComplete="off"
              enterKeyHint="done"
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          </label>

          <p className="kx-hs-note">
            {current.gramsKnown ? `That's about ${fmtNumber(Math.round(entryGrams(current)))} ${current.liquid ? 'ml' : 'g'}. ` : ''}
            {estimatedUnit ? `One ${current.unit} is a typical ${Math.round(current.unitGrams)} g — switch to grams if you know the weight.`
              : current.estimated ? 'Amounts from a photo are estimates — change them if you know better.'
              : 'Worked out on your phone from the food’s nutrition per 100 g.'}
          </p>

          <button type="button" className="primary-btn" onClick={() => onSave({ ...current, qty: clampQty(current.qty), note: current.note?.trim() || undefined })}>
            {mode === 'add' ? `Add to today · ${fmtNumber(Math.round(n.kcal))} kcal` : 'Save'}
          </button>
          {onLogAgain && (
            <button type="button" className="secondary-btn" onClick={() => onLogAgain({ ...current, qty: clampQty(current.qty) })}>
              Log again today
            </button>
          )}
          {mode === 'edit' && (
            <button type="button" className="kx-fe-remove" onClick={() => onRemove(current.id)}>{onLogAgain ? 'Remove from that day' : 'Remove from today'}</button>
          )}
        </div>
      )}
    </Sheet>
  );
}
