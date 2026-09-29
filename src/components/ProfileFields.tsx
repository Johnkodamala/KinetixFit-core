// "About you" fields, shared by onboarding (split across screens in AboutYouFlow) and the Profile tab
// (a settings list where each row opens a sheet). One source for the options and ranges, so they can't drift.
import type { UserProfile } from '../App';
import { ChoiceCards, MeasureField, Segmented, SheetRow, type Choice } from './Pickers';
import { HeartIcon, SleepIcon, TrendDownIcon, TrendUpIcon } from './Icons';
import { REGIONS, regionById } from '../lib/regions';
import { COUNTRIES, countryOf, detectCountry, type CountryCode } from '../lib/countries';
import { useEffect } from 'react';
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

const COUNTRY_OPTIONS: Choice<string>[] = COUNTRIES.map(c => ({ value: c.code, label: `${c.flag}  ${c.name}` }));
const REGION_OPTIONS: Choice<string>[] = REGIONS.map(r => ({ value: r.id, label: r.name }));

const HEIGHT = { min: 120, max: 230, step: 1, labelEvery: 10, unit: 'cm' };
const WEIGHT = { min: 30, max: 250, step: 0.1, decimals: 1, labelEvery: 10, unit: 'kg' };
const AGE = { min: 13, max: 100, step: 1, labelEvery: 10, unit: 'years' };
const CYCLE = { min: 20, max: 45, step: 1, labelEvery: 5, unit: 'days' };

const labelOf = <T,>(options: Choice<T>[], value: T) => options.find(o => o.value === value)?.label ?? '';

// US: height in feet and inches, weight in pounds. The profile always stores cm and kg.
const CM_PER_IN = 2.54;
const LB_PER_KG = 2.20462;
const feetInches = (inches: number) => `${Math.floor(inches / 12)} ft ${inches % 12} in`;
const heightText = (p: UserProfile) =>
  countryOf(p).units === 'us' ? feetInches(Math.round(p.height / CM_PER_IN)) : `${p.height} cm`;
const weightText = (p: UserProfile) =>
  countryOf(p).units === 'us' ? `${Math.round(p.weight * LB_PER_KG)} lb` : `${p.weight.toFixed(1)} kg`;

function HeightField({ profile, onChange }: { profile: UserProfile; onChange: Patch }) {
  if (countryOf(profile).units !== 'us') {
    return <MeasureField label="Height" value={profile.height} {...HEIGHT} onChange={height => onChange({ height })} />;
  }
  const inches = Math.round(profile.height / CM_PER_IN);
  return (
    <MeasureField label="Height" value={inches} min={48} max={90} step={1} labelEvery={12} unit="in" caption={feetInches(inches)}
      onChange={v => onChange({ height: Math.round(v * CM_PER_IN * 10) / 10 })} />
  );
}

function WeightField({ profile, onChange }: { profile: UserProfile; onChange: Patch }) {
  if (countryOf(profile).units !== 'us') {
    return <MeasureField label="Weight" value={profile.weight} {...WEIGHT} onChange={weight => onChange({ weight })} />;
  }
  return (
    <MeasureField label="Weight" value={Math.round(profile.weight * LB_PER_KG)} min={66} max={550} step={1} labelEvery={10} unit="lb"
      onChange={v => onChange({ weight: Math.round((v / LB_PER_KG) * 10) / 10 })} />
  );
}

/** Country, then (UK only) the region, which picks the "Did you know?" fact. */
function CountryChoice({ profile, onChange }: { profile: UserProfile; onChange: Patch }) {
  return (
    <>
      <ChoiceCards label="Where are you based?" options={COUNTRY_OPTIONS} value={profile.country ?? ''}
        onChange={code => onChange({ country: code as CountryCode, region: code === 'GB' ? profile.region : null })} columns={2} compact />
      {profile.country === 'GB' && (
        <ChoiceCards label="Which part of the UK? (optional)" options={REGION_OPTIONS} value={profile.region ?? ''}
          onChange={region => onChange({ region })} columns={2} compact />
      )}
    </>
  );
}
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

/** Onboarding screen 1: name + country (the phone's own region is preselected when it's one we support) */
export function NameRegionFields({ profile, onChange }: { profile: UserProfile; onChange: Patch }) {
  useEffect(() => {
    if (profile.country) return;
    const detected = detectCountry() ?? (profile.region && profile.region !== 'outside_uk' ? 'GB' : null);
    if (detected) onChange({ country: detected });
    // only on first show
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="kx-form">
      <label className="kx-field">
        <span className="kx-field-label">Your name</span>
        <NameInput profile={profile} onChange={onChange} className="auth-input" />
      </label>
      <CountryChoice profile={profile} onChange={onChange} />
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
      <HeightField profile={profile} onChange={onChange} />
      <WeightField profile={profile} onChange={onChange} />
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

      <SheetRow label="Country" value={countryOf(profile).name} sheetTitle="Where are you based?">
        {close => (
          <ChoiceCards label="Country" hideLabel options={COUNTRY_OPTIONS} value={countryOf(profile).code} columns={2} compact
            onChange={code => pickThenClose(() => onChange({ country: code as CountryCode, region: code === 'GB' ? profile.region : null }), close)} />
        )}
      </SheetRow>
      {countryOf(profile).code === 'GB' && (
        <SheetRow label="Region" value={regionById(profile.region)?.name ?? 'Not set'} sheetTitle="Which part of the UK?">
          {close => (
            <ChoiceCards label="Region" hideLabel options={REGION_OPTIONS} value={profile.region ?? ''} columns={2} compact
              onChange={region => pickThenClose(() => onChange({ region }), close)} />
          )}
        </SheetRow>
      )}

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
      <SheetRow label="Height" value={heightText(profile)}>
        {() => <HeightField profile={profile} onChange={onChange} />}
      </SheetRow>
      <SheetRow label="Weight" value={weightText(profile)}>
        {() => <WeightField profile={profile} onChange={onChange} />}
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
