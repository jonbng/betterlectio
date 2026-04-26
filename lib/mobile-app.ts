import QRCode from 'qrcode';

const APP_STORE_REDIRECT_BASE = 'https://betterlectio.dk/download/ios';

/**
 * Returns the betterlectio.dk redirect URL for the App Store. When `studentId`
 * is provided it's tagged as `?u={studentId}` so the redirect handler can
 * stamp `students.app_qr_scanned_at` on first scan.
 */
export function appStoreUrlFor(studentId?: string | null): string {
  if (!studentId) return APP_STORE_REDIRECT_BASE;
  const url = new URL(APP_STORE_REDIRECT_BASE);
  url.searchParams.set('u', studentId);
  return url.toString();
}

export async function renderAppStoreQrSvg(studentId?: string | null): Promise<string> {
  return QRCode.toString(appStoreUrlFor(studentId), {
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
