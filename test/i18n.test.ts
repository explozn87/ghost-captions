import { describe, it, expect } from 'vitest';
import { t, asLang, tables, LANGS, DEFAULT_LANG, type Lang } from '../src/i18n/index.ts';
import { en } from '../src/i18n/en.ts';
import { ko } from '../src/i18n/ko.ts';
import type { Family, Side, Trend } from '../src/shared/types.ts';

// Task 7.1: the i18n tables cover every UI string, ghost label and export
// phrase, with identical keys across languages (Requirement 9.1, 9.2) and
// English as the default (Requirement 9.1). The type system already refuses a
// missing key (both tables are typed `Strings`); these tests are the runtime
// floor the steering asks for — key parity and no blank strings — plus the
// `t()`/`asLang` contract.

/**
 * Collect every leaf key path in a nested object of strings, e.g.
 * `ui.exportCaptions`, `family.footsteps`. Used to compare two language tables
 * structurally rather than trusting the shared type alone.
 */
function leafPaths(obj: unknown, prefix = ''): string[] {
  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>)
      .flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

/** The string value at a leaf path, for the no-blank-value check. */
function valueAt(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

describe('i18n key parity (task 7.1)', () => {
  it('en and ko expose the exact same leaf keys', () => {
    const enKeys = leafPaths(en).sort();
    const koKeys = leafPaths(ko).sort();
    expect(koKeys).toEqual(enKeys);
  });

  it('every leaf value is a non-empty string in both languages', () => {
    for (const table of [en, ko]) {
      for (const path of leafPaths(table)) {
        const v = valueAt(table, path);
        expect(typeof v, `${path} should be a string`).toBe('string');
        expect((v as string).length, `${path} should not be empty`).toBeGreaterThan(0);
      }
    }
  });

  it('covers every ghost family, side and trend used downstream', () => {
    const families: Family[] = [
      'footsteps', 'door', 'knock', 'scream', 'laughter', 'crying',
      'tenseMusic', 'calmMusic', 'singing', 'impact', 'gunshot',
      'vehicle', 'siren', 'animal', 'wind', 'rain', 'thunder',
      'fire', 'glass', 'unknown',
    ];
    const knownSides: Exclude<Side, 'centre-unknown'>[] = ['left', 'right'];
    const movingTrends: Exclude<Trend, 'steady'>[] = ['rising', 'falling'];
    for (const table of [en, ko]) {
      for (const f of families) expect(table.family[f]).toBeTruthy();
      for (const s of knownSides) expect(table.side[s]).toBeTruthy();
      for (const tr of movingTrends) expect(table.trend[tr]).toBeTruthy();
    }
  });
});

describe('i18n helpers (task 7.1)', () => {
  it('defaults to English', () => {
    expect(DEFAULT_LANG).toBe('en');
    expect(t(DEFAULT_LANG)).toBe(en);
  });

  it('t() returns the matching table for each offered language', () => {
    expect(t('en')).toBe(en);
    expect(t('ko')).toBe(ko);
    for (const lang of LANGS) {
      expect(tables[lang]).toBeDefined();
    }
  });

  it('asLang narrows known codes and falls back to the default otherwise', () => {
    expect(asLang('en')).toBe('en');
    expect(asLang('ko')).toBe('ko');
    expect(asLang('fr')).toBe(DEFAULT_LANG);
    expect(asLang(null)).toBe(DEFAULT_LANG);
    expect(asLang(undefined)).toBe(DEFAULT_LANG);
    expect(asLang('')).toBe(DEFAULT_LANG);
  });

  it('offers English first, then Korean', () => {
    expect(LANGS).toEqual<Lang[]>(['en', 'ko']);
  });
});
