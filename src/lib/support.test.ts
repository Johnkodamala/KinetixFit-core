import { describe, expect, it } from 'vitest';
import { supportEmailBody } from './support';

describe('supportEmailBody', () => {
  it('puts the message and name first, then which app and phone it came from', () => {
    expect(supportEmailBody('It crashes when I scan', 'Siva', { app: '1.9 (10)', platform: 'android', model: 'SM-G990E' }))
      .toBe('It crashes when I scan\n\nSiva\n\n—\nKinetix Fit 1.9 (10) · android · SM-G990E');
  });

  it('leaves out what is not known (the website has no app version)', () => {
    expect(supportEmailBody('Hello', 'Siva', { platform: 'web' })).toBe('Hello\n\nSiva\n\n—\nKinetix Fit · web');
  });
});
