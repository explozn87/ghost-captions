import { describe, it, expect } from 'vitest';
import rawText from './fixtures/sintel.windows.txt?raw';
import windows from './fixtures/sintel.windows.json';
import { parseRecordedWindows, WINDOW_SECONDS } from './fixtures/recordedWindows.ts';
import type { ClassWindow } from '../src/shared/types.ts';

// Task 3.2: the committed JSON fixture must be exactly what the parser derives
// from the recorded raw text, so that example tests in task 5.4 run on honest
// classifier output and a stale fixture is caught here. The JSON is the source
// of truth for downstream tests; this test keeps it in step with the raw dump.

const typed = windows as ClassWindow[];

describe('sintel.windows.json fixture (task 3.2)', () => {
  it('equals the parser output on the recorded raw text', () => {
    const fromRaw = parseRecordedWindows(rawText);
    expect(typed).toEqual(fromRaw);
  });

  it('has one window per recorded line (54 windows)', () => {
    expect(typed).toHaveLength(54);
  });

  it('sets end = start + 0.975 for every window (design.md)', () => {
    for (const w of typed) {
      expect(w.end).toBeCloseTo(w.start + WINDOW_SECONDS, 6);
    }
  });

  it('keeps windows in start order', () => {
    for (let i = 1; i < typed.length; i++) {
      expect(typed[i]!.start).toBeGreaterThanOrEqual(typed[i - 1]!.start);
    }
  });

  it('records empty categories for "-" lines and keeps scores otherwise', () => {
    const empties = typed.filter((w) => w.categories.length === 0);
    // Lines 1.0, 22.4 and 34.1 were "-" in the raw dump.
    expect(empties).toHaveLength(3);
    for (const w of typed) {
      for (const c of w.categories) {
        expect(c.score).toBeGreaterThan(0);
        expect(c.score).toBeLessThanOrEqual(1);
        expect(c.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps a category name that itself contains a comma', () => {
    const w = typed.find((x) => x.start === 8.8);
    expect(w?.categories.map((c) => c.name)).toContain('Gunshot, gunfire');
  });

  it('contains the speech windows so speech handling can be exercised', () => {
    const hasSpeech = typed.some((w) => w.categories.some((c) => c.name === 'Speech'));
    expect(hasSpeech).toBe(true);
  });

  it('contains only category names and scores (no audio payload)', () => {
    for (const w of typed) {
      expect(Object.keys(w).sort()).toEqual(['categories', 'end', 'start']);
      for (const c of w.categories) {
        expect(Object.keys(c).sort()).toEqual(['name', 'score']);
      }
    }
  });
});
