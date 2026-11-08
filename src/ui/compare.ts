// The "Compare" playback on an end-card evidence row (task 25.5).
//
// Each evidence row offers a Compare button that plays the few seconds around
// that occurrence TWICE: first with the sound overlay hidden ("Captions only"),
// then with the overlay shown ("With Ghost Captions"), then returns to the end
// card. This file holds the state machine as a PURE function of elapsed time so
// the sequence is fully tested without a video element or a clock; the Player
// just reads the current phase each tick and sets the overlay alpha target and
// the chip accordingly.
//
// It deliberately reuses the existing show-when overlay fade (the Player's
// `overlayAlpha`) rather than adding a new rendering path: a compare phase only
// decides the overlay-visible target and the playback window; `draw` fades to
// it exactly as it does for mute/unmute (task 21.1).

/** How many seconds around the occurrence each pass plays (task 25.5). */
export const COMPARE_WINDOW_SEC = 3;

/** The phase of a compare run at a given elapsed time. */
export type ComparePhase = 'captionsOnly' | 'withGhosts' | 'done';

/** The full plan for a compare run, derived from the occurrence start. */
export interface ComparePlan {
  /** Playback start time (seconds) for both passes. */
  from: number;
  /** Playback end time (seconds) for both passes. */
  to: number;
  /** Length of one pass in seconds (`to - from`). */
  passSec: number;
}

/**
 * The playback window for comparing an occurrence (task 25.5): the few seconds
 * around its start. Clamped so `from` is never negative. The window begins a
 * little before the occurrence so the viewer hears the lead-in, matching the
 * row-click seek (which goes 0.5 s before).
 */
export function comparePlan(occurrenceStart: number, windowSec = COMPARE_WINDOW_SEC): ComparePlan {
  const lead = 0.5;
  const from = Math.max(0, occurrenceStart - lead);
  const to = from + windowSec;
  return { from, to, passSec: windowSec };
}

/**
 * The compare phase at `elapsed` seconds since the run began (task 25.5): the
 * first `passSec` seconds are the captions-only pass, the next `passSec` are
 * the with-ghosts pass, and anything after is `done` (return to the end card).
 * Pure and total over any finite elapsed time.
 */
export function comparePhaseAt(elapsed: number, plan: ComparePlan): ComparePhase {
  if (elapsed < 0) return 'captionsOnly';
  if (elapsed < plan.passSec) return 'captionsOnly';
  if (elapsed < plan.passSec * 2) return 'withGhosts';
  return 'done';
}

/**
 * The playback time to seek to for a given elapsed time within a compare run
 * (task 25.5): both passes replay the same window, so the time wraps back to
 * `from` at the start of the second pass. Returns the window start once the run
 * is done.
 */
export function comparePlaybackTime(elapsed: number, plan: ComparePlan): number {
  const phase = comparePhaseAt(elapsed, plan);
  if (phase === 'done') return plan.from;
  const within = phase === 'captionsOnly' ? elapsed : elapsed - plan.passSec;
  return plan.from + Math.max(0, within);
}

/** Whether the sound overlay should be shown in a given compare phase (task 25.5). */
export function compareOverlayVisible(phase: ComparePhase): boolean {
  return phase === 'withGhosts';
}
