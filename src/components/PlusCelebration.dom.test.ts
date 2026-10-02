// @vitest-environment jsdom
import { act, createElement as h, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const success = vi.fn();
vi.mock('../lib/feedback', () => ({ success: () => success() }));

import PlusCelebration from './PlusCelebration';
import PlusBadge from './PlusBadge';
import { PLUS_BENEFITS } from '../lib/plus';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, unmount: () => act(() => root.unmount()) };
}

describe('PlusCelebration', () => {
  beforeEach(() => success.mockClear());
  afterEach(() => { document.body.innerHTML = ''; });

  it('welcomes the person to Plus and lists what they now have', () => {
    const { host, unmount } = mount(h(PlusCelebration, { onClose: () => {} }));
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Welcome to Plus');
    for (const benefit of PLUS_BENEFITS) expect(dialog.textContent).toContain(benefit);
    unmount();
  });

  it('plays the success feedback once when it appears', () => {
    const { unmount } = mount(h(PlusCelebration, { onClose: () => {} }));
    expect(success).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('closes from the button and from Escape', () => {
    const onClose = vi.fn();
    const { host, unmount } = mount(h(PlusCelebration, { onClose }));
    act(() => { (host.querySelector('button.kx-plus-cta') as HTMLButtonElement).click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('draws confetti that screen readers skip', () => {
    const { host, unmount } = mount(h(PlusCelebration, { onClose: () => {} }));
    const confetti = host.querySelector('.kx-plus-confetti')!;
    expect(confetti.getAttribute('aria-hidden')).toBe('true');
    expect(confetti.children.length).toBeGreaterThanOrEqual(16);
    unmount();
  });
});

describe('PlusBadge', () => {
  it('reads PLUS and is a label, not a button', () => {
    const { host, unmount } = mount(h(PlusBadge, null));
    const badge = host.querySelector('.kx-plus-badge')!;
    expect(badge.textContent).toBe('PLUS');
    expect(badge.tagName).toBe('SPAN');
    unmount();
  });
});
