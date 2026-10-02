// The text of a support email opened from Get help. Nothing is sent by the app: this is only what the person's own
// email app starts with, and they can read and edit it. The last lines say which app version and phone it came from,
// so a bug report doesn't need a round of "which version are you on?".

export interface SupportDetails { app?: string; platform: string; model?: string; }

export function supportEmailBody(message: string, name: string, details: SupportDetails): string {
  const from = ['Kinetix Fit' + (details.app ? ` ${details.app}` : ''), details.platform, details.model].filter(Boolean).join(' · ');
  return `${message}\n\n${name}\n\n—\n${from}`;
}
