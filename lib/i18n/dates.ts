import { getLocale } from './state';
import type { LocaleCode } from './locales';

const LOCALE_TAGS: Record<LocaleCode, string> = {
  da: 'da-DK',
  en: 'en-US',
};

export function getLocaleTag(locale?: LocaleCode): string {
  return LOCALE_TAGS[locale ?? getLocale()];
}

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();
const monthFormatters = new Map<string, Intl.DateTimeFormat>();

function weekdayFormatter(tag: string, variant: 'long' | 'short'): Intl.DateTimeFormat {
  const key = `${tag}|${variant}`;
  let fmt = weekdayFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(tag, { weekday: variant });
    weekdayFormatters.set(key, fmt);
  }
  return fmt;
}

function monthFormatter(tag: string, variant: 'long' | 'short'): Intl.DateTimeFormat {
  const key = `${tag}|${variant}`;
  let fmt = monthFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(tag, { month: variant });
    monthFormatters.set(key, fmt);
  }
  return fmt;
}

export function formatWeekday(
  date: Date,
  variant: 'long' | 'short' = 'long',
  locale?: LocaleCode,
): string {
  return weekdayFormatter(getLocaleTag(locale), variant).format(date);
}

export function formatWeekdayCapitalized(
  date: Date,
  variant: 'long' | 'short' = 'long',
  locale?: LocaleCode,
): string {
  const name = formatWeekday(date, variant, locale);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function formatMonth(
  date: Date,
  variant: 'long' | 'short' = 'long',
  locale?: LocaleCode,
): string {
  return monthFormatter(getLocaleTag(locale), variant).format(date);
}

export function formatLocaleDate(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  locale?: LocaleCode,
): string {
  return new Intl.DateTimeFormat(getLocaleTag(locale), options).format(date);
}

export function formatLocaleTime(
  date: Date,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
  locale?: LocaleCode,
): string {
  return new Intl.DateTimeFormat(getLocaleTag(locale), options).format(date);
}
