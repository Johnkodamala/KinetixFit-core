// @vitest-environment jsdom
import { act, createElement as h, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Boom = () => { throw new Error('render failed'); };

function mount(ui: ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, unmount: () => act(() => root.unmount()) };
}

describe('ErrorBoundary', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

  it('shows the app untouched when nothing throws', () => {
    const { host, unmount } = mount(h(ErrorBoundary, null, h('p', null, 'fine')));
    expect(host.textContent).toBe('fine');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    unmount();
  });

  it('shows a message and a Reload button instead of a blank page when a screen throws', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { host, unmount } = mount(h(ErrorBoundary, null, h(Boom)));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');
    expect(host.querySelector('button')?.textContent).toBe('Reload');
    expect(log.mock.calls.some(c => String(c[0]).includes('Kinetix Fit hit an error'))).toBe(true);
    unmount();
  });
});
