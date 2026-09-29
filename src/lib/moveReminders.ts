// Movement breaks: a nudge to get up after sitting still for a long time.
// - Android: detected. MoveReminderReceiver.java checks the step counter and whether the screen is on every ~15 min
//   in the active hours; after `minutes` in use with no steps it sends one notification.
// - iOS: an iPhone app can't see whether the phone is in use or read steps in the background on a schedule, so
//   breaks are plain reminders every `minutes` through the active hours (the Apple Watch has its own stand reminders).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { styled, scheduleNotifications } from './notifications';

export const MOVE_MINUTES_OPTIONS = [45, 60, 90, 120];
export const MOVE_IDS = Array.from({ length: 40 }, (_, i) => 9300 + i);

export interface MoveSettings {
  enabled: boolean; startHour: number; endHour: number; minutes: number;
  /** iOS: hours water reminders fire at — a break that lands on one moves 30 min later, so two don't arrive at once */
  waterHours?: number[];
}

const MoveReminder = registerPlugin<{
  configure(o: MoveSettings & { askPermission: boolean }): Promise<{ granted: boolean; sensor: boolean }>;
}>('MoveReminder');

// Same words as Android's MoveReminderReceiver.java LINES
const IOS_LINES: { title: string; body: string; largeBody: string }[] = [
  { title: 'Time to stretch your legs', body: 'Been sitting a while? Two minutes on your feet.',
    largeBody: 'Been sitting a while? Stand up, roll your shoulders and walk for two minutes — your back and your focus will thank you.' },
  { title: 'Up you get', body: 'A short walk now helps your back, your focus and your steps.',
    largeBody: 'A short walk now helps your back, your focus and your step count. Even a lap of the room counts.' },
  { title: 'Screen break', body: 'Look away, stand tall and move for a couple of minutes.',
    largeBody: 'Look away from the screen, stand tall and move for a couple of minutes. Your eyes get a rest too.' },
  { title: 'Quick movement break', body: 'Refill your water on the way — two birds, one walk.',
    largeBody: 'Stand up and go and refill your water — you’ll get a few steps in and top up your hydration at the same time.' },
];

/** Minutes past midnight for each break: every `minutes` after the start of the active hours, until the end. */
export function breakTimes(startHour: number, endHour: number, minutes: number): number[] {
  const end = (endHour < startHour ? endHour + 24 : endHour) * 60;
  const out: number[] = [];
  for (let t = startHour * 60 + minutes; t <= end && out.length < MOVE_IDS.length; t += minutes) out.push(t % (24 * 60));
  return out;
}

/** The end of the active hours in minutes after the start day's midnight (past 24 h for an overnight window). */
const endMinute = (s: MoveSettings) => (s.endHour < s.startHour ? s.endHour + 24 : s.endHour) * 60;

/**
 * Applies the settings. `askPermission` only when the person has just turned breaks on (Android asks for
 * "Physical activity" then). Returns what stops them working, if anything.
 */
export async function applyMoveReminders(s: MoveSettings, askPermission = false): Promise<'ok' | 'no-permission' | 'no-sensor'> {
  const platform = Capacitor.getPlatform();
  if (platform === 'android') {
    const r = await MoveReminder.configure({ ...s, askPermission });
    if (!s.enabled) return 'ok';
    return !r.sensor ? 'no-sensor' : !r.granted ? 'no-permission' : 'ok';
  }
  if (platform === 'ios') {
    await LocalNotifications.cancel({ notifications: MOVE_IDS.map(id => ({ id })) }).catch(() => {});
    if (!s.enabled) return 'ok';
    await scheduleNotifications(
      breakTimes(s.startHour, s.endHour, s.minutes)
        // a clash moves 30 min later, or earlier when later would pass the end of the active hours
        .map(t => (t % 60 === 0 && s.waterHours?.includes(t / 60) ? (t + 30 <= endMinute(s) ? t + 30 : t - 30) : t) % (24 * 60))
        .map((t, i) => styled('activity', {
          id: MOVE_IDS[i],
          ...IOS_LINES[i % IOS_LINES.length],
          schedule: { on: { hour: Math.floor(t / 60), minute: t % 60 }, repeats: true, allowWhileIdle: true },
        })),
    ).catch(err => console.warn('Movement break scheduling failed:', err));
  }
  return 'ok';
}
