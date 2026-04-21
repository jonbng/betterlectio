import { getSettings } from '@/lib/settings-storage';
import { DEFAULT_LOCALE, isSupportedLocale, type LocaleCode } from './locales';

export function resolveInitialLocale(): LocaleCode {
  try {
    const stored = getSettings().interface?.language;
    if (isSupportedLocale(stored)) return stored;
  } catch {
    // fall through to navigator detection
  }

  try {
    const base = (typeof navigator !== 'undefined' ? navigator.language : '')
      .split('-')[0]
      ?.toLowerCase();
    if (isSupportedLocale(base)) return base;
  } catch {
    // fall through to default
  }

  return DEFAULT_LOCALE;
}
