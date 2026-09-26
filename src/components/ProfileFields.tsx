// "About you" fields, shared by onboarding (split across screens in AboutYouFlow) and the Profile tab
// (a settings list where each row opens a sheet). One source for the options and ranges, so they can't drift.
import type { UserProfile } from '../App';
import { ChoiceCards, MeasureField, Segmented, SheetRow, type Choice } from './Pickers';
import { HeartIcon, SleepIcon, TrendDownIcon, TrendUpIcon } from './Icons';
import { REGIONS, regionById } from '../lib/regions';
import { localDayKey } from '../lib/dates';
import type { GoalSuggestion } from '../lib/bmi';

type Patch = (changes: Partial<UserProfile>) => void;

const SEX_OPTIONS: Choice<UserProfile['sex']>[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: null, label: 'Rather not say' },
];

const ACTIVITY_OPTIONS: Choice<UserProfile['activityLevel']>[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Little or no exercise' },
  { value: 'light', label: 'Light', hint: 'Exercise 1–3 days a week' },
  { value: 'moderate', label: 'Moderate', hint: 'Exercise 3–5 days a week' },
  { value: 'active', label: 'Active', hint: 'Exercise 6–7 days a week' },
  { value: 'very_active', label: 'Very active', hint: 'Hard training or a physical job' },
];

// 'Autonomic Recovery' is the stored value; people see "Recover better"
const GOAL_OPTIONS: Choice<UserProfile['target']>[] = [
  { value: 'Weight Loss', label: 'Lose weight', icon: <TrendDownIcon /> },
  { value: 'Weight Gain', label: 'Gain weight', icon: <TrendUpIcon /> },
  { value: 'Cardio Endurance', label: 'Build endurance', icon: <HeartIcon /> },
  { value: 'Autonomic Recovery', label: 'Recover better', icon: <SleepIcon /> },
];

const REGION_OPTIONS: Choice<string>[] = REGIONS.map(r => ({ value: r.id, label: r.name }));

const HEIGHT = { min: 120, max: 230, step: 1, labelEvery: 10, unit: 'cm' };
const WEIGHT = { min: 30, max: 250, step: 0.1, decimals: 1, labelEvery: 10, unit: 'kg' };
const AGE = { min: 13, max: 100, step: 1, labelEvery: 10, unit: 'years' };
const CYCLE = { min: 20, max: 45, step: 1, labelEvery: 5, unit: 'days' };

const labelOf = <T,>(options: Choice<T>[], value: T) => options.find(o => o.value === value)?.label ?? '';
const todayIso = () => localDayKey();

function NameInput({ profile, onChange, className }: { profile: UserProfile; onChange: Patch; className: string }) {
  return (
    <input
      type="text"
      className={className}
      value={profile.name}
      onChange={e => onChange({ name: e.target.value })}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      autoComplete="given-name"
      autoCapitalize="words"
      enterKeyHint="done"
      placeholder="What should we call you?"
      maxLength={40}
    />
  );
}

function PeriodDateInput({ profile, onChange, className }: { profile: UserProfile; onChange: Patch; className: string }) {
  return (
    <input
      type="date"
      className={className}
      value={profile.lastPeriodStartDate ?? ''}
      max={todayIso()}
      onChange={e => onChange({ lastPeriodStartDate: e.target.value || null })}
    />
  );
}

/** Onboarding screen 1: name + region */
export function NameRegionFields({ profile, onChange }: { profile: UserProfile; onChange: Patch }) {
  return (
    <div className="kx-form">
      <label className="kx-field">
        <span className="kx-field-label">Your name</span>
        <NameInput profile={profile} onChange={onChange} className="auth-input" />
      </label>
      <ChoiceCards label="Where are you based?" options={REGION_OPTIONS} value={profile.region ?? ''}
        onChange={region => onChange({ region })} columns={2} compact />
    </div>
  );
}

/** Onboarding screen 2: sex, age, height, weight (+ cycle for women) */
export function BodyFields({ profile, onChange }: { profile: UserProfile; onChange: Patch }) {
  return (
    <div className="kx-form">
      <Segmented label="Sex" options={SEX_OPTIONS} value={profile.sex} onChange={sex => onChange({ sex })} />
      {profile.sex === 'female' && (
        <>
          <label className="kx-field">
            <span className="kx-field-label">Last period started</span>
            <PeriodDateInput profile={profile} onChange={onChange} className="auth-input" />
          </label>
          <MeasureField label="Cycle length" value={profile.averageCycleLength} {...CYCLE} onChange={averageCycleLength => onChange({ averageCycleLength })} />
        </>
      )}
      <MeasureField label="Age" value={profile.age} {...AGE} onChange={age => onChange({ age })} />
      <MeasureField label="Height" value={profile.height} {...HEIGHT} onChange={height => onChange({ height })} />
      <MeasureField label="Weight" value={profile.weight} {...WEIGHT} onChange={weight => onChange({ weight })} />
    </div>
  );
}

/** Onboarding screen 3: activity + goal. With a BMI-based suggestion, that goal is marked and explained. */
export function GoalFields({ profile, onChange, suggestion }: { profile: UserProfile; onChange: Patch; suggestion?: GoalSuggestion | null }) {
  const goalOptions = suggestion
    ? GOAL_OPTIONS.map(o => (o.value === suggestion.goal ? { ...o, hint: 'Suggested for you' } : o))
    : GOAL_OPTIONS;
  return (
    <div className="kx-form">
      <ChoiceCards label="How active are you?" options={ACTIVITY_OPTIONS} value={profile.activityLevel} onChange={activityLevel => onChange({ activityLevel })} />
      <div className="kx-goal-field">
        <ChoiceCards label="Main goal" options={goalOptions} value={profile.target} onChange={target => onChange({ target })} columns={2} />
        {suggestion && (
          <p className="kx-note kx-goal-note">
            {suggestion.reason} BMI is only a rough guide — it can’t tell muscle from fat — so pick whichever goal suits you.
          </p>
        )}
      </div>
    </div>
  );
}

/** Profile tab "Your details": a settings list; each row opens a sheet. */
export function ProfileSettingsList({ profile, onChange }: { profile: UserProfile; onChange: Patch }) {
  // Choosing an option closes its sheet, after a beat so the selection is seen
  const pickThenClose = (apply: () => void, close: () => void) => { apply(); window.setTimeout(close, 180); };

  return (
    <div className="kx-rows">
      <label className="kx-row kx-row-input">
        <span className="kx-row-label">Name</span>
        <NameInput profile={profile} onChange={onChange} className="kx-row-field" />
      </label>

      <SheetRow label="Region" value={regionById(profile.region)?.name ?? 'Not set'} sheetTitle="Where are you based?">
        {close => (
          <ChoiceCards label="Region" hideLabel options={REGION_OPTIONS} value={profile.region ?? ''} columns={2} compact
            onChange={region => pickThenClose(() => onChange({ region }), close)} />
        )}
      </SheetRow>

      <SheetRow label="Sex" value={labelOf(SEX_OPTIONS, profile.sex)}>
        {close => (
          <ChoiceCards label="Sex" hideLabel options={SEX_OPTIONS.map(o => ({ ...o, value: o.value ?? 'none' }))}
            value={profile.sex ?? 'none'}
            onChange={v => pickThenClose(() => onChange({ sex: v === 'none' ? null : v as UserProfile['sex'] }), close)} />
        )}
      </SheetRow>

      {profile.sex === 'female' && (
        <>
          <label className="kx-row kx-row-input">
            <span className="kx-row-label">Last period started</span>
            <PeriodDateInput profile={profile} onChange={onChange} className="kx-row-field" />
          </label>
          <SheetRow label="Cycle length" value={`${profile.averageCycleLength} days`}>
            {() => <MeasureField label="Cycle length" value={profile.averageCycleLength} {...CYCLE} onChange={averageCycleLength => onChange({ averageCycleLength })} />}
          </SheetRow>
        </>
      )}

      <SheetRow label="Age" value={`${profile.age}`}>
        {() => <MeasureField label="Age" value={profile.age} {...AGE} onChange={age => onChange({ age })} />}
      </SheetRow>
      <SheetRow label="Height" value={`${profile.height} cm`}>
        {() => <MeasureField label="Height" value={profile.height} {...HEIGHT} onChange={height => onChange({ height })} />}
      </SheetRow>
      <SheetRow label="Weight" value={`${profile.weight.toFixed(1)} kg`}>
        {() => <MeasureField label="Weight" value={profile.weight} {...WEIGHT} onChange={weight => onChange({ weight })} />}
      </SheetRow>
      <SheetRow label="Activity" value={labelOf(ACTIVITY_OPTIONS, profile.activityLevel)} sheetTitle="How active are you?">
        {close => (
          <ChoiceCards label="How active are you?" hideLabel options={ACTIVITY_OPTIONS} value={profile.activityLevel}
            onChange={activityLevel => pickThenClose(() => onChange({ activityLevel }), close)} />
        )}
      </SheetRow>
      <SheetRow label="Goal" value={labelOf(GOAL_OPTIONS, profile.target)} sheetTitle="Main goal">
        {close => (
          <ChoiceCards label="Main goal" hideLabel options={GOAL_OPTIONS} value={profile.target} columns={2}
            onChange={target => pickThenClose(() => onChange({ target }), close)} />
        )}
      </SheetRow>
    </div>
  );
}
