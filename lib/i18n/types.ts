import type { DaDictionary } from './dictionaries/da';

export type Dictionary = { [key: string]: string | Dictionary };

type PathOf<T> = T extends string
  ? ''
  : {
      [K in keyof T & string]: T[K] extends string
        ? K
        : `${K}.${PathOf<T[K]> & string}`;
    }[keyof T & string];

export type TranslationKey = PathOf<DaDictionary>;

export type TranslationVars = Record<string, string | number>;

export type TFunction = (key: TranslationKey, vars?: TranslationVars) => string;
