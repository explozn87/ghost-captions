// i18n entry point (task 7.1): the `Lang` type, the language tables, the
// default (English), and the `t()` helper.
//
// `t(lang)` returns the whole string table for a language, so a component (or
// the export) reads strings by field — `t(lang).ui.exportCaptions`,
// `t(lang).family[event.family]` — rather than passing dotted key strings.
// This keeps lookups type-checked: a typo in a key is a compile error, not a
// missing translation at runtime. No user-facing string is hard-coded in a
// component (Requirement 9.2); they all come from here.

import type { Strings } from './strings.ts';
import { en } from './en.ts';
import { ko } from './ko.ts';

export type { Strings, LoudnessBand, OminousBand } from './strings.ts';

/** The languages the app offers, English default (Requirement 9.1). */
export type Lang = 'en' | 'ko';

/** The default language shown to judges (Requirement 9.1, steering). */
export const DEFAULT_LANG: Lang = 'en';

/** Every language table, keyed by `Lang`. */
export const tables: Record<Lang, Strings> = { en, ko };

/** The list of offered languages, in display order. */
export const LANGS: Lang[] = ['en', 'ko'];

/**
 * Return the full string table for a language. Unknown values fall back to the
 * default so a bad stored setting can never blank the UI.
 *
 * @example
 *   const s = t(lang);
 *   button.textContent = s.ui.exportCaptions;
 *   label.textContent = s.family[event.family];
 */
export function t(lang: Lang): Strings {
  return tables[lang] ?? tables[DEFAULT_LANG];
}

/**
 * Narrow an arbitrary string (e.g. from local storage or a query param) to a
 * supported `Lang`, falling back to the default. Keeps the stored-setting path
 * honest without scattering guards through the UI.
 */
export function asLang(value: string | null | undefined): Lang {
  return value === 'en' || value === 'ko' ? value : DEFAULT_LANG;
}
