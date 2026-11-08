// Overlay layout (task 8.1), a pure function from events + time to sprites.
//
// `layout(events, t, viewport, settings)` turns the sound events active at the
// current playback time into the `GhostSprite[]` the canvas renderer draws
// (`draw.ts`, task 8.2). It is pure — no DOM, no canvas, no clock — so every
// positioning rule is covered by tests, including property P6 (a sprite is
// never placed in the bottom caption band).
//
// What each measured quantity maps to (Requirement 6.2):
//   - side            → horizontal band: left 15–30 %, centre 40–60 %,
//                        right 70–85 % of the viewport width;
//   - a travelling    → x interpolates the event's sideTrack across its
//     sound              duration so the ghost drifts across the bands;
//   - loudness        → ghost scale (louder is bigger);
//   - ominousness     → fog density 0..1;
//   - beat            → tremble frequency in Hz (0 when no beat);
//   - rising/falling  → scale grows/shrinks over the event (approach/recede).
//
// Honesty and accessibility rules baked in here:
//   - every sprite carries a text label built from the i18n phrases, with a
//     direction word only for a known side (Req 6.4, 8.2);
//   - sprites stay out of the bottom caption band so ordinary subtitles are
//     never covered (Req 6.5, property P6);
//   - the tremble frequency is capped below 3 Hz so no effect can flash more
//     than three times per second (Req 10.3); `draw()` honours the cap, and
//     layout never emits a higher value;
//   - reduced motion removes tremble and travel (the ghost sits at its mean
//     position) but keeps position band, size, fog level and label (Req 6.6).

import type { GhostSprite, Side, SoundEvent } from '../shared/types.ts';
import { tables, type Lang, type Strings } from '../i18n/index.ts';
import { soundNoun } from '../i18n/soundLabel.ts';

/** The drawable area the overlay covers, in CSS pixels. */
export interface Viewport {
  width: number;
  height: number;
}

/** User/OS display preferences the layout must honour (Requirements 6.6, 6.7). */
export interface OverlaySettings {
  lang: Lang;
  /** Remove drift, tremble and animated fog; keep all information (Req 6.6). */
  reducedMotion: boolean;
  /** Global ghost-size multiplier from the size control (Req 6.7). */
  sizeScale: number;
  /** Families the user has muted; their sprites are omitted (Req 6.7). */
  mutedFamilies: ReadonlySet<SoundEvent['family']>;
}

/**
 * Fraction of the viewport height reserved at the bottom for ordinary
 * subtitles. Ghost centres stay above `1 - CAPTION_BAND`, and their drawn
 * radius is accounted for so even a large ghost cannot reach into the band
 * (Req 6.5, property P6).
 */
export const CAPTION_BAND = 0.18;

/**
 * Upper fraction of the viewport ghosts live in (design.md: upper 70 %). The
 * vertical slot is chosen inside `[Y_MIN, yMaxForRadius]` so tall ghosts still
 * clear the caption band.
 */
const Y_MIN = 0.1;

/** Horizontal band centres as a fraction of width, per side (design.md). */
const BAND_CENTRE: Record<Side, number> = {
  left: 0.225, // middle of 15–30 %
  'centre-unknown': 0.5, // middle of 40–60 %
  right: 0.775, // middle of 70–85 %
};

/**
 * Base ghost radius as a fraction of the smaller viewport dimension, before
 * the loudness/size multipliers. Picked so a mid-loudness ghost reads clearly
 * without crowding at `maxOnScreen` (NFR-1).
 */
const BASE_RADIUS = 0.08;

/** Loudness maps scale across this range: quiet sounds are smaller, not gone. */
const MIN_LOUD_SCALE = 0.6;
const MAX_LOUD_SCALE = 1.4;

/** How much `rising`/`falling` grows/shrinks scale across the event. */
const TREND_SCALE_SWING = 0.25;

/**
 * Hard cap on tremble frequency (Hz). WCAG 2.3.1 forbids more than three
 * flashes per second; we cap at 2.5 Hz so even with the draw-time phase there
 * is margin below three (Req 10.3).
 */
export const MAX_TREMBLE_HZ = 2.5;

/** Clamp a number into [lo, hi]. */
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * The horizontal position (0..1 of width) for an event at time `t`. A
 * travelling sound interpolates its `sideTrack` so the ghost drifts between
 * bands; under reduced motion it sits at the mean of the track instead of
 * moving (Req 4.5, 6.6).
 */
function trackedX(event: SoundEvent, t: number, reducedMotion: boolean): number {
  const track = event.sideTrack;
  if (track.length === 0) return BAND_CENTRE[event.side];

  if (reducedMotion) {
    // Mean band over the whole track: a steady position that still reflects
    // where the sound mostly sat, with no motion.
    const sum = track.reduce((s, p) => s + BAND_CENTRE[p.side], 0);
    return sum / track.length;
  }

  // Find the surrounding samples and linearly interpolate their band centres.
  if (t <= track[0]!.t) return BAND_CENTRE[track[0]!.side];
  const last = track[track.length - 1]!;
  if (t >= last.t) return BAND_CENTRE[last.side];
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1]!;
    const b = track[i]!;
    if (t <= b.t) {
      const span = b.t - a.t;
      const frac = span > 0 ? (t - a.t) / span : 0;
      const xa = BAND_CENTRE[a.side];
      const xb = BAND_CENTRE[b.side];
      return xa + (xb - xa) * frac;
    }
  }
  return BAND_CENTRE[event.side];
}

/**
 * Scale from loudness and trend. Loudness sets the base size; a rising event
 * grows toward its end (approaching), a falling one shrinks (receding). Under
 * reduced motion the trend swing is dropped so the ghost does not move, but
 * the loudness size is kept (Req 6.2, 6.6).
 */
function scaleFor(event: SoundEvent, t: number, reducedMotion: boolean): number {
  const base = MIN_LOUD_SCALE + event.loudness * (MAX_LOUD_SCALE - MIN_LOUD_SCALE);
  if (reducedMotion || event.trend === 'steady') return base;

  const span = event.end - event.start;
  const progress = span > 0 ? clamp((t - event.start) / span, 0, 1) : 1;
  // progress 0..1; centre the swing around the base so the mean size still
  // reflects loudness. rising: -swing/2 → +swing/2; falling: the reverse.
  const dir = event.trend === 'rising' ? 1 : -1;
  const swing = (progress - 0.5) * TREND_SCALE_SWING * dir;
  return base * (1 + swing);
}

/**
 * Build the label text for a sprite from the i18n phrases: the sound noun
 * (the specific classifier label when confident, else the family word — see
 * `soundNoun`, task 15.1), plus a direction word only for a known side, plus a
 * trend word when the loudness clearly rose or fell (Req 6.4). Uses the same
 * tables and resolver as the caption export so overlay and export never
 * disagree (Req 9.2). `lang` defaults to English so callers holding only a
 * `Strings` table keep working.
 */
export function spriteLabel(event: SoundEvent, s: Strings, lang: Lang = 'en'): string {
  const parts: string[] = [soundNoun(event, s, lang)];
  if (event.side === 'left' || event.side === 'right') {
    parts.push(s.side[event.side]);
  }
  if (event.trend === 'rising' || event.trend === 'falling') {
    parts.push(s.trend[event.trend]);
  }
  return parts.join(s.join);
}

/**
 * Lay out the ghosts for the events active at time `t`.
 *
 * Pure: given the same events, time, viewport and settings it always returns
 * the same sprites. Speech events are skipped (they are shown as a small
 * marker by the UI, never a ghost — Req 3.2); muted families are omitted
 * (Req 6.7). Each surviving event becomes one sprite positioned by side,
 * sized by loudness and trend, fogged by ominousness and trembling on its
 * beat, with a text label and a vertical slot that clears the caption band.
 */
export function layout(
  events: readonly SoundEvent[],
  t: number,
  viewport: Viewport,
  settings: OverlaySettings,
): GhostSprite[] {
  const s = tables[settings.lang] ?? tables.en;
  const minDim = Math.min(viewport.width, viewport.height);
  const sprites: GhostSprite[] = [];

  // Deterministic vertical stacking: spread active ghosts over the usable
  // band by their index so two simultaneous ghosts do not sit exactly on top
  // of each other. The order is the event order from `activeEvents`.
  const drawable = events.filter((e) => !e.isSpeech && !settings.mutedFamilies.has(e.family));

  drawable.forEach((event, i) => {
    const scale = scaleFor(event, t, settings.reducedMotion) * settings.sizeScale;
    // Radius as a fraction of viewport height, used to keep the sprite clear
    // of the caption band regardless of size.
    const radiusFracH = minDim > 0 ? (BASE_RADIUS * scale * minDim) / viewport.height : 0;

    // Vertical slot: spread across [Y_MIN, yMax] where yMax leaves room for the
    // sprite's own radius above the caption band. With one ghost it sits near
    // the top third; more ghosts fan downward but never into the band.
    const yMax = 1 - CAPTION_BAND - radiusFracH;
    const slots = Math.max(1, drawable.length);
    const frac = slots > 1 ? i / (slots - 1) : 0;
    const yHigh = Math.max(Y_MIN, yMax); // guard tiny viewports
    const y = clamp(Y_MIN + frac * (yHigh - Y_MIN), Y_MIN, yHigh);

    const x = clamp(trackedX(event, t, settings.reducedMotion), 0, 1);

    const trembleHz =
      settings.reducedMotion || event.beatPeriod == null || event.beatPeriod <= 0
        ? 0
        : clamp(1 / event.beatPeriod, 0, MAX_TREMBLE_HZ);

    sprites.push({
      family: event.family,
      x,
      y,
      scale,
      fog: clamp(event.ominous, 0, 1),
      trembleHz,
      opacity: 1,
      label: spriteLabel(event, s, settings.lang),
    });
  });

  return sprites;
}
