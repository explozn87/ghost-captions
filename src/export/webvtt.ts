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

import type { DialogueCue, EventTrack, Family } from '../shared/types.ts';
import { tables, type Lang as I18nLang, type Strings } from '../i18n/index.ts';
import { occurrenceNoun, soundNoun } from '../i18n/soundLabel.ts';
import {
  occurrences,
  occurrenceShownEnd,
  type Occurrence,
} from '../events/occurrences.ts';
import { ghostConfig, type GhostConfig } from '../config/ghost.config.ts';

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
 * getting louder`. The noun is the specific classifier label when confident,
 * else the family word (`soundNoun`, task 15.1); an `unknown` event is never
 * named with a guessed label. Only the known parts are included: a direction
 * phrase appears solely for a known side (Req 8.2) and a trend phrase solely
 * when the loudness clearly rose or fell (Req 5.4).
 */
function cueText(
  event: EventTrack['events'][number],
  s: Strings,
  lang: Lang,
): string {
  const parts: string[] = [soundNoun(event, s, lang)];
  if (event.side === 'left' || event.side === 'right') {
    parts.push(s.side[event.side]);
  }
  if (event.trend === 'rising' || event.trend === 'falling') {
    parts.push(s.trend[event.trend]);
  }
  return `[${parts.join(s.join)}]`;
}

/**
 * Render a finished event track as a WebVTT file.
 *
 * One cue per non-speech event, in event order, with bracketed non-speech
 * caption text in the requested language. Speech events are skipped so the
 * file carries only what ordinary captions miss (Requirement 8.1). The result
 * is a plain string; the caller turns it into a download (Requirement 8.4).
 *
 * When the viewer has loaded a dialogue subtitle file (task 19.4), pass its
 * cues as `dialogue`: the dialogue cues (verbatim, no brackets) are merged
 * with the sound cues (bracketed, as above) in time order, so a creator gets
 * one complete SDH-style file with both the spoken words and the sounds.
 */
export function toWebVtt(
  track: EventTrack,
  lang: Lang,
  dialogue: readonly DialogueCue[] = [],
): string {
  const s = tables[lang] ?? tables.en;
  const blocks: string[] = ['WEBVTT'];

  // Collect every cue (sound + dialogue) with a start, end and text, then emit
  // them in time order. Sound cues come from non-speech events only; dialogue
  // cues are the spoken words verbatim. A stable secondary sort on end time,
  // then source (sound before dialogue), keeps the output deterministic so the
  // property test can assert ordering (P5).
  interface Row { start: number; end: number; text: string; kind: 0 | 1; seq: number }
  const rows: Row[] = [];

  for (const event of track.events) {
    if (event.isSpeech) continue;
    rows.push({
      start: event.start,
      end: Math.max(event.end, event.start),
      text: cueText(event, s, lang),
      kind: 0, // sound
      seq: rows.length,
    });
  }
  for (const cue of dialogue) {
    rows.push({
      start: cue.start,
      end: Math.max(cue.end, cue.start),
      text: cue.text,
      kind: 1, // dialogue
      seq: rows.length,
    });
  }

  // Sort by start, then source kind (sound before dialogue), then the original
  // insertion order. We deliberately do NOT break ties on `end`: two sound
  // events that share a start but differ in duration must keep the order the
  // start-sorted event track produced them in, so each emitted cue still lines
  // up with its source event and its direction phrase (P5). Sorting on `end`
  // would reorder such a pair and misalign the direction phrases. The `kind`
  // key keeps a sound cue before a dialogue cue at the same instant, and the
  // final `seq` tiebreaker preserves insertion order for everything else, so
  // the output stays deterministic.
  rows.sort(
    (a, b) => a.start - b.start || a.kind - b.kind || a.seq - b.seq,
  );

  let index = 0;
  for (const row of rows) {
    index += 1;
    const start = formatTimestamp(row.start);
    const end = formatTimestamp(row.end);
    blocks.push(`${index}\n${start} --> ${end}\n${row.text}`);
  }

  // A trailing newline keeps the file POSIX-friendly and matches how most
  // WebVTT writers emit the last cue.
  return blocks.join('\n\n') + '\n';
}


/**
 * Render the SHOWN sound occurrences as a WebVTT file so the download says
 * exactly what the screen said (task 33.1).
 *
 * The old `toWebVtt` iterates every raw event over the whole file. On a trimmed
 * demo (one with an `endAt`, task 25.6) that gave a .vtt covering the full clip
 * — music past the trim point, a different number of cues than the end card's
 * evidence list. This builder uses the SAME source the end card uses:
 *
 *   - `occurrences(track.events, settings)` folds the shown events into one cue
 *     per perceived sound (so music is not split into three), with the same
 *     `isShownEvent` filter (no speech, no hidden family);
 *   - when the clip has an `endAt`, only occurrences that START before it are
 *     exported, and each cue ends at `occurrenceShownEnd(occ, effectiveEnd)` so
 *     a span running past the trim point ends at the trim point — exactly as
 *     the evidence row's listed span does;
 *   - each cue's bracketed text is `occurrenceNoun(occ, …)` — the family label
 *     plus the direction phrase when the side is known — the identical phrase
 *     the end-card row prints, in the requested language (Req 8.3). An unknown
 *     occurrence is never given a guessed label (Req 8.2); its family word is
 *     used, as on screen.
 *
 * Dialogue cues (task 19.4) are merged in time order as before, but clipped to
 * the effective end too (`endAt` with no dialogue after the trim point). A cue
 * whose own span starts at or after the effective end is dropped; one that
 * overruns it is clamped, so the exported file and a trimmed demo agree.
 *
 * With no `endAt` the export covers the whole file as before (the effective end
 * is the track duration), still built from the shown occurrences rather than
 * raw events. Pure: no DOM or Blob work (NFR-5); the caller downloads it.
 */
export function toWebVttFromOccurrences(
  track: EventTrack,
  lang: Lang,
  options: {
    settings: { mutedFamilies: ReadonlySet<Family> };
    /** Short-demo end point (task 25.6); omit for a user file (whole clip). */
    endAt?: number | undefined;
    /** Dialogue cues to merge, verbatim (task 19.4). */
    dialogue?: readonly DialogueCue[];
    cfg?: GhostConfig;
  },
): string {
  const s = tables[lang] ?? tables.en;
  const cfg = options.cfg ?? ghostConfig;
  const dialogue = options.dialogue ?? [];
  // The effective end mirrors the Player (task 25.6): a short demo ends at its
  // `endAt`, capped to the real duration; a user file runs to the full length.
  const effectiveEnd =
    options.endAt != null ? Math.min(options.endAt, track.duration) : track.duration;

  interface Row { start: number; end: number; text: string; kind: 0 | 1; seq: number }
  const rows: Row[] = [];

  // Sound cues: one per shown occurrence that STARTS before the effective end,
  // ending where the occurrence is last shown (task 29.4 / 33.1), labelled with
  // the end-card phrase.
  const occs: Occurrence[] = occurrences(track.events, options.settings, cfg).filter(
    (occ) => occ.start < effectiveEnd,
  );
  for (const occ of occs) {
    const end = occurrenceShownEnd(occ, effectiveEnd);
    rows.push({
      start: occ.start,
      end: Math.max(end, occ.start),
      text: `[${occurrenceNoun(occ, s, lang, cfg)}]`,
      kind: 0,
      seq: rows.length,
    });
  }

  // Dialogue cues, clipped to the effective end (task 33.1): a cue starting at
  // or after the trim point is dropped, one overrunning it is clamped.
  for (const cue of dialogue) {
    if (cue.start >= effectiveEnd) continue;
    rows.push({
      start: cue.start,
      end: Math.min(Math.max(cue.end, cue.start), effectiveEnd),
      text: cue.text,
      kind: 1,
      seq: rows.length,
    });
  }

  rows.sort((a, b) => a.start - b.start || a.kind - b.kind || a.seq - b.seq);

  const blocks: string[] = ['WEBVTT'];
  let index = 0;
  for (const row of rows) {
    index += 1;
    const start = formatTimestamp(row.start);
    const end = formatTimestamp(row.end);
    blocks.push(`${index}\n${start} --> ${end}\n${row.text}`);
  }
  return blocks.join('\n\n') + '\n';
}
