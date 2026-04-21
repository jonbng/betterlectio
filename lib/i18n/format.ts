import type { LocaleCode } from './locales';
import type { TranslationVars } from './types';

const PLACEHOLDER_RE = /\{(\w+)\}/g;

export function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER_RE, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

export function handleMissing(key: string, locale: LocaleCode): void {
  if (import.meta.env.DEV) {
    console.warn(`[BetterLectio i18n] missing key "${key}" in locale "${locale}"`);
  }
}
