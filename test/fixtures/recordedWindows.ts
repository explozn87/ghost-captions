// Parser for the recorded raw classifier output (task 3.2).
//
// `sintel.windows.txt` is the raw dump from the 2026-11-08 browser run
// (MediaPipe tasks-audio + yamnet.tflite). This turns it into the typed
// `ClassWindow[]` the pipeline consumes, so example tests in task 5.4 can run
// `buildEvents` on real classifier output. The committed JSON fixture is the
// output of this function; the fixture test asserts the two stay in step.
//
// Format of each data line: "<start> <cat:score>, <cat:score>, ..." where a
// lone "-" means nothing cleared the classifier's score threshold. Comment
// lines start with "#". `end` is `start + WINDOW_SECONDS` per design.md.

import type { ClassWindow } from '../../src/shared/types.ts';

/** YAMNet window length in seconds (design.md: end = start + 0.975). */
export const WINDOW_SECONDS = 0.975;

/** Round to avoid binary-float noise in the emitted JSON. */
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * Parse the raw recorded text into `ClassWindow[]`. Comment and blank lines are
 * skipped; a window whose only token is "-" has an empty `categories` array.
 */
export function parseRecordedWindows(text: string): ClassWindow[] {
  const windows: ClassWindow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const firstSpace = line.indexOf(' ');
    const startStr = firstSpace === -1 ? line : line.slice(0, firstSpace);
    const rest = firstSpace === -1 ? '' : line.slice(firstSpace + 1).trim();

    const start = Number(startStr);
    if (!Number.isFinite(start)) {
      throw new Error(`unparseable window start: "${rawLine}"`);
    }

    const categories: { name: string; score: number }[] = [];
    if (rest !== '' && rest !== '-') {
      // A category is "<name>:<score>", joined by ", ". The name itself may
      // contain commas (e.g. "Gunshot, gunfire"), so a naive split on comma is
      // wrong. Instead scan for each "name:score" pair, where score is the only
      // numeric-after-colon token; the name runs up to that score.
      const pattern = /([^:]+?):(\d*\.?\d+)(?:,\s*|$)/g;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(rest)) !== null) {
        const name = m[1]!.replace(/^,\s*/, '').trim();
        const score = Number(m[2]);
        if (!Number.isFinite(score)) {
          throw new Error(`unparseable score in "${m[0]}" (line "${rawLine}")`);
        }
        categories.push({ name, score });
      }
      if (categories.length === 0) {
        throw new Error(`no categories parsed from "${rest}" (line "${rawLine}")`);
      }
    }

    windows.push({ start: round3(start), end: round3(start + WINDOW_SECONDS), categories });
  }
  return windows;
}
