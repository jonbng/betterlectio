export const SUPPORTED_LOCALES = ['da', 'en'] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: LocaleCode = 'da';

export const LOCALE_LABELS: Record<LocaleCode, string> = {
  da: 'Dansk',
  en: 'English',
};

export function isSupportedLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
