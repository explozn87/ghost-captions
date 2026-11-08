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
      !settings.mutedFamilies.has(e.family),
  );

  // One big ghost at a time (task 17.2): only the loudest drawable point event
  // is full size; every other simultaneous point event becomes a small marker
  // at MARKER_SCALE so large ghosts never pile up over faces. Ties break on the
  // earlier array index for determinism (layout is pure).
  let loudestIndex = -1;
  let loudestLoud = -Infinity;
  drawable.forEach((e, i) => {
    if (e.loudness > loudestLoud) {
      loudestLoud = e.loudness;
      loudestIndex = i;
    }
  });

  // The base radius fraction of the shorter viewport dimension: half the
  // configured ghost diameter (task 17.1).
  const baseRadius = baseRadiusFrac(cfg);

  drawable.forEach((event, i) => {
    const isBig = i === loudestIndex;
    const markerFactor = isBig ? 1 : MARKER_SCALE;
    const scale =
      scaleFor(event, t, settings.reducedMotion, cfg) *
      edgePop(event, t, settings.reducedMotion, cfg) *
      settings.sizeScale *
      markerFactor;

    // Radius as a fraction of viewport height, so a tall ghost still clears the
    // caption band regardless of aspect ratio.
    const radiusFracH = minDim > 0 && viewport.height > 0
      ? (baseRadius * scale * minDim) / viewport.height
      : 0;

    const yMax = 1 - CAPTION_BAND - radiusFracH;
    const slots = Math.max(1, drawable.length);
    const frac = slots > 1 ? i / (slots - 1) : 0;
    const yHigh = Math.max(Y_MIN, yMax);
    const y = clamp(Y_MIN + frac * (yHigh - Y_MIN), Y_MIN, yHigh);

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

    sprites.push({
      family: event.family,
      x,
      y,
      scale,
      fog: clamp(event.ominous, 0, 1),
      trembleHz,
      opacity: clamp01(edgeOpacity * faceDim),
      label: spriteLabel(event, s, settings.lang),
    });
  });

  return sprites;
}

/** Which edge an ambient event covers: its side, or whole-frame when unknown. */
function fogEdgeFor(side: Side): FogEdge {
  if (side === 'left') return 'left';
  if (side === 'right') return 'right';
  return 'all';
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
 * Lay out the edge-fog vignettes for the AMBIENT events near time `t` (task
 * 16.3). Pass every event whose fog could still be visible: an event that is
 * active, or ended within `fogDecayDuration` (so its slow decay still shows).
 * Speech is skipped; muted ambient families are omitted (Req 6.7). Each
 * ambient event yields one `EdgeFog` with its edge, smoothed opacity and label;
 * zero-opacity fogs are dropped. The central 60% of the frame is never covered
 * (enforced by `draw`, per `FOG_CLEAR_CENTRE`).
 */
export function edgeFogs(
  events: readonly SoundEvent[],
  t: number,
  settings: OverlaySettings,
  cfg: GhostConfig = ghostConfig,
): EdgeFog[] {
  const s = tables[settings.lang] ?? tables.en;
  const fogs: EdgeFog[] = [];
  for (const event of events) {
    if (event.isSpeech) continue;
    if (!isAmbientFamily(event.family, cfg)) continue;
    if (settings.mutedFamilies.has(event.family)) continue;
    const opacity = fogOpacityAt(event, t, settings.reducedMotion, cfg);
    if (opacity <= 0) continue;
    // Texture density tracks loudness/ominousness so a louder, more ominous
    // ambient sound has a denser band texture (task 18.2).
    const textureDensity = clamp01(0.5 * event.loudness + 0.5 * event.ominous);
    fogs.push({
      family: event.family,
      edge: fogEdgeFor(event.side),
      opacity,
      label: spriteLabel(event, s, settings.lang),
      texture: ambientTextureOf(event.family, cfg) as FogTexture,
      textureDensity,
    });
  }
  return fogs;
}
