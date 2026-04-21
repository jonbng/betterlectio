import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { DEFAULT_LOCALE, type LocaleCode } from './locales';
import { LOCALE_CHANGED_EVENT, getLocale } from './state';
import { makeT } from './t';
import type { TFunction } from './types';

interface I18nContextValue {
  locale: LocaleCode;
  t: TFunction;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  t: makeT(DEFAULT_LOCALE),
});

export function I18nProvider({ children }: { children: ComponentChildren }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => getLocale());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<LocaleCode>).detail;
      if (detail) setLocaleState(detail);
    };
    window.addEventListener(LOCALE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(LOCALE_CHANGED_EVENT, handler);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, t: makeT(locale) }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  return useContext(I18nContext);
}
