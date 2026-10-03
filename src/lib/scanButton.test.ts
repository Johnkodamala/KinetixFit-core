import { describe, expect, it } from 'vitest';
import { scanButtonAway } from './scanButton';

describe('when the scan button steps aside', () => {
  it('goes away as the page scrolls down, and comes back as it scrolls up', () => {
    expect(scanButtonAway(false, 200, 260)).toBe(true);
    expect(scanButtonAway(true, 260, 240)).toBe(false);
  });

  it('stays as it is for a nudge: a few pixels either way is not a scroll', () => {
    expect(scanButtonAway(false, 200, 203)).toBe(false);
    expect(scanButtonAway(true, 200, 197)).toBe(true);
    expect(scanButtonAway(true, 200, 200)).toBe(true);
  });

  it('is always there at the top of the page, scrolling or not', () => {
    expect(scanButtonAway(true, 120, 20)).toBe(false);
    expect(scanButtonAway(false, 0, 30)).toBe(false);
    expect(scanButtonAway(true, 40, 0)).toBe(false);
  });

  it('keeps hiding all the way down a long page and returns on the first scroll up', () => {
    let away = false;
    let y = 0;
    for (const next of [60, 140, 300, 520, 800, 1200]) { away = scanButtonAway(away, y, next); y = next; expect(away, `down to ${next}`).toBe(true); }
    away = scanButtonAway(away, y, y - 40);
    expect(away).toBe(false);
  });

  it('is not fooled by the page bouncing at the bottom (a tiny scroll back up keeps it hidden)', () => {
    expect(scanButtonAway(true, 1200, 1197)).toBe(true);
  });
});
