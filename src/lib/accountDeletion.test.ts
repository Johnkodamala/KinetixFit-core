import { describe, it, expect, vi, beforeEach } from 'vitest';

let headers: Record<string, string> = { Authorization: 'Bearer good-token' };
vi.mock('./sessionToken', () => ({ bearerHeader: async () => headers }));
vi.mock('./server', () => ({ serverUrl: (path: string) => `https://server.test${path}` }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' }, registerPlugin: () => ({}) }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: {} }));
vi.mock('./moveReminders', () => ({ applyMoveReminders: vi.fn() }));

import { deleteDescription, requestDeletion } from './accountDeletion';

const fetchMock = vi.fn();
beforeEach(() => {
  headers = { Authorization: 'Bearer good-token' };
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('requestDeletion', () => {
  it('posts the mode and the confirmation with the session token', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    expect(await requestDeletion('data')).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://server.test/api/delete-account');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer good-token' });
    expect(JSON.parse(init.body)).toEqual({ mode: 'data', confirm: true });
  });

  it('does not ask the server when signed out', async () => {
    headers = {};
    const result = await requestDeletion('account');
    expect(result).toEqual({ ok: false, message: 'Sign in again to delete your data.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so, and means it, when the server could not finish: nothing is wiped from the phone on a failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Some of your data could not be deleted. Nothing was lost; please try again.' }) });
    expect(await requestDeletion('account')).toEqual({ ok: false, message: 'Some of your data could not be deleted. Nothing was lost; please try again.' });
  });

  it('explains an expired session, an older server and no network', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    expect((await requestDeletion('account'))).toEqual({ ok: false, message: 'Sign in again to delete your data.' });
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    expect((await requestDeletion('account')).ok).toBe(false);
    fetchMock.mockRejectedValue(new Error('offline'));
    const offline = await requestDeletion('account');
    expect(offline.ok).toBe(false);
    expect(!offline.ok && offline.message).toContain('Nothing was deleted');
  });
});

describe('deleteDescription', () => {
  it('says what is deleted from the phone and the servers, and that a Plus subscription is not cancelled', () => {
    for (const mode of ['data', 'account'] as const) {
      const text = deleteDescription(mode);
      expect(text).toMatch(/deleted from your phone and from our servers/);
      expect(text).toMatch(/doesn’t cancel it/);
    }
  });

  it('keeping the account: tells people to log out of their other phones first, which would put some of it back', () => {
    expect(deleteDescription('data')).toMatch(/other phone/);
    expect(deleteDescription('data')).toMatch(/log out there first/);
    expect(deleteDescription('data')).toMatch(/Your account stays/);
  });

  it('deleting the account needs no such warning: the other phones are signed out with it', () => {
    expect(deleteDescription('account')).not.toMatch(/other phone/);
    expect(deleteDescription('account')).toMatch(/sign up again/);
  });
});
