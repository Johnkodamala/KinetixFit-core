import { Capacitor } from '@capacitor/core';

// On the website, /api/* and pages like /privacy-policy are same-origin on Vercel, so relative paths
// work. Inside the Android/iOS apps the page is served from https://localhost (or
// capacitor://localhost), so a relative path would hit the bundled app itself — native builds must
// use the deployed site's absolute URL.
// Use the www host: the apex domain 308-redirects, and CORS preflights don't follow redirects.
const NATIVE_SERVER_URL = (import.meta.env.VITE_SERVER_URL || 'https://www.kinetixfit.co.uk').replace(/\/+$/, '');

export function serverUrl(path: string): string {
  return Capacitor.isNativePlatform() ? `${NATIVE_SERVER_URL}${path}` : path;
}
