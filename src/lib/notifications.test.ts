// How notifications look and read (src/lib/notifications.ts).
import { describe, expect, it } from 'vitest';
import { styled, hydrationNotifications, nutritionAlert, streakReminderNotifications, STREAK_REMINDER_IDS, gutReminderNotifications } from './notifications';

const hasEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s);

describe('notification look', () => {
  it('every kind gets its badge, a header and the longer text when expanded', () => {
    const n = styled('hydration', { id: 1, title: 'T', body: 'B' });
    expect(n).toMatchObject({ largeIcon: 'kx_notif_water', summaryText: 'Hydration', largeBody: 'B', channelId: 'kx-hydration', threadIdentifier: 'kx-hydration' });
    expect(styled('streak', { id: 2, title: 'T', body: 'B', header: 'Custom' }).summaryText).toBe('Custom');
  });

  it('water reminders carry the goal in the header, a tip when expanded, and the Add a glass button', () => {
    const [first, , last] = hydrationNotifications([9, 12, 17], 2500);
    expect(first.summaryText).toBe('Hydration · 2.5 L goal');
    expect(first.largeBody!.length).toBeGreaterThan(first.body.length);
    expect(last.title).toBe('Last one for today');
    expect(first.actionTypeId).toBe('KX_HYDRATION');
    expect(hydrationNotifications([9], 2000)[0].summaryText).toBe('Hydration · 2 L goal');
  });

  it('no emoji anywhere', () => {
    const texts = [
      ...hydrationNotifications([8, 10, 12, 14, 16, 18, 20, 22], 2000),
      ...gutReminderNotifications(new Date(2026, 8, 28, 9), () => false),
      ...streakReminderNotifications(new Date(2026, 8, 28, 9), () => false, 5),
    ].flatMap(n => [n.title, n.body, n.largeBody ?? '']);
    for (const key of ['calories', 'protein', 'fiber'] as const) {
      for (const reached of [true, false]) texts.push(...Object.values(nutritionAlert(key, reached, 120, 1800)));
    }
    expect(texts.filter(hasEmoji)).toEqual([]);
  });
});

describe('nutrition alerts', () => {
  it('calories are information, protein and fibre a win', () => {
    expect(nutritionAlert('calories', true, 0, 1850).title).toBe('That’s today’s calories');
    expect(nutritionAlert('calories', false, 180, 1850).body).toBe('About 180 kcal left for today.');
    expect(nutritionAlert('protein', true, 0, 120).title).toBe('Protein goal reached');
    expect(nutritionAlert('fiber', false, 6, 30).body).toBe('Just 6 g to go today.');
    expect(nutritionAlert('fiber', false, 6, 30).largeBody).toMatch(/oats/);
  });
});

describe('streak reminders', () => {
  it('19:30 on days without a check-in, naming today’s streak', () => {
    const now = new Date(2026, 8, 28, 9, 0);
    const n = streakReminderNotifications(now, () => false, 5);
    expect(n).toHaveLength(7);
    expect(n.map(x => x.id)).toEqual(STREAK_REMINDER_IDS);
    const at = (n[0].schedule as { at: Date }).at;
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([28, 19, 30]);
    expect(n[0].title).toBe('Keep your 5-day streak');
    expect(n[1].title).toBe('Your daily check-in');
    expect(n[0].extra).toEqual({ open: 'checkin' });
    expect(n[0].actionTypeId).toBe('KX_STREAK');
  });

  it('skips days already checked in and times already past', () => {
    const answeredToday = streakReminderNotifications(new Date(2026, 8, 28, 9), d => d.getDate() === 28, 5);
    expect((answeredToday[0].schedule as { at: Date }).at.getDate()).toBe(29);
    const late = streakReminderNotifications(new Date(2026, 8, 28, 20), () => false, 5);
    expect((late[0].schedule as { at: Date }).at.getDate()).toBe(29);
    expect(streakReminderNotifications(new Date(2026, 8, 28, 9), () => false, 0)[0].title).toBe('Your daily check-in');
  });
});
