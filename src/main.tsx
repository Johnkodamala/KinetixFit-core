import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { Purchases } from '@revenuecat/purchases-capacitor'
import './index.css'
import App from './App.tsx'

// RevenueCat's Capacitor SDK only supports native billing (App Store / Play Store) — configuring
// it on web is a no-op at best, so this is skipped entirely there. The Profile tab's subscription
// UI already falls back to demo-mode text when Purchases.isConfigured() is false, so a missing key
// degrades gracefully rather than breaking anything.
if (Capacitor.isNativePlatform()) {
  const apiKey = Capacitor.getPlatform() === 'ios'
    ? import.meta.env.VITE_REVENUECAT_IOS_PUBLIC_KEY
    : import.meta.env.VITE_REVENUECAT_ANDROID_PUBLIC_KEY;

  if (apiKey) {
    Purchases.configure({ apiKey });
  } else {
    console.warn(`RevenueCat public SDK key not set for platform "${Capacitor.getPlatform()}" — set VITE_REVENUECAT_IOS_PUBLIC_KEY / VITE_REVENUECAT_ANDROID_PUBLIC_KEY in .env. Subscription status will show demo-mode text until then.`);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
