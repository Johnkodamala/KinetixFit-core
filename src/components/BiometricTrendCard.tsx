import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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
  Optimal: '#059669',
  Critical: '#DC2626',
  Calibrating: '#D97706',
  Syncing: '#2563EB'
};

interface BiometricTrendCardProps {
  icon: string;
  title: string;
  status: string;
  behavior: string;
  latestReading: string;
  subMetrics: SubMetric[];
  trend: DailyPoint[];
  unit: string;
  color: string;
  chartType: 'bar' | 'line';
  /** Whether there's any basis at all to expect real data (e.g. a device has ever been connected). */
  isTrackable: boolean;
  disconnectedMessage: string;
  /** Shown instead of the chart when isTrackable but fewer than minPoints real values exist yet. */
  buildingMessage?: string;
  minPoints?: number;
  trendFootnote?: string;
  expanded: boolean;
  onToggle: () => void;
  rangeDays: 7 | 30;
  onRangeChange: (days: 7 | 30) => void;
}

export default function BiometricTrendCard({
  icon, title, status, behavior, latestReading, subMetrics, trend, unit, color, chartType,
  isTrackable, disconnectedMessage, buildingMessage, minPoints = 2, trendFootnote,
  expanded, onToggle, rangeDays, onRangeChange
}: BiometricTrendCardProps) {
  const visibleData = trend.slice(-rangeDays);
  const nonNullCount = visibleData.filter(d => d.value !== null).length;
  const showBuilding = isTrackable && nonNullCount < minPoints;

  return (
    <div className="btc-card">
      <button className="btc-header" onClick={onToggle} type="button">
        <div className="btc-header-left">
          <span className="btc-icon">{icon}</span>
          <div>
            <div className="btc-title">{title}</div>
            <div className="btc-reading">{latestReading}</div>
          </div>
        </div>
        <div className="btc-header-right">
          <span className="btc-status-pill" style={{ color: STATUS_COLORS[status] || '#6B7280', backgroundColor: `${STATUS_COLORS[status] || '#6B7280'}1A` }}>
            {status}
          </span>
          <span className="btc-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {!isTrackable ? (
        <p className="btc-empty">{disconnectedMessage}</p>
      ) : showBuilding ? (
        <p className="btc-empty">{buildingMessage || 'Building your trend — check back in a few days.'}</p>
      ) : (
        <div className="btc-chart-wrap" style={{ height: expanded ? 200 : 48 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={visibleData} margin={{ top: 4, right: expanded ? 8 : 0, left: expanded ? 0 : 0, bottom: 0 }}>
                {expanded && <CartesianGrid stroke="#E5E7EB" vertical={false} />}
                {expanded && <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />}
                {expanded && <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} width={36} />}
                {expanded && <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }} formatter={(v) => [`${v}${unit}`, title]} />}
                <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            ) : (
              <LineChart data={visibleData} margin={{ top: 4, right: expanded ? 8 : 0, left: expanded ? 0 : 0, bottom: 0 }}>
                {expanded && <CartesianGrid stroke="#E5E7EB" vertical={false} />}
                {expanded && <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />}
                {expanded && <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} width={36} domain={['auto', 'auto']} />}
                {expanded && <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }} formatter={(v) => [`${v}${unit}`, title]} />}
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={expanded} connectNulls isAnimationActive={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {expanded && (
        <>
          {isTrackable && !showBuilding && (
            <div className="btc-range-toggle">
              <button type="button" className={rangeDays === 7 ? 'btc-range-active' : ''} onClick={() => onRangeChange(7)}>7 days</button>
              <button type="button" className={rangeDays === 30 ? 'btc-range-active' : ''} onClick={() => onRangeChange(30)}>30 days</button>
            </div>
          )}

          {isTrackable && !showBuilding && (
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

          {isTrackable && !showBuilding && <p className="btc-behavior">{behavior}</p>}

          {isTrackable && !showBuilding && subMetrics.length > 0 && (
            <div className="btc-submetrics">
              {subMetrics.map((sm, idx) => (
                <div key={idx} className="btc-submetric">
                  <span>{sm.label}</span>
                  <strong style={{ color: sm.color === '#00ff88' ? '#059669' : sm.color === '#ff3b30' ? '#DC2626' : sm.color === '#00bfff' ? '#2563EB' : sm.color === '#6b7280' ? '#9CA3AF' : sm.color }}>
                    {sm.value}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <style>{`
        .btc-card {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif;
          background-color: #FFFFFF;
          border: 1px solid #E5E7EB;
          border-radius: 12px;
          padding: 14px 16px;
          box-sizing: border-box;
          color: #1A1D1F;
        }
        .btc-header {
          all: unset;
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          box-sizing: border-box;
          cursor: pointer;
        }
        .btc-header-left { display: flex; align-items: center; gap: 10px; }
        .btc-icon { font-size: 20px; }
        .btc-title { font-size: 15px; font-weight: 600; color: #1A1D1F; }
        .btc-reading { font-size: 13px; color: #6B7280; margin-top: 1px; }
        .btc-header-right { display: flex; align-items: center; gap: 8px; }
        .btc-status-pill { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 10px; }
        .btc-chevron { font-size: 11px; color: #9CA3AF; }
        .btc-empty { font-size: 13px; color: #6B7280; margin: 10px 0 0 0; line-height: 1.5; }
        .btc-chart-wrap { margin-top: 8px; }
        .btc-range-toggle { display: flex; gap: 6px; margin-top: 10px; }
        .btc-range-toggle button {
          font-family: inherit; font-size: 12px; font-weight: 600; color: #6B7280;
          background: #F3F4F6; border: 1px solid #E5E7EB; border-radius: 6px;
          padding: 4px 10px; cursor: pointer;
        }
        .btc-range-toggle button.btc-range-active { background: #2563EB; border-color: #2563EB; color: #FFFFFF; }
        .btc-daily-list { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; max-height: 160px; overflow-y: auto; }
        .btc-daily-row { display: flex; justify-content: space-between; font-size: 13px; color: #374151; padding: 3px 0; border-bottom: 1px solid #F3F4F6; }
        .btc-footnote { font-size: 12px; color: #9CA3AF; margin: 10px 0 0 0; line-height: 1.5; }
        .btc-behavior { font-size: 13px; color: #6B7280; margin: 10px 0 0 0; }
        .btc-submetrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
        .btc-submetric { display: flex; flex-direction: column; gap: 2px; background: #F9FAFB; border: 1px solid #F3F4F6; border-radius: 8px; padding: 8px 10px; }
        .btc-submetric span { font-size: 11px; color: #9CA3AF; }
        .btc-submetric strong { font-size: 14px; }
      `}</style>
    </div>
  );
}
