// Account → Widgets: every home-screen widget with a live preview (today's real numbers), free and Plus. Anyone can
// look at the Plus ones — Check-in, Quick log, My stats — and try their settings; only Plus members can save them
// (on the home screen they show a locked card without Plus). Android can ask the launcher to add a widget
// (pinWidget); on iPhone the page says how. The previews are drawn here in HTML/SVG to match the native widgets
// (android/.../res/layout/widget_*.xml, ios/App/KinetixFitWidgets/WidgetViews.swift) — keep them roughly in step.
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Sheet, Segmented, ChoiceCards } from './Pickers';
import { CameraIcon, BarcodeIcon, FlameIcon, StepsIcon, TargetIcon, LockIcon, DumbbellIcon, TrophyIcon } from './Icons';
import { fmtNumber } from '../lib/countries';
import { waterAmount } from '../lib/water';
import { WORKOUT_TYPES, MINUTE_PRESETS, formatMinutes } from '../lib/workouts';
import { ENERGY_LABELS } from '../lib/checkins';
import type { Streak } from '../lib/streak';
import * as feedback from '../lib/feedback';
import {
  WIDGETS, STAT_OPTIONS, THEMES, HAPTIC_OPTIONS, QUICK_WATER_ML, MIN_STATS, MAX_STATS, MAX_QUICK, pinWidget, installedWidgets,
  quickActionLabel, type WidgetInfo, type WidgetKind, type WidgetPrefs, type StatId, type QuickAction, type WidgetTheme,
} from '../lib/widgets';

export interface WidgetData {
  waterMl: number;
  waterGoalMl: number;
  glassMl: number;
  /** ml per day, oldest first, today last */
  waterWeek: number[];
  steps: number | null;
  stepsGoal: number;
  kcalLeft: number | null;
  kcalEaten: number;
  kcalTarget: number;
  protein: number;
  proteinTarget: number;
  questsDone: number;
  questsTotal: number;
  points: number;
  workoutsWeek: number;
  streak: Streak;
  /** today's check-in energy (1–5), if checked in */
  energy: number | null;
  /** "Next 14:00", or '' */
  nextReminder: string;
}

type Size = 'small' | 'medium';
const MEDIUM_ONLY: WidgetKind[] = ['today', 'scan'];

// --- Small drawing pieces ------------------------------------------------------------------------------------------

function Ring({ value, size = 100, stroke = 10, className = '', children }: { value: number; size?: number; stroke?: number; className?: string; children?: ReactNode }) {
  const id = useId();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className={`kx-wp-ring ${className}`}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--wp-from)' }} />
            <stop offset="1" style={{ stopColor: 'var(--wp-to)' }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="kx-wp-track-stroke" />
        {v > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={`url(#${id})`} strokeLinecap="round"
            strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </svg>
      {children && <span className="kx-wp-ring-inner">{children}</span>}
    </span>
  );
}

function Bar({ value }: { value: number }) {
  return <span className="kx-wp-bar"><span style={{ '--v': Math.max(0, Math.min(1, value)) } as CSSProperties} /></span>;
}

function Head({ icon, label, right }: { icon: ReactNode; label: string; right?: ReactNode }) {
  return (
    <span className="kx-wp-head">
      <span className="kx-wp-chip">{icon}</span>
      <span className="kx-wp-label">{label}</span>
      {right && <span className="kx-wp-right">{right}</span>}
    </span>
  );
}

const Drop = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M12 3.2c3.4 4.2 6 7.6 6 10.8a6 6 0 0 1-12 0c0-3.2 2.6-6.6 6-10.8Z" /></svg>
);
const Plus = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
);
const Tick = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

/** "750 ml" / "1.25 L": the number big, the unit small. */
function Amount({ ml }: { ml: number }) {
  const [n, unit] = waterAmount(ml).split(' ');
  return <span className="kx-wp-num">{n}<small>{unit}</small></span>;
}

function Bottle({ fill }: { fill: number }) {
  const id = useId();
  const top = 78 - Math.max(0, Math.min(1, fill)) * 64;
  return (
    <svg className="kx-wp-bottle" viewBox="0 0 40 80" aria-hidden="true">
      <defs>
        <clipPath id={`${id}c`}><rect x="5" y="14" width="30" height="64" rx="9" /></clipPath>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--wp-water-bright)' }} />
          <stop offset="1" style={{ stopColor: 'var(--wp-water-deep)' }} />
        </linearGradient>
      </defs>
      <rect x="14" y="2" width="12" height="7" rx="2" className="kx-wp-bottle-cap" />
      <path d="M15 9h10v5H15z" className="kx-wp-bottle-neck" />
      <rect x="5" y="14" width="30" height="64" rx="9" className="kx-wp-bottle-glass" />
      <g clipPath={`url(#${id}c)`}>
        <path d={`M0 ${top} Q10 ${top - 3} 20 ${top} T40 ${top} V80 H0Z`} fill={`url(#${id}g)`} />
      </g>
      <rect x="5" y="14" width="30" height="64" rx="9" fill="none" className="kx-wp-bottle-edge" />
    </svg>
  );
}

/** Water glass: a clear tumbler filling up (WidgetArt.waterGlass / WaterGlassArt drawn simply). */
const TUMBLER = 'M7,8 L12.5,70 A17.5,3.5 0 0,0 47.5,70 L53,8 A23,4.6 0 0,0 7,8 Z';
function Tumbler({ fill }: { fill: number }) {
  const id = useId();
  const f = fill <= 0 ? 0 : Math.max(0.07, Math.min(1, fill));
  // inside the glass: from the rim (y 8) to the top of its thick base (y 62.8), 1.8 in from the walls
  const level = 62.8 - (62.8 - 13.5) * f;
  const lr = 23 - 5.5 * ((level - 8) / 62) - 1.8;
  return (
    <svg className="kx-wp-tumbler" viewBox="0 0 60 78" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--wp-water-bright)' }} />
          <stop offset="1" style={{ stopColor: 'var(--wp-water-deep)' }} />
        </linearGradient>
        <clipPath id={`${id}c`}><path d="M8.8,8 L13.7,62.8 A16.3,3.27 0 0,0 46.3,62.8 L51.2,8 A21.2,4.24 0 0,0 8.8,8 Z" /></clipPath>
      </defs>
      {f > 0 && <ellipse cx="36" cy="72" rx="15" ry="3" className="kx-wp-tumbler-caustic" />}
      <path d={TUMBLER} className="kx-wp-tumbler-glass" />
      {f > 0 && (
        <g clipPath={`url(#${id}c)`}>
          <rect x="0" y={level} width="60" height={78 - level} fill={`url(#${id}w)`} />
          <ellipse cx="30" cy={level} rx={lr} ry={lr * 0.2} className="kx-wp-tumbler-top" />
        </g>
      )}
      <path d="M13.8,15 L16.6,58" className="kx-wp-tumbler-shine" />
      <path d={TUMBLER} className="kx-wp-tumbler-edge" />
      <ellipse cx="30" cy="8" rx="23" ry="4.6" className="kx-wp-tumbler-rim" />
    </svg>
  );
}

// --- One widget ----------------------------------------------------------------------------------------------------

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

function statValue(id: StatId, d: WidgetData): { value: string; unit?: string; label: string; progress: number | null } {
  switch (id) {
    case 'steps': return { value: d.steps === null ? '—' : fmtNumber(d.steps), label: 'steps', progress: d.steps === null ? null : d.steps / d.stepsGoal };
    case 'water': { const [n, u] = waterAmount(d.waterMl).split(' '); return { value: n, unit: u, label: 'water', progress: d.waterMl / d.waterGoalMl }; }
    case 'kcalLeft': return { value: d.kcalLeft === null ? '—' : fmtNumber(Math.max(0, d.kcalLeft)), label: 'kcal left', progress: d.kcalTarget ? d.kcalEaten / d.kcalTarget : null };
    case 'protein': return { value: fmtNumber(d.protein), unit: 'g', label: 'protein', progress: d.proteinTarget ? d.protein / d.proteinTarget : null };
    case 'streak': return { value: String(d.streak.current), label: 'day streak', progress: null };
    case 'points': return { value: fmtNumber(d.points), label: 'points', progress: null };
    case 'quests': return { value: `${d.questsDone}/${d.questsTotal}`, label: 'quests', progress: d.questsTotal ? d.questsDone / d.questsTotal : 0 };
    case 'workouts': return { value: String(d.workoutsWeek), label: 'workouts', progress: null };
  }
}

function quickIcon(a: QuickAction) {
  return a.kind === 'water' ? <Drop /> : /Run|Walk|Hike/.test(a.type) ? <StepsIcon size={14} /> : <DumbbellIcon size={14} />;
}

export function WidgetPreview({ kind, size, data, prefs, locked = false }: {
  kind: WidgetKind; size: Size; data: WidgetData; prefs: WidgetPrefs; locked?: boolean;
}) {
  const info = WIDGETS.find(w => w.kind === kind)!;
  const theme: WidgetTheme | null = kind === 'stats' ? prefs.stats.theme : kind === 'quick' ? prefs.quick.theme : kind === 'checkin' ? prefs.checkin.theme : null;
  const water = clamp01(data.waterMl / data.waterGoalMl);
  const s = data.streak;
  let body: ReactNode;

  switch (kind) {
    case 'checkin': {
      const done = s.today && data.energy !== null;
      body = (
        <>
          <Head icon={<TargetIcon size={12} />} label="CHECK-IN" right={<span className="kx-wp-streak-chip"><FlameIcon size={11} />{s.current}</span>} />
          {done ? (
            <span className="kx-wp-done">
              <span className="kx-wp-done-tick"><Tick /></span>
              <span><strong>Checked in</strong><small>Energy {data.energy}/5 · {s.current}-day streak</small></span>
            </span>
          ) : (
            <span className="kx-wp-ask">
              <span className="kx-wp-q">How’s your energy?</span>
              <span className="kx-wp-pips">
                {ENERGY_LABELS.map((label, i) => (
                  <span key={label} className="kx-wp-pip" style={{ '--e': i + 1 } as CSSProperties}>
                    <i />{size === 'medium' && <small>{label === 'Full of energy' ? 'Full' : label}</small>}
                  </span>
                ))}
              </span>
            </span>
          )}
        </>
      );
      break;
    }
    case 'quick': {
      const actions = prefs.quick.actions;
      body = (
        <>
          <Head icon={<Plus />} label="QUICK LOG" right={size === 'medium' ? <span className="kx-wp-mini">{waterAmount(data.waterMl)}</span> : undefined} />
          <span className={`kx-wp-buttons n${actions.length}`}>
            {actions.map((a, i) => (
              <span key={i} className="kx-wp-btn">
                <span className="kx-wp-btn-icon">{quickIcon(a)}</span>
                <span className="kx-wp-btn-label">{a.kind === 'water' ? waterAmount(a.ml) : `${a.type} ${a.minutes}`}</span>
              </span>
            ))}
          </span>
        </>
      );
      break;
    }
    case 'stats': {
      const metrics = prefs.stats.metrics;
      body = (
        <>
          <Head icon={<TrophyIcon size={12} />} label="MY STATS" />
          <span className={`kx-wp-stats n${metrics.length}`}>
            {metrics.map(id => {
              const v = statValue(id, data);
              return (
                <span key={id} className="kx-wp-stat">
                  <span className="kx-wp-num">{v.value}{v.unit && <small>{v.unit}</small>}</span>
                  <span className="kx-wp-sub">{v.label}</span>
                  {v.progress !== null && <Bar value={v.progress} />}
                </span>
              );
            })}
          </span>
        </>
      );
      break;
    }
    case 'streak':
      body = (
        <>
          <Head icon={<FlameIcon size={12} />} label="STREAK" right={s.today ? <span className="kx-wp-mini is-good">Done today</span> : undefined} />
          <span className="kx-wp-streak-body">
            <span className="kx-wp-streak-num">
              <span className="kx-wp-num">{s.current}</span>
              <span className="kx-wp-sub">day streak</span>
            </span>
            <span className="kx-wp-dots">
              {s.week.map(d => <span key={d.day} className={`kx-wp-dot${d.done ? ' is-done' : ''}`}><i />{d.letter}</span>)}
            </span>
          </span>
          {size === 'medium' && <span className="kx-wp-foot">{s.today ? `Best ${s.best} days` : 'Check in today to keep it going'}</span>}
        </>
      );
      break;
    case 'today':
      body = (
        <>
          <Head icon={<StepsIcon size={12} />} label="TODAY" right={<span className="kx-wp-mini"><Drop /> {waterAmount(data.waterMl)}</span>} />
          <span className="kx-wp-cols">
            <span className="kx-wp-col is-steps"><span className="kx-wp-num">{data.steps === null ? '—' : fmtNumber(data.steps)}</span><span className="kx-wp-sub">steps</span><Bar value={(data.steps ?? 0) / data.stepsGoal} /></span>
            <span className="kx-wp-col is-food"><span className="kx-wp-num">{data.kcalLeft === null ? '—' : fmtNumber(Math.max(0, data.kcalLeft))}</span><span className="kx-wp-sub">kcal left</span><Bar value={data.kcalTarget ? data.kcalEaten / data.kcalTarget : 0} /></span>
            <span className="kx-wp-col is-quest"><span className="kx-wp-num">{data.questsDone}/{data.questsTotal}</span><span className="kx-wp-sub">quests</span><Bar value={data.questsTotal ? data.questsDone / data.questsTotal : 0} /></span>
          </span>
        </>
      );
      break;
    case 'rings':
      body = (
        <>
          <Head icon={<TargetIcon size={12} />} label="DAILY RINGS" />
          <span className="kx-wp-rings-row">
            <span className="kx-wp-rings">
              {/* nested: each inner ring is drawn smaller (CSS insets), so its stroke is thicker to look the same */}
              <Ring value={(data.steps ?? 0) / data.stepsGoal} className="is-steps" stroke={10} />
              <Ring value={water} className="is-water" stroke={14} />
              <Ring value={data.kcalTarget ? data.kcalEaten / data.kcalTarget : 0} className="is-food" stroke={22} />
            </span>
            {size === 'medium' && (
              <span className="kx-wp-legend">
                <span className="is-steps"><i />{data.steps === null ? '—' : fmtNumber(data.steps)} steps</span>
                <span className="is-water"><i />{waterAmount(data.waterMl)}</span>
                <span className="is-food"><i />{fmtNumber(data.kcalEaten)} kcal</span>
              </span>
            )}
          </span>
        </>
      );
      break;
    case 'steps':
      body = (
        <>
          <Head icon={<StepsIcon size={12} />} label="STEPS" right={<span className="kx-wp-mini">{data.steps === null ? '' : `${Math.min(100, Math.round((data.steps / data.stepsGoal) * 100))}%`}</span>} />
          <span className="kx-wp-rings-row">
            <Ring value={(data.steps ?? 0) / data.stepsGoal} className="is-steps is-solo" stroke={10}>
              {size === 'small' && <span className="kx-wp-num">{data.steps === null ? '—' : fmtNumber(data.steps)}</span>}
            </Ring>
            {size === 'medium' && (
              <span className="kx-wp-side"><span className="kx-wp-num">{data.steps === null ? '—' : fmtNumber(data.steps)}</span><span className="kx-wp-sub">of {fmtNumber(data.stepsGoal)} steps</span></span>
            )}
          </span>
        </>
      );
      break;
    case 'hydration':
      body = (
        <>
          <Head icon={<Drop />} label="WATER" />
          <span className="kx-wp-bottle-row">
            <Bottle fill={water} />
            <span className="kx-wp-side">
              <Amount ml={data.waterMl} />
              <span className="kx-wp-sub">of {waterAmount(data.waterGoalMl)}</span>
              {size === 'medium' && data.nextReminder && <span className="kx-wp-sub">{data.nextReminder}</span>}
            </span>
          </span>
          <span className="kx-wp-water-btn"><Plus /> Add {waterAmount(data.glassMl)}</span>
        </>
      );
      break;
    case 'waterLevel':
      body = (
        <>
          <span className="kx-wp-level" style={{ '--v': water } as CSSProperties} aria-hidden="true"><svg viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0 5 Q12.5 0 25 5 T50 5 T75 5 T100 5 V10 H0Z" /></svg></span>
          <Head icon={<Drop />} label="WATER" />
          <span className="kx-wp-level-text"><Amount ml={data.waterMl} /><span className="kx-wp-sub">{Math.round(water * 100)}% of {waterAmount(data.waterGoalMl)}</span></span>
          <span className="kx-wp-round-btn"><Plus /></span>
        </>
      );
      break;
    case 'waterRing':
      body = (
        <>
          <Head icon={<Drop />} label="WATER" />
          <span className="kx-wp-rings-row">
            <Ring value={water} className="is-water is-solo" stroke={10}>{size === 'small' && <Amount ml={data.waterMl} />}</Ring>
            {size === 'medium' && <span className="kx-wp-side"><Amount ml={data.waterMl} /><span className="kx-wp-sub">of {waterAmount(data.waterGoalMl)}</span></span>}
          </span>
          <span className="kx-wp-round-btn"><Plus /></span>
        </>
      );
      break;
    case 'waterQuick':
      body = (
        <>
          <Head icon={<Drop />} label="WATER" right={<span className="kx-wp-mini">{Math.round(water * 100)}%</span>} />
          <span className="kx-wp-side is-row"><Amount ml={data.waterMl} /><span className="kx-wp-sub">of {waterAmount(data.waterGoalMl)}</span></span>
          <Bar value={water} />
          <span className="kx-wp-buttons n2">
            <span className="kx-wp-btn is-water"><span className="kx-wp-btn-icon"><Drop /></span><span className="kx-wp-btn-label">{waterAmount(data.glassMl)}</span></span>
            <span className="kx-wp-btn is-water"><span className="kx-wp-btn-icon"><Drop /></span><span className="kx-wp-btn-label">{waterAmount(data.glassMl >= 500 ? 1000 : 500)}</span></span>
          </span>
        </>
      );
      break;
    case 'waterWeek': {
      const max = Math.max(data.waterGoalMl, ...data.waterWeek);
      body = (
        <>
          <Head icon={<Drop />} label="THIS WEEK" right={<span className="kx-wp-mini">{waterAmount(data.waterMl)}</span>} />
          <span className="kx-wp-week" style={{ '--goal': data.waterGoalMl / max } as CSSProperties}>
            {data.waterWeek.map((ml, i) => (
              <span key={i} className={`kx-wp-week-bar${i === 6 ? ' is-today' : ''}${ml >= data.waterGoalMl ? ' is-goal' : ''}`}>
                <span style={{ '--v': ml / max } as CSSProperties} />
              </span>
            ))}
          </span>
        </>
      );
      break;
    }
    case 'scan':
      body = (
        <>
          <Head icon={<CameraIcon size={12} />} label="QUICK SCAN" />
          <span className="kx-wp-buttons n2 is-scan">
            <span className="kx-wp-btn is-accent"><span className="kx-wp-btn-icon"><CameraIcon size={16} /></span><span className="kx-wp-btn-label">Snap food</span></span>
            <span className="kx-wp-btn"><span className="kx-wp-btn-icon"><BarcodeIcon size={16} /></span><span className="kx-wp-btn-label">Scan barcode</span></span>
          </span>
        </>
      );
      break;
    case 'glass': {
      const glasses = Math.ceil(Math.max(0, data.waterGoalMl - data.waterMl) / Math.max(50, data.glassMl));
      body = (
        <>
          <Head icon={<Drop />} label="WATER" right={<span className="kx-wp-mini">{Math.round(water * 100)}%</span>} />
          <span className="kx-wp-bottle-row">
            <Tumbler fill={water} />
            <span className="kx-wp-side">
              <Amount ml={data.waterMl} />
              <span className="kx-wp-sub">
                of {waterAmount(data.waterGoalMl)}
                {size === 'medium' && ` · ${glasses === 0 ? 'Goal reached' : `${glasses} ${glasses === 1 ? 'glass' : 'glasses'} to go`}`}
              </span>
              {data.nextReminder && <span className="kx-wp-sub">{data.nextReminder}</span>}
            </span>
          </span>
          <span className="kx-wp-round-btn"><Plus /></span>
        </>
      );
      break;
    }
  }

  return (
    <div
      className={`kx-wp kx-wp-${size} kx-wpk-${kind}${theme ? ` kx-wp-theme-${theme}` : ''}${locked ? ' is-locked' : ''}`}
      role="img"
      aria-label={`${info.name} widget${locked ? ', Kinetix Fit Plus' : ''}`}
    >
      <span className="kx-wp-body">{body}</span>
      {locked && <span className="kx-wp-lock"><LockIcon size={11} /> Plus</span>}
    </div>
  );
}

// --- The gallery ---------------------------------------------------------------------------------------------------

interface GalleryProps {
  data: WidgetData;
  prefs: WidgetPrefs;
  isPlus: boolean;
  onPrefsChange: (prefs: WidgetPrefs) => void;
  onUnlock: () => void;
  notify: (tone: 'success' | 'error' | 'warn' | 'info', text: string) => void;
}

export default function WidgetGallery({ data, prefs, isPlus, onPrefsChange, onUnlock, notify }: GalleryProps) {
  const [sizes, setSizes] = useState<Partial<Record<WidgetKind, Size>>>({});
  const [installed, setInstalled] = useState<WidgetKind[]>([]);
  const [editing, setEditing] = useState<WidgetKind | null>(null);
  const [howTo, setHowTo] = useState<WidgetInfo | null>(null);
  const platform = Capacitor.getPlatform();

  useEffect(() => {
    let alive = true;
    const refresh = () => installedWidgets().then(k => { if (alive) setInstalled(k); });
    refresh();
    // after the launcher's "Add" dialog, the page is shown again: look again
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; document.removeEventListener('visibilitychange', refresh); };
  }, []);

  const add = async (w: WidgetInfo) => {
    feedback.tap();
    const r = await pinWidget(w.kind);
    if (r.requested) notify('info', `Confirm on the screen that pops up to add ${w.name} to your home screen.`);
    else setHowTo(w);
  };

  const item = (w: WidgetInfo) => {
    const locked = w.plus && !isPlus;
    const canSmall = !MEDIUM_ONLY.includes(w.kind);
    const size: Size = canSmall ? sizes[w.kind] ?? 'medium' : 'medium';
    return (
      <article key={w.kind} className={`hub-support-card kx-wg-item${w.plus ? ' is-plus' : ''}`}>
        <div className="kx-wg-stage">
          <WidgetPreview kind={w.kind} size={size} data={data} prefs={prefs} locked={locked} />
        </div>
        <div className="kx-wg-info">
          <div className="kx-wg-title">
            <h3>{w.name}</h3>
            {w.plus && <span className="kx-plus-pill">Plus</span>}
            {installed.includes(w.kind) && <span className="kx-wg-on">On your home screen</span>}
          </div>
          <p className="kx-wg-desc">{w.description}</p>
          <div className="kx-wg-meta">
            {canSmall ? (
              <span className="kx-wg-sizes" role="radiogroup" aria-label="Preview size">
                {(['small', 'medium'] as Size[]).map(sz => (
                  <button key={sz} type="button" role="radio" aria-checked={size === sz} className={size === sz ? 'is-on' : undefined}
                    onClick={() => { feedback.selection(); setSizes(p => ({ ...p, [w.kind]: sz })); }}>
                    {sz === 'small' ? 'Small' : 'Medium'}
                  </button>
                ))}
              </span>
            ) : <span className="kx-wg-size-note">Medium</span>}
            {w.haptic && platform !== 'ios' && <span className="kx-wg-tag">Haptic</span>}
            {w.editable && <span className="kx-wg-tag">Customisable</span>}
          </div>
          <div className="kx-wg-actions">
            {locked ? (
              <button type="button" className="primary-btn" onClick={onUnlock}><LockIcon size={14} /> Unlock with Plus</button>
            ) : Capacitor.isNativePlatform() ? (
              <button type="button" className="primary-btn" onClick={() => add(w)}>{installed.includes(w.kind) ? 'Add another' : 'Add to home screen'}</button>
            ) : null}
            {w.editable && (
              <button type="button" className="edit-bio-btn" onClick={() => setEditing(w.kind)}>{locked ? 'Try the settings' : 'Customise'}</button>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="kx-wg">
      <p className="card-header-desc kx-wg-intro">
        {Capacitor.isNativePlatform()
          ? 'Your numbers on the home screen, without opening the app. The Plus widgets can be changed to suit you — anyone can look.'
          : 'Home-screen widgets come with the Kinetix Fit app for Android and iPhone. Anyone can look at the Plus ones.'}
      </p>
      <h3 className="kx-section-label">Plus widgets</h3>
      {WIDGETS.filter(w => w.plus).map(item)}
      <h3 className="kx-section-label">Free widgets</h3>
      {WIDGETS.filter(w => !w.plus).map(item)}

      <WidgetEditor kind={editing} data={data} prefs={prefs} isPlus={isPlus} onSave={p => { onPrefsChange(p); setEditing(null); notify('success', 'Widget updated — it changes on your home screen in a moment.'); }}
        onUnlock={() => { setEditing(null); onUnlock(); }} onClose={() => setEditing(null)} />

      <Sheet open={howTo !== null} title={`Add ${howTo?.name ?? 'a widget'}`} onClose={() => setHowTo(null)}>
        <ol className="kx-steps">
          {platform === 'ios' ? (
            <>
              <li>Go to your Home Screen and <strong>touch and hold</strong> an empty spot until the apps jiggle.</li>
              <li>Tap <strong>Edit</strong> at the top left, then <strong>Add Widget</strong>.</li>
              <li>Search for <strong>Kinetix Fit</strong>, swipe to <strong>{howTo?.name}</strong>, pick a size and tap <strong>Add Widget</strong>.</li>
            </>
          ) : (
            <>
              <li>Go to your home screen and <strong>touch and hold</strong> an empty spot.</li>
              <li>Tap <strong>Widgets</strong>, then find <strong>Kinetix Fit</strong>.</li>
              <li>Touch and hold <strong>{howTo?.name}</strong> and drag it where you want it.</li>
            </>
          )}
        </ol>
        {howTo?.plus && <p className="kx-hs-note">Change its settings any time here in Account → Widgets.</p>}
      </Sheet>
    </div>
  );
}

// --- Customise a Plus widget -----------------------------------------------------------------------------------

function WidgetEditor({ kind, data, prefs, isPlus, onSave, onUnlock, onClose }: {
  kind: WidgetKind | null; data: WidgetData; prefs: WidgetPrefs; isPlus: boolean;
  onSave: (p: WidgetPrefs) => void; onUnlock: () => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(prefs);
  const [openedFor, setOpenedFor] = useState<WidgetKind | null>(null);
  const [adding, setAdding] = useState<'water' | 'workout' | null>(null);
  const [workoutType, setWorkoutType] = useState(WORKOUT_TYPES[0]);
  const [workoutMinutes, setWorkoutMinutes] = useState(30);
  // start from the saved settings each time it opens
  if (kind !== openedFor) {
    setOpenedFor(kind);
    if (kind) { setDraft(prefs); setAdding(null); }
  }
  const info = kind ? WIDGETS.find(w => w.kind === kind)! : null;

  const themePicker = (value: WidgetTheme, set: (t: WidgetTheme) => void) => (
    <div className="kx-wg-field">
      <span className="kx-field-label">Colour</span>
      <div className="kx-wg-swatches" role="radiogroup" aria-label="Colour">
        {THEMES.map(t => (
          <button key={t.id} type="button" role="radio" aria-checked={value === t.id} aria-label={t.label}
            className={`kx-wg-swatch kx-wp-theme-${t.id}${value === t.id ? ' is-on' : ''}`} onClick={() => { feedback.tap(); set(t.id); }}>
            <i /><span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
  const hapticPicker = (value: WidgetPrefs['quick']['haptic'], set: (h: WidgetPrefs['quick']['haptic']) => void) => (
    <>
      <Segmented label="Haptic on tap" value={value} onChange={set} options={HAPTIC_OPTIONS.map(h => ({ value: h.id, label: h.label }))} />
      {Capacitor.getPlatform() === 'ios' && <p className="kx-hs-note">iPhone widgets can’t vibrate, so this only applies on Android.</p>}
    </>
  );

  let fields: ReactNode = null;
  if (kind === 'stats') {
    const chosen = draft.stats.metrics;
    fields = (
      <>
        <div className="kx-wg-field">
          <span className="kx-field-label">Show {MIN_STATS}–{MAX_STATS} numbers</span>
          <div className="kx-chip-wrap">
            {STAT_OPTIONS.map(o => {
              const on = chosen.includes(o.id);
              const disabled = !on && chosen.length >= MAX_STATS;
              return (
                <button key={o.id} type="button" className={`kx-chip${on ? ' kx-chip-on' : ''}`} aria-pressed={on} disabled={disabled}
                  onClick={() => {
                    if (on && chosen.length <= MIN_STATS) return;
                    feedback.tap();
                    setDraft(d => ({ ...d, stats: { ...d.stats, metrics: on ? chosen.filter(m => m !== o.id) : [...chosen, o.id] } }));
                  }}>
                  {o.label}
                </button>
              );
            })}
          </div>
          <p className="kx-hs-note">In the order you pick them. {chosen.length <= MIN_STATS ? `Keep at least ${MIN_STATS}.` : ''}</p>
        </div>
        {themePicker(draft.stats.theme, t => setDraft(d => ({ ...d, stats: { ...d.stats, theme: t } })))}
      </>
    );
  } else if (kind === 'quick') {
    const actions = draft.quick.actions;
    const setActions = (next: QuickAction[]) => setDraft(d => ({ ...d, quick: { ...d.quick, actions: next } }));
    fields = (
      <>
        <div className="kx-wg-field">
          <span className="kx-field-label">Buttons ({actions.length} of {MAX_QUICK})</span>
          <ul className="kx-wg-actions-list">
            {actions.map((a, i) => (
              <li key={i}>
                <span className="kx-wg-action-icon">{quickIcon(a)}</span>
                <span className="kx-wg-action-label">{quickActionLabel(a)}</span>
                <button type="button" className="kx-hs-remove" disabled={actions.length <= 1}
                  onClick={() => setActions(actions.filter((_, j) => j !== i))} aria-label={`Remove ${quickActionLabel(a)}`}>Remove</button>
              </li>
            ))}
          </ul>
          {actions.length < MAX_QUICK && !adding && (
            <div className="kx-wg-add-row">
              <button type="button" className="edit-bio-btn" onClick={() => setAdding('water')}>+ Water</button>
              <button type="button" className="edit-bio-btn" onClick={() => setAdding('workout')}>+ Workout</button>
            </div>
          )}
          {adding === 'water' && (
            <div className="kx-wg-adding">
              <span className="kx-field-label">How much?</span>
              <div className="kx-chip-wrap">
                {QUICK_WATER_ML.map(ml => (
                  <button key={ml} type="button" className="kx-chip" onClick={() => { feedback.tap(); setActions([...actions, { kind: 'water', ml }]); setAdding(null); }}>
                    {waterAmount(ml)}
                  </button>
                ))}
              </div>
              <button type="button" className="ob-link" onClick={() => setAdding(null)}>Cancel</button>
            </div>
          )}
          {adding === 'workout' && (
            <div className="kx-wg-adding">
              <ChoiceCards label="Workout" columns={4} compact options={WORKOUT_TYPES.map(t => ({ value: t, label: t }))} value={workoutType} onChange={setWorkoutType} />
              <ChoiceCards label="How long?" columns={4} compact options={MINUTE_PRESETS.map(m => ({ value: m, label: formatMinutes(m) }))} value={workoutMinutes} onChange={setWorkoutMinutes} />
              <div className="kx-wg-add-row">
                <button type="button" className="primary-btn" onClick={() => { setActions([...actions, { kind: 'workout', type: workoutType, minutes: workoutMinutes }]); setAdding(null); }}>
                  Add “{workoutType} {workoutMinutes} min”
                </button>
                <button type="button" className="ob-link" onClick={() => setAdding(null)}>Cancel</button>
              </div>
            </div>
          )}
          <p className="kx-hs-note">Workouts logged from the widget are for your own record, like ones you add in the app.</p>
        </div>
        {themePicker(draft.quick.theme, t => setDraft(d => ({ ...d, quick: { ...d.quick, theme: t } })))}
        {hapticPicker(draft.quick.haptic, h => setDraft(d => ({ ...d, quick: { ...d.quick, haptic: h } })))}
      </>
    );
  } else if (kind === 'checkin') {
    fields = (
      <>
        <p className="kx-hs-note">Tap how your energy is on the widget and you’re checked in: it keeps your streak and earns the day’s check-in points. The sleep question waits for the app.</p>
        {themePicker(draft.checkin.theme, t => setDraft(d => ({ ...d, checkin: { ...d.checkin, theme: t } })))}
        {hapticPicker(draft.checkin.haptic, h => setDraft(d => ({ ...d, checkin: { ...d.checkin, haptic: h } })))}
      </>
    );
  }

  return (
    <Sheet open={kind !== null} title={info ? `Customise ${info.name}` : 'Customise'} onClose={onClose}>
      {kind && (
        <div className="kx-wg-editor">
          <div className="kx-wg-stage is-editor">
            <WidgetPreview kind={kind} size="small" data={data} prefs={draft} />
            <WidgetPreview kind={kind} size="medium" data={data} prefs={draft} />
          </div>
          {fields}
          {isPlus ? (
            <button type="button" className="primary-btn" onClick={() => onSave(draft)}>Save</button>
          ) : (
            <>
              <button type="button" className="primary-btn" onClick={onUnlock}><LockIcon size={14} /> Unlock with Plus to use it</button>
              <p className="kx-hs-note">Plus widgets are for Kinetix Fit Plus members — you can try the settings here first.</p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

