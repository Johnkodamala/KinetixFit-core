import { describe, it, expect, vi, beforeEach } from 'vitest';

let headers: Record<string, string> = { Authorization: 'Bearer good-token' };
vi.mock('./sessionToken', () => ({ bearerHeader: async () => headers }));
vi.mock('./server', () => ({ serverUrl: (path: string) => `https://server.test${path}` }));

import { claimCheckIns, claimableCheckInDays } from './checkinClaims';

const fetchMock = vi.fn();
beforeEach(() => {
  headers = { Authorization: 'Bearer good-token' };
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
});

describe('claimableCheckInDays', () => {
  const now = new Date('2026-10-01T12:00:00');
  it('keeps today and yesterday, oldest first — the days the server still accepts', () => {
    const days = claimableCheckInDays({ '2026-10-01': {}, '2026-09-30': {}, '2026-09-20': {}, '2026-08-01': {} }, now);
    expect(days).toEqual(['2026-09-30', '2026-10-01']);
  });
  it('is empty with no check-ins', () => {
    expect(claimableCheckInDays({}, now)).toEqual([]);
  });
});

describe('claimCheckIns', () => {
  it('posts the days to the server with the session token', async () => {
    expect(await claimCheckIns(['2026-09-30', '2026-10-01'])).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://server.test/api/claim-checkins');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer good-token', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ days: ['2026-09-30', '2026-10-01'] });
  });

  it('sends nothing when there are no days', async () => {
    expect(await claimCheckIns([])).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing, and says so, when signed out', async () => {
    headers = {};
    expect(await claimCheckIns(['2026-10-01'])).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only the last seven days, the most the server takes', async () => {
    const days = Array.from({ length: 9 }, (_, i) => `2026-09-${String(i + 10).padStart(2, '0')}`);
    await claimCheckIns(days);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).days).toEqual(days.slice(-7));
  });

  it('never throws: offline, or a server that answers with an error, just means try again next time', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await claimCheckIns(['2026-10-01'])).toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: false });
    expect(await claimCheckIns(['2026-10-01'])).toBe(false);
  });
});
