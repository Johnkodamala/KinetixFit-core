// Health Connect missing (src/lib/healthConnect.ts): get it from the Play Store, or explain the phone is too old.
import { describe, expect, it } from 'vitest';
import { androidVersion, healthConnectProblem } from './healthConnect';

const ua = (v: string) => `Mozilla/5.0 (Linux; Android ${v}; SM-A515F Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0 Mobile Safari/537.36`;

describe('Health Connect availability', () => {
  it('reads the Android version from the WebView', () => {
    expect(androidVersion(ua('13'))).toBe(13);
    expect(androidVersion(ua('8.1.0'))).toBe(8);
    expect(androidVersion('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBeNull();
  });

  it('available: nothing to do', () => {
    expect(healthConnectProblem({ available: true }, ua('13'))).toBeNull();
  });

  it('Android 9–13 without the app (the plugin says "needs an update"): get it from the Play Store', () => {
    expect(healthConnectProblem({ available: false, reason: 'Health Connect needs an update.' }, ua('12'))).toBe('get');
    expect(healthConnectProblem({ available: false, reason: 'Health Connect availability unknown.' }, ua('11'))).toBe('get');
    expect(healthConnectProblem({ available: false }, '')).toBe('get');
  });

  it('older than Android 9, or unavailable on the device: explain instead', () => {
    expect(healthConnectProblem({ available: false, reason: 'Health Connect needs an update.' }, ua('8.1.0'))).toBe('unsupported');
    expect(healthConnectProblem({ available: false, reason: 'Health Connect is unavailable on this device.' }, ua('13'))).toBe('unsupported');
  });
});
