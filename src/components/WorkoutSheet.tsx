// Workouts added by hand (src/lib/workouts.ts): the sheet that adds one or changes / deletes one, and the list of
// every workout (Today → Workouts → See all). What, how long (a preset or any number of minutes), which day and an
// optional note. They're the person's own record: only workouts a watch or phone records count for quests.
import { useState, type ReactNode } from 'react';
import { ChoiceCards, MeasureField, Segmented, Sheet } from './Pickers';
import { ChevronIcon } from './Icons';
import { localDayKey, localDayKeyDaysAgo } from '../lib/dates';
import { fmtDate, fmtNumber } from '../lib/countries';
import {
  WORKOUT_TYPES, MORE_WORKOUT_TYPES, MINUTE_PRESETS, MIN_WORKOUT_ENTRY, MAX_WORKOUT_ENTRY, MAX_TYPE_LENGTH, MAX_NOTE_LENGTH,
  cleanType, formatMinutes, workoutProblem, type ManualWorkout, type WorkoutDraft, type DetectedWorkout,
} from '../lib/workouts';

const OTHER = '__other';
const CUSTOM = -1;
type When = 'today' | 'yesterday' | 'earlier';

interface WorkoutSheetProps {
  open: boolean;
  /** the workout being changed; null adds a new one */
  editing: ManualWorkout | null;
  onSave: (draft: WorkoutDraft) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** Remount it (a new `key`) each time it opens, so it starts from `editing` or a blank workout. */
export default function WorkoutSheet({ open, editing, onSave, onDelete, onClose }: WorkoutSheetProps) {
  const today = localDayKey();
  const yesterday = localDayKeyDaysAgo(1);
  const known = [...WORKOUT_TYPES, ...MORE_WORKOUT_TYPES];
  const startType = editing?.type ?? WORKOUT_TYPES[0];
  const [type, setType] = useState(known.includes(startType) ? startType : OTHER);
  const [otherName, setOtherName] = useState(known.includes(startType) ? '' : startType);
  const [showMore, setShowMore] = useState(MORE_WORKOUT_TYPES.includes(startType));
  const [minutes, setMinutes] = useState(editing?.minutes ?? 30);
  const [custom, setCustom] = useState(editing ? !MINUTE_PRESETS.includes(editing.minutes) : false);
  const [day, setDay] = useState(editing?.day ?? today);
  const [when, setWhen] = useState<When>(!editing || editing.day === today ? 'today' : editing.day === yesterday ? 'yesterday' : 'earlier');
  const [note, setNote] = useState(editing?.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const shownTypes = showMore ? known : WORKOUT_TYPES;
  // a type from "Show more" stays visible after Show less
  const typeOptions = [...shownTypes, ...(type !== OTHER && !shownTypes.includes(type) ? [type] : []), OTHER]
    .map(t => ({ value: t, label: t === OTHER ? 'Other…' : t }));
  const name = type === OTHER ? cleanType(otherName) : type;
  const draft: WorkoutDraft = { type: name, minutes, day, note };
  const problem = workoutProblem(draft, today);

  const chooseWhen = (w: When) => {
    setWhen(w);
    if (w === 'today') setDay(today);
    else if (w === 'yesterday') setDay(yesterday);
    else if (day >= yesterday) setDay(localDayKeyDaysAgo(2));
  };

  return (
    <Sheet open={open} title={editing ? 'Change workout' : 'Add a workout'} onClose={onClose}>
      <div className="kx-add-workout">
        <div className="kx-aw-types">
          <ChoiceCards label="What did you do?" columns={4} compact options={typeOptions} value={type} onChange={setType} />
          <button type="button" className="kx-show-more" aria-expanded={showMore} onClick={() => setShowMore(v => !v)}>
            {showMore ? 'Show less' : `Show more · ${MORE_WORKOUT_TYPES.length} activities`}
          </button>
        </div>
        {type === OTHER && (
          <label className="kx-fe-note">
            <span className="kx-field-label">What was it?</span>
            <input
              type="text"
              className="auth-input"
              maxLength={MAX_TYPE_LENGTH}
              placeholder="e.g. Paddleboarding"
              value={otherName}
              onChange={e => setOtherName(e.target.value)}
              autoCapitalize="words"
              autoComplete="off"
              enterKeyHint="done"
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          </label>
        )}

        <ChoiceCards label="How long?" columns={4} compact
          options={[...MINUTE_PRESETS.map(m => ({ value: m, label: formatMinutes(m) })), { value: CUSTOM, label: 'Custom' }]}
          value={custom ? CUSTOM : minutes}
          onChange={v => { if (v === CUSTOM) setCustom(true); else { setCustom(false); setMinutes(v); } }} />
        {custom && (
          <MeasureField label="Minutes" value={minutes} unit="min" min={MIN_WORKOUT_ENTRY} max={MAX_WORKOUT_ENTRY} labelEvery={15}
            caption={minutes >= 60 ? formatMinutes(minutes) : undefined} onChange={setMinutes} />
        )}

        <Segmented label="When?" value={when} onChange={chooseWhen}
          options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'earlier', label: 'Earlier' }]} />
        {when === 'earlier' && (
          <label className="kx-fe-note">
            <span className="kx-field-label">Day</span>
            <input type="date" className="auth-input kx-aw-date" value={day} max={yesterday} min={localDayKeyDaysAgo(365)}
              onChange={e => { if (e.target.value) setDay(e.target.value); }} />
          </label>
        )}

        <label className="kx-fe-note">
          <span className="kx-field-label">Note <span className="kx-gut-optional">Optional</span></span>
          <input
            type="text"
            className="auth-input"
            maxLength={MAX_NOTE_LENGTH}
            placeholder="e.g. 5 km, easy pace, leg day"
            value={note}
            onChange={e => setNote(e.target.value)}
            autoCapitalize="sentences"
            autoComplete="off"
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        </label>

        <p className="kx-hs-note">Workouts you add are for your own record. Only ones your watch or phone records count for quests and points.</p>
        {problem && name && <p className="kx-field-hint" role="alert">{problem}</p>}
        <button type="button" className="primary-btn" disabled={!!problem} onClick={() => onSave(draft)}>
          {editing ? 'Save changes' : `Add ${name ? name.toLowerCase() : 'workout'} · ${formatMinutes(minutes)}`}
        </button>
        {editing && (confirmDelete ? (
          <div className="kx-aw-confirm" role="group" aria-label="Delete this workout?">
            <span>Delete this workout?</span>
            <button type="button" className="kx-fe-remove" onClick={() => onDelete(editing.id)}>Delete</button>
            <button type="button" className="ob-link" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </div>
        ) : (
          <button type="button" className="kx-fe-remove" onClick={() => setConfirmDelete(true)}>Delete workout</button>
        ))}
      </div>
    </Sheet>
  );
}

interface HistoryProps {
  open: boolean;
  manual: ManualWorkout[];
  /** recorded by a watch or phone (last 30 days) — shown, not editable */
  detected: DetectedWorkout[];
  icon: (label: string) => ReactNode;
  detectedMeta: (w: DetectedWorkout) => string;
  onEdit: (w: ManualWorkout) => void;
  onAdd: () => void;
  onClose: () => void;
}

/** Every workout, newest day first: recorded ones (read-only) and hand-added ones (tap to change). */
export function WorkoutHistorySheet({ open, manual, detected, icon, detectedMeta, onEdit, onAdd, onClose }: HistoryProps) {
  const [shown, setShown] = useState(30);
  const byDay = new Map<string, { manual: ManualWorkout[]; detected: DetectedWorkout[] }>();
  const bucket = (day: string) => {
    if (!byDay.has(day)) byDay.set(day, { manual: [], detected: [] });
    return byDay.get(day)!;
  };
  for (const w of detected) bucket(localDayKey(new Date(w.start))).detected.push(w);
  for (const w of manual) bucket(w.day).manual.push(w);
  const days = [...byDay.keys()].sort().reverse();
  const visible = days.slice(0, shown);
  const today = localDayKey();
  const yesterday = localDayKeyDaysAgo(1);
  const dayTitle = (day: string) => day === today ? 'Today' : day === yesterday ? 'Yesterday'
    : fmtDate(new Date(`${day}T12:00:00`), { weekday: 'short', day: 'numeric', month: 'short' });
  const totalMinutes = manualMinutesThisWeek(manual) + detected
    .filter(w => localDayKey(new Date(w.start)) >= localDayKeyDaysAgo(6)).reduce((t, w) => t + w.minutes, 0);

  return (
    <Sheet open={open} title="Your workouts" onClose={onClose}>
      <div className="kx-add-workout">
        <p className="kx-hs-note">
          {fmtNumber(totalMinutes)} min in the last 7 days. Tap one you added to change or delete it.
        </p>
        {visible.length === 0 ? (
          <div className="kx-empty"><p>No workouts yet.</p></div>
        ) : visible.map(day => {
          const d = byDay.get(day)!;
          return (
            <section key={day} className="kx-wh-day">
              <h4 className="kx-workouts-earlier">{dayTitle(day)}</h4>
              <ul className="kx-workout-list">
                {d.detected.map(w => (
                  <li key={w.id} className="kx-workout-row">
                    <span className="kx-workout-icon">{icon(w.label)}</span>
                    <span><span className="kx-workout-name">{w.label}</span><span className="kx-workout-meta">{detectedMeta(w)}</span></span>
                    <span className="kx-workout-tag">Counted</span>
                  </li>
                ))}
                {d.manual.map(w => (
                  <li key={w.id}>
                    <button type="button" className="kx-workout-row is-manual is-button" onClick={() => onEdit(w)}>
                      <span className="kx-workout-icon">{icon(w.type)}</span>
                      <span>
                        <span className="kx-workout-name">{w.type}</span>
                        <span className="kx-workout-meta">{[formatMinutes(w.minutes), w.note].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="kx-workout-tag">Added by you</span>
                      <ChevronIcon className="kx-workout-chevron" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {days.length > shown && (
          <button type="button" className="kx-show-more" onClick={() => setShown(n => n + 30)}>Show more days</button>
        )}
        <button type="button" className="secondary-btn" onClick={onAdd}>Add a workout</button>
      </div>
    </Sheet>
  );
}

function manualMinutesThisWeek(list: ManualWorkout[]): number {
  const since = localDayKeyDaysAgo(6);
  return list.filter(w => w.day >= since).reduce((t, w) => t + w.minutes, 0);
}
