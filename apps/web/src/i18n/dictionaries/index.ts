import type { Locale } from '../config';
import { en, type Dictionary } from './en';
import { id } from './id';
import { ru } from './ru';
import { zh } from './zh';
import { pt } from './pt';

export type { Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { en, id, ru, zh, pt };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
