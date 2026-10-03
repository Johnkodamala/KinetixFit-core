// @vitest-environment jsdom
// What the open trend card says about a day and about the period: the readout line and the dashed average line.
// (Recharts is replaced by stand-ins: jsdom has no layout, and only the average line's value is looked at.)
import { act, createElement as h, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('recharts', async () => {
  const { createElement } = await import('react');
  const pass = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  const nothing = () => null;
  return {
    ResponsiveContainer: pass, BarChart: pass, AreaChart: pass, Bar: pass, Area: pass,
    Cell: nothing, XAxis: nothing, YAxis: nothing, CartesianGrid: nothing,
    ReferenceLine: (props: { y?: number }) => (props.y === undefined ? null : createElement('i', { className: 'avg-line', 'data-y': String(props.y) })),
  };
});

import BiometricTrendCard, { type DailyPoint } from './BiometricTrendCard';
import { localDayKeyDaysAgo } from '../lib/dates';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Seven days ending today: the values oldest first, labelled D0 (6 days ago) … D6 (today). */
const week = (values: (number | null)[]): DailyPoint[] =>
  values.map((value, i) => ({ date: localDayKeyDaysAgo(values.length - 1 - i), label: `D${i}`, value }));

const STEPS = [18000, 21000, 15000, 16000, 18500, 14000, 17]; // six full days, then today so far

function open(trend: DailyPoint[], extra: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(h(BiometricTrendCard, {
    icon: null, title: 'Steps', status: 'Optimal', behavior: '', latestReading: '', subMetrics: [], trend, unit: '', color: 'red',
    chartType: 'bar', isTrackable: true, minPoints: 1, expanded: true, onToggle: () => {}, rangeDays: 7, onRangeChange: () => {},
    format: (v: number) => String(v), ...extra,
  })));
  return {
    readout: () => host.querySelector('.btc-readout span')?.textContent ?? '',
    bigNumber: () => host.querySelector('.btc-readout strong')?.textContent ?? '',
    avgLineAt: () => host.querySelector('.avg-line')?.getAttribute('data-y') ?? null,
    pickDay: (label: string) => act(() => { [...host.querySelectorAll<HTMLButtonElement>('.btc-daily-row')].find(b => b.textContent?.startsWith(label))!.click(); }),
    unmount: () => act(() => root.unmount()),
  };
}

describe('the average on a trend card', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('counts today so far unless the card says today is a day in progress (as before)', () => {
    const card = open(week(STEPS));
    expect(card.readout()).toBe('Latest · D6 · 7-day average 14645');
    expect(Number(card.avgLineAt())).toBeCloseTo(14645.3, 0);
    card.unmount();
  });

  it('leaves today out for a running total, so the average is of full days and says how many', () => {
    const card = open(week(STEPS), { partialToday: true });
    expect(card.readout()).toBe('Latest · D6 · 6-day average 17083');
    expect(Number(card.avgLineAt())).toBeCloseTo(17083.33, 0);
    card.unmount();
  });

  it('names the number of days actually averaged, not the range (a night is missing: 6, not 7)', () => {
    const card = open(week([300, null, 310, 290, 320, 280, null]));
    expect(card.readout()).toContain('5-day average');
    card.unmount();
  });

  it('says 7-day average when all seven days have a reading', () => {
    const card = open(week([1, 2, 3, 4, 5, 6, 7]));
    expect(card.readout()).toContain('7-day average 4');
    card.unmount();
  });

  it('shows no average with fewer than two full days', () => {
    const card = open(week([null, null, null, null, null, 14000, 17]), { partialToday: true });
    expect(card.readout()).toBe('Latest · D6');
    expect(card.avgLineAt()).toBeNull();
    card.unmount();
  });
});

describe('what the readout calls a day', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const HEART = [72, 70, 75, 74, 68, 71, 66]; // daily averages: six full days, then today so far

  it('calls the latest day "Latest" by default, and any other day by its date', () => {
    const card = open(week(HEART), { title: 'Heart rate', unit: ' bpm' });
    expect(card.readout()).toBe('Latest · D6 · 7-day average 71 bpm');
    card.pickDay('D2');
    expect(card.bigNumber()).toBe('75 bpm');
    expect(card.readout()).toBe('D2 · 7-day average 71 bpm');
    card.unmount();
  });

  it('says "Average on" when the card plots daily averages, so it is not mistaken for the latest reading', () => {
    const card = open(week(HEART), { title: 'Heart rate', dayValueLabel: 'Average', partialToday: true, unit: ' bpm' });
    expect(card.bigNumber()).toBe('66 bpm');
    expect(card.readout()).toBe('Average on D6 · 6-day average 72 bpm');
    card.pickDay('D1');
    expect(card.bigNumber()).toBe('70 bpm');
    expect(card.readout()).toBe('Average on D1 · 6-day average 72 bpm');
    card.unmount();
  });
});
