// Needed vs eaten, one row per nutrient: "62 of 140 g · 78 g to go" with a bar. Used on Nourish (today) and in
// Food history (any day). Nutrients that labels often leave out say how many of the day's foods gave a value.
import { fmtNumber } from '../lib/countries';
import { knownCount, CORE_NUTRIENTS, type LogEntry, type Nutrients } from '../lib/foodLog';
import { statusOf, statusText, valueOf, type NutrientTarget } from '../lib/nutrition';

interface NutritionMetersProps {
  targets: NutrientTarget[];
  totals: Nutrients;
  /** the day's entries, for "from N of M foods" */
  entries: LogEntry[];
}

export default function NutritionMeters({ targets, totals, entries }: NutritionMetersProps) {
  return (
    <ul className="kx-meters">
      {targets.map(t => {
        const eaten = valueOf(totals, t.key);
        const fmt = (n: number) => `${fmtNumber(Number(n.toFixed(t.decimals)), t.decimals)}${t.unit === 'kcal' ? ' kcal' : ` ${t.unit}`}`;
        const status = statusOf(t, eaten);
        const known = CORE_NUTRIENTS.includes(t.key) ? entries.length : knownCount(entries, t.key);
        const partial = entries.length > 0 && known < entries.length;
        // none of the day's foods gave this one: say so rather than show a made-up 0
        if (entries.length > 0 && known === 0) {
          return (
            <li key={t.key} className="kx-meter is-unknown">
              <div className="kx-meter-top">
                <span className="kx-meter-label">{t.label}</span>
                <span className="kx-meter-value">{t.amount ? <>— of {fmt(t.amount)}</> : '—'}</span>
              </div>
              <div className="kx-meter-foot"><span>Not listed for {entries.length === 1 ? 'this food' : 'these foods'}</span></div>
            </li>
          );
        }
        const fill = t.amount ? Math.min(1, eaten / t.amount) : 0;
        return (
          <li key={t.key} className={`kx-meter is-${status}`}>
            <div className="kx-meter-top">
              <span className="kx-meter-label">{t.label}</span>
              <span className="kx-meter-value">
                <strong>{fmtNumber(Number(eaten.toFixed(t.decimals)), t.decimals)}</strong>
                {t.amount ? <> of {fmt(t.amount)}</> : <> {t.unit}</>}
              </span>
            </div>
            {t.amount ? (
              <div className="kx-meter-track" role="meter" aria-label={t.label} aria-valuemin={0} aria-valuemax={t.amount}
                aria-valuenow={Math.round(eaten)} aria-valuetext={`${fmt(eaten)} of ${fmt(t.amount)}`}>
                <span style={{ ['--fill' as string]: fill }} />
              </div>
            ) : null}
            <div className="kx-meter-foot">
              <span>{statusText(t, eaten, fmt)}{t.kind === 'limit' ? ' · limit' : ''}</span>
              {partial && <span>from {known} of {entries.length} foods</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
