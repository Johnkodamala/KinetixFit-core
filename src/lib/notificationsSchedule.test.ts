// scheduleNotifications (src/lib/notifications.ts): reminders are always scheduled as inexact on Android, so the app can
// leave out the exact-alarm permission and the plugin never opens the "Alarms & reminders" screen.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const schedule = vi.fn();
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: { schedule: (...a: unknown[]) => schedule(...a), createChannel: vi.fn(), registerActionTypes: vi.fn() },
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' }, registerPlugin: () => ({}) }));

import { scheduleNotifications } from './notifications';

beforeEach(() => { schedule.mockReset(); schedule.mockResolvedValue({ notifications: [] }); });

describe('scheduleNotifications', () => {
  it('marks every reminder inexact and keeps the rest of it as it was', async () => {
    const at = new Date(2026, 9, 3, 9, 0);
    await scheduleNotifications([
      { id: 1, title: 'A', body: 'a', schedule: { at, allowWhileIdle: true } },
      { id: 2, title: 'B', body: 'b', schedule: { on: { hour: 19, minute: 30 }, repeats: true } },
    ]);
    const { notifications } = schedule.mock.calls[0][0];
    expect(notifications).toHaveLength(2);
    for (const n of notifications) expect(n.isExactNotification).toBe(false);
    expect(notifications[0]).toMatchObject({ id: 1, title: 'A', schedule: { at, allowWhileIdle: true } });
    expect(notifications[1].schedule).toEqual({ on: { hour: 19, minute: 30 }, repeats: true });
  });

  it('does nothing for an empty list', async () => {
    await scheduleNotifications([]);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('still retries without badge pictures when iOS refuses them, and stays inexact', async () => {
    schedule.mockRejectedValueOnce(new Error('attachment'));
    await scheduleNotifications([{ id: 3, title: 'C', body: 'c', attachments: [{ id: 'x', url: 'file:///x.png' }] }]);
    expect(schedule).toHaveBeenCalledTimes(2);
    const retry = schedule.mock.calls[1][0].notifications[0];
    expect(retry.attachments).toBeUndefined();
    expect(retry.isExactNotification).toBe(false);
  });
});
