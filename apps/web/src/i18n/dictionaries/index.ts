import type { Locale } from '../config';
import { en, type Dictionary } from './en';
import { id } from './id';
import { ru } from './ru';
import { zh } from './zh';

export type { Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { en, id, ru, zh };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
