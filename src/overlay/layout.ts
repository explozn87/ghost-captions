// Overlay layout (task 8.1, extended in task 16.3–16.4), pure functions from
// events + time to drawable shapes.
//
// `layout(events, t, viewport, settings)` turns the POINT sound events active
// at the current playback time into `GhostSprite[]` the canvas renderer draws
// (`draw.ts`). `edgeFogs(events, t, viewport, settings)` turns AMBIENT events
// (wind, rain, thunder, tense/calm music — see `isAmbientFamily`) into
// `EdgeFog[]`, a vignette from the screen edges rather than a ghost (task
// 16.3). Both are pure — no DOM, no canvas, no clock — so every rule is
// covered by tests, including property P6 (a sprite is never placed in the
// bottom caption band).
//
// What each measured quantity maps to (Requirement 6.2):
//   - side            → horizontal band for a point ghost; which edge an
//                        ambient fog covers;
//   - a travelling    → x interpolates the event's sideTrack across its
//     sound              duration so the ghost drifts between bands;
//   - loudness        → ghost scale, and ambient fog strength;
//   - ominousness     → fog density 0..1, and ambient fog strength;
//   - beat            → tremble frequency in Hz (0 when no beat);
//   - rising/falling  → scale grows/shrinks over the event (approach/recede).
//
// Point-ghost arrival/withdrawal (task 16.4):
//   - a point ghost with a KNOWN side enters from that screen edge (emerging
//     from the fog band) at the event start and withdraws back out at the end;
//   - a `centre-unknown` point ghost fades in place in the upper area, never
//     covering the centre-bottom caption band.
//
// Honesty and accessibility rules baked in here:
//   - every sprite/fog carries a text label with a direction word only for a
//     known side (Req 6.4, 8.2);
//   - sprites stay out of the bottom caption band (Req 6.5, property P6);
//   - edge fog never covers the central 60% of the frame and never exceeds the
//     configured max opacity (Req 6.5, task 16.3);
//   - tremble frequency is capped below 3 Hz so nothing flashes > 3 Hz
//     (Req 10.3); layout never emits a higher value;
//   - reduced motion removes tremble, travel and enter/withdraw motion but
//     keeps position band, size, fog level and label (Req 6.6).

import type { EdgeFog, FogEdge, FogTexture, GhostSprite, Side, SoundEvent } from '../shared/types.ts';
import { tables, type Lang, type Strings } from '../i18n/index.ts';
import { soundNoun } from '../i18n/soundLabel.ts';
import { ambientTextureOf, ghostConfig, isAmbientFamily, type GhostConfig } from '../config/ghost.config.ts';
import { groupKey } from '../events/occurrences.ts';

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
  /** Families the user has muted; their sprites/fogs are omitted (Req 6.7). */
  mutedFamilies: ReadonlySet<SoundEvent['family']>;
  /**
   * Fraction of the viewport height reserved at the bottom for ordinary
   * subtitles (task 19.2/19.3). Optional: when omitted the default
   * {@link CAPTION_BAND} is used. The Player raises this when a dialogue cue is
   * on screen (measured from the rendered cue) or when the "burned-in
   * subtitles" setting is on, so ghosts and fog push further up.
   */
  captionBandFrac?: number;
}

/**
 * Default fraction of the viewport height reserved at the bottom for ordinary
 * subtitles. Ghost centres stay above `1 - band`, and their drawn radius is
 * accounted for so even a large ghost cannot reach into the band (Req 6.5,
 * property P6). The effective band can be raised per frame via
 * {@link OverlaySettings.captionBandFrac} when a dialogue cue is on screen or
 * burned-in subtitles are declared (task 19.2/19.3); it is never lowered below
 * this default.
 */
export const CAPTION_BAND = 0.18;

/** The effective caption-band fraction for a frame, never below the default. */
export function captionBandOf(settings: OverlaySettings): number {
  const frac = settings.captionBandFrac;
  if (frac == null || !Number.isFinite(frac)) return CAPTION_BAND;
  return clamp(Math.max(frac, CAPTION_BAND), CAPTION_BAND, 0.6);
}

/**
 * Upper fraction of the viewport ghosts live in (design.md: upper 70 %). The
 * vertical slot is chosen inside `[Y_MIN, yMaxForRadius]` so tall ghosts still
 * clear the caption band.
 */
const Y_MIN = 0.1;

/**
 * Minimum gap (fraction of viewport height) between the top of a ghost's image
 * and the top of the frame, so a ghost's head is never clipped (task 22.3).
 * The measured defect: car and gunshot ghosts were clipped by 30–50 px at the
 * top because `y` could be smaller than the sprite's half-height.
 */
const TOP_MARGIN = 0.02;
export { TOP_MARGIN };

/** Horizontal band centres as a fraction of width, per side (design.md). */
const BAND_CENTRE: Record<Side, number> = {
  left: 0.225, // middle of 15–30 %
  'centre-unknown': 0.5, // middle of 40–60 %
  right: 0.775, // middle of 70–85 %
};

/**
 * Where a point ghost sits while it is off-screen, just outside the frame, for
 * the enter/withdraw motion (task 16.4). It emerges from and withdraws to the
 * matching edge.
 */
const OFFSCREEN_X: Record<Exclude<Side, 'centre-unknown'>, number> = {
  left: -0.12,
  right: 1.12,
};

/**
 * Duration (seconds) of the enter and withdraw glides for a side point ghost.
 * Short enough to feel responsive, long enough to read as emerging from the
 * fog band rather than popping in.
 */
const ENTER_TIME = 0.4;
const WITHDRAW_TIME = 0.4;

/** Central fraction of the frame edge fog must never cover (Req 6.5). */
export const FOG_CLEAR_CENTRE = 0.6;

/**
 * The base ghost radius as a fraction of the shorter viewport dimension, half
 * the configured ghost diameter (task 17.1). Shared with `draw` so layout and
 * drawing size ghosts identically from one config value.
 */
export function baseRadiusFrac(cfg: GhostConfig = ghostConfig): number {
  return cfg.ghostDiameterFrac.value / 2;
}

/**
 * How much `rising`/`falling` grows/shrinks scale across the event. */
const TREND_SCALE_SWING = 0.25;

/**
 * Fraction of full size a non-loudest simultaneous point ghost is drawn at, so
 * only one big ghost shows at a time and large ghosts never pile up over faces
 * (task 17.2). Markers keep their label.
 */
export const MARKER_SCALE = 0.25;

/**
 * The central horizontal band a full-size ghost's opacity is dimmed inside, to
 * keep the face region light (task 17.4): the central 40% of the frame width,
 * i.e. 0.3..0.7.
 */
export const CENTRE_FACE_BAND = 0.4;
/** The dimmed opacity a full-size ghost takes while its centre is in that band. */
export const CENTRE_FACE_OPACITY = 0.55;

/** Scale-pop (one pulse) for an `edgeReact` ghost just after it arrives (task 17.3). */
const EDGE_POP_AMOUNT = 0.3;
const EDGE_POP_TIME = 0.3;
/** Gentle sway (fraction of a band width) for a `hover` ghost (task 17.3). */
const HOVER_SWAY_X = 0.03;
const HOVER_SWAY_HZ = 0.2;

/**
 * Arrival scale-pop applied to EVERY point ghost at the start of its occurrence
 * (task 23.5): the scale swells to `arrivalPopScale`× over the first
 * `arrivalPopSec` seconds then eases back. A single rise-and-fall, never a
 * repeating flash (Req 10.3); dropped under reduced motion (the Player bolds
 * the label instead). Returns a multiplier ≥ 1. Because grouped same-family
 * events touch, using the event's own start means only the true arrival pops;
 * a hover/edge ghost that is one event per occurrence pops once.
 */
function arrivalPop(event: SoundEvent, t: number, reducedMotion: boolean, cfg: GhostConfig): number {
  if (reducedMotion) return 1;
  const since = t - event.start;
  const dur = cfg.arrivalPopSec.value;
  if (since < 0 || since > dur || dur <= 0) return 1;
  // Ease: peak at the start, decay to 1 by the end of the window.
  const pulse = Math.sin((1 - since / dur) * (Math.PI / 2));
  return 1 + (cfg.arrivalPopScale.value - 1) * pulse;
}

/**
 * Whether an event is within its arrival window (task 23.5), regardless of
 * reduced motion. Under reduced motion `draw` bolds the label during this
 * window instead of scaling the sprite.
 */
function isArriving(event: SoundEvent, t: number, cfg: GhostConfig): boolean {
  const since = t - event.start;
  return since >= 0 && since <= cfg.arrivalPopSec.value;
}

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

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

/**
 * The last moment a point ghost is drawn (task 34.1): its measured end, or
 * `start + ghostMinDisplaySeconds` when the occurrence is shorter than that, so
 * a short sound stays long enough to read. Never earlier than the measured end,
 * so a long sound is unchanged. Pure; reads only the event timing and config.
 *
 * This is a DISPLAY quantity only — it never changes the event's measured
 * `end`, so the missed-sounds counter, the end-card list, the timeline and the
 * WebVTT export all keep the measured start/end (task 34.2).
 */
export function ghostDisplayEnd(event: SoundEvent, cfg: GhostConfig = ghostConfig): number {
  return Math.max(event.end, event.start + cfg.ghostMinDisplaySeconds.value);
}

/**
 * Whether a point ghost should be drawn at time `t` (task 34.1): within
 * `[start, ghostDisplayEnd)`. Used by the Player to keep a short ghost on screen
 * through its linger tail even though its measured event has ended, and by
 * `layout` to drop events outside their display window.
 */
export function isGhostVisibleAt(event: SoundEvent, t: number, cfg: GhostConfig = ghostConfig): boolean {
  return t >= event.start && t < ghostDisplayEnd(event, cfg);
}

/**
 * The linger-tail opacity multiplier for a point ghost at time `t` (task 34.1):
 *   - 1 while the event is still within its measured span (`t < end`);
 *   - during the linger tail (`end <= t < ghostDisplayEnd`, which exists only
 *     for occurrences shorter than `ghostMinDisplaySeconds`) it starts at
 *     `ghostLingerAlpha` and fades smoothly to 0 by the end of the tail, so the
 *     lingering sound reads as a fading memory, not an ongoing sound;
 *   - 0 once past `ghostDisplayEnd`.
 * Under reduced motion the tail is held static at `ghostLingerAlpha` with no
 * fade (task 34.3). Pure. A long occurrence (no tail) always returns 1 while
 * active.
 */
export function lingerAlpha(
  event: SoundEvent,
  t: number,
  reducedMotion: boolean,
  cfg: GhostConfig = ghostConfig,
): number {
  if (t < event.start) return 0;
  if (t < event.end) return 1;
  const displayEnd = ghostDisplayEnd(event, cfg);
  if (t >= displayEnd) return 0;
  const start = cfg.ghostLingerAlpha.value;
  if (reducedMotion) return start;
  const tail = displayEnd - event.end;
  if (tail <= 0) return start;
  const remaining = clamp01((displayEnd - t) / tail);
  return start * remaining;
}

/**
 * The on-screen band centre (0..1 of width) for an event at time `t`. A
 * travelling sound interpolates its `sideTrack` so the ghost drifts between
 * bands; under reduced motion it sits at the mean of the track instead of
 * moving (Req 4.5, 6.6).
 */
function trackedX(event: SoundEvent, t: number, reducedMotion: boolean): number {
  const track = event.sideTrack;
  if (track.length === 0) return BAND_CENTRE[event.side];

  if (reducedMotion) {
    const sum = track.reduce((s, p) => s + BAND_CENTRE[p.side], 0);
    return sum / track.length;
  }

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
 * Whether the event's `sideTrack` records a measured change between the left
 * and right bands (task 17.3, `cross`). A travelling car is left→right; a
 * static sound stays on one side. `centre-unknown` steps do not count as a
 * side change.
 */
function hasMeasuredSideChange(event: SoundEvent): boolean {
  let seenLeft = false;
  let seenRight = false;
  for (const p of event.sideTrack) {
    if (p.side === 'left') seenLeft = true;
    else if (p.side === 'right') seenRight = true;
  }
  return seenLeft && seenRight;
}

/**
 * The motion kind for an event (task 17.3), read from the config table by
 * family. Ambient families never reach here (they are edge fog).
 */
function motionOf(event: SoundEvent, cfg: GhostConfig): import('../config/ghost.config.ts').MotionKind {
  return cfg.motionByFamily.value[event.family];
}

/**
 * The horizontal position of a point ghost, by motion kind (task 17.3),
 * including the enter/withdraw glide for a known side (task 16.4).
 *
 *   - `cross`: if the sideTrack has a measured left↔right change, follow the
 *     tracked interpolation across the frame; otherwise glide in from its edge
 *     and out, as before.
 *   - `edgeReact`: glide in from its edge and out (the scale-pop is added in
 *     `scale`, not here).
 *   - `hover`: stay at its band with a slow gentle sway (no edge glide); a
 *     centre-unknown hover fades in place via opacity.
 *
 * A centre-unknown ghost always sits at its band (it fades in place via
 * opacity — see `pointGhostOpacity`). Under reduced motion the ghost sits at
 * its settled band with no glide or sway (Req 6.6).
 */
function pointX(event: SoundEvent, t: number, reducedMotion: boolean, cfg: GhostConfig): number {
  const settled = trackedX(event, t, reducedMotion);
  const motion = motionOf(event, cfg);

  if (reducedMotion) return settled;

  if (motion === 'hover') {
    if (event.side === 'centre-unknown') return settled;
    // A gentle, slow horizontal sway around the settled band.
    const sway = Math.sin(2 * Math.PI * HOVER_SWAY_HZ * t) * HOVER_SWAY_X;
    return settled + sway;
  }

  // cross with a measured side change follows the track across the frame.
  if (motion === 'cross' && hasMeasuredSideChange(event)) return settled;

  // cross without a change and edgeReact both glide in from the edge and out.
  if (event.side === 'centre-unknown') return settled;

  const offscreen = OFFSCREEN_X[event.side];
  const span = event.end - event.start;
  // Guard tiny events: if the event is shorter than enter+withdraw, split it.
  const enter = Math.min(ENTER_TIME, span / 2);
  const withdraw = Math.min(WITHDRAW_TIME, span / 2);

  if (t < event.start + enter) {
    const frac = enter > 0 ? clamp01((t - event.start) / enter) : 1;
    return offscreen + (settled - offscreen) * frac;
  }
  if (t > event.end - withdraw) {
    const frac = withdraw > 0 ? clamp01((event.end - t) / withdraw) : 0;
    return offscreen + (settled - offscreen) * frac;
  }
  return settled;
}

/**
 * Opacity for a point ghost at the event edges (task 16.4, 17.3). A ghost that
 * glides in from a screen edge (a side `cross`/`edgeReact` ghost) stays fully
 * opaque — its motion is the glide. A ghost with no edge entrance fades in over
 * the first `ENTER_TIME` and out over the last `WITHDRAW_TIME`: that is every
 * `hover` ghost and every `centre-unknown` point ghost. Under reduced motion
 * opacity is 1 (fade is motion). Range 0..1.
 */
function pointGhostOpacity(event: SoundEvent, t: number, reducedMotion: boolean, cfg: GhostConfig): number {
  if (reducedMotion) return 1;
  const motion = motionOf(event, cfg);
  const gliding = motion !== 'hover' && event.side !== 'centre-unknown';
  if (gliding) return 1;
  const span = event.end - event.start;
  const enter = Math.min(ENTER_TIME, span / 2);
  const withdraw = Math.min(WITHDRAW_TIME, span / 2);
  if (t < event.start + enter) return enter > 0 ? clamp01((t - event.start) / enter) : 1;
  if (t > event.end - withdraw) return withdraw > 0 ? clamp01((event.end - t) / withdraw) : 0;
  return 1;
}

/**
 * Scale from loudness and trend, in the narrow config band (task 17.1). The
 * base diameter is applied in `layout`/`draw`; this returns the multiplier.
 * Loudness sets the base size; a rising event grows toward its end
 * (approaching), a falling one shrinks (receding). Under reduced motion the
 * trend swing is dropped so the ghost does not move, but the loudness size is
 * kept (Req 6.2, 6.6).
 */
function scaleFor(event: SoundEvent, t: number, reducedMotion: boolean, cfg: GhostConfig): number {
  const lo = cfg.loudScaleMin.value;
  const hi = cfg.loudScaleMax.value;
  const base = lo + event.loudness * (hi - lo);
  if (reducedMotion || event.trend === 'steady') return base;

  const span = event.end - event.start;
  const progress = span > 0 ? clamp((t - event.start) / span, 0, 1) : 1;
  const dir = event.trend === 'rising' ? 1 : -1;
  const swing = (progress - 0.5) * TREND_SCALE_SWING * dir;
  return base * (1 + swing);
}

/**
 * A short one-pulse scale-pop for an `edgeReact` ghost just after it arrives
 * (task 17.3): the scale swells by up to `EDGE_POP_AMOUNT` over the first
 * `EDGE_POP_TIME` seconds, then settles. A single rise-and-fall, never a
 * repeating flash (Req 10.3). Returns a multiplier ≥ 1. Dropped under reduced
 * motion.
 */
function edgePop(event: SoundEvent, t: number, reducedMotion: boolean, cfg: GhostConfig): number {
  if (reducedMotion) return 1;
  if (motionOf(event, cfg) !== 'edgeReact') return 1;
  const since = t - event.start;
  if (since < 0 || since > EDGE_POP_TIME) return 1;
  // One half-sine pulse: 0 at the ends, peak in the middle.
  const pulse = Math.sin((since / EDGE_POP_TIME) * Math.PI);
  return 1 + EDGE_POP_AMOUNT * pulse;
}

/**
 * Build the label text for a sprite/fog from the i18n phrases: the sound noun
 * (the specific classifier label when confident, else the family word — see
 * `soundNoun`, task 15.1), plus a direction word only for a known side, plus a
 * trend word when the loudness clearly rose or fell (Req 6.4). Uses the same
 * tables and resolver as the caption export so overlay and export never
 * disagree (Req 9.2). `lang` defaults to English so callers holding only a
 * `Strings` table keep working.
 *
 * Task 25.2 — the trend word is TRANSIENT: it is appended only for
 * `trendLabelSec` seconds after the trend starts (the event start), then the
 * label returns to the plain name. Pass the current time `t` to apply this;
 * when `t` is omitted (e.g. the WebVTT export, where a cue spans the whole
 * event) the trend is always included.
 */
export function spriteLabel(
  event: SoundEvent,
  s: Strings,
  lang: Lang = 'en',
  t?: number,
  cfg: GhostConfig = ghostConfig,
): string {
  const parts: string[] = [soundNoun(event, s, lang)];
  if (event.side === 'left' || event.side === 'right') {
    parts.push(s.side[event.side]);
  }
  if (event.trend === 'rising' || event.trend === 'falling') {
    // The trend word is transient (task 25.2): shown only within trendLabelSec
    // of the event start. When no time is given (export), it is always shown.
    const withinTrendWindow = t == null || t - event.start <= cfg.trendLabelSec.value;
    if (withinTrendWindow) parts.push(s.trend[event.trend]);
  }
  return parts.join(s.join);
}

/**
 * The per-label sprite override for an event (task 36.3): the PNG path to draw
 * instead of the family sprite when the event's SPECIFIC classifier label
 * (`topLabel`) has one in `spriteOverrideByLabel`. Returns `undefined` when the
 * label has no override (or the event has no confident label), so the family
 * sprite is used as usual. Keyed by the English `display_name` exactly as it
 * sits on `SoundEvent.topLabel`. Pure; reads only the event and config.
 */
export function spriteOverrideFor(
  event: SoundEvent,
  cfg: GhostConfig = ghostConfig,
): string | undefined {
  const label = event.topLabel;
  if (label == null) return undefined;
  return cfg.spriteOverrideByLabel.value[label];
}

/**
 * Lay out the point ghosts for the events active at time `t`.
 *
 * Pure: given the same events, time, viewport and settings it always returns
 * the same sprites. Speech events and AMBIENT families are skipped (ambient
 * events become edge fog via `edgeFogs`, task 16.3); muted families are
 * omitted (Req 6.7). Each surviving point event becomes one sprite positioned
 * by side (gliding in/out from its edge, task 16.4), sized by loudness and
 * trend, fogged by ominousness and trembling on its beat, with a text label
 * and a vertical slot that clears the caption band.
 */
export function layout(
  events: readonly SoundEvent[],
  t: number,
  viewport: Viewport,
  settings: OverlaySettings,
  cfg: GhostConfig = ghostConfig,
): GhostSprite[] {
  const s = tables[settings.lang] ?? tables.en;
  const minDim = Math.min(viewport.width, viewport.height);
  const sprites: GhostSprite[] = [];

  const drawable = events.filter(
    (e) =>
      !e.isSpeech &&
      !isAmbientFamily(e.family, cfg) &&
      !settings.mutedFamilies.has(e.family) &&
      // A short ghost lingers past its measured end up to ghostDisplayEnd (task
      // 34.1); drop anything the Player passed in that is already past its
      // display window so it is not drawn.
      isGhostVisibleAt(e, t, cfg),
  );

  // One big ghost at a time (task 17.2): only the loudest drawable point event
  // is full size; every other simultaneous point event becomes a small marker
  // at MARKER_SCALE so large ghosts never pile up over faces. Ties break on the
  // earlier array index for determinism (layout is pure).
  //
  // A newcomer that is still within its measured span (not lingering) always
  // takes the big slot ahead of a ghost that has already ended and is only
  // lingering (task 34.2): the lingering ghost drops to its small marker form
  // (or disappears when its tail ends). So the big slot is chosen among the
  // still-active events first; only if none is active does a lingering one take
  // it.
  let loudestIndex = -1;
  let loudestLoud = -Infinity;
  let loudestActive = false;
  drawable.forEach((e, i) => {
    const active = t < e.end;
    // Prefer an active event over a lingering one; among equal activity, the
    // loudest; ties break on the earlier index.
    const better =
      loudestIndex === -1 ||
      (active && !loudestActive) ||
      (active === loudestActive && e.loudness > loudestLoud);
    if (better) {
      loudestLoud = e.loudness;
      loudestIndex = i;
      loudestActive = active;
    }
  });

  // The base radius fraction of the shorter viewport dimension: half the
  // configured ghost diameter (task 17.1).
  const baseRadius = baseRadiusFrac(cfg);

  // The effective caption band for this frame (task 19.2/19.3): raised by the
  // Player when a dialogue cue is on screen or burned-in subtitles are
  // declared, so ghosts push further up; never below the default.
  const captionBand = captionBandOf(settings);

  drawable.forEach((event, i) => {
    const isBig = i === loudestIndex;
    const markerFactor = isBig ? 1 : MARKER_SCALE;
    const scale =
      scaleFor(event, t, settings.reducedMotion, cfg) *
      edgePop(event, t, settings.reducedMotion, cfg) *
      arrivalPop(event, t, settings.reducedMotion, cfg) *
      settings.sizeScale *
      markerFactor;

    // Radius as a fraction of viewport height, so a tall ghost still clears the
    // caption band regardless of aspect ratio.
    const radiusFracH = minDim > 0 && viewport.height > 0
      ? (baseRadius * scale * minDim) / viewport.height
      : 0;

    // The top of the ghost image must never go above the frame (task 22.3):
    // the sprite box spans `y ± radiusFracH`, so the centre needs to sit at
    // least `radiusFracH + TOP_MARGIN` from the top. The caption-band rule
    // (yMax) still wins on very small viewports — when the two bounds cross the
    // ghost is simply placed as high as the caption band allows and `draw`
    // shrinks it there — so we never push a ghost down into the caption band to
    // satisfy the head rule.
    const yTopClear = radiusFracH + TOP_MARGIN;
    const yMax = 1 - captionBand - radiusFracH;
    const slots = Math.max(1, drawable.length);
    const frac = slots > 1 ? i / (slots - 1) : 0;
    // The usable vertical range: from the head-clear floor (never above the
    // frame) up to the caption-band ceiling. When the viewport is so small that
    // the floor would pass the ceiling, the ceiling wins (caption band first).
    const yLow = Math.max(Y_MIN, yTopClear);
    const yHigh = Math.max(Y_MIN, yMax);
    const y = yHigh >= yLow
      ? clamp(yLow + frac * (yHigh - yLow), yLow, yHigh)
      : yHigh;

    const x = clamp(pointX(event, t, settings.reducedMotion, cfg), OFFSCREEN_X.left, OFFSCREEN_X.right);

    const trembleHz =
      settings.reducedMotion || event.beatPeriod == null || event.beatPeriod <= 0
        ? 0
        : clamp(1 / event.beatPeriod, 0, MAX_TREMBLE_HZ);

    // Keep the central face region light (task 17.4): a full-size ghost's
    // opacity drops to CENTRE_FACE_OPACITY while its centre sits in the central
    // 40% of the frame. Markers are already small, so they keep their opacity.
    const edgeOpacity = pointGhostOpacity(event, t, settings.reducedMotion, cfg);
    const inFaceBand = x > 0.5 - CENTRE_FACE_BAND / 2 && x < 0.5 + CENTRE_FACE_BAND / 2;
    const faceDim = isBig && inFaceBand ? CENTRE_FACE_OPACITY : 1;
    // A short ghost that has passed its measured end lingers at reduced opacity
    // and fades out (task 34.1), so the viewer still has time to read the label
    // but the sound reads as "just happened", not ongoing.
    const linger = lingerAlpha(event, t, settings.reducedMotion, cfg);

    // A per-label sprite override (task 36.3): e.g. a Helicopter (vehicle
    // family) draws the helicopter sprite, not the wheeled-car ghost. Only set
    // when the specific label has an override, so the family sprite is used
    // otherwise. With `exactOptionalPropertyTypes`, the keys are added only
    // when defined.
    const override = spriteOverrideFor(event, cfg);

    sprites.push({
      family: event.family,
      x,
      y,
      scale,
      fog: clamp(event.ominous, 0, 1),
      trembleHz,
      opacity: clamp01(edgeOpacity * faceDim * linger),
      label: spriteLabel(event, s, settings.lang, t),
      arriving: isArriving(event, t, cfg),
      ...(override != null ? { spriteOverride: override, spriteOverrideKey: event.topLabel! } : {}),
    });
  });

  return sprites;
}

/**
 * Which edge an ambient event covers (task 23.4): its measured side when known
 * (`left`/`right`), else the top band (`top`). An ambient sound with no known
 * side no longer paints both side bands with two copies of its sprite — it uses
 * a single top-edge band, so a left/right band always means a measured side.
 */
function fogEdgeFor(side: Side): FogEdge {
  if (side === 'left') return 'left';
  if (side === 'right') return 'right';
  return 'top';
}

/**
 * The target edge-fog opacity for an ambient event: driven by loudness and
 * ominousness, lifted so a medium-loud event is clearly visible and capped by
 * `edgeFogMaxOpacity` (tasks 16.3, 18.1). The drive (0..1) is mapped onto
 * `[edgeFogMinVisible, edgeFogMaxOpacity]` so even a soft ambient sound reads
 * at the outer edge, while a loud, ominous one (a thunderclap) pushes toward
 * the cap. The earlier linear `drive × cap` mapping peaked around 0.2 for a
 * medium wind and was invisible (measured 4/255 on the Sintel wind scene).
 */
function fogTarget(event: SoundEvent, cfg: GhostConfig): number {
  const drive = clamp01(0.5 * event.loudness + 0.5 * event.ominous);
  const floor = cfg.edgeFogMinVisible.value;
  const cap = cfg.edgeFogMaxOpacity.value;
  return clamp01(floor + drive * (cap - floor));
}

/**
 * The smoothed edge-fog opacity at time `t`: it rises (attack) while the event
 * is in its opening and decays (release) after the event ends, so the fog
 * swells in and withdraws slowly rather than snapping (task 16.3). Modelled
 * deterministically from the event's timing so the function stays pure:
 *   - before/at the start: 0;
 *   - during the attack window: linear ramp from 0 to the target at a rate no
 *     faster than `edgeFogAttack` per ~16 ms frame;
 *   - held at the target until the event ends;
 *   - after the end: linear decay at `edgeFogRelease` per frame down to 0.
 * Under reduced motion the steady target is shown with no ramp (Req 6.6).
 */
function fogOpacityAt(event: SoundEvent, t: number, reducedMotion: boolean, cfg: GhostConfig): number {
  const target = fogTarget(event, cfg);
  if (reducedMotion) {
    // Steady fog while active, nothing once ended.
    return t >= event.start && t < event.end ? target : 0;
  }
  // Attack/release are already expressed in opacity per second (task 18.1), so
  // the fog looks the same at any overlay frame rate.
  const attackPerSec = cfg.edgeFogAttack.value;
  const releasePerSec = cfg.edgeFogRelease.value;

  if (t < event.start) return 0;
  if (t < event.end) {
    const rising = (t - event.start) * attackPerSec;
    return clamp01(Math.min(target, rising));
  }
  // After the end: start from target and decay.
  const decayed = target - (t - event.end) * releasePerSec;
  return clamp01(decayed);
}

/**
 * How long after an ambient event ends its decaying fog is still visible, so a
 * caller selecting "recently active" events knows how far back to look.
 */
export function fogDecayDuration(cfg: GhostConfig = ghostConfig): number {
  return cfg.edgeFogMaxOpacity.value / cfg.edgeFogRelease.value;
}

/**
 * Whether an ambient event has been steady long enough to settle (task 23.5,
 * measured per OCCURRENCE in task 26.2): the OCCURRENCE it belongs to has been
 * running for more than `settleAfterSec` (counted from the occurrence's start,
 * `occStart`, not the event piece's own start) with no recent loudness rise.
 *
 * Task 26.2 — the earlier version read the event piece's own `start` and
 * `trend`, so when `buildEvents` split a long cue into pieces a late piece's
 * clock restarted and a single long `rising` piece blocked settling for its
 * whole length. Measured defect: at 22 s, music that started at 11 s had not
 * folded. Now the settle clock runs from the occurrence's start, and "a recent
 * rise" is a rise whose own start was within the last `trendLabelSec` —
 * `recentRise` — so a long rising piece no longer blocks settling once its rise
 * is old. Pure: it reads only the passed timing, flags and config.
 */
function fogSettledAt(
  occStart: number,
  event: SoundEvent,
  recentRise: boolean,
  t: number,
  cfg: GhostConfig,
): boolean {
  if (t < occStart + cfg.settleAfterSec.value) return false;
  if (t >= event.end) return false;
  return !recentRise;
}

/**
 * Whether an ambient event has been steady long enough to FOLD into a corner
 * chip (task 25.3, measured per OCCURRENCE in task 26.2): its OCCURRENCE has
 * been running for more than the longer `settleSec` (counted from `occStart`)
 * with no recent loudness rise. Same shape as {@link fogSettledAt} with the
 * longer threshold, so a sound first fades its band (settle, task 23.5) then
 * folds to a chip. A rise within the last `trendLabelSec` unfolds it. Kept
 * under reduced motion as a static state (the chip is shown without the fold
 * animation, Req 6.6).
 */
function fogFoldedAt(
  occStart: number,
  event: SoundEvent,
  recentRise: boolean,
  t: number,
  cfg: GhostConfig,
): boolean {
  if (t < occStart + cfg.settleSec.value) return false;
  if (t >= event.end) return false;
  return !recentRise;
}

/**
 * Per-occurrence settle info for the ambient events passed to `edgeFogs` (task
 * 26.2). For each ambient event this records the START of the occurrence it
 * belongs to (so the settle/fold clock runs from the occurrence, not the split
 * piece) and whether a loudness RISE began recently in that occurrence (a rise
 * whose own start is within the last `trendLabelSec`, which unfolds the band).
 *
 * Ambient events are grouped the same way as the fog merge (task 24.1) and the
 * occurrence counter (task 23.1): by {@link groupKey} (all music families fold
 * into one `'music'` group) AND by edge, so a left wind and a top wind stay
 * distinct occurrences. Within a group, events overlapping or within
 * `occurrenceGapSec` of the running end fold into one occurrence. Pure.
 */
function ambientOccurrenceInfo(
  events: readonly SoundEvent[],
  t: number,
  cfg: GhostConfig,
): Map<SoundEvent, { occStart: number; recentRise: boolean }> {
  const info = new Map<SoundEvent, { occStart: number; recentRise: boolean }>();
  const gap = cfg.occurrenceGapSec.value;
  const trendWindow = cfg.trendLabelSec.value;

  // Bucket ambient events by group+edge, matching the fog merge key.
  const buckets = new Map<string, SoundEvent[]>();
  for (const e of events) {
    if (e.isSpeech || !isAmbientFamily(e.family, cfg)) continue;
    const key = `${groupKey(e.family)}|${fogEdgeFor(e.side)}`;
    const list = buckets.get(key);
    if (list) list.push(e);
    else buckets.set(key, [e]);
  }

  for (const list of buckets.values()) {
    list.sort((a, b) => a.start - b.start || a.end - b.end);
    let current: SoundEvent[] = [];
    let currentEnd = -Infinity;
    const flush = () => {
      if (current.length === 0) return;
      let occStart = Infinity;
      // A rise is "recent" when ANY member's rising piece started within the
      // last trendLabelSec: that keeps the band awake briefly after a swell,
      // then lets the occurrence settle even if the piece is still labelled
      // rising for its whole (longer) length.
      let recentRise = false;
      for (const e of current) {
        if (e.start < occStart) occStart = e.start;
        if (e.trend === 'rising' && t - e.start <= trendWindow && t >= e.start) {
          recentRise = true;
        }
      }
      for (const e of current) info.set(e, { occStart, recentRise });
      current = [];
      currentEnd = -Infinity;
    };
    for (const e of list) {
      if (current.length === 0) {
        current.push(e);
        currentEnd = e.end;
        continue;
      }
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

  return info;
}

/**
 * The band-sprite scale for an ambient event at time `t` (task 23.5): the
 * arrival pop just after the occurrence starts, then 1. Shares
 * {@link arrivalPop}'s shape so point and ambient arrivals feel the same.
 */
function fogSpriteScaleAt(event: SoundEvent, t: number, reducedMotion: boolean, cfg: GhostConfig): number {
  return arrivalPop(event, t, reducedMotion, cfg);
}

/**
 * Lay out the edge-fog vignettes for the AMBIENT events near time `t` (task
 * 16.3, extended in tasks 18.x, 23.4, 23.5). Pass every event whose fog could
 * still be visible: an event that is active, or ended within
 * `fogDecayDuration` (so its slow decay still shows). Speech is skipped; muted
 * ambient families are omitted (Req 6.7). Each ambient event yields one
 * `EdgeFog` with its edge, smoothed opacity and label; zero-opacity fogs are
 * dropped.
 *
 * Task 23.4: a `top` fog (no measured side) is placed in a shared top band.
 * This function assigns each `top` fog a `topSlot`/`topCount` so `draw` can lay
 * several of them side by side in the band, never on top of each other. A
 * `left`/`right` fog keeps its side band.
 *
 * Task 23.5: each fog carries a `spriteScale` (arrival pop) and a `settled`
 * flag so `draw` can pop the band sprite on arrival and fade/thin the band once
 * the ambient sound has been steady.
 *
 * Task 24.1: simultaneously active ambient events that belong to the same
 * occurrence group (all music families count as one group — see `groupKey`)
 * AND cover the same edge are merged into ONE fog: its opacity is the max of
 * the members, its label and texture come from the loudest member. The Sintel
 * demo showed two top-band slots "Music, getting louder" and "Music" side by
 * side at 13 s because `buildEvents` split the long music cue; merging folds
 * those back into one fog so only one "Music" plate is ever on screen.
 */
export function edgeFogs(
  events: readonly SoundEvent[],
  t: number,
  settings: OverlaySettings,
  cfg: GhostConfig = ghostConfig,
): EdgeFog[] {
  const s = tables[settings.lang] ?? tables.en;

  // The raw per-event fog contributions before merging (task 24.1): each one
  // carries the smoothed opacity, texture density and the event it came from,
  // so the merge can pick the loudest member and max the opacity.
  interface RawFog {
    event: SoundEvent;
    edge: FogEdge;
    opacity: number;
    textureDensity: number;
    settled: boolean;
    folded: boolean;
    spriteScale: number;
    arriving: boolean;
  }

  // Per-occurrence settle info (task 26.2): the occurrence start and recent-rise
  // flag for every ambient event, so the settle/fold clock runs from the
  // occurrence rather than the split event piece.
  const occInfo = ambientOccurrenceInfo(events, t, cfg);

  const raw: RawFog[] = [];
  for (const event of events) {
    if (event.isSpeech) continue;
    if (!isAmbientFamily(event.family, cfg)) continue;
    if (settings.mutedFamilies.has(event.family)) continue;
    const opacity = fogOpacityAt(event, t, settings.reducedMotion, cfg);
    if (opacity <= 0) continue;
    // Measure settling from the occurrence (task 26.2): fall back to the event's
    // own start/trend if the event was not grouped (should not happen for
    // ambient events, but keeps the function total).
    const occ = occInfo.get(event) ?? { occStart: event.start, recentRise: event.trend === 'rising' };
    const settled = fogSettledAt(occ.occStart, event, occ.recentRise, t, cfg);
    const folded = fogFoldedAt(occ.occStart, event, occ.recentRise, t, cfg);
    // Texture density tracks loudness/ominousness so a louder, more ominous
    // ambient sound has a denser band texture (task 18.2); a settled band
    // thins its texture (task 23.5).
    let textureDensity = clamp01(0.5 * event.loudness + 0.5 * event.ominous);
    let fogOpacity = opacity;
    if (settled) {
      textureDensity *= cfg.settleTextureFactor.value;
      fogOpacity *= cfg.settleOpacityFactor.value;
    }
    raw.push({
      event,
      edge: fogEdgeFor(event.side),
      opacity: fogOpacity,
      textureDensity,
      settled,
      folded,
      spriteScale: fogSpriteScaleAt(event, t, settings.reducedMotion, cfg),
      arriving: isArriving(event, t, cfg),
    });
  }

  // Merge same-group, same-edge fogs into one (task 24.1). The group key folds
  // all music families together, so overlapping music fragments become a single
  // "Music" fog; the edge is kept in the key so a left and a top music fog stay
  // distinct (they name different sources). Each bucket keeps insertion order so
  // the result is deterministic.
  const buckets = new Map<string, RawFog[]>();
  for (const r of raw) {
    const key = `${groupKey(r.event.family)}|${r.edge}`;
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }

  const merged: EdgeFog[] = [];
  for (const members of buckets.values()) {
    // The loudest member names the fog (its family → sprite/texture/label),
    // matching how an occurrence's loudest event names it (task 23.1). Ties
    // break on the earlier member for determinism.
    let loudest = members[0]!;
    let maxOpacity = members[0]!.opacity;
    let maxTextureDensity = members[0]!.textureDensity;
    let maxSpriteScale = members[0]!.spriteScale;
    let anyArriving = members[0]!.arriving;
    // A merged fog has settled only when every member has settled: a fresh
    // member keeps the band awake.
    let allSettled = members[0]!.settled;
    // Likewise a merged fog folds only when every member has folded.
    let allFolded = members[0]!.folded;
    for (const m of members) {
      if (m.opacity > maxOpacity) maxOpacity = m.opacity;
      if (m.textureDensity > maxTextureDensity) maxTextureDensity = m.textureDensity;
      if (m.spriteScale > maxSpriteScale) maxSpriteScale = m.spriteScale;
      if (m.arriving) anyArriving = true;
      if (!m.settled) allSettled = false;
      if (!m.folded) allFolded = false;
      if (m.event.loudness > loudest.event.loudness) loudest = m;
    }
    merged.push({
      family: loudest.event.family,
      edge: loudest.edge,
      opacity: maxOpacity,
      label: spriteLabel(loudest.event, s, settings.lang, t),
      texture: ambientTextureOf(loudest.event.family, cfg) as FogTexture,
      textureDensity: maxTextureDensity,
      spriteScale: maxSpriteScale,
      settled: allSettled,
      folded: allFolded,
      foldSlot: 0,
      foldCount: 0,
      // Filled in below once we know how many top fogs there are.
      topSlot: 0,
      topCount: 1,
      arriving: anyArriving,
    });
  }

  // Assign side-by-side slots to the top-band fogs (task 23.4), in a stable
  // order, so several active ambient sounds without a side never stack on top
  // of each other. A FOLDED fog (task 25.3) no longer paints a band — it is a
  // corner chip — so it is excluded from the top-band slotting and instead
  // gets a fold slot so several settled occurrences stack in the corner
  // without overlapping. Side fogs keep slot 0 of a single-slot band.
  const topFogs = merged.filter((f) => f.edge === 'top' && !f.folded);
  topFogs.forEach((f, i) => {
    f.topSlot = i;
    f.topCount = topFogs.length;
  });
  const foldedFogs = merged.filter((f) => f.folded);
  foldedFogs.forEach((f, i) => {
    f.foldSlot = i;
    f.foldCount = foldedFogs.length;
    // A folded fog is a corner chip, not a band: it claims no top slot.
    f.topSlot = 0;
    f.topCount = 0;
  });
  return merged;
}
