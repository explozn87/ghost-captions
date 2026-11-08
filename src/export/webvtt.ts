// WebVTT export (task 6.1), a pure function over the finished EventTrack.
//
// `toWebVtt(track, lang)` turns the measured sound events into a standard
// WebVTT caption file with one cue per event, so a creator can publish the
// same richer non-speech captions on any platform (Requirement 8). It is a
// pure string builder with no DOM or Blob work (NFR-5); the download wrapper
// lives in the UI layer (task 9).
//
// Honesty rules baked in here (Requirements 8.1–8.3):
//   - speech events get NO cue (spoken words belong to ordinary captions);
//   - a direction phrase appears only when the side is known (left/right);
//   - we never print a guessed label: an `unknown` family is written as an
//     "unknown sound" cue, never as a made-up category name.
//
// The export's cue phrases are the shared i18n tables (task 7): one source of
// truth for every user-facing string (Requirement 9.2). This module keeps a
// small `phrases` view over those tables so the cue builder below depends only
// on the four fields it needs (family/side/trend/join) and the public API
// (`phrases`, `Lang`) stays stable.

import type { EventTrack } from '../shared/types.ts';
import { tables, type Lang as I18nLang, type Strings } from '../i18n/index.ts';

/** The languages the export supports, English default (Requirement 9.1). */
export type Lang = I18nLang;

/** The subset of a language table one cue needs. */
type Phrases = Pick<Strings, 'family' | 'side' | 'trend' | 'join'>;

/**
 * Export cue phrases, taken directly from the i18n tables so there is a single
 * source of truth across the UI, the overlay labels and the caption export.
 * Keys are identical across languages (the i18n key-parity test enforces it),
 * so a cue reads the same shape in either language.
 */
export const phrases: Record<Lang, Phrases> = {
  en: tables.en,
  ko: tables.ko,
};

/**
 * Format a time in seconds as WebVTT's `HH:MM:SS.mmm`. Negative times are
 * clamped to zero so a cue never carries an invalid timestamp.
 */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, seconds);
  const ms = Math.round(s * 1000);
  const hh = Math.floor(ms / 3_600_000);
  const mm = Math.floor((ms % 3_600_000) / 60_000);
  const ss = Math.floor((ms % 60_000) / 1000);
  const mmm = ms % 1000;
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}.${pad(mmm, 3)}`;
}

/**
 * Build the text inside one cue's brackets, e.g. `footsteps, from the left,
 * getting louder`. Only the known parts are included: a direction phrase
 * appears solely for a known side (Req 8.2) and a trend phrase solely when the
 * loudness clearly rose or fell (Req 5.4).
 */
function cueText(
  event: EventTrack['events'][number],
  p: Phrases,
): string {
  const parts: string[] = [p.family[event.family]];
  if (event.side === 'left' || event.side === 'right') {
    parts.push(p.side[event.side]);
  }
  if (event.trend === 'rising' || event.trend === 'falling') {
    parts.push(p.trend[event.trend]);
  }
  return `[${parts.join(p.join)}]`;
}

/**
 * Render a finished event track as a WebVTT file.
 *
 * One cue per non-speech event, in event order, with bracketed non-speech
 * caption text in the requested language. Speech events are skipped so the
 * file carries only what ordinary captions miss (Requirement 8.1). The result
 * is a plain string; the caller turns it into a download (Requirement 8.4).
 */
export function toWebVtt(track: EventTrack, lang: Lang): string {
  const p = phrases[lang];
  const blocks: string[] = ['WEBVTT'];

  // Keep the original event order; events are already sorted by start time in
  // the track, and skipping speech must not reorder anything (P5 checks that
  // cue times stay ordered).
  let index = 0;
  for (const event of track.events) {
    if (event.isSpeech) continue;
    index += 1;
    const start = formatTimestamp(event.start);
    const end = formatTimestamp(Math.max(event.end, event.start));
    blocks.push(`${index}\n${start} --> ${end}\n${cueText(event, p)}`);
  }

  // A trailing newline keeps the file POSIX-friendly and matches how most
  // WebVTT writers emit the last cue.
  return blocks.join('\n\n') + '\n';
}
