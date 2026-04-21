import type { LocaleCode } from '../locales';
import type { DaDictionary } from './da';
import { da } from './da';
import { en } from './en';

export const DICTIONARIES: Record<LocaleCode, DaDictionary> = {
  da,
  en,
};
