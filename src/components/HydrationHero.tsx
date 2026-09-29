import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { hydrationWindow } from '../lib/notifications';
import { GLASS_SIZES, WATER_GOAL_ML_OPTIONS, entryMl, entryTime, waterAmount, waterWeek, type WaterLog } from '../lib/water';
import { localDayKey } from '../lib/dates';
import { ChoiceCards, Segmented, Sheet } from './Pickers';

// "1.25 L" → big "1.25" + small "L"; "750 ml" → "750" + "ml"
const splitAmount = (ml: number) => { const [n, u] = waterAmount(ml).split(' '); return { n, u }; };

// Hydration at the top of Today: a glass bottle that fills with the water the person logs (one tap per glass),
// the day's count beside it, and the next reminder. Tapping the card opens the Hydration page (HydrationSheet), kept
// simple on purpose: today's count with + / −, this week in one chart, today's glasses folded away, then settings.
// Styles: src/styles/today.css.

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (d: Date | number) => { const x = new Date(d); return `${pad(x.getHours())}:${pad(x.getMinutes())}`; };

/** The next reminder (a pending "remind me in 30 min" counts), or null when reminders are off / can't be sent. */
function nextReminder(r: ReminderInfo, now: number): number | null {
  if (!r.canRemind || !r.enabled) return null;
  const { next } = hydrationWindow(r.startHour, r.endHour, r.intervalHours, now);
  const snooze = r.snoozedUntil && r.snoozedUntil > now ? r.snoozedUntil : null;
  return snooze !== null && (next === null || snooze < next) ? snooze : next;
}

export interface ReminderInfo {
  enabled: boolean;
  intervalHours: number;
  startHour: number;
  endHour: number;
  /** Reminders are local notifications — only the apps can send them. */
  canRemind: boolean;
  snoozedUntil: number | null;
}

function ChevronSmall({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 200ms' }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function Bottle({ fill }: { fill: number }) {
  const clipId = `kx-bottle-${useId().replace(/:/g, '')}`;
  // Bottle body spans y 58..188 in the SVG; the liquid surface sits at fill of that height.
  const surfaceY = 188 - Math.min(1, Math.max(0.05, fill)) * 130;
  return (
    <svg className="kx-hydro-bottle" viewBox="0 0 120 200" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d="M40 44 h40 v10 q0 4 6 8 q18 12 18 34 v78 q0 16 -16 16 h-56 q-16 0 -16 -16 v-78 q0 -22 18 -34 q6 -4 6 -8 z" />
        </clipPath>
        <linearGradient id={`${clipId}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--m-water)', stopOpacity: 0.85 }} />
          <stop offset="100%" style={{ stopColor: 'var(--m-water)', stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <rect className="kx-hydro-cap" x="38" y="16" width="44" height="26" rx="8" />
      <rect className="kx-hydro-cap-band" x="38" y="34" width="44" height="6" rx="2" />
      <g clipPath={`url(#${clipId})`}>
        <rect className="kx-hydro-glass-fill" x="0" y="40" width="120" height="160" />
        <g className="kx-hydro-liquid" style={{ transform: `translateY(${surfaceY}px)` }}>
          <path className="kx-hydro-wave kx-hydro-wave-back" d="M-120 6 q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 v200 h-360 z" />
          <path className="kx-hydro-wave" fill={`url(#${clipId}-water)`} d="M-120 4 q15 -9 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 v200 h-360 z" />
          <circle className="kx-hydro-bubble" cx="46" cy="60" r="3" />
          <circle className="kx-hydro-bubble b2" cx="70" cy="80" r="2" />
          <circle className="kx-hydro-bubble b3" cx="58" cy="100" r="2.5" />
        </g>
      </g>
      <path className="kx-hydro-outline" d="M40 44 h40 v10 q0 4 6 8 q18 12 18 34 v78 q0 16 -16 16 h-56 q-16 0 -16 -16 v-78 q0 -22 18 -34 q6 -4 6 -8 z" />
      <path className="kx-hydro-shine" d="M26 104 q0 -14 8 -22" />
      <path className="kx-hydro-shine thin" d="M26 118 v44" />
    </svg>
  );
}

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export default function HydrationHero({ ml, goalMl, glassMl, reminders, onAddGlass, onOpen }: {
  ml: number;
  goalMl: number;
  glassMl: number;
  reminders: ReminderInfo;
  onAddGlass: () => void;
  onOpen: () => void;
}) {
  const now = useNow();
  const next = nextReminder(reminders, now);
  const reached = ml >= goalMl;
  const sub = reached ? 'Goal reached — nicely done'
    : next !== null ? `Next reminder ${clock(next)}`
    : ml > 0 ? `${waterAmount(Math.max(0, goalMl - ml))} to go`
    : `Tap + for each ${waterAmount(glassMl)} glass.`;
  const open = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } };
  const amount = splitAmount(ml);

  return (
    <section className={`kx-hydro${reached ? ' is-done' : ''}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={open}
      aria-label={`Hydration: ${waterAmount(ml)} of ${waterAmount(goalMl)} today. Open hydration details.`}>
      <div className="kx-hydro-top">
        <Bottle fill={ml / goalMl} />
        <div className="kx-hydro-text">
          <span className="kx-hydro-eyebrow">Hydration</span>
          <span className="kx-hydro-kicker">Today</span>
          <strong className="kx-hydro-time">{amount.n}<small> {amount.u}</small></strong>
          <span className="kx-hydro-unit">of {waterAmount(goalMl)}</span>
          <span className="kx-hydro-sub">{sub}</span>
        </div>
        <button type="button" className="kx-hydro-add" aria-label={`Add a ${waterAmount(glassMl)} glass of water`}
          onClick={e => { e.stopPropagation(); onAddGlass(); }}>
          <PlusIcon />
        </button>
      </div>
    </section>
  );
}

/** The Hydration page: today's glasses and reminders, the last week, the goal and the reminder switch. */
export function HydrationSheet({ open, onClose, log, goalMl, glassMl, reminders, onAddGlass, onRemoveGlass, onGoalChange, onGlassChange, onToggleReminders, onOpenReminderSettings }: {
  open: boolean;
  onClose: () => void;
  log: WaterLog;
  goalMl: number;
  glassMl: number;
  reminders: ReminderInfo;
  onAddGlass: () => void;
  onRemoveGlass: (time: number) => void;
  onGoalChange: (ml: number) => void;
  onGlassChange: (ml: number) => void;
  onToggleReminders: (on: boolean) => void;
  onOpenReminderSettings: () => void;
}) {
  const now = useNow();
  const today = localDayKey(new Date(now));
  const drinks = log[today] ?? [];
  const ml = drinks.reduce<number>((sum, e) => sum + entryMl(e), 0);
  const next = nextReminder(reminders, now);

  // Today's drinks, newest first — behind "Today's drinks" so the page opens simple.
  const [showDrinks, setShowDrinks] = useState(false);
  const newestFirst = [...drinks].sort((a, b) => entryTime(b) - entryTime(a));
  const reminderLine = !reminders.canRemind ? null
    : !reminders.enabled ? 'Reminders are off'
    : ml >= goalMl ? 'Goal reached — nicely done'
    : next !== null ? `Next reminder at ${clock(next)}` : 'No more reminders today';

  const week = waterWeek(log);
  const max = Math.max(goalMl, ...week.map(d => d.ml));
  const daysMet = week.filter(d => d.ml >= goalMl).length;
  const loggedDays = week.filter(d => d.ml > 0);
  const average = loggedDays.length ? loggedDays.reduce((s, d) => s + d.ml, 0) / loggedDays.length : 0;
  const dayLetter = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' });
  const amount = splitAmount(ml);
  // bar labels: "750", "1.2" (litres, one decimal) — short enough to sit above a thin bar
  const barLabel = (v: number) => (v < 1000 ? String(Math.round(v)) : (Math.round(v / 100) / 10).toString());

  return (
    <Sheet open={open} title="Hydration" onClose={onClose}>
      <div className="kx-hs">
        {/* Today at a glance: amount, a progress bar, − / + */}
        <div className="kx-hs-summary">
          <div>
            <strong className="kx-hs-count">{amount.n}<small> {amount.u} of {waterAmount(goalMl)}</small></strong>
            <span className="kx-hs-amount">{drinks.length} {drinks.length === 1 ? 'drink' : 'drinks'}{reminderLine ? ` · ${reminderLine}` : ''}</span>
          </div>
        </div>
        <div className="kx-hs-progress" role="progressbar" aria-valuemin={0} aria-valuemax={goalMl} aria-valuenow={ml}
          aria-label={`${waterAmount(ml)} of ${waterAmount(goalMl)}`}>
          <span style={{ ['--fill' as string]: Math.min(1, ml / goalMl) }} />
        </div>
        <div className="kx-hs-actions">
          <button type="button" className="secondary-btn kx-hs-undo" onClick={() => newestFirst[0] !== undefined && onRemoveGlass(entryTime(newestFirst[0]))}
            disabled={drinks.length === 0} aria-label="Remove the last drink">−</button>
          <button type="button" className="primary-btn kx-hs-add" onClick={onAddGlass}><PlusIcon /> Add {waterAmount(glassMl)}</button>
        </div>

        {/* The week, in one small chart and one line */}
        <div className="kx-hs-section">
          <h4 className="kx-hs-heading">This week</h4>
          <div className="kx-hs-week" role="img"
            aria-label={week.map(d => `${dayLetter(d.day)} ${waterAmount(d.ml)}`).join(', ') + `; goal ${waterAmount(goalMl)}`}>
            <span className="kx-hs-goal-line" style={{ ['--r' as string]: goalMl / max }} />
            {week.map(d => (
              <div key={d.day} className={`kx-hs-day${d.day === today ? ' is-today' : ''}${d.ml >= goalMl ? ' is-met' : ''}`}>
                <span className="kx-hs-bar" style={{ height: `${Math.max(d.ml ? 6 : 0, (d.ml / max) * 100)}%` }}>{d.ml > 0 && <b>{barLabel(d.ml)}</b>}</span>
                <span className="kx-hs-day-label">{dayLetter(d.day)}</span>
              </div>
            ))}
          </div>
          <p className="kx-hs-note">
            {loggedDays.length === 0 ? 'Your week fills in as you log water.'
              : `Goal met ${daysMet} of 7 days · about ${waterAmount(Math.round(average / 50) * 50)} a day when you logged.`}
          </p>
        </div>

        {/* Details on request: each drink with its time and amount, to take one off */}
        {drinks.length > 0 && (
          <div className="kx-hs-section">
            <button type="button" className="kx-hs-toggle" onClick={() => setShowDrinks(v => !v)} aria-expanded={showDrinks}>
              <span>Today’s drinks</span>
              <span className="kx-hs-toggle-meta">{drinks.length} · last at {clock(entryTime(newestFirst[0]))}<ChevronSmall open={showDrinks} /></span>
            </button>
            {showDrinks && (
              <ul className="kx-hs-list">
                {newestFirst.map(e => (
                  <li key={entryTime(e)}>
                    <span className="kx-hs-time">{clock(entryTime(e))}</span>
                    <span className="kx-hs-label">Water <small>{waterAmount(entryMl(e))}</small></span>
                    <button type="button" className="kx-hs-remove" onClick={() => onRemoveGlass(entryTime(e))} aria-label={`Remove the drink at ${clock(entryTime(e))}`}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Settings last */}
        <div className="kx-hs-section">
          <h4 className="kx-hs-heading">Settings</h4>
          <ChoiceCards label="Glass size" columns={4} compact value={glassMl} onChange={onGlassChange}
            options={GLASS_SIZES.map(g => ({ value: g, label: `${g} ml` }))} />
          <Segmented label="Daily goal" value={goalMl} options={WATER_GOAL_ML_OPTIONS.map(g => ({ value: g, label: waterAmount(g) }))} onChange={onGoalChange} />
          {reminders.canRemind ? (
            <>
              <label className="demo-toggle-label">
                <input type="checkbox" className="demo-toggle-checkbox" checked={reminders.enabled} onChange={e => onToggleReminders(e.target.checked)} />
                Water reminders
              </label>
              {reminders.enabled && (
                <button type="button" className="kx-row" onClick={onOpenReminderSettings}>
                  <span className="kx-row-label">Reminder times</span>
                  <span className="kx-row-value">Every {reminders.intervalHours} h · {pad(reminders.startHour)}:00–{pad(reminders.endHour)}:00</span>
                </button>
              )}
            </>
          ) : (
            <p className="kx-hs-note">Water reminders come from the Kinetix Fit app on your phone.</p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
