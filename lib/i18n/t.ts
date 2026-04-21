import { DICTIONARIES } from './dictionaries';
import { handleMissing, interpolate } from './format';
import { DEFAULT_LOCALE, type LocaleCode } from './locales';
import { getLocale } from './state';
import type { Dictionary, TFunction, TranslationKey, TranslationVars } from './types';

function lookup(dict: Dictionary, key: string): string | undefined {
  const parts = key.split('.');
  let node: string | Dictionary | undefined = dict;
  for (const part of parts) {
    if (node === undefined || typeof node !== 'object' || node === null) return undefined;
    node = (node as Dictionary)[part] as string | Dictionary | undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

function resolve(locale: LocaleCode, key: string): string {
  const primary = lookup(DICTIONARIES[locale] as unknown as Dictionary, key);
  if (primary !== undefined) return primary;
  handleMissing(key, locale);
  if (locale !== DEFAULT_LOCALE) {
    const fallback = lookup(DICTIONARIES[DEFAULT_LOCALE] as unknown as Dictionary, key);
    if (fallback !== undefined) return fallback;
  }
  return key;
}

export function makeT(locale: LocaleCode): TFunction {
  return (key, vars) => interpolate(resolve(locale, key as string), vars);
}

export function t(key: TranslationKey, vars?: TranslationVars): string {
  return interpolate(resolve(getLocale(), key as string), vars);
}
