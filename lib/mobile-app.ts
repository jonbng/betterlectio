import QRCode from 'qrcode';

export const APP_STORE_URL = 'https://betterlectio.dk/download/ios';

export async function renderAppStoreQrSvg(): Promise<string> {
  return QRCode.toString(APP_STORE_URL, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 0,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

const INVITE_SNOOZE_KEY_PREFIX = 'bl-mobile-app-invite-last-shown';
const INVITE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function inviteSnoozeKey(studentId: string): string {
  return `${INVITE_SNOOZE_KEY_PREFIX}:${studentId}`;
}

export function getInviteSnoozeAt(studentId: string): number | null {
  try {
    const raw = localStorage.getItem(inviteSnoozeKey(studentId));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function isInviteSnoozed(studentId: string, now = Date.now()): boolean {
  const ts = getInviteSnoozeAt(studentId);
  if (ts == null) return false;
  return now - ts < INVITE_SNOOZE_MS;
}

export function stampInviteShown(studentId: string, now = Date.now()): void {
  try {
    localStorage.setItem(inviteSnoozeKey(studentId), String(now));
  } catch {}
}
