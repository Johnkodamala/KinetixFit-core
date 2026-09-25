// The website calls /api/* same-origin, so it never needs CORS. The native apps do: their WebViews
// serve the bundled app from https://localhost (Android) and capacitor://localhost (iOS) and call
// https://www.kinetixfit.co.uk/api/*, which is cross-origin. Without this, the browser's preflight
// OPTIONS request hits the handler's POST-only check, gets a 405, and every native API call fails.
const NATIVE_APP_ORIGINS = new Set(['https://localhost', 'capacitor://localhost']);

// Returns true when the request was a preflight and has already been answered.
export function handleCors(req, res) {
  const origin = req.headers.origin;
  if (origin && NATIVE_APP_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
