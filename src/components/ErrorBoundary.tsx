import { Component, type ErrorInfo, type ReactNode } from 'react';

// A screen that throws while rendering used to leave a blank page and no way out. This keeps a way out on screen:
// what happened, and a button that reloads the app. Nothing is sent anywhere; the error goes to the console only.
// Inline styles on purpose: if the stylesheet is what broke, the message must still be readable.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Kinetix Fit hit an error while drawing a screen:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
        padding: '24px 28px', textAlign: 'center', background: '#16181F', color: '#F4F5F7', fontFamily: 'system-ui, sans-serif',
      }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Something went wrong</h1>
        <p style={{ margin: 0, maxWidth: 320, lineHeight: 1.45, color: '#B9BDC8' }}>
          Kinetix Fit hit a problem showing this screen. Your logs are saved. Reload to carry on.
        </p>
        <button type="button" onClick={() => window.location.reload()} style={{
          marginTop: 6, padding: '12px 28px', border: 0, borderRadius: 999, background: '#E5532D', color: '#fff', fontSize: 16, fontWeight: 600,
        }}>Reload</button>
      </div>
    );
  }
}
