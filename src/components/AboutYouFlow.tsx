// Onboarding "About you", split into short screens with a moment after each answer, so setup feels
// like getting to know the app rather than filling in a form:
//   0 You        name + region
//   1 moment     hello + a true fact about their region + a motivational line
//   2 Body       sex, age, height, weight (rulers with haptic ticks and sounds)
//   3 moment     their own numbers brought to life (calories at rest, 10,000-step distance, heartbeats)
//   4 Goal       activity + main goal
//   5 Plan       "building your plan" → daily targets + what weeks 1, 4 and 12 look like for their goal
// Then App.tsx moves on to allergies (onboarding step 6). Styles: src/styles/about-you.css.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { UserProfile } from '../App';
import TrackLanes from './TrackLanes';
import { BodyFields, GoalFields, NameRegionFields } from './ProfileFields';
import { ChevronIcon, PinIcon, SoundIcon } from './Icons';
import { MOTIVATION_LINES, regionById } from '../lib/regions';
import * as feedback from '../lib/feedback';
import { suggestGoal } from '../lib/bmi';

interface Targets { calories: number; protein: number; fiber: number; }

interface Props {
  profile: UserProfile;
  onChange: (changes: Partial<UserProfile>) => void;
  /** resting calories (Mifflin–St Jeor), from App.tsx */
  bmr: number;
  /** daily targets for the current answers, from App.tsx */
  targets: Targets;
  onBack: () => void;
  onDone: () => void;
}

type Stage = 0 | 1 | 2 | 3 | 4 | 5;
// which of the four progress lanes each stage fills, and how far
const LANE_FILL: Record<Stage, [number, number]> = { 0: [0, 0.5], 1: [0, 1], 2: [1, 0.5], 3: [1, 1], 4: [2, 1], 5: [3, 1] };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');

/** Counts up to a number, like a stopwatch settling (instant under reduced motion) */
function CountUp({ value, duration = 1100, format = fmt }: { value: number; duration?: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf = 0;
    if (reducedMotion()) { raf = requestAnimationFrame(() => setShown(value)); return () => cancelAnimationFrame(raf); }
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      setShown(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

// What the app does for each goal over the first weeks — only things KinetixFit actually offers.
function planFor(goal: UserProfile['target'], t: Targets): { week: string; title: string; body: string }[] {
  switch (goal) {
    case 'Weight Loss':
      return [
        { week: 'Week 1', title: 'Know your numbers', body: `Every meal you check counts towards a ${fmt(t.calories)} kcal day — no guesswork.` },
        { week: 'Week 4', title: 'Habits that stick', body: 'Daily quests and step points make moving the easy choice.' },
        { week: 'Week 12', title: 'Steady, lasting progress', body: 'The NHS suggests aiming for 0.5 to 1 kg a week. We’ll keep you on that steady path.' },
      ];
    case 'Weight Gain':
      return [
        { week: 'Week 1', title: 'Fuel properly', body: `${fmt(t.calories)} kcal and ${t.protein} g of protein a day, with meal ideas that fit.` },
        { week: 'Week 4', title: 'Strength builds', body: 'Log your workouts and hit your protein — that’s what muscle grows on.' },
        { week: 'Week 12', title: 'A stronger you', body: 'Your trends show the work adding up, week after week.' },
      ];
    case 'Cardio Endurance':
      return [
        { week: 'Week 1', title: 'Your baseline', body: 'Your steps and resting heart rate, read straight from your phone or watch.' },
        { week: 'Week 4', title: 'A fitter heart', body: 'Trend graphs show your resting heart rate as your training builds.' },
        { week: 'Week 12', title: 'Go further', body: 'Longer runs, rides and swims logged — with the points to show for it.' },
      ];
    case 'Autonomic Recovery':
    default:
      return [
        { week: 'Week 1', title: 'Your rest baseline', body: 'Sleep and heart-rate variability, read from your device each day.' },
        { week: 'Week 4', title: 'Know when to push', body: 'Your stress estimate tells you when to train hard and when to rest.' },
        { week: 'Week 12', title: 'Balanced and rested', body: 'Better sleep habits and smarter training, backed by your own data.' },
      ];
  }
}

const GOAL_NAMES: Record<UserProfile['target'], string> = {
  'Weight Loss': 'Lose weight',
  'Weight Gain': 'Gain weight',
  'Cardio Endurance': 'Build endurance',
  'Autonomic Recovery': 'Recover better',
};

export default function AboutYouFlow({ profile, onChange, bmr, targets, onBack, onDone }: Props) {
  const [stage, setStage] = useState<Stage>(0);
  const [planReady, setPlanReady] = useState(false);
  const [soundOn, setSoundOnState] = useState(feedback.isSoundOn());

  const firstName = profile.name.trim().split(/\s+/)[0] || 'there';
  const region = regionById(profile.region);
  const motivation = useMemo(() => {
    const seed = [...`${profile.region}${firstName}`].reduce((n, c) => n + c.charCodeAt(0), 0);
    return MOTIVATION_LINES[seed % MOTIVATION_LINES.length];
  }, [profile.region, firstName]);

  // BMI-based goal: preselected on the Goal screen until the person picks a goal themselves
  const suggestion = suggestGoal(profile);
  const [goalPicked, setGoalPicked] = useState(false);

  const goTo = (next: Stage) => {
    if (next === 5) setPlanReady(false);
    if (next === 4 && !goalPicked && suggestion) onChange({ target: suggestion.goal });
    setStage(next);
    document.querySelector('.ob-container')?.scrollTo({ top: 0 }); // each screen starts at the top
  };
  const back = () => (stage === 0 ? onBack() : goTo((stage - 1) as Stage));

  // "Building your plan": a short beat, then the reveal with a chime
  useEffect(() => {
    if (stage !== 5 || planReady) return;
    const t = window.setTimeout(() => { setPlanReady(true); feedback.success(); }, reducedMotion() ? 300 : 2200);
    return () => window.clearTimeout(t);
  }, [stage, planReady]);

  const [laneIndex, laneFill] = LANE_FILL[stage];
  const strideKm = (profile.height * 0.415 * 10000) / 100000; // walking stride ≈ 41.5% of height
  const heartbeats = profile.age * 365.25 * 24 * 60 * 70; // ~70 beats a minute on average
  const heartbeatText = heartbeats >= 1e9 ? `${(heartbeats / 1e9).toFixed(1)} billion` : `${Math.round(heartbeats / 1e8) * 100} million`;

  let body: ReactNode;
  let cta: { label: string; onClick: () => void; disabled?: boolean } | null;

  switch (stage) {
    case 0:
      body = (
        <>
          <p className="ay-eyebrow">About you</p>
          <h1 className="ob-title">Let’s get to know you</h1>
          <p className="ob-body">A few quick questions and we’ll build your plan.</p>
          <NameRegionFields profile={profile} onChange={onChange} />
        </>
      );
      cta = { label: 'Continue', onClick: () => goTo(1), disabled: !profile.name.trim() || !region };
      break;

    case 1:
      body = (
        <div className="ob-hero-panel ay-hero">
          <TrackLanes />
          <p className="ay-place"><PinIcon size={16} /> {region?.name}</p>
          <h1 className="ay-hello">Hi, <em>{firstName}</em>.</h1>
          <div className="ay-fact">
            <span className="ay-fact-label">Did you know?</span>
            <p>{region?.fact}</p>
          </div>
          <p className="ay-quote">{motivation}</p>
        </div>
      );
      cta = { label: 'Keep going', onClick: () => goTo(2) };
      break;

    case 2:
      body = (
        <>
          <p className="ay-eyebrow">Your body</p>
          <h1 className="ob-title">Your numbers</h1>
          <p className="ob-body">Slide the rulers or tap a number to type it. We use these for your daily targets.</p>
          <BodyFields profile={profile} onChange={onChange} />
        </>
      );
      cta = { label: 'Continue', onClick: () => goTo(3) };
      break;

    case 3:
      body = (
        <>
          <div className="ob-hero-panel ay-hero">
            <TrackLanes />
            <span className="ay-fact-label">Every day, at rest</span>
            <p className="ay-big"><CountUp value={bmr} /><small>kcal</small></p>
            <p className="ay-hero-text">That’s what your body burns before you take a single step, {firstName}. Everything you do on top of it counts.</p>
          </div>
          <div className="ay-tiles">
            <div className="ay-tile">
              <span>10,000 of your steps</span>
              <strong>≈ <CountUp value={strideKm * 10} format={n => (n / 10).toFixed(1)} /> km</strong>
            </div>
            <div className="ay-tile">
              <span>Heartbeats so far</span>
              <strong>≈ {heartbeatText}</strong>
            </div>
          </div>
        </>
      );
      cta = { label: 'Continue', onClick: () => goTo(4) };
      break;

    case 4:
      body = (
        <>
          <p className="ay-eyebrow">Your goal</p>
          <h1 className="ob-title">What are you aiming for?</h1>
          <p className="ob-body">We’ll shape your targets, quests and meal ideas around it.</p>
          <GoalFields profile={profile} suggestion={suggestion}
            onChange={changes => { if (changes.target) setGoalPicked(true); onChange(changes); }} />
        </>
      );
      cta = { label: 'Build my plan', onClick: () => goTo(5) };
      break;

    case 5:
    default:
      body = !planReady ? (
        <div className="ay-build" role="status" aria-live="polite">
          <p className="ay-eyebrow">Your plan</p>
          <h1 className="ob-title">Building your plan…</h1>
          <div className="ay-build-lane" aria-hidden="true"><span /></div>
          <ul className="ay-build-steps">
            <li>Setting your daily calories</li>
            <li>Balancing protein and fibre</li>
            <li>Picking quests for your goal</li>
          </ul>
        </div>
      ) : (
        <>
          <p className="ay-eyebrow">{GOAL_NAMES[profile.target]}</p>
          <h1 className="ob-title">Your plan is ready, {firstName}</h1>
          <div className="ay-targets">
            <div><strong><CountUp value={targets.calories} /></strong><span>kcal a day</span></div>
            <div><strong><CountUp value={targets.protein} />g</strong><span>protein</span></div>
            <div><strong><CountUp value={targets.fiber} />g</strong><span>fibre</span></div>
          </div>
          <p className="ay-section">How KinetixFit changes your next 12 weeks</p>
          <ol className="ay-timeline">
            {planFor(profile.target, targets).map((item, i) => (
              <li key={item.week} style={{ '--i': i } as CSSProperties}>
                <span className="ay-week">{item.week}</span>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </li>
            ))}
          </ol>
        </>
      );
      cta = planReady ? { label: 'Let’s go', onClick: onDone } : null;
      break;
  }

  return (
    <div className="workspace-container">
      <div className="app-viewport-container">
        <div className="ob-container">
          <div className="ob-card ay-card">
            <div className="ay-top">
              <button type="button" className="ay-icon-btn" onClick={back} aria-label="Back">
                <ChevronIcon size={20} style={{ transform: 'rotate(90deg)' }} />
              </button>
              <div className="ay-lanes" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={4} aria-valuenow={laneIndex + laneFill}>
                {[0, 1, 2, 3].map(i => (
                  <span key={i} style={{ '--fill': i < laneIndex ? 1 : i === laneIndex ? laneFill : 0 } as CSSProperties} />
                ))}
              </div>
              {stage === 2 ? (
                <button
                  type="button"
                  className="ay-icon-btn"
                  onClick={() => { feedback.setSoundOn(!soundOn); setSoundOnState(!soundOn); feedback.tap(); }}
                  aria-pressed={soundOn}
                  aria-label={soundOn ? 'Turn ruler sounds off' : 'Turn ruler sounds on'}
                >
                  <SoundIcon size={20} muted={!soundOn} />
                </button>
              ) : <span className="ay-icon-spacer" />}
            </div>

            <div className="ay-stage" key={`${stage}-${planReady}`}>
              {body}
            </div>

            {cta && (
              <button className="primary-btn ob-sticky-cta ay-cta" onClick={cta.onClick} disabled={cta.disabled}>
                {cta.label}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
