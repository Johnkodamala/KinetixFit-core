// Food history: the last two weeks as calorie bars against the day's target, averages over the last 7 logged days,
// and any day's foods with needed-vs-eaten for every nutrient. Tapping a food opens it to change or remove
// (FoodEntrySheet), or to log it again today.
import { useState } from 'react';
import { Sheet } from './Pickers';
import NutritionMeters from './NutritionMeters';
import { fmtDate, fmtNumber, fmtTime } from '../lib/countries';
import { localDayKey } from '../lib/dates';
import { sumNutrients, entryNutrients, portionText, foodTitle, extrasText, HISTORY_DAYS, type FoodDays } from '../lib/foodLog';
import type { NutrientTarget } from '../lib/nutrition';

interface FoodHistorySheetProps {
  open: boolean;
  days: FoodDays;
  mainTargets: NutrientTarget[];
  moreTargets: NutrientTarget[];
  onOpenEntry: (day: string, id: string) => void;
  onClose: () => void;
}

const STRIP_DAYS = 14;

const dayKeyAgo = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return localDayKey(d); };
const dateOf = (day: string) => new Date(`${day}T12:00:00`);

function dayTitle(day: string) {
  if (day === dayKeyAgo(0)) return 'Today';
  if (day === dayKeyAgo(1)) return 'Yesterday';
  return fmtDate(dateOf(day), { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function FoodHistorySheet({ open, days, mainTargets, moreTargets, onOpenEntry, onClose }: FoodHistorySheetProps) {
  const [selected, setSelected] = useState(() => dayKeyAgo(0));
  const [showAll, setShowAll] = useState(false);
  const kcalTarget = mainTargets.find(t => t.key === 'kcal')?.amount ?? 0;

  const strip = Array.from({ length: STRIP_DAYS }, (_, i) => {
    const day = dayKeyAgo(STRIP_DAYS - 1 - i);
    const entries = days[day] ?? [];
    return { day, kcal: entries.length ? sumNutrients(entries).kcal : null };
  });
  const top = Math.max(kcalTarget * 1.25, ...strip.map(d => d.kcal ?? 0), 1);

  // Averages over the logged days among the last 7 (a day with nothing logged isn't a zero day).
  const lastWeek = Array.from({ length: 7 }, (_, i) => days[dayKeyAgo(i)] ?? []).filter(e => e.length > 0);
  const avg = lastWeek.length ? (() => {
    const totals = lastWeek.map(sumNutrients);
    const mean = (k: 'kcal' | 'protein' | 'fiber' | 'carbs' | 'fat') => totals.reduce((s, t) => s + t[k], 0) / totals.length;
    return { kcal: mean('kcal'), protein: mean('protein'), carbs: mean('carbs'), fat: mean('fat'), fiber: mean('fiber') };
  })() : null;
  const onTarget = lastWeek.filter(e => { const k = sumNutrients(e).kcal; return kcalTarget && k >= kcalTarget * 0.9 && k <= kcalTarget * 1.1; }).length;

  const entries = days[selected] ?? [];
  const totals = sumNutrients(entries);
  const loggedDays = Object.keys(days).length;

  return (
    <Sheet open={open} title="Food history" onClose={onClose}>
      <div className="kx-fh">
        <div className="kx-fh-strip" role="group" aria-label={`Calories, last ${STRIP_DAYS} days`}>
          {kcalTarget > 0 && <span className="kx-fh-target" style={{ ['--r' as string]: kcalTarget / top }} aria-hidden="true" />}
          {strip.map(d => {
            const over = d.kcal !== null && kcalTarget > 0 && d.kcal > kcalTarget * 1.1;
            return (
              <button key={d.day} type="button" onClick={() => setSelected(d.day)}
                className={`kx-fh-day${d.day === selected ? ' is-selected' : ''}${d.kcal === null ? ' is-empty' : ''}${over ? ' is-over' : ''}`}
                aria-pressed={d.day === selected}
                aria-label={`${dayTitle(d.day)}: ${d.kcal === null ? 'nothing logged' : `${fmtNumber(Math.round(d.kcal))} kcal`}`}>
                <span className="kx-fh-bar"><span style={{ height: `${d.kcal === null ? 0 : Math.max(4, (d.kcal / top) * 100)}%` }} /></span>
                <span className="kx-fh-letter">{fmtDate(dateOf(d.day), { weekday: 'narrow' })}</span>
              </button>
            );
          })}
        </div>
        <p className="kx-hs-note">
          {avg
            ? <>Last 7 days ({lastWeek.length} logged): about <strong>{fmtNumber(Math.round(avg.kcal))} kcal</strong>, {Math.round(avg.protein)} g protein, {Math.round(avg.carbs)} g carbs, {Math.round(avg.fat)} g fat and {Math.round(avg.fiber)} g fibre a day{kcalTarget ? ` · on target ${onTarget} of ${lastWeek.length} days` : ''}.</>
            : 'Nothing logged in the last 7 days yet. Foods you check are kept here day by day.'}
        </p>

        <div className="kx-fh-head">
          <h4>{dayTitle(selected)}</h4>
          <span>{entries.length ? `${entries.length} ${entries.length === 1 ? 'food' : 'foods'} · ${fmtNumber(Math.round(totals.kcal))} kcal` : 'Nothing logged'}</span>
        </div>

        {entries.length > 0 && (
          <>
            <NutritionMeters targets={showAll ? [...mainTargets, ...moreTargets] : mainTargets} totals={totals} entries={entries} />
            <button type="button" className="ob-link kx-fh-more" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}>
              {showAll ? 'Show less' : 'Show more'}
            </button>
            <ul className="kx-foodlog-list">
              {[...entries].reverse().map(e => (
                <li key={e.id}>
                  <button type="button" className="kx-foodlog-row" onClick={() => onOpenEntry(selected, e.id)}
                    aria-label={`${e.name}, ${portionText(e)}. Change, remove or log again`}>
                    <span className="kx-foodlog-name">
                      <strong>{foodTitle(e.name)}</strong>
                      <small>{fmtTime(new Date(e.at))} · {portionText(e)}{e.extras?.length ? ` · + ${extrasText(e)}` : ''}</small>
                      {e.note && <small className="kx-foodlog-note">{e.note}</small>}
                    </span>
                    <span className="kx-foodlog-kcal">{fmtNumber(Math.round(entryNutrients(e).kcal))}<small> kcal</small></span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="kx-hs-note">Kept on this phone for {HISTORY_DAYS} days{loggedDays ? ` · ${loggedDays} ${loggedDays === 1 ? 'day' : 'days'} logged so far` : ''}.</p>
      </div>
    </Sheet>
  );
}
