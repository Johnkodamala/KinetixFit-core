import type { ReactNode } from 'react';
import { BarChart, Bar, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronIcon } from './Icons';

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  label: string; // short display label, e.g. "Mon" or "12 Sep"
  value: number | null;
}

interface SubMetric {
  label: string;
  value: string;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  Optimal: 'var(--good)',
  Critical: 'var(--danger)',
  Calibrating: 'var(--warn)',
  Syncing: 'var(--info)'
};
// What the pill says: the stored statuses are internal words ("Calibrating" meant "no reading yet")
const STATUS_LABELS: Record<string, string> = {
  Optimal: 'Synced',
  Critical: 'High',
  Calibrating: 'Waiting',
  Syncing: 'Syncing'
};

interface BiometricTrendCardProps {
  icon: ReactNode;
  title: string;
  status: string;
  behavior: string;
  latestReading: string;
  subMetrics: SubMetric[];
  trend: DailyPoint[];
  unit: string;
  /** A CSS colour — normally one of the --m-* metric tokens. */
  color: string;
  chartType: 'bar' | 'line';
  /** Whether there's any basis at all to expect real data (e.g. a device has ever been connected). */
  isTrackable: boolean;
  /** Shown under a card with no data source. Omit when the screen already has one Connect prompt. */
  disconnectedMessage?: string;
  /** Shown instead of the chart when isTrackable but fewer than minPoints real values exist yet. */
  buildingMessage?: string;
  minPoints?: number;
  trendFootnote?: string;
  expanded: boolean;
  onToggle: () => void;
  rangeDays: 7 | 30;
  onRangeChange: (days: 7 | 30) => void;
}

// Renders every real point as a small dot except the most recent real value ("today"), which
// gets a larger, filled dot so the current reading stands out from its own history at a glance.
// Recharts' own custom-dot prop type doesn't line up cleanly with a plain function component
// (a known library quirk — see recharts/recharts#3799-style issues), so props are untyped here.
function makeTodayDot(color: string, lastRealIndex: number) {
  return function TodayDot(props: { cx?: number; cy?: number; index?: number; payload?: DailyPoint }) {
    const { cx, cy, index, payload } = props;
    if (cx === undefined || cy === undefined || payload?.value === null || payload?.value === undefined) return <></>;
    const isToday = index === lastRealIndex;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={isToday ? 5 : 2.5}
        style={{ fill: isToday ? color : 'var(--surface)', stroke: color }}
        strokeWidth={isToday ? 0 : 1.5}
      />
    );
  };
}

const AXIS_TICK = { fontSize: 11, fill: 'var(--ink-3)' };
const TOOLTIP_STYLE = {
  fontSize: 12, borderRadius: 10, border: '1px solid var(--line)',
  background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'var(--shadow-md)'
};

export default function BiometricTrendCard({
  icon, title, status, behavior, latestReading, subMetrics, trend, unit, color, chartType,
  isTrackable, disconnectedMessage, buildingMessage, minPoints = 2, trendFootnote,
  expanded, onToggle, rangeDays, onRangeChange
}: BiometricTrendCardProps) {
  const visibleData = trend.slice(-rangeDays);
  const nonNullCount = visibleData.filter(d => d.value !== null).length;
  const showBuilding = isTrackable && nonNullCount < minPoints;
  const gradientId = `btc-grad-${title.replace(/[^a-zA-Z0-9]/g, '')}`;
  let lastRealIndex = -1;
  visibleData.forEach((d, i) => { if (d.value !== null) lastRealIndex = i; });
  const realPointCount = visibleData.filter(d => d.value !== null).length;
  const statusColor = STATUS_COLORS[status] || 'var(--ink-3)';
  const hasChart = isTrackable && !showBuilding;

  return (
    <div className={`btc-card ${expanded ? 'btc-open' : ''}`} style={{ ['--metric' as string]: color }}>
      <button className="btc-header" onClick={isTrackable ? onToggle : undefined} type="button" aria-expanded={isTrackable ? expanded : undefined} disabled={!isTrackable}>
        <span className="btc-icon">{icon}</span>
        <span className="btc-heading">
          <span className="btc-title">{title}</span>
          <span className="btc-reading">{latestReading}</span>
        </span>
        {isTrackable ? <span className="btc-status-pill" style={{ ['--status' as string]: statusColor }}>{STATUS_LABELS[status] ?? status}</span> : <span />}
        {isTrackable ? <span className="btc-chevron"><ChevronIcon /></span> : <span />}
      </button>

      {!isTrackable ? (
        disconnectedMessage ? <p className="btc-empty">{disconnectedMessage}</p> : null
      ) : showBuilding ? (
        <p className="btc-empty">{buildingMessage || 'Building your trend — check back in a few days.'}</p>
      ) : (
        <div className="btc-chart-wrap" style={{ height: expanded ? 200 : 52 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={visibleData} margin={{ top: 4, right: expanded ? 8 : 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: color, stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.7 }} />
                  </linearGradient>
                </defs>
                {expanded && <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />}
                {expanded && <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />}
                {expanded && <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={36} />}
                {expanded && <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}${unit}`, title]} />}
                <Bar dataKey="value" fill={`url(#${gradientId})`} radius={[5, 5, 2, 2]} animationDuration={700} animationEasing="ease-out" maxBarSize={28}>
                  {visibleData.map((d, i) => (
                    <Cell key={d.date} fillOpacity={d.value === null ? 0 : i === lastRealIndex ? 1 : 0.4} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <AreaChart data={visibleData} margin={{ top: 6, right: expanded ? 8 : 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.3 }} />
                    <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
                {expanded && <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />}
                {expanded && <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />}
                {expanded && <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={36} domain={['auto', 'auto']} />}
                {expanded && <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}${unit}`, title]} />}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2.5}
                  fill={`url(#${gradientId})`}
                  connectNulls
                  animationDuration={800}
                  animationEasing="ease-out"
                  // one day of data draws no line, so show that day as a dot instead of an empty chart
                  dot={expanded || realPointCount === 1 ? makeTodayDot(color, lastRealIndex) : false}
                  activeDot={expanded ? { r: 5, fill: color, stroke: 'var(--surface)', strokeWidth: 2 } : false}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {expanded && (
        <div className="btc-details">
          {hasChart && (
            <div className="btc-range-toggle" role="group" aria-label="Trend range">
              <button type="button" className={rangeDays === 7 ? 'btc-range-active' : ''} onClick={() => onRangeChange(7)}>7 days</button>
              <button type="button" className={rangeDays === 30 ? 'btc-range-active' : ''} onClick={() => onRangeChange(30)}>30 days</button>
            </div>
          )}

          {hasChart && (
            <div className="btc-daily-list">
              {visibleData.map(d => (
                <div key={d.date} className="btc-daily-row">
                  <span>{d.label}</span>
                  <span>{d.value !== null ? `${d.value}${unit}` : '—'}</span>
                </div>
              ))}
            </div>
          )}

          {trendFootnote && <p className="btc-footnote">{trendFootnote}</p>}

          {hasChart && <p className="btc-behavior">{behavior}</p>}

          {hasChart && subMetrics.length > 0 && (
            <div className="btc-submetrics">
              {subMetrics.map((sm, idx) => (
                <div key={idx} className="btc-submetric">
                  <span>{sm.label}</span>
                  <strong style={{ color: sm.color }}>{sm.value}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .btc-card {
          position: relative;
          /* liquid glass, like the other cards (src/styles/glass.css) */
          background: linear-gradient(180deg, var(--glass-sheen), transparent 38%), var(--glass-fill);
          border: 1px solid var(--glass-border);
          border-radius: var(--r-md);
          padding: 14px 16px 14px 18px;
          box-sizing: border-box;
          color: var(--ink);
          box-shadow: var(--glass-shadow), inset 0 1px 0 var(--glass-highlight), 0 0 0 0.5px var(--glass-edge);
          overflow: hidden;
          transition: box-shadow var(--dur) var(--ease-out), transform var(--dur) var(--ease-out), border-color var(--dur);
        }
        /* The metric's "lane": a coloured rail down the left edge that thickens when open */
        .btc-card::before {
          content: '';
          position: absolute; left: 6px; top: 14px; bottom: 14px;
          width: 3px;
          border-radius: 3px;
          background: var(--metric);
          transition: width var(--dur) var(--ease-out);
        }
        .btc-card.btc-open { box-shadow: var(--shadow-md), inset 0 1px 0 var(--glass-highlight), 0 0 0 0.5px var(--glass-edge); border-color: color-mix(in srgb, var(--metric) 35%, var(--glass-border)); }
        .btc-card.btc-open::before { width: 6px; }
        .btc-header {
          all: unset;
          display: grid;
          grid-template-columns: auto 1fr auto auto;
          align-items: center;
          column-gap: 12px;
          width: 100%;
          box-sizing: border-box;
          cursor: pointer;
          border-radius: var(--r-sm);
        }
        .btc-header:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
        .btc-header:active .btc-icon { transform: scale(0.92); }
        .btc-icon {
          width: 38px; height: 38px; border-radius: 12px;
          display: grid; place-items: center;
          color: var(--metric);
          background: color-mix(in srgb, var(--metric) 13%, transparent);
          transition: transform var(--dur-fast) var(--ease-out);
        }
        .btc-heading { display: flex; flex-direction: column; min-width: 0; }
        .btc-title { font-size: 15px; font-weight: 650; color: var(--ink); }
        .btc-reading { font-size: 13px; color: var(--ink-3); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .btc-status-pill {
          font-size: 11px; font-weight: 650; padding: 3px 9px; border-radius: var(--r-pill);
          color: var(--status);
          background: color-mix(in srgb, var(--status) 12%, transparent);
        }
        .btc-chevron { color: var(--ink-4); display: grid; transition: transform var(--dur) var(--ease-out); }
        .btc-open .btc-chevron { transform: rotate(180deg); }
        .btc-empty { font-size: 13px; color: var(--ink-3); margin: 10px 0 0 50px; line-height: 1.5; }
        .btc-chart-wrap { margin-top: 10px; transition: height var(--dur) var(--ease-out); }
        .btc-details { animation: kx-rise var(--dur) var(--ease-out) both; }
        .btc-range-toggle {
          display: inline-flex; gap: 2px; margin-top: 12px; padding: 3px;
          background: var(--surface-2); border-radius: var(--r-pill);
        }
        .btc-range-toggle button {
          font-size: 12px; font-weight: 650; color: var(--ink-3);
          background: transparent; border: none; border-radius: var(--r-pill);
          padding: 5px 12px; cursor: pointer;
          transition: background var(--dur-fast), color var(--dur-fast);
        }
        .btc-range-toggle button.btc-range-active { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-sm); }
        .btc-daily-list { display: flex; flex-direction: column; margin-top: 10px; max-height: 164px; overflow-y: auto; }
        .btc-daily-row {
          display: flex; justify-content: space-between; font-size: 13px; color: var(--ink-2);
          padding: 6px 0; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums;
        }
        .btc-daily-row:last-child { border-bottom: none; }
        .btc-footnote { font-size: 12px; color: var(--ink-3); margin: 10px 0 0 0; line-height: 1.5; }
        .btc-behavior { font-size: 13px; color: var(--ink-2); margin: 10px 0 0 0; line-height: 1.5; }
        .btc-submetrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
        .btc-submetric {
          display: flex; flex-direction: column; gap: 2px;
          background: var(--surface-2); border-radius: var(--r-sm); padding: 9px 11px;
        }
        .btc-submetric span { font-size: 11px; color: var(--ink-3); }
        .btc-submetric strong { font-size: 14px; font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}
