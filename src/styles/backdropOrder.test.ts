// A rule that sets both `backdrop-filter` and `-webkit-backdrop-filter` must write the prefixed line FIRST. The build's CSS
// minifier keeps only one of the two when the unprefixed line comes first, and the one it kept was the prefixed line, which
// Chrome and Android's WebView ignore: the dimmed, blurred backdrop behind every sheet and dialog, the Plus celebration and the
// refresh pill had no blur on Android at all (found on the S21 FE: the screen behind a sheet showed through, crisp). Written
// the other way round, as glass.css does, both survive. This reads every stylesheet and checks that order.
import { describe, it, expect } from 'vitest';

const sheets = import.meta.glob('../**/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('backdrop-filter order in the stylesheets', () => {
  it('finds the stylesheets (so the check below is not vacuous)', () => {
    expect(Object.keys(sheets).length).toBeGreaterThan(5);
    const withBlur = Object.values(sheets).filter(css => /-webkit-backdrop-filter/.test(css));
    expect(withBlur.length).toBeGreaterThan(3);
  });

  it('writes -webkit-backdrop-filter before backdrop-filter in every rule that has both', () => {
    const offenders: string[] = [];
    for (const [file, css] of Object.entries(sheets)) {
      for (const block of noComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const body = block[2];
        const prefixed = body.search(/-webkit-backdrop-filter\s*:/);
        const plain = body.search(/(?<![-\w])backdrop-filter\s*:/);
        if (plain !== -1 && prefixed !== -1 && plain < prefixed) offenders.push(`${file.split('/').pop()}: ${block[1].trim().split('\n').pop()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never has the prefixed line alone (Chrome would get no blur)', () => {
    const alone: string[] = [];
    for (const [file, css] of Object.entries(sheets)) {
      for (const block of noComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const body = block[2];
        if (/-webkit-backdrop-filter\s*:/.test(body) && !/(?<![-\w])backdrop-filter\s*:/.test(body)) alone.push(`${file.split('/').pop()}: ${block[1].trim().split('\n').pop()}`);
      }
    }
    expect(alone).toEqual([]);
  });
});
