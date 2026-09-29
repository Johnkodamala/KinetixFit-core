// Today → Your cycle (src/lib/cycle.ts): where the person is in their cycle, when the next period is likely (a window,
// from their own logged periods), how sure that estimate is, and anything this cycle known to shift it. "My period
// started today" logs a start; the sheet lists every logged start with its cycle length, to add a past one or remove one.
import { useState } from 'react';
import { Sheet } from './Pickers';
import { CycleIcon } from './Icons';
import { fmtDate } from '../lib/countries';
import { localDayKey } from '../lib/dates';
import { cycleToday, dayDiff, shiftDay, PHASE_TEXT, type CycleToday } from '../lib/cycle';
import * as feedback from '../lib/feedback';

interface Props {
  periods: string[];
  typicalLength: number;
  periodLength?: number;
  /** cycleContext(): short sleep, hard training, under-eating, falling HRV this cycle */
  context: string[];
  onLog: (day: string) => void;
  onRemove: (day: string) => void;
}

const short = (day: string) => fmtDate(new Date(`${day}T12:00:00`), { day: 'numeric', month: 'short' });

function confidenceText(c: CycleToday): string {
  const n = c.stats.lengths.length;
  if (c.stats.confidence === 'rough') return `A first estimate from one logged period and a ${c.stats.average}-day cycle. Log each period and it gets more accurate.`;
  if (c.stats.confidence === 'good') return `Based on your last ${n} cycles, which are regular (about ${c.stats.average} days).`;
  return `Based on your last ${n} ${n === 1 ? 'cycle' : 'cycles'} (about ${c.stats.average} days).`;
}

/** The cycle as a bar: period days, the fertile window, ovulation and today, on a track as long as the cycle. */
function CycleTrack({ c, periodLength }: { c: CycleToday; periodLength: number }) {
  const length = Math.max(c.stats.average, c.day);
  const start = shiftDay(c.next, -c.stats.average);
  const pos = (day: string) => Math.min(100, Math.max(0, (dayDiff(start, day) / length) * 100));
  const fertileFrom = pos(c.fertileStart), fertileTo = pos(c.ovulation) + 100 / length;
  return (
    <div className="kx-cycle-track" role="img"
      aria-label={`Day ${c.day} of about ${c.stats.average}. Fertile window estimate ${short(c.fertileStart)} to ${short(c.ovulation)}.`}>
      <span className="kx-cycle-seg is-period" style={{ left: 0, width: `${(Math.min(periodLength, length) / length) * 100}%` }} />
      <span className="kx-cycle-seg is-fertile" style={{ left: `${fertileFrom}%`, width: `${Math.max(2, fertileTo - fertileFrom)}%` }} />
      <span className="kx-cycle-ovulation" style={{ left: `${pos(c.ovulation) + 50 / length}%` }} />
      <span className="kx-cycle-today" style={{ left: `${Math.min(100, ((c.day - 0.5) / length) * 100)}%` }}><i /></span>
    </div>
  );
}

export default function CycleCard({ periods, typicalLength, periodLength = 5, context, onLog, onRemove }: Props) {
  const today = localDayKey();
  const c = cycleToday(periods, typicalLength, periodLength, today);
  const [open, setOpen] = useState(false);
  const [pastDay, setPastDay] = useState(today);
  const log = (day: string) => { feedback.tap(); onLog(day); };

  return (
    <div className="hub-support-card kx-cycle">
      <div className="kx-card-head">
        <h3 className="card-header-title">
          <span className="kx-title-icon" style={{ ['--tint' as string]: 'var(--m-cycle)' }}><CycleIcon size={16} /></span>
          Your cycle
        </h3>
        {c && <span className="kx-count">Day {c.day}</span>}
      </div>

      {!c ? (
        <>
          <p className="kx-card-sub">Log the day your last period started to see where you are in your cycle and when the next one is likely.</p>
          <div className="kx-setup-actions">
            <button type="button" className="primary-btn" onClick={() => log(today)}>My period started today</button>
            <button type="button" className="edit-bio-btn" onClick={() => setOpen(true)}>It started earlier</button>
          </div>
        </>
      ) : (
        <>
          <p className={`kx-cycle-phase is-${c.phase}`}>{PHASE_TEXT[c.phase].title}</p>
          <p className="kx-card-sub">{PHASE_TEXT[c.phase].body}</p>
          <CycleTrack c={c} periodLength={periodLength} />
          <div className="kx-cycle-legend">
            <span><i className="is-period" />Period</span><span><i className="is-fertile" />Fertile window (estimate)</span><span><i className="is-today" />Today</span>
          </div>
          <div className="kx-cycle-next">
            <span className="kx-cycle-next-label">Next period</span>
            <strong>
              {c.lateBy > 0 ? `${c.lateBy} ${c.lateBy === 1 ? 'day' : 'days'} late`
                : c.daysUntil > 1 ? `In about ${c.daysUntil} days`
                : c.daysUntil === 1 ? 'Likely tomorrow' : 'Due now'}
            </strong>
            <span>{short(c.windowStart)} – {short(c.windowEnd)}</span>
          </div>
          <p className="kx-hs-note">{confidenceText(c)}</p>
          {context.length > 0 && (
            <ul className="kx-cycle-context" aria-label="This cycle">
              {context.map(line => <li key={line}>{line}</li>)}
            </ul>
          )}
          {c.stats.irregular && (
            <p className="kx-cycle-gp">Your cycles vary quite a lot. That’s common, but if they’re often shorter than 21 or longer than 35 days apart, or suddenly change, it’s worth mentioning to a GP.</p>
          )}
          <div className="kx-setup-actions">
            <button type="button" className={c.phase === 'due' || c.phase === 'late' ? 'primary-btn' : 'edit-bio-btn'} onClick={() => log(today)}>My period started today</button>
            <button type="button" className="edit-bio-btn" onClick={() => setOpen(true)}>Log or edit periods</button>
          </div>
          <p className="kx-cycle-fine">Estimates from your own dates — not a way to prevent pregnancy. Everything stays on your phone.</p>
        </>
      )}

      <Sheet open={open} title="Your periods" onClose={() => setOpen(false)}>
        <div className="kx-add-workout">
          <label className="kx-fe-note">
            <span className="kx-field-label">A period started on</span>
            <input type="date" className="auth-input kx-aw-date" value={pastDay} max={today} min={shiftDay(today, -400)}
              onChange={e => { if (e.target.value) setPastDay(e.target.value); }} />
          </label>
          <button type="button" className="primary-btn" onClick={() => { log(pastDay); setOpen(false); }}>Add {short(pastDay)}</button>
          {periods.length > 0 && (
            <ul className="kx-cycle-history">
              {[...periods].reverse().map((p, i, list) => {
                const next = i > 0 ? list[i - 1] : null;
                return (
                  <li key={p}>
                    <span>
                      <strong>{fmtDate(new Date(`${p}T12:00:00`), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                      <small>{next ? `${dayDiff(p, next)}-day cycle` : 'Latest'}</small>
                    </span>
                    <button type="button" className="kx-hs-remove" onClick={() => onRemove(p)} aria-label={`Remove ${short(p)}`}>Remove</button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="kx-hs-note">Log each period’s first day. Predictions use your last six cycles; a start within 10 days of another counts as the same period.</p>
        </div>
      </Sheet>
    </div>
  );
}
