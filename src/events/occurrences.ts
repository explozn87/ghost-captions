// Group shown sound events into sound OCCURRENCES (task 23.1, 23.2).
//
// The "sounds the captions missed" counter, the "+1" flash and the end card
// must count what a viewer perceives as one sound, not the raw events the
// pipeline produced. The Sintel demo counted music three times and stacked two
// "Music" plates at 13 s because `buildEvents` split a long cue on
// loudness-trend changes. An occurrence folds those touching fragments into one
// count:
//
//   - events of the same GROUP (all music families — tenseMusic, calmMusic,
//     singing — count as one group, "music"; every other family is its own
//     group) that overlap or are separated by less than `occurrenceGapSec`
//     form one occurrence;
//   - a change of loudness trend inside an occurrence updates its label but is
//     NOT a new occurrence (it is already the same family, so the grouping
//     folds it in);
//   - splitting one event into touching pieces never changes the count
//     (property, task 23.1).
//
// Honest definition of "missed" (task 23.2): when a subtitle file is loaded, an
// occurrence is NOT counted if a subtitle cue overlapping it already describes a
// sound — text in square brackets (`[door creaks]`) or a music cue (a ♪/♫
// line). So the count is always "sounds the captions you have did not already
// describe".
//
// Pure: it reads only the events, the settings and (for the honest count) the
// dialogue cues, so the counter chip, the end card and its evidence list are
// all driven by tested functions rather than ad-hoc counting in the component.

import type { DialogueCue, Family, SoundEvent } from '../shared/types.ts';
import { ghostConfig, type GhostConfig } from '../config/ghost.config.ts';

/**
 * The music families that count as one group for occurrence grouping. Choir and
 * singing are deliberately NOT here (task 25.1): a sung/choir sound is drawn as
 * its own ghost (`singing` is a point family), so folding it into "music" hid a
 * ghost that was on screen from the evidence list. Only the two instrumental
 * music families share the "music" group.
 */
const MUSIC_FAMILIES: ReadonlySet<Family> = new Set<Family>(['tenseMusic', 'calmMusic']);

/**
 * The grouping key for a family (task 23.1): all music families share the
 * single key `'music'`; every other family is its own key. Two events with the
 * same group key and close enough in time fold into one occurrence.
 */
export function groupKey(family: Family): string {
  return MUSIC_FAMILIES.has(family) ? 'music' : family;
}

/**
 * One perceived sound (task 23.1): a run of same-group shown events folded
 * together. The occurrence carries the span it covers, the family and label of
 * its loudest moment (so a trend change updates the label, never the count),
 * and the side of that loudest moment (for the evidence row, task 23.3).
 */
export interface Occurrence {
  /** The grouping key (family, or `'music'`). */
  group: string;
  /** Start of the earliest event in the occurrence. */
  start: number;
  /** End of the latest event in the occurrence. */
  end: number;
  /** The family of the loudest event in the occurrence (names its sprite/label). */
  family: SoundEvent['family'];
  /** The loudest event's specific label, if any (task 23.1 — one label per occurrence). */
  topLabel: string | null;
  labelScore: number;
  /** The loudest event's side (for the evidence row direction phrase). */
  side: SoundEvent['side'];
  /** The loudest event's loudness, so callers can rank occurrences. */
  loudness: number;
  /** The loudest event's trend (its label may say "getting louder"). */
  trend: SoundEvent['trend'];
  /** The events folded into this occurrence, in time order. */
  events: SoundEvent[];
}

/**
 * Whether an event counts as "shown" to the viewer (task 23.1), matching the
 * overlay and the old `missedCount`:
 *   - speech is excluded (spoken words belong to ordinary captions, Req 3.2);
 *   - a family the viewer has hidden ("Hide sound types") is excluded;
 *   - unknown events the unknown rule dropped never reach the track, so no
 *     extra check is needed here.
 */
export function isShownEvent(
  event: SoundEvent,
  mutedFamilies: ReadonlySet<Family>,
): boolean {
  if (event.isSpeech) return false;
  if (mutedFamilies.has(event.family)) return false;
  return true;
}

/**
 * Group the SHOWN events into sound occurrences (task 23.1). Events are first
 * filtered to the shown set, then grouped per group key: within a group, events
 * sorted by start are folded together while the next event overlaps the running
 * occurrence or starts within `occurrenceGapSec` of its current end. The
 * occurrence's family/label/side/trend come from its loudest event, so only one
 * label per occurrence is ever on screen (never two stacked "Music" plates).
 *
 * The returned occurrences are sorted by start time.
 */
export function occurrences(
  events: readonly SoundEvent[],
  settings: { mutedFamilies: ReadonlySet<Family> },
  cfg: GhostConfig = ghostConfig,
): Occurrence[] {
  const gap = cfg.occurrenceGapSec.value;
  const shown = events.filter((e) => isShownEvent(e, settings.mutedFamilies));

  // Bucket by group key, each bucket sorted by start then end.
  const byGroup = new Map<string, SoundEvent[]>();
  for (const e of shown) {
    const key = groupKey(e.family);
    const list = byGroup.get(key);
    if (list) list.push(e);
    else byGroup.set(key, [e]);
  }

  const out: Occurrence[] = [];
  for (const [group, list] of byGroup) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    let current: SoundEvent[] = [];
    let currentEnd = -Infinity;
    const flush = () => {
      if (current.length > 0) out.push(makeOccurrence(group, current));
      current = [];
      currentEnd = -Infinity;
    };
    for (const e of list) {
      if (current.length === 0) {
        current.push(e);
        currentEnd = e.end;
        continue;
      }
      // Fold in when the event overlaps or starts within the gap of the
      // running occurrence's current end.
      if (e.start - currentEnd < gap) {
        current.push(e);
        currentEnd = Math.max(currentEnd, e.end);
      } else {
        flush();
        current.push(e);
        currentEnd = e.end;
      }
    }
    flush();
  }

  out.sort((a, b) => a.start - b.start || a.end - b.end);
  return out;
}

/** Build one occurrence from a run of same-group events (its loudest names it). */
function makeOccurrence(group: string, events: SoundEvent[]): Occurrence {
  let start = Infinity;
  let end = -Infinity;
  let loudest = events[0]!;
  for (const e of events) {
    if (e.start < start) start = e.start;
    if (e.end > end) end = e.end;
    if (e.loudness > loudest.loudness) loudest = e;
  }
  return {
    group,
    start,
    end,
    family: loudest.family,
    topLabel: loudest.topLabel,
    labelScore: loudest.labelScore,
    side: loudest.side,
    loudness: loudest.loudness,
    trend: loudest.trend,
    events: events.slice(),
  };
}

/**
 * Whether a subtitle cue already DESCRIBES a sound (task 23.2): its text is in
 * square brackets (SDH style, `[door creaks]`) or it is a music cue (a line
 * with a ♪ or ♫). Only such cues suppress a sound occurrence from the count; an
 * ordinary spoken-word cue does not, because it describes speech, not the sound
 * a ghost carries.
 */
export function cueDescribesSound(cue: DialogueCue): boolean {
  const text = cue.text;
  if (/[♪♫]/.test(text)) return true;
  // Any bracketed run like [door creaks] or (gunshot) — SDH non-speech cues.
  if (/\[[^\]]+\]/.test(text)) return true;
  if (/\([^)]+\)/.test(text)) return true;
  return false;
}

/**
 * Whether an occurrence is COUNTED as missed (task 23.2). Without a subtitle
 * file every shown occurrence is counted. With a file, an occurrence is not
 * counted when a cue that overlaps it already describes a sound — the captions
 * the viewer loaded already cover it, so it was not "missed".
 */
export function occurrenceIsMissed(
  occ: Occurrence,
  dialogue: readonly DialogueCue[],
): boolean {
  if (dialogue.length === 0) return true;
  for (const cue of dialogue) {
    if (!cueDescribesSound(cue)) continue;
    // Overlap test: the cue and the occurrence share any time.
    if (cue.start < occ.end && occ.start < cue.end) return false;
  }
  return true;
}

/**
 * The occurrences that count as missed up to and including time `t` (task 23.1,
 * 23.2): shown, grouped into occurrences, each honest-checked against the
 * loaded dialogue, and whose start is at or before `t`. The counter, the "+1"
 * flash, the end card and its evidence list all read this one function so they
 * can never disagree.
 */
export function missedOccurrences(
  events: readonly SoundEvent[],
  t: number,
  settings: { mutedFamilies: ReadonlySet<Family> },
  dialogue: readonly DialogueCue[] = [],
  cfg: GhostConfig = ghostConfig,
): Occurrence[] {
  return occurrences(events, settings, cfg).filter(
    (occ) => occ.start <= t && occurrenceIsMissed(occ, dialogue),
  );
}

/**
 * Whether the count is measured against dialogue-only captions or a loaded
 * subtitle file (task 23.2), so the end card can state the basis of its number.
 */
export function missedBasis(dialogue: readonly DialogueCue[]): 'dialogueOnly' | 'withFile' {
  return dialogue.length > 0 ? 'withFile' : 'dialogueOnly';
}

/**
 * The last moment an occurrence is actually SHOWN on the overlay, clamped to a
 * clip's effective end (task 29.4). The end card's listed span and the picture
 * must agree: the overlay draws an occurrence only while one of its member
 * events (whose own start is at or before the effective end) is running, so a
 * trailing fragment that STARTS after the effective end must never extend the
 * listed span. Returns the largest member-event `end` among members that start
 * at or before `effectiveEnd`, capped at `effectiveEnd`. Pure, so the end card
 * and its tests share one definition.
 */
export function occurrenceShownEnd(occ: Occurrence, effectiveEnd: number): number {
  let shownEnd = occ.start;
  for (const e of occ.events) {
    if (e.start > effectiveEnd) continue;
    if (e.end > shownEnd) shownEnd = e.end;
  }
  return Math.min(shownEnd, effectiveEnd);
}

/** A time in seconds as `M:SS`, rounded to the nearest second (task 25.1). */
function clockRounded(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

/**
 * The time prefix for an end-card evidence row (task 25.1): a SPAN
 * ("0:10–0:52") when the occurrence lasts `evidenceSpanMinSec` or more, else
 * just its start ("0:09"). Times are rounded to the nearest second of the first
 * moment the sound is shown, not floored, so a sound at 9.6 s reads "0:10"
 * rather than "0:09". Pure, so the end card and its tests share one function.
 */
export function occurrenceTimeLabel(
  occ: Pick<Occurrence, 'start' | 'end'>,
  cfg: GhostConfig = ghostConfig,
): string {
  const span = occ.end - occ.start;
  const start = clockRounded(occ.start);
  if (span >= cfg.evidenceSpanMinSec.value) {
    return `${start}\u2013${clockRounded(occ.end)}`;
  }
  return start;
}
