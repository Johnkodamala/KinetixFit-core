// Phone notifications: channels (Android), icons, copy and actions in one place.
// IDs: 9000–9023 hydration (repeating daily), 9150 "remind me in 30 min", 9200+ nutrition, 9300+ movement breaks
// (src/lib/moveReminders.ts; Android posts its own from MoveReminderReceiver.java), 9400–9406 the gut check-in,
// 9500–9506 the streak reminder.
//
// How they look: every kind has a colour badge (scripts/app-icons/notify.mjs) — Android's large icon
// (res/drawable-nodpi/kx_notif_<badge>.png), iOS's thumbnail (public/notify/<badge>.png) — a short title and line, a
// longer text when expanded (Android), a small header saying what it is ("Hydration · 2 L goal"), threads on iOS, and
// buttons where there's something to do: Add a glass / Remind me in 30 min on water, Check in on the streak reminder.
// Plain words, no emoji (design rule).
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';

export const HYDRATION_IDS = Array.from({ length: 24 }, (_, i) => 9000 + i);
export const HYDRATION_SNOOZE_ID = 9150;
export const NUTRITION_BASE_ID = 9200;

export const HYDRATION_ACTION_TYPE = 'KX_HYDRATION';
export const ACTION_SNOOZE = 'snooze-30';
export const ACTION_ADD_GLASS = 'add-glass';
export const STREAK_ACTION_TYPE = 'KX_STREAK';
export const ACTION_CHECK_IN = 'check-in';

type Kind = 'hydration' | 'activity' | 'nutrition' | 'checkin' | 'streak';
type Badge = 'water' | 'move' | 'goal' | 'gut' | 'streak';

// Android: each kind has its own channel (people can mute one without losing the others), a white status-bar icon
// tinted with the kind's colour and the badge as its large icon. iOS: a thread per kind and the badge as a thumbnail.
const STYLE: Record<Kind, { channelId: string; smallIcon: string; iconColor: string; badge: Badge; header: string }> = {
  hydration: { channelId: 'kx-hydration', smallIcon: 'ic_stat_water', iconColor: '#0C8FB5', badge: 'water', header: 'Hydration' },
  activity: { channelId: 'kx-activity', smallIcon: 'ic_stat_kinetixfit', iconColor: '#E5532D', badge: 'move', header: 'Movement break' },
  nutrition: { channelId: 'kx-nutrition', smallIcon: 'ic_stat_kinetixfit', iconColor: '#D98E0B', badge: 'goal', header: 'Today’s food' },
  checkin: { channelId: 'kx-checkin', smallIcon: 'ic_stat_kinetixfit', iconColor: '#16895A', badge: 'gut', header: 'Gut check-in' },
  streak: { channelId: 'kx-streak', smallIcon: 'ic_stat_kinetixfit', iconColor: '#D8401F', badge: 'streak', header: 'Your streak' },
};

let setupDone: Promise<void> | null = null;

/** Channels + the hydration action buttons. Safe to call repeatedly. */
export function setupNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  setupDone ??= (async () => {
    if (Capacitor.getPlatform() === 'android') {
      await Promise.all([
        LocalNotifications.createChannel({ id: 'kx-hydration', name: 'Water reminders', description: 'Nudges to drink water during your active hours', importance: 4, lightColor: '#0C8FB5', vibration: true }),
        LocalNotifications.createChannel({ id: 'kx-activity', name: 'Activity', description: 'Movement breaks and activity reminders', importance: 3 }),
        LocalNotifications.createChannel({ id: 'kx-nutrition', name: 'Nutrition goals', description: 'When you reach or near a daily target', importance: 3 }),
        LocalNotifications.createChannel({ id: 'kx-checkin', name: 'Gut check-in', description: 'An evening reminder to note how your gut feels', importance: 3 }),
        LocalNotifications.createChannel({ id: 'kx-streak', name: 'Streak reminders', description: 'An evening nudge on days you haven’t checked in yet', importance: 3 }),
      ]).catch(err => console.warn('Notification channels failed:', err));
    }
    await LocalNotifications.registerActionTypes({
      types: [
        { id: HYDRATION_ACTION_TYPE, actions: [{ id: ACTION_ADD_GLASS, title: 'Add a glass' }, { id: ACTION_SNOOZE, title: 'Remind me in 30 min' }] },
        { id: STREAK_ACTION_TYPE, actions: [{ id: ACTION_CHECK_IN, title: 'Check in now' }] },
      ],
    }).catch(err => console.warn('Notification actions failed:', err));
  })();
  return setupDone;
}

/**
 * A notification in its kind's look: channel, icons, colour and badge, the small header (`header` overrides the kind's
 * own, e.g. "Hydration · 2 L goal"), and the longer text shown when expanded (`largeBody`, else the body).
 */
export function styled(kind: Kind, n: LocalNotificationSchema & { header?: string }): LocalNotificationSchema {
  const { header, ...rest } = n;
  const st = STYLE[kind];
  const ios = Capacitor.getPlatform() === 'ios';
  return {
    channelId: st.channelId, smallIcon: st.smallIcon, iconColor: st.iconColor,
    largeIcon: `kx_notif_${st.badge}`,
    summaryText: header ?? st.header,
    largeBody: rest.largeBody ?? rest.body,
    threadIdentifier: `kx-${kind}`,
    ...(ios ? { attachments: [{ id: st.badge, url: `res:///notify/${st.badge}.png` }] } : {}),
    ...rest,
  };
}

/**
 * Schedules them; if iOS refuses the badge thumbnails (attachments must be files it can copy), schedules them again
 * without — a reminder without its picture beats no reminder.
 */
export async function scheduleNotifications(list: LocalNotificationSchema[]) {
  if (!list.length) return;
  try {
    await LocalNotifications.schedule({ notifications: list });
  } catch (err) {
    if (!list.some(n => n.attachments?.length)) throw err;
    console.warn('Scheduling with badges failed, trying without:', err);
    await LocalNotifications.schedule({ notifications: list.map(n => ({ ...n, attachments: undefined })) });
  }
}

// A different line for each reminder of the day, so they don't read like the same alarm over and over; the expanded
// text (Android) adds a practical tip.
const HYDRATION_LINES: { title: string; body: string; more: string }[] = [
  { title: 'Morning glass', body: 'Start with a glass of water — you lose some overnight.',
    more: 'You lose water while you sleep. A glass first thing wakes you up better than scrolling does.' },
  { title: 'Sip break', body: 'Two minutes, one glass. Your focus will thank you.',
    more: 'Even mild dehydration can make it harder to concentrate. Two minutes, one glass.' },
  { title: 'Top up your bottle', body: 'Refill it now so it’s there when you need it.',
    more: 'People drink more when water is within reach. Refill your bottle and keep it where you can see it.' },
  { title: 'Water with lunch', body: 'A glass with your meal helps you notice when you’re full.',
    more: 'Having a glass of water with your meal slows you down and helps you notice when you’re full.' },
  { title: 'Beat the afternoon dip', body: 'Feeling flat? Try water before coffee.',
    more: 'That mid-afternoon slump is sometimes thirst. Try a glass of water before reaching for coffee or a snack.' },
  { title: 'Keep it flowing', body: 'Another glass keeps your energy steady into the evening.',
    more: 'Steady sips through the day beat a lot at once — another glass now keeps your energy up into the evening.' },
  { title: 'Evening sip', body: 'A glass now, then ease off before bed.',
    more: 'Have a glass now and ease off later, so you’re not up in the night.' },
  { title: 'Last one for today', body: 'One more glass and today’s water is done.',
    more: 'One more glass and you’ve had today’s water. Tap Add a glass to log it without opening the app.' },
];

/** "2 L", "1.5 L", "750 ml" (same as src/lib/water.ts waterAmount — kept here so this file stands alone) */
const amount = (ml: number) => (ml < 1000 ? `${ml} ml` : `${Math.round(ml / 10) / 100} L`);

/**
 * The hours reminders fire at: every `intervalHours` from the start of the active hours to the end, in that order.
 * An end before the start is an overnight window (e.g. a night shift 21:00–07:00) and runs on past midnight.
 */
export function reminderHours(startHour: number, endHour: number, intervalHours: number): number[] {
  const hours: number[] = [];
  const end = endHour < startHour ? endHour + 24 : endHour;
  for (let h = startHour; h <= end; h += Math.max(1, intervalHours)) hours.push(h % 24);
  return hours;
}

export interface HydrationWindow {
  /** The reminder times (ms) of the active window shown on Today: the one running now, else the latest or next one. */
  times: number[];
  prev: number | null;
  next: number | null;
  /** Between windows, after one that ended today: "Done for today". */
  done: boolean;
}

/**
 * Where `now` sits in the reminder schedule. Windows start every day at `startHour`; an overnight one ends the next
 * morning, so the window running at 03:00 may have started yesterday. Android/iOS widgets repeat this logic
 * (WidgetStore.java, KinetixFitWidgets/WidgetStore.swift).
 */
export function hydrationWindow(startHour: number, endHour: number, intervalHours: number, now: number): HydrationWindow {
  const hours = reminderHours(startHour, endHour, intervalHours);
  const day = new Date(now);
  const at = (hour: number, dayOffset: number) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate() + dayOffset, hour).getTime();
  // Yesterday's, today's and tomorrow's windows; hours before the start hour belong to the next morning.
  const windows = [-1, 0, 1].map(d => hours.map(h => at(h, d + (h < startHour ? 1 : 0))));
  const all = windows.flat();
  const next = all.find(t => t > now) ?? null;
  const prev = [...all].reverse().find(t => t <= now) ?? null;
  const running = windows.find(w => w.length > 0 && w[0] <= now && now <= w[w.length - 1]);
  const endedToday = prev !== null && new Date(prev).toDateString() === day.toDateString();
  const done = !running && endedToday;
  const times = running ?? (done ? windows.find(w => w.includes(prev!)) : windows.find(w => next !== null && w.includes(next))) ?? [];
  return { times, prev, next, done };
}

/** The water reminders for each hour; `goalMl` goes in the header ("Hydration · 2 L goal"). */
export function hydrationNotifications(hours: number[], goalMl?: number): LocalNotificationSchema[] {
  return hours.map((hour, i) => {
    const line = i === hours.length - 1 && hours.length > 1 ? HYDRATION_LINES[HYDRATION_LINES.length - 1] : HYDRATION_LINES[i % (HYDRATION_LINES.length - 1)];
    return styled('hydration', {
      id: HYDRATION_IDS[i],
      title: line.title,
      body: line.body,
      largeBody: line.more,
      header: goalMl ? `Hydration · ${amount(goalMl)} goal` : undefined,
      actionTypeId: HYDRATION_ACTION_TYPE,
      schedule: { on: { hour, minute: 0 }, repeats: true, allowWhileIdle: true },
    });
  });
}

export function hydrationSnoozeNotification(at: Date): LocalNotificationSchema {
  return styled('hydration', {
    id: HYDRATION_SNOOZE_ID,
    title: 'Here’s your water reminder',
    body: 'You asked us to remind you — time for a glass.',
    largeBody: 'You asked us to remind you — time for a glass of water. Tap Add a glass to log it straight away.',
    actionTypeId: HYDRATION_ACTION_TYPE,
    schedule: { at, allowWhileIdle: true },
  });
}

/**
 * The text of a nutrition-target alert (fired once per target per day, at 90% and at 100%). Calories reaching the
 * target isn't a win to celebrate, so it's worded as information; protein and fibre are.
 */
export function nutritionAlert(key: 'calories' | 'protein' | 'fiber', reached: boolean, remaining: number, target: number): { title: string; body: string; largeBody: string } {
  const n = (v: number) => v.toLocaleString('en-GB');
  if (key === 'calories') {
    return reached
      ? { title: 'That’s today’s calories', body: `You’ve reached your ${n(target)} kcal for today.`,
        largeBody: `You’ve reached your ${n(target)} kcal for today. Still hungry? Vegetables, fruit or some lean protein are the lightest way to top up.` }
      : { title: 'Nearly at today’s calories', body: `About ${n(remaining)} kcal left for today.`,
        largeBody: `About ${n(remaining)} kcal left for today — worth keeping in mind for your next meal.` };
  }
  const label = key === 'protein' ? 'protein' : 'fibre';
  return reached
    ? { title: `${key === 'protein' ? 'Protein' : 'Fibre'} goal reached`, body: `That’s your ${n(target)} g of ${label} for today. Nice work.`,
      largeBody: `That’s your ${n(target)} g of ${label} for today. Nice work — keep it up tomorrow.` }
    : { title: `Nearly there on ${label}`, body: `Just ${n(remaining)} g to go today.`,
      largeBody: `Just ${n(remaining)} g of ${label} to go today — ${key === 'protein' ? 'yogurt, eggs, dal or a handful of nuts would do it' : 'fruit, oats, beans or wholegrain bread would do it'}.` };
}

export async function cancelHydration(includeSnooze = true) {
  const ids = includeSnooze ? [...HYDRATION_IDS, HYDRATION_SNOOZE_ID] : HYDRATION_IDS;
  await LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) }).catch(() => {});
}

// The gut check-in reminder: one evening nudge a day, only on days without a check-in yet. Scheduled a week ahead as
// single notifications (not a repeating one), so answering today can cancel just today's.
export const GUT_REMINDER_IDS = Array.from({ length: 7 }, (_, i) => 9400 + i);
export const GUT_REMINDER_HOUR = 20;
const GUT_LINES: { title: string; body: string; more: string }[] = [
  { title: 'How’s your gut today?', body: 'One tap to note it — it builds your weekly gut report.',
    more: 'One tap to note how your gut felt today. After a week you get food ideas matched to how you felt and what you ate.' },
  { title: 'Gut check-in', body: 'How did your gut feel today? It takes a second.',
    more: 'How did your gut feel today? It takes a second, and it stays on your phone.' },
  { title: 'A quick one before bed', body: 'Note how your gut felt today.',
    more: 'Note how your gut felt today — the more days you check in, the better your weekly report can spot patterns.' },
];

/**
 * The next 7 reminders at GUT_REMINDER_HOUR, from today (if it's still before then and today isn't answered) onwards.
 * `answered(dayKey)` says whether a day already has a check-in.
 */
export function gutReminderNotifications(now: Date, answered: (day: Date) => boolean): LocalNotificationSchema[] {
  const out: LocalNotificationSchema[] = [];
  for (let i = 0; out.length < GUT_REMINDER_IDS.length && i < 8; i++) {
    const at = new Date(now);
    at.setDate(at.getDate() + i);
    at.setHours(GUT_REMINDER_HOUR, 0, 0, 0);
    if (at.getTime() <= now.getTime() || answered(at)) continue;
    const line = GUT_LINES[out.length % GUT_LINES.length];
    out.push(styled('checkin', {
      id: GUT_REMINDER_IDS[out.length], title: line.title, body: line.body, largeBody: line.more,
      schedule: { at, allowWhileIdle: true }, extra: { open: 'gut' },
    }));
  }
  return out;
}

export async function cancelGutReminders() {
  await LocalNotifications.cancel({ notifications: GUT_REMINDER_IDS.map(id => ({ id })) }).catch(() => {});
}

// The streak reminder: 19:30 on days without a check-in yet, so a streak isn't lost by forgetting. Scheduled a week ahead
// as single notifications and re-planned whenever check-ins change (answering today cancels today's).
export const STREAK_REMINDER_IDS = Array.from({ length: 7 }, (_, i) => 9500 + i);
export const STREAK_REMINDER_TIME = { hour: 19, minute: 30 };

/**
 * The next 7 streak reminders from today (if it's before 19:30 and today has no check-in) onwards. `streak` is the
 * streak today (it breaks at midnight if today has no check-in); later days use general words, since it depends on them.
 */
export function streakReminderNotifications(now: Date, checkedIn: (day: Date) => boolean, streak: number): LocalNotificationSchema[] {
  const out: LocalNotificationSchema[] = [];
  for (let i = 0; out.length < STREAK_REMINDER_IDS.length && i < 8; i++) {
    const at = new Date(now);
    at.setDate(at.getDate() + i);
    at.setHours(STREAK_REMINDER_TIME.hour, STREAK_REMINDER_TIME.minute, 0, 0);
    if (at.getTime() <= now.getTime() || checkedIn(at)) continue;
    const today = i === 0;
    const copy = today && streak > 0
      ? { title: `Keep your ${streak}-day streak`, body: 'Check in before midnight — it takes two taps.',
        more: `You’re on a ${streak}-day streak. Check in before midnight to keep it — two taps, and it earns today’s points.` }
      : { title: 'Your daily check-in', body: 'Two taps: how you slept and how your energy is.',
        more: 'Two taps: how long you slept and how your energy is. It builds your streak and earns today’s points.' };
    out.push(styled('streak', {
      id: STREAK_REMINDER_IDS[out.length], title: copy.title, body: copy.body, largeBody: copy.more,
      actionTypeId: STREAK_ACTION_TYPE, schedule: { at, allowWhileIdle: true }, extra: { open: 'checkin' },
    }));
  }
  return out;
}

export async function cancelStreakReminders() {
  await LocalNotifications.cancel({ notifications: STREAK_REMINDER_IDS.map(id => ({ id })) }).catch(() => {});
}
