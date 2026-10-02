import { describe, expect, it } from 'vitest';
import { healthSourceName, ownHealthSource } from './healthSources';

describe('healthSourceName: what each phone reads health data from', () => {
  it('names Apple Health on iOS and Health Connect on Android', () => {
    expect(healthSourceName('ios')).toBe('Apple Health');
    expect(healthSourceName('android')).toBe('Health Connect');
  });
});

describe('ownHealthSource: "Connected to …" must be about this phone', () => {
  it('keeps the connection this phone made', () => {
    expect(ownHealthSource('Apple Health', 'ios')).toBe('Apple Health');
    expect(ownHealthSource('Health Connect', 'android')).toBe('Health Connect');
  });

  it('drops one that came from the other kind of phone (synced from an account used elsewhere)', () => {
    expect(ownHealthSource('Health Connect', 'ios')).toBeNull();
    expect(ownHealthSource('Apple Health', 'android')).toBeNull();
  });

  it('keeps nothing as nothing, and leaves the website alone', () => {
    expect(ownHealthSource(null, 'ios')).toBeNull();
    expect(ownHealthSource('Health Connect', 'web')).toBe('Health Connect');
  });
});
