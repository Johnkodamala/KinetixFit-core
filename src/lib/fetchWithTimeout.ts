// A fetch that gives up after `ms`. The account's client uses it for every request, so a request that never answers (the
// phone reports "connected" a moment before the connection carries traffic) ends with an error the sync can retry, instead
// of hanging for minutes with the upload waiting behind it. The timer covers the wait for the answer, not the reading of
// its (small) body. Written without AbortSignal.any/timeout: iOS 16.4 to 17.3 has neither.
export const REQUEST_TIMEOUT_MS = 20_000;

export function fetchWithTimeout(ms: number = REQUEST_TIMEOUT_MS, inner: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    const theirs = init?.signal;
    if (theirs) {
      if (theirs.aborted) controller.abort();
      else theirs.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return inner(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
}
