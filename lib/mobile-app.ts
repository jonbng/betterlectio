import QRCode from 'qrcode';

const MOBILE_APP_DOWNLOAD_BASE = 'https://betterlectio.dk/download/app';

type MobileAppPromotionState = {
  app_installed_at?: string | null;
  dismissed_app_prompt_at?: string | null;
  app_eligible?: boolean;
  app_qr_scanned_at?: string | null;
  marked_android_at?: string | null;
};

/** The rollout is public; only installation or an explicit opt-out suppresses it. */
export function shouldPromoteMobileApp(student: MobileAppPromotionState | null | undefined): boolean {
  return Boolean(student && !student.app_installed_at && !student.dismissed_app_prompt_at);
}

/**
 * Returns the betterlectio.dk platform-neutral app redirect. When `studentId`
 * is provided it's tagged so the handler can stamp the first QR scan before
 * selecting App Store or Google Play.
 */
export function mobileAppDownloadUrlFor(studentId?: string | null): string {
  if (!studentId) return MOBILE_APP_DOWNLOAD_BASE;
  const url = new URL(MOBILE_APP_DOWNLOAD_BASE);
  url.searchParams.set('u', studentId);
  return url.toString();
}

export async function renderMobileAppQrSvg(studentId?: string | null): Promise<string> {
  return QRCode.toString(mobileAppDownloadUrlFor(studentId), {
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

const INVITE_THANKS_KEY_PREFIX = 'bl-mobile-app-invite-thanks-shown';

function inviteThanksKey(studentId: string): string {
  return `${INVITE_THANKS_KEY_PREFIX}:${studentId}`;
}

export function hasInviteThanksBeenShown(studentId: string): boolean {
  try {
    return localStorage.getItem(inviteThanksKey(studentId)) != null;
  } catch {
    return false;
  }
}

export function markInviteThanksShown(studentId: string, now = Date.now()): void {
  try {
    localStorage.setItem(inviteThanksKey(studentId), String(now));
  } catch {}
}
