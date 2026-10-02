// @vitest-environment jsdom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
// jsdom has no matchMedia: the theme and the intro ask it about dark mode and reduced motion, even while being imported
vi.hoisted(() => {
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

import LaunchIntro from './LaunchIntro';
import { rememberPlus } from '../lib/plusBadge';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function opening() {
  document.documentElement.dataset.intro = 'run';
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(h(LaunchIntro)));
  return { host, unmount: () => act(() => root.unmount()) };
}

describe('the opening screen', () => {
  afterEach(() => { document.body.innerHTML = ''; delete document.documentElement.dataset.intro; localStorage.clear(); });

  it('says PLUS under the wordmark for an account known to be on Plus', () => {
    rememberPlus(true);
    const { host, unmount } = opening();
    expect(host.querySelector('.kx-intro-plus')?.textContent).toBe('PLUS');
    unmount();
  });

  it('is the plain opening for everyone else', () => {
    const { host, unmount } = opening();
    expect(host.querySelector('.kx-intro-word')?.textContent).toBe('KINETIX FIT');
    expect(host.querySelector('.kx-intro-plus')).toBeNull();
    unmount();
  });
});
