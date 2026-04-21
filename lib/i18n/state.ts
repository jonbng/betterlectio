import { updateSetting } from '@/lib/settings-storage';
import { isSupportedLocale, type LocaleCode } from './locales';
import { resolveInitialLocale } from './resolve';

export const LOCALE_CHANGED_EVENT = 'betterlectio:locale-changed';

let currentLocale: LocaleCode | null = null;

export function getLocale(): LocaleCode {
  if (currentLocale === null) {
    currentLocale = resolveInitialLocale();
  }
  return currentLocale;
}

export function setLocale(next: LocaleCode): void {
  if (!isSupportedLocale(next)) return;
  if (currentLocale === next) return;
  currentLocale = next;

  try {
    updateSetting('interface', 'language', next);
  } catch (err) {
    console.error('[BetterLectio i18n] failed to persist locale', err);
  }

  try {
    window.dispatchEvent(new CustomEvent<LocaleCode>(LOCALE_CHANGED_EVENT, { detail: next }));
  } catch {
    // window or CustomEvent unavailable — providers won't react, but storage is updated
  }
}
