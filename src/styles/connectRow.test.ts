// The "Connect a device" sheet's row is a button holding a label and an orange "Connect". A button centres its text by default, so on a
// Samsung phone, where the label wraps ("Samsung Health · via Health / Connect"), it came out centred while every other line in the
// sheet is left-aligned, and sat 10 px from "Connect" (seen on the S21 FE). Layout can't run in a unit test; this pins the fix.
import { describe, it, expect } from 'vitest';
import appCss from './app.css?raw';

const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (selector: string) => [...noComments(appCss).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(m => m[1].split(',').map(x => x.trim()).includes(selector)).map(m => m[2]).join('\n');

describe('the Connect a device row', () => {
  it('left-aligns its label and keeps a gap before "Connect"', () => {
    const row = rule('.modal-sync-option-btn');
    expect(row).toMatch(/text-align:\s*left\s*;/);
    expect(row).toMatch(/gap:\s*12px\s*;/);
  });
});
