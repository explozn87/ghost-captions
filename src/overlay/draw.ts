// Overlay drawing (task 8.2, extended in task 16.3 & 16.5): paint the laid-out
// sprites and edge fogs onto a 2D canvas.
//
// `draw(ctx, sprites, fogs, time, reducedMotion)` renders the `GhostSprite[]`
// and `EdgeFog[]` that `layout()`/`edgeFogs()` produced. It is the only part of
// the overlay that touches a canvas; all positioning maths already happened in
// layout, so `draw` only turns the shapes into pixels. The animated parts it
// adds — tremble and fog pulse — are driven by `time` (the video's current
// time in seconds) so the same frame redraws identically and tests can assert a
// given frame.
//
// Sprite art (task 16.5): each point ghost is painted from a preloaded PNG at
// `public/ghosts/<family>.png` (512×512, transparent) scaled to the sprite
// size and drawn at the sprite's opacity. Images preload once; any image that
// is missing or not yet loaded falls back to the existing Path2D silhouette, so
// the overlay is never blank. Reduced motion keeps the same images without
// drift or tremble.
//
// Edge fog (task 16.3): ambient events are drawn as a vignette from the screen
// edges — whole-frame when the side is unknown, only one side's edge when
// known. The central 60% is never covered, opacity is capped by layout, and
// thunder is a single slow edge pulse, never a white flash (Req 10.3). The
// ambient event's label sits near the edge on a backing plate.
//
// Accessibility: every ghost/fog label sits on a dark backing plate at AA
// contrast (Req 6.4, 10.2); tremble moves the ghost rather than flashing its
// brightness and layout already capped its frequency below 3 Hz; the fog
// "pulse" is a small opacity breathing well under 3 Hz, disabled under reduced
// motion (Req 10.3).

import type { EdgeFog, Family, FogTexture, GhostSprite } from '../shared/types.ts';
import { FOG_CLEAR_CENTRE, baseRadiusFrac, CAPTION_BAND } from './layout.ts';
import { ghostConfig } from '../config/ghost.config.ts';

/**
 * A minimal 2D drawing surface. Declared structurally (not as
 * `CanvasRenderingContext2D`) so `draw` can be unit-tested against a small
 * recording fake without a real canvas, matching the pure-first testing
 * approach (NFR-5). Every member used by `draw` is listed here.
 */
export interface Ctx2D {
  canvas: { width: number; height: number };
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  fill(path: Path2D): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  measureText(text: string): { width: number };
  fillText(text: string, x: number, y: number): void;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): { addColorStop(offset: number, color: string): void };
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): { addColorStop(offset: number, color: string): void };
  fillStyle: string | CanvasGradient;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
}

/**
 * Per-family silhouette as an SVG path string drawn inside a unit box roughly
 * [-1,-1]..[1,1]. Each outline is visually distinct (Req 6.3) and acts as the
 * fallback whenever the family's PNG sprite is missing or not yet loaded (task
 * 16.5). The paths are deliberately simple so they stay crisp at any scale.
 */
const FAMILY_PATH_SOURCE: Record<Family, string> = {
  // Classic sheet ghost with a wavy hem — the base shape for unknown.
  unknown:
    'M -0.7 0.9 L -0.7 -0.1 A 0.7 0.7 0 0 1 0.7 -0.1 L 0.7 0.9 L 0.45 0.7 L 0.2 0.9 L 0 0.7 L -0.2 0.9 L -0.45 0.7 Z',
  // Ghost with two feet — footsteps.
  footsteps:
    'M -0.7 0.9 L -0.7 -0.1 A 0.7 0.7 0 0 1 0.7 -0.1 L 0.7 0.9 L 0.3 0.9 L 0.3 0.6 L -0.3 0.6 L -0.3 0.9 Z',
  // Ghost framed like a doorway — door.
  door: 'M -0.6 0.9 L -0.6 -0.5 A 0.6 0.6 0 0 1 0.6 -0.5 L 0.6 0.9 Z',
  // A knocking fist / small box with a raised knuckle — knock.
  knock:
    'M -0.5 0.6 L -0.5 -0.2 L -0.1 -0.2 L -0.1 -0.6 L 0.3 -0.6 L 0.3 -0.2 L 0.5 -0.2 L 0.5 0.6 Z',
  // Ghost with a wide open mouth — scream.
  scream:
    'M -0.7 0.9 L -0.7 -0.1 A 0.7 0.7 0 0 1 0.7 -0.1 L 0.7 0.9 L 0.4 0.6 L 0.2 0.95 L 0 0.6 L -0.2 0.95 L -0.4 0.6 Z',
  // Upturned grin crescent — laughter.
  laughter: 'M -0.8 -0.3 A 0.8 0.8 0 0 0 0.8 -0.3 A 0.95 0.95 0 0 1 -0.8 -0.3 Z',
  // Teardrop — crying.
  crying: 'M 0 -0.9 C 0.5 -0.2 0.7 0.3 0.7 0.5 A 0.7 0.7 0 1 1 -0.7 0.5 C -0.7 0.3 -0.5 -0.2 0 -0.9 Z',
  // Jagged, spiky ghost — tense music.
  tenseMusic:
    'M -0.8 0.9 L -0.6 0.2 L -0.8 -0.2 L -0.4 -0.3 L -0.5 -0.8 L 0 -0.5 L 0.5 -0.8 L 0.4 -0.3 L 0.8 -0.2 L 0.6 0.2 L 0.8 0.9 Z',
  // Soft rounded blob — calm music.
  calmMusic: 'M 0 -0.8 A 0.8 0.8 0 1 1 -0.01 -0.8 Z',
  // A musical note — singing.
  singing:
    'M 0.3 -0.9 L 0.5 -0.9 L 0.5 0.4 A 0.3 0.25 0 1 1 0.3 0.15 L 0.3 -0.5 L -0.3 -0.35 L -0.3 0.6 A 0.3 0.25 0 1 1 -0.5 0.35 L -0.5 -0.7 L 0.3 -0.85 Z',
  // Starburst — impact & explosion.
  impact:
    'M 0 -0.9 L 0.2 -0.25 L 0.85 -0.3 L 0.35 0.1 L 0.6 0.75 L 0 0.35 L -0.6 0.75 L -0.35 0.1 L -0.85 -0.3 L -0.2 -0.25 Z',
  // A bullet/pistol pointed shape — gunshot.
  gunshot:
    'M -0.9 -0.2 L 0.3 -0.2 L 0.9 0 L 0.3 0.2 L -0.9 0.2 Z',
  // Rounded box on wheels — engine & vehicle.
  vehicle:
    'M -0.8 0.4 L -0.8 -0.1 L -0.4 -0.1 L -0.2 -0.5 L 0.8 -0.5 L 0.8 0.4 Z',
  // Bell outline — siren & alarm.
  siren:
    'M 0 -0.8 C 0.6 -0.8 0.6 0.1 0.8 0.5 L -0.8 0.5 C -0.6 0.1 -0.6 -0.8 0 -0.8 Z',
  // Ghost with pointed ears — animal.
  animal:
    'M -0.6 -0.3 L -0.8 -0.9 L -0.3 -0.5 A 0.6 0.6 0 0 1 0.3 -0.5 L 0.8 -0.9 L 0.6 -0.3 L 0.7 0.9 L -0.7 0.9 Z',
  // Horizontal gust streaks — wind.
  wind:
    'M -0.9 -0.4 Q 0.2 -0.6 0.6 -0.4 Q 0.9 -0.2 0.5 -0.1 L -0.9 -0.1 Z M -0.9 0.2 Q 0.4 0.0 0.8 0.2 Q 1.0 0.4 0.6 0.5 L -0.9 0.5 Z',
  // Diagonal raindrop streaks — rain.
  rain:
    'M -0.6 -0.9 L -0.3 -0.3 L -0.5 -0.3 Z M 0 -0.9 L 0.3 -0.3 L 0.1 -0.3 Z M 0.5 -0.5 L 0.7 0.1 L 0.4 0.1 Z M -0.3 0.1 L -0.1 0.7 L -0.4 0.7 Z',
  // Lightning bolt — thunder.
  thunder: 'M 0.1 -0.9 L -0.5 0.1 L -0.1 0.1 L -0.3 0.9 L 0.5 -0.2 L 0.05 -0.2 Z',
  // Flame — fire.
  fire:
    'M 0 0.9 C -0.7 0.6 -0.7 0.0 -0.3 -0.4 C -0.35 -0.1 -0.1 0.0 -0.1 -0.3 C -0.1 -0.6 0.1 -0.8 0 -0.9 C 0.5 -0.6 0.4 -0.2 0.25 0.0 C 0.4 0.0 0.45 -0.2 0.45 -0.35 C 0.75 0.0 0.7 0.6 0 0.9 Z',
  // Cracked shard — breaking glass.
  glass:
    'M -0.6 0.9 L -0.2 -0.2 L -0.5 -0.6 L 0.1 -0.3 L 0 -0.9 L 0.35 -0.25 L 0.7 -0.6 L 0.4 0.1 L 0.7 0.9 L 0 0.5 Z',
};

/**
 * A loader for a family's sprite image. The default uses the browser `Image`;
 * tests inject a fake so the preload/fallback paths run without a DOM. Returns
 * a drawable image source once loaded, or null if it failed to load.
 */
export interface SpriteImageLoader {
  load(family: Family): { image: CanvasImageSource | null; loaded: boolean };
}

/** The path to a family's sprite PNG (task 16.5). */
export function spriteImageUrl(family: Family): string {
  return `/ghosts/${family}.png`;
}

/**
 * The browser loader: kicks off one `Image` load per family and reports
 * whether it has finished. Loads are started lazily on first request and cached
 * for the life of the page, so the overlay preloads each image once (task
 * 16.5). In a non-DOM environment (`Image` absent) it reports nothing loaded,
 * so `draw` falls back to silhouettes.
 */
function makeBrowserLoader(): SpriteImageLoader {
  const cache = new Map<Family, { image: CanvasImageSource | null; loaded: boolean }>();
  const hasImage = typeof Image !== 'undefined';
  return {
    load(family: Family) {
      const existing = cache.get(family);
      if (existing) return existing;
      if (!hasImage) {
        const miss = { image: null, loaded: false };
        cache.set(family, miss);
        return miss;
      }
      const entry: { image: CanvasImageSource | null; loaded: boolean } = {
        image: null,
        loaded: false,
      };
      const img = new Image();
      img.onload = () => {
        entry.image = img;
        entry.loaded = true;
      };
      img.onerror = () => {
        entry.image = null;
        entry.loaded = true; // resolved (as a failure) — fall back to silhouette
      };
      img.src = spriteImageUrl(family);
      cache.set(family, entry);
      return entry;
    },
  };
}

let defaultLoader: SpriteImageLoader | null = null;

/** The process-wide default sprite loader, created lazily (task 16.5). */
export function getDefaultSpriteLoader(): SpriteImageLoader {
  if (!defaultLoader) defaultLoader = makeBrowserLoader();
  return defaultLoader;
}

/**
 * Preload every family's sprite image once, so the first draw has them ready
 * (task 16.5). Safe to call repeatedly; the loader caches.
 */
export function preloadSpriteImages(loader: SpriteImageLoader = getDefaultSpriteLoader()): void {
  for (const family of Object.keys(FAMILY_PATH_SOURCE) as Family[]) loader.load(family);
}

/**
 * The silhouettes baked lazily to `Path2D`, used as the fallback whenever a
 * family's sprite image is missing or not yet loaded (task 16.5). In a browser
 * `Path2D` accepts an SVG path string; where it is absent the renderer skips
 * the fill (the label still draws — information never depends only on the
 * silhouette, Req 6.4).
 */
let bakedPaths: Record<Family, Path2D | null> | null = null;

function familyPaths(): Record<Family, Path2D | null> {
  const hasPath2D = typeof Path2D !== 'undefined';
  const needBake = bakedPaths === null || (hasPath2D && bakedPaths.unknown === null);
  if (needBake) {
    const out = {} as Record<Family, Path2D | null>;
    for (const family of Object.keys(FAMILY_PATH_SOURCE) as Family[]) {
      out[family] = hasPath2D ? new Path2D(FAMILY_PATH_SOURCE[family]) : null;
    }
    bakedPaths = out;
  }
  return bakedPaths!;
}

/** Expose the raw path sources for tests (one distinct shape per family). */
export const familyPathSource = FAMILY_PATH_SOURCE;

/** Tremble amplitude as a fraction of the sprite radius. Deliberately small. */
const TREMBLE_AMPLITUDE = 0.08;
/** Fog pulse depth (opacity swing) and its slow frequency, well under 3 Hz. */
const FOG_PULSE_DEPTH = 0.1;
const FOG_PULSE_HZ = 0.25;

/**
 * Base sprite radius as a fraction of the shorter viewport dimension, read from
 * the shared config via layout so draw and layout size ghosts identically
 * (task 17.1).
 */
const BASE_RADIUS_PX = baseRadiusFrac();

/** Label typography. The backing plate guarantees AA contrast (Req 10.2). */
const LABEL_FONT_PX = 16;
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 4;

/**
 * Horizontal margin (device px) a label plate is kept clear of either frame
 * edge (task 22.1): a plate is clamped into `[EDGE_MARGIN, W - EDGE_MARGIN]` so
 * its text never leaves the frame. Measured defect: at 9.6 s the gunshot
 * label's right edge was 81 px past the frame.
 */
export const EDGE_MARGIN = 8;

/**
 * Vertical gap (device px) left between two label plates when one is pushed
 * clear of another so they never overlap (task 22.2). Measured defect: at
 * 7.3 s the wind label (y 64) and car label (y 82) were only 18 px apart and
 * overlapped.
 */
export const LABEL_GAP = 4;

/**
 * Gap (device px) between the bottom of a sprite's body and the top of its
 * label plate (task 23.5): labels are always placed OUTSIDE the sprite body,
 * below it, so they never sit on top of the ghost image.
 */
export const LABEL_BELOW_GAP = 4;

/**
 * One label plate's geometry, in device pixels (tasks 22.1, 22.2). `x` is the
 * plate's centre; `y` is its top; `w`/`h` its size. `placeLabels` reads and
 * returns these; drawing happens afterwards from the resolved rectangle so a
 * label is clamped into the frame and never overlaps another.
 */
export interface LabelRect {
  /** Centre x of the plate in device px. */
  x: number;
  /** Top y of the plate in device px. */
  y: number;
  /** Plate width in device px. */
  w: number;
  /** Plate height in device px. */
  h: number;
}

/**
 * Resolve a frame's label plates so none leaves the frame and none overlaps
 * (tasks 22.1, 22.2). The input order is the priority order — the caller puts
 * the big ghost first, then the ambient fogs, then the markers — and each later
 * plate yields to the earlier ones it meets.
 *
 * Steps per plate, in input order:
 *   1. clamp its centre horizontally so the whole plate sits in
 *      `[EDGE_MARGIN, W - EDGE_MARGIN]` (task 22.1); the plate moves, not the
 *      ghost;
 *   2. while it intersects any already-placed plate, push it down by
 *      `LABEL_GAP` below the lowest one it hits (task 22.2);
 *   3. if pushing down would send it into the caption band (below
 *      `H*(1-captionBand)`), push it up above the highest intersecting plate
 *      instead, clamped so its top stays at `y >= 0`.
 *
 * Pure: it reads only the input rects and the frame/caption-band sizes and
 * returns new rects, so the properties (no two outputs intersect, all inside
 * the frame, none in the caption band) are covered by tests. When a frame is
 * so crowded that a plate cannot be placed without touching the band, it is
 * clamped to just above the band — the caption-band rule always wins (Req 6.5).
 */
export function placeLabels(
  rects: readonly LabelRect[],
  W: number,
  H: number,
  captionBand: number,
): LabelRect[] {
  const bandTop = H * (1 - clamp01(captionBand));
  const placed: LabelRect[] = [];

  for (const input of rects) {
    // 1. Clamp horizontally so the whole plate is inside the frame (task 22.1).
    const halfW = input.w / 2;
    let x = input.x;
    if (W >= input.w + EDGE_MARGIN * 2) {
      x = clampNum(x, EDGE_MARGIN + halfW, W - EDGE_MARGIN - halfW);
    } else {
      // Plate wider than the frame: centre it as best we can.
      x = W / 2;
    }

    let y = input.y;
    const h = input.h;

    // Highest allowed top so the plate stays clear of the caption band, and
    // never above the frame.
    const maxTop = Math.max(0, bandTop - h);
    y = clampNum(y, 0, maxTop);

    const candidate: LabelRect = { x, y, w: input.w, h };

    // 2/3. Resolve overlaps against already-placed plates (task 22.2). Only
    // plates that overlap this one horizontally can collide, so collect their
    // occupied vertical intervals and find the nearest free vertical slot of
    // height `h` within `[0, maxTop]`: first searching downward from the wished
    // `y` (keeping labels below their ghost where possible), then upward. This
    // always finds a non-overlapping slot when one exists (the earlier
    // push-down/push-up loop could leave a residual overlap on crowded frames,
    // the task-22.2 property defect fast-check found).
    const horizHits = placed
      .filter((p) => horizontallyOverlaps(candidate, p))
      .map((p) => ({ top: p.y, bottom: p.y + p.h }))
      .sort((a, b) => a.top - b.top);

    candidate.y = findFreeSlot(y, h, maxTop, horizHits);

    placed.push(candidate);
  }

  return placed;
}

/** Whether two plates overlap horizontally (share any x range). */
function horizontallyOverlaps(a: LabelRect, b: LabelRect): boolean {
  const aL = a.x - a.w / 2;
  const aR = a.x + a.w / 2;
  const bL = b.x - b.w / 2;
  const bR = b.x + b.w / 2;
  return aR > bL + 1e-9 && bR > aL + 1e-9;
}

/**
 * Find a vertical top position for a plate of height `h` that does not overlap
 * any of the `occupied` intervals (each `{top, bottom}` of a horizontally
 * overlapping plate), within `[0, maxTop]`. Prefers the wished position `wishY`,
 * then the nearest free slot below it, then the nearest above. Returns a top in
 * `[0, maxTop]`; on a frame so crowded no gap fits, it clamps to `maxTop` (the
 * caption-band rule always wins — the few-pixel residual there is covered by
 * the degenerate-frame handling). A `LABEL_GAP` is kept between plates.
 */
function findFreeSlot(
  wishY: number,
  h: number,
  maxTop: number,
  occupied: { top: number; bottom: number }[],
): number {
  const fits = (top: number): boolean => {
    if (top < 0 || top > maxTop + 1e-9) return false;
    const bottom = top + h;
    for (const o of occupied) {
      // Overlap if the plate [top, bottom] intersects [o.top - gap, o.bottom + gap).
      if (top < o.bottom + LABEL_GAP - 1e-9 && o.top - LABEL_GAP + 1e-9 < bottom) {
        return false;
      }
    }
    return true;
  };

  if (fits(wishY)) return wishY;

  // Candidate tops: just below each occupied interval (stack down) and just
  // above each (stack up), plus the band ceiling and floor. Pick the one that
  // fits and is closest to the wished position, breaking ties downward (keep
  // labels below their ghost) for determinism.
  const candidates: number[] = [0, maxTop];
  for (const o of occupied) {
    candidates.push(o.bottom + LABEL_GAP); // below this plate
    candidates.push(o.top - LABEL_GAP - h); // above this plate
  }
  let best: number | null = null;
  let bestKey = Infinity;
  for (const c of candidates) {
    if (!fits(c)) continue;
    // Prefer closest to wishY; on a tie prefer the lower (greater y) slot.
    const dist = Math.abs(c - wishY);
    const key = dist - (c > wishY ? 1e-6 : 0);
    if (key < bestKey) {
      bestKey = key;
      best = c;
    }
  }
  if (best !== null) return best;
  // No gap fits (extremely crowded): clamp to the band ceiling.
  return maxTop;
}

/** Clamp a number into [lo, hi]; if lo > hi, returns lo (degenerate frame). */
function clampNum(x: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return x < lo ? lo : x > hi ? hi : x;
}

/** The plate size (device px) for a label's text width (tasks 22.1, 22.2). */
export function labelPlateSize(textWidth: number): { w: number; h: number } {
  return { w: textWidth + LABEL_PAD_X * 2, h: LABEL_FONT_PX + LABEL_PAD_Y * 2 };
}

/**
 * A label waiting to be placed (tasks 22.1, 22.2): its text, the opacity to
 * draw it at, and its wished-for plate rectangle (centre x, top y, size). The
 * rect is resolved against the other plates by `placeLabels` before drawing.
 */
interface PendingLabel {
  text: string;
  opacity: number;
  rect: LabelRect;
  /** Draw the label in bold (task 23.5 arrival under reduced motion). */
  bold: boolean;
}

/**
 * Measure a label's plate at its wished-for anchor (`cx`, `topY`) without
 * drawing it (tasks 22.1, 22.2). The anchor matches where the inline label used
 * to sit (centred under the ghost); `placeLabels` then clamps it into the frame
 * and clear of other plates, and `drawLabelAt` paints it. `bold` (task 23.5)
 * is carried through so an arriving label under reduced motion is drawn bold.
 */
function measureLabel(
  ctx: Ctx2D,
  label: string,
  cx: number,
  topY: number,
  opacity: number,
  bold = false,
): PendingLabel {
  ctx.save();
  ctx.font = `${bold ? 'bold ' : ''}${LABEL_FONT_PX}px sans-serif`;
  const textW = ctx.measureText(label).width;
  ctx.restore();
  const { w, h } = labelPlateSize(textW);
  return { text: label, opacity, rect: { x: cx, y: topY, w, h }, bold };
}

/** Options for `draw`, so the sprite loader can be injected in tests. */
export interface DrawOptions {
  loader?: SpriteImageLoader;
  /**
   * Fraction of the viewport height reserved at the bottom for subtitles (task
   * 19.2/19.3). Fog textures and ambient sprites stay above it. Defaults to
   * {@link CAPTION_BAND}.
   */
  captionBandFrac?: number;
  /**
   * The active dialogue cue text to draw in the bottom caption band (task
   * 19.2), or null when none. White text on a dark plate, at most two lines.
   */
  dialogue?: string | null;
  /**
   * Opacity of the whole sound overlay (ghosts, edge fog, sound labels), 0..1,
   * used to fade it in and out in the `auto` show-when mode (task 21.1).
   * Defaults to 1. Dialogue subtitles ignore this and always draw at full
   * opacity. When 0 the sound overlay is skipped entirely.
   */
  overlayAlpha?: number;
}

/**
 * Draw every edge fog and sprite for one frame.
 *
 * @param ctx            the 2D context (or a structural fake in tests)
 * @param sprites        the laid-out point ghosts from `layout()`
 * @param fogs           the laid-out ambient edge fogs from `edgeFogs()`
 * @param time           the video's current time in seconds, driving tremble
 *                       and fog pulse; ignored under reduced motion
 * @param reducedMotion  when true, no tremble offset and no fog pulse — the
 *                       steady picture only (Req 6.6)
 * @param options        optional sprite-image loader (task 16.5)
 *
 * The canvas is cleared first, so the caller can redraw each frame. Edge fogs
 * are painted first (behind the ghosts); positions in sprites are fractions of
 * the viewport, turned into device pixels using the context's canvas size.
 */
export function draw(
  ctx: Ctx2D,
  sprites: readonly GhostSprite[],
  fogs: readonly EdgeFog[],
  time: number,
  reducedMotion: boolean,
  options: DrawOptions = {},
): void {
  const loader = options.loader ?? getDefaultSpriteLoader();
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const minDim = Math.min(W, H);
  const captionBand = Math.max(CAPTION_BAND, options.captionBandFrac ?? CAPTION_BAND);
  ctx.clearRect(0, 0, W, H);

  // The whole sound overlay fades with `overlayAlpha` (task 21.1). At 0 it is
  // skipped entirely; otherwise a thin proxy multiplies every per-shape
  // globalAlpha the fog/sprite helpers set, so one value dims the lot. Dialogue
  // is drawn later on the real ctx and is never dimmed.
  const overlayAlpha = clamp01(options.overlayAlpha ?? 1);
  if (overlayAlpha > 0) {
    const octx = overlayAlpha < 1 ? makeAlphaScaledCtx(ctx, overlayAlpha) : ctx;

    // Labels are collected first, then placed as a group so none leaves the
    // frame (task 22.1) and none overlaps another (task 22.2). The collection
    // order is the priority order placeLabels resolves in: the big ghost first,
    // then the ambient fogs, then the markers. Fogs and ghosts themselves are
    // drawn in their own z-order (fog behind ghosts); only the label plates are
    // deferred so their positions can be resolved together.
    const bigLabels: PendingLabel[] = [];
    const ambientLabels: PendingLabel[] = [];
    const markerLabels: PendingLabel[] = [];

    // Ambient edge fog sits behind the ghosts. drawEdgeFog paints the vignette,
    // texture and family sprite and returns the label plate(s) to place later
    // (a whole-frame fog returns one plate per edge, task 22.4).
    for (const fog of fogs) {
      const pending = drawEdgeFog(octx, fog, time, reducedMotion, loader, minDim, captionBand);
      ambientLabels.push(...pending);
    }

    // The loudest point ghost (largest scale) is the one big ghost; its label
    // has top priority. Everything else is a marker.
    let bigIndex = -1;
    let bigScale = -Infinity;
    sprites.forEach((sp, i) => {
      if (sp.scale > bigScale) {
        bigScale = sp.scale;
        bigIndex = i;
      }
    });

    sprites.forEach((sprite, i) => {
      const cx = sprite.x * W;
      const cy = sprite.y * H;
      const radius = BASE_RADIUS_PX * sprite.scale * minDim;

      let dx = 0;
      let dy = 0;
      if (!reducedMotion && sprite.trembleHz > 0) {
        const phase = 2 * Math.PI * sprite.trembleHz * time;
        dx = Math.sin(phase) * radius * TREMBLE_AMPLITUDE;
        dy = Math.cos(phase) * radius * TREMBLE_AMPLITUDE * 0.5;
      }

      drawFog(octx, cx + dx, cy + dy, radius, sprite.fog, time, reducedMotion);
      drawGhost(octx, sprite, cx + dx, cy + dy, radius, loader);
      // The label is placed just BELOW the sprite body (task 23.5) so it never
      // sits on top of the ghost image. placeLabels then clamps it into the
      // frame and clear of other plates. Under reduced motion an arriving label
      // is drawn bold in place of the scale pop (task 23.5).
      const labelTop = cy + dy + radius + LABEL_BELOW_GAP;
      const bold = reducedMotion && sprite.arriving;
      const pending = measureLabel(octx, sprite.label, cx + dx, labelTop, sprite.opacity, bold);
      if (i === bigIndex) bigLabels.push(pending);
      else markerLabels.push(pending);
    });

    // Resolve all plates together: big ghost, then ambient, then markers (task
    // 22.2). Each surviving plate is drawn at its resolved rectangle, clamped
    // into the frame and clear of the others and the caption band.
    const pendings = [...bigLabels, ...ambientLabels, ...markerLabels];
    const rects = placeLabels(
      pendings.map((p) => p.rect),
      W,
      H,
      captionBand,
    );
    pendings.forEach((p, i) => {
      const r = rects[i]!;
      drawLabelAt(octx, p.text, r, p.opacity, p.bold);
    });
  }

  // The active dialogue cue in the bottom caption band (task 19.2): drawn last
  // so it sits above the ghosts, white text on a dark plate, at most two lines.
  // It is never dimmed by overlayAlpha — a muted viewer still needs the
  // dialogue whatever the show-when mode (task 21.1).
  if (options.dialogue != null && options.dialogue.trim().length > 0) {
    drawDialogue(ctx, options.dialogue, W, H);
  }
}

/**
 * Wrap a 2D context so every `globalAlpha` assignment is multiplied by a fixed
 * factor (task 21.1). Lets one `overlayAlpha` fade the whole sound overlay
 * without threading it through every fog/sprite helper. All other members
 * delegate to the real context unchanged.
 */
function makeAlphaScaledCtx(ctx: Ctx2D, factor: number): Ctx2D {
  let base = 1;
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      if (prop === 'globalAlpha') return base * factor;
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, prop, value, receiver) {
      if (prop === 'globalAlpha') {
        base = value as number;
        (target as Ctx2D).globalAlpha = base * factor;
        return true;
      }
      return Reflect.set(target, prop, value, receiver);
    },
  }) as Ctx2D;
}

/**
 * Fog as a soft radial gradient around a point ghost; denser for a more
 * ominous sound (Req 6.2). Under reduced motion the opacity is the steady
 * `fog` level; otherwise it breathes by a small amount at a sub-1-Hz rate
 * (Req 6.6, 10.3).
 */
function drawFog(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  radius: number,
  fog: number,
  time: number,
  reducedMotion: boolean,
): void {
  if (fog <= 0) return;
  const fogRadius = radius * 2.2;
  let alpha = fog;
  if (!reducedMotion) {
    const pulse = Math.sin(2 * Math.PI * FOG_PULSE_HZ * time);
    alpha = clamp01(fog + pulse * FOG_PULSE_DEPTH * fog);
  }
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, fogRadius);
  grad.addColorStop(0, `rgba(120,130,150,${(alpha * 0.55).toFixed(3)})`);
  grad.addColorStop(1, 'rgba(120,130,150,0)');
  ctx.save();
  ctx.fillStyle = grad as unknown as CanvasGradient;
  ctx.globalAlpha = 1;
  ctx.fillRect(cx - fogRadius, cy - fogRadius, fogRadius * 2, fogRadius * 2);
  ctx.restore();
}

/**
 * Pale lavender light for the edge fog (task 18.1). Chosen so the fog is
 * clearly visible over both dark and bright video — the earlier dark grey-blue
 * (90,100,120) vanished on dark scenes (measured 4/255 edge change on the
 * Sintel wind scene). Lavender reads against black and still shows against a
 * bright frame.
 */
const FOG_RGB = '205,200,240';

/**
 * Minimum opacity an ambient event's family sprite is drawn at while the event
 * is active (task 22.4), so it stays clearly visible next to its texture and
 * never fades to a faint shape while its label is still on. The effective
 * sprite opacity is `max(this, fog.opacity)`.
 */
export const AMBIENT_SPRITE_MIN_OPACITY = 0.6;

/**
 * Draw one ambient event as an edge vignette (tasks 16.3, 18.1–18.3, 23.4,
 * 23.5). A linear gradient of pale lavender light fades from the covered edge
 * to transparent, so the central 60% of the frame is never covered (Req 6.5).
 *
 * Task 23.4: the edge is now one of `left`/`right` (a MEASURED side) or `top`
 * (no known side). A `top` fog sits in a band along the top edge with ONE
 * sprite + label — it no longer paints both side bands with two copies of the
 * same sprite. Several active top fogs sit side by side using `topSlot`/
 * `topCount`, never on top of each other. A `left`/`right` fog keeps its side
 * band, so a side band always means a measured side.
 *
 * Inside the covered band it adds a per-family motion texture (task 18.2, now
 * using note glyphs drawn as text for music — never bare rectangles, task
 * 23.4) and the family's sprite (task 18.3), popped on arrival and faded once
 * settled (task 23.5). The label is placed BELOW the sprite body (task 23.5).
 *
 * It paints the vignette, texture and sprite itself but DOES NOT draw its
 * label: it returns it as a {@link PendingLabel} so the caller can resolve
 * every plate of the frame together (tasks 22.1, 22.2).
 */
function drawEdgeFog(
  ctx: Ctx2D,
  fog: EdgeFog,
  time: number,
  reducedMotion: boolean,
  loader: SpriteImageLoader,
  minDim: number,
  captionBand: number,
): PendingLabel[] {
  if (fog.opacity <= 0) return [];
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const topH = H * (1 - captionBand);

  // A FOLDED ambient occurrence (task 25.3) is a small chip in the top-left
  // corner — sprite at 40% of the band-sprite size plus its plain name — and
  // paints no band, so the centre of the top edge stays free for in-video
  // titles. Several folded fogs stack downward without overlapping.
  if (fog.folded) {
    const chipRadius = baseRadiusFrac() * 0.5 * minDim * 0.4;
    const margin = 8;
    const slotH = chipRadius * 2 + 8;
    const cx = margin + chipRadius;
    const cy = margin + chipRadius + fog.foldSlot * slotH;
    drawAmbientSprite(ctx, fog.family, cx, cy, chipRadius, AMBIENT_SPRITE_MIN_OPACITY, loader);
    // The chip's label sits to the right of the sprite; its plate is placed by
    // placeLabels like any other (so it never leaves the frame or overlaps).
    const labelCX = cx + chipRadius + 2;
    const labelTop = cy - LABEL_FONT_PX / 2 - LABEL_PAD_Y;
    return [measureLabel(ctx, fog.label, labelCX + 40, labelTop, 1, false)];
  }

  // Side band width: half of the cleared-centre complement, so left+right
  // together leave the central FOG_CLEAR_CENTRE untouched.
  const sideFrac = (1 - FOG_CLEAR_CENTRE) / 2;
  const sideBandW = W * sideFrac;
  // The top band is a shallow strip along the top edge (above the picture
  // centre, never the caption band); its height is a fraction of the frame.
  const topBandH = Math.min(topH, H * TOP_BAND_FRAC);
  const spriteOpacity = Math.max(AMBIENT_SPRITE_MIN_OPACITY, fog.opacity);
  const baseAmbientRadius = baseRadiusFrac() * 0.5 * minDim;
  const ambientRadius = baseAmbientRadius * (fog.spriteScale || 1);

  if (fog.edge === 'top') {
    // A horizontal band at the top. Several top fogs split the band's width
    // into equal slots so their sprites + labels sit side by side (task 23.4).
    const count = Math.max(1, fog.topCount);
    const slot = Math.min(fog.topSlot, count - 1);
    const slotW = W / count;
    const slotX0 = slot * slotW;
    const slotCX = slotX0 + slotW / 2;

    // Task 24.2: the band is ONE vertical gradient across the FULL frame width,
    // so there is no hard vertical edge between slots. It is painted once — by
    // the first slot only — spanning the whole width; the slots then only
    // position each fog's sprite, label and texture. The old code painted a
    // per-slot rectangle, which left a visible seam at the slot boundary.
    if (slot === 0) {
      const grad = ctx.createLinearGradient(0, 0, 0, topBandH);
      grad.addColorStop(0, `rgba(${FOG_RGB},${fog.opacity.toFixed(3)})`);
      grad.addColorStop(1, `rgba(${FOG_RGB},0)`);
      ctx.save();
      ctx.fillStyle = grad as unknown as CanvasGradient;
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, W, topBandH);
      ctx.restore();
    }

    // Texture stays inside this slot's share of the band (task 24.3): the band
    // height is clamped to TOP_BAND_FRAC so the shapes never spill below it.
    drawFogTexture(ctx, fog, slotX0, slotW, topBandH, time, reducedMotion);

    // One sprite and one label for this slot, sprite above the label, both kept
    // inside the band (the label plate may extend just below it, never into the
    // caption band — placeLabels enforces that).
    const spriteCY = topBandH * 0.42;
    drawAmbientSprite(ctx, fog.family, slotCX, spriteCY, ambientRadius, spriteOpacity, loader);
    const labelTop = spriteCY + ambientRadius + LABEL_BELOW_GAP;
    return [measureLabel(ctx, fog.label, slotCX, labelTop, 1, reducedMotion && fog.arriving)];
  }

  // A measured side: paint that side's vertical band.
  const which: 'left' | 'right' = fog.edge;
  const x0 = which === 'left' ? 0 : W;
  const x1 = which === 'left' ? sideBandW : W - sideBandW;
  const grad = ctx.createLinearGradient(x0, 0, x1, 0);
  grad.addColorStop(0, `rgba(${FOG_RGB},${fog.opacity.toFixed(3)})`);
  grad.addColorStop(1, `rgba(${FOG_RGB},0)`);
  ctx.save();
  ctx.fillStyle = grad as unknown as CanvasGradient;
  ctx.globalAlpha = 1;
  const rectX = which === 'left' ? 0 : W - sideBandW;
  ctx.fillRect(rectX, 0, sideBandW, topH);
  ctx.restore();

  drawFogTexture(ctx, fog, rectX, sideBandW, topH, time, reducedMotion);

  const bandCentreX = which === 'left' ? sideBandW / 2 : W - sideBandW / 2;
  const spriteCY = H * 0.22;
  drawAmbientSprite(ctx, fog.family, bandCentreX, spriteCY, ambientRadius, spriteOpacity, loader);
  const labelTop = spriteCY + ambientRadius + LABEL_BELOW_GAP;
  return [measureLabel(ctx, fog.label, bandCentreX, labelTop, 1, reducedMotion && fog.arriving)];
}

/** Fraction of the frame height the shared top ambient band occupies (task 24.3, from config). */
export const TOP_BAND_FRAC = ghostConfig.topBandFrac.value;

/**
 * Draw the per-family motion texture inside one fog band (task 18.2, extended
 * in task 23.4). The band occupies `[bandX, bandX+bandW] × [0, bandH]`; shapes
 * stay inside it. Motion is driven by `time` and dropped under reduced motion
 * (a static texture at the same density). Density (count of shapes) scales with
 * `fog.textureDensity`.
 *
 * Task 23.4: music uses note GLYPHS (♪ ♫) drawn as text, never rectangles;
 * wind uses horizontal streaks; rain thin falling lines; thunder one slow
 * swell — no bare rectangles or bars remain in any texture. All shapes use the
 * same lavender light as the fog, so nothing flashes (Req 10.3).
 */
function drawFogTexture(
  ctx: Ctx2D,
  fog: EdgeFog,
  bandX: number,
  bandW: number,
  bandH: number,
  time: number,
  reducedMotion: boolean,
): void {
  const texture: FogTexture = fog.texture;
  if (texture === 'none') return;
  // A few shapes, more when denser; at least two so the texture always reads.
  const count = 2 + Math.round(fog.textureDensity * 4);
  const alpha = Math.min(1, fog.opacity * 1.4);
  const colour = `rgba(${FOG_RGB},${alpha.toFixed(3)})`;

  ctx.save();
  ctx.fillStyle = colour;
  ctx.globalAlpha = 1;

  // A rect clamped to the band so no shape ever reaches the central 60% of the
  // frame (Req 6.5). Used for wind/rain/thunder only — music uses glyph text.
  const bandEnd = bandX + bandW;
  const bandRect = (x: number, y: number, w: number, h: number) => {
    const x0 = Math.max(bandX, x);
    const x1 = Math.min(bandEnd, x + w);
    if (x1 <= x0) return;
    ctx.fillRect(x0, y, x1 - x0, h);
  };

  if (texture === 'notesTense' || texture === 'notesCalm') {
    // Music draws note glyphs as TEXT, never rectangles (task 23.4). Tense
    // drifts faster and uses the busier ♫; calm is slower with a plain ♪.
    const speed = texture === 'notesTense' ? 50 : 22;
    const glyph = texture === 'notesTense' ? '♫' : '♪';
    const size = (texture === 'notesTense' ? 0.09 : 0.11) * bandH;
    const glyphPx = Math.max(10, Math.round(size));
    ctx.font = `${glyphPx}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Glyphs stay inside the band (task 24.3): the drawable vertical range is
    // inset by half the glyph height so a drifting note never crosses the band
    // edge. Middle baseline means the glyph spans ±glyphPx/2 around y.
    const yMin = glyphPx / 2;
    const ySpan = Math.max(0, bandH - glyphPx);
    for (let i = 0; i < count; i++) {
      const fracX = (i + 0.5) / count;
      const x = bandX + fracX * bandW;
      const baseY = ((i * 0.37) % 1) * ySpan;
      const drift = reducedMotion ? 0 : ((time * speed + i * 40) % Math.max(1, ySpan));
      const y = yMin + ((baseY + drift) % Math.max(1, ySpan));
      ctx.fillText(glyph, x, y);
    }
    ctx.restore();
    return;
  }

  for (let i = 0; i < count; i++) {
    const fracX = (i + 0.5) / count;
    const fracY = (i * 0.37) % 1;
    const baseX = bandX + fracX * bandW;

    if (texture === 'windStreaks') {
      // Soft horizontal streaks drifting across the band. The streak height is
      // small, so the top is placed within [0, bandH - h] to stay inside the
      // band (task 24.3).
      const h = Math.max(2, bandH * 0.03);
      const yTop = fracY * Math.max(0, bandH - h);
      const drift = reducedMotion ? 0 : ((time * 40 + i * 30) % bandW);
      const x = bandX + ((fracX * bandW + drift) % bandW);
      const w = bandW * 0.5;
      bandRect(x, yTop, w, h);
    } else if (texture === 'rainStreaks') {
      // Thin falling streaks. The falling top is kept within [0, bandH - h] so
      // a streak never crosses the band's lower edge (task 24.3).
      const h = bandH * 0.18;
      const span = Math.max(1, bandH - h);
      const fall = reducedMotion ? 0 : ((time * 120 + i * 50) % span);
      const yTop = (fracY * span + fall) % span;
      const w = Math.max(1, bandW * 0.02);
      bandRect(baseX, yTop, w, h);
    } else if (texture === 'thunderSwell') {
      // One slow edge swell: a single broad band whose width breathes slowly,
      // never a flash (Req 10.3). Only one shape regardless of density.
      if (i > 0) continue;
      // A soft gradient from the band's outer edge, never a hard-edged block
      // (fun review 2026-11-09: the solid swell read as an unnamed rectangle).
      const swell = reducedMotion ? 0.6 : 0.6 + 0.3 * Math.sin(2 * Math.PI * 0.2 * time);
      // Brightness stays constant (Req 10.3); only the reach of the gradient
      // breathes slowly.
      const g =
        fog.edge === 'top'
          ? ctx.createLinearGradient(0, 0, 0, bandH * swell)
          : fog.edge === 'right'
            ? ctx.createLinearGradient(bandEnd, 0, bandEnd - bandW * swell, 0)
            : ctx.createLinearGradient(bandX, 0, bandX + bandW * swell, 0);
      g.addColorStop(0, `rgba(${FOG_RGB},${(alpha * 0.75).toFixed(3)})`);
      g.addColorStop(1, `rgba(${FOG_RGB},0)`);
      ctx.fillStyle = g as unknown as CanvasGradient;
      ctx.fillRect(bandX, 0, bandW, bandH);
      ctx.fillStyle = colour;
    }
  }
  ctx.restore();
}

/**
 * Draw an ambient event's family sprite inside its fog band at reduced size
 * (task 18.3): the PNG when loaded, else the Path2D silhouette fallback (task
 * 16.5), both at `opacity`. The caller passes an opacity of at least
 * `AMBIENT_SPRITE_MIN_OPACITY` while the event is active (task 22.4), and this
 * draws at exactly that opacity (no extra dimming) so the sprite never fades to
 * a faint shape while its label is on. Centred at (cx, cy) in a box of side
 * `2*radius`.
 */
function drawAmbientSprite(
  ctx: Ctx2D,
  family: Family,
  cx: number,
  cy: number,
  radius: number,
  opacity: number,
  loader: SpriteImageLoader,
): void {
  const entry = loader.load(family);
  if (entry.loaded && entry.image) {
    ctx.save();
    ctx.globalAlpha = clamp01(opacity);
    const side = radius * 2;
    ctx.drawImage(entry.image, cx - radius, cy - radius, side, side);
    ctx.restore();
    return;
  }
  const path = familyPaths()[family];
  if (!path) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(radius, radius);
  ctx.globalAlpha = clamp01(opacity);
  ctx.fillStyle = `rgba(${FOG_RGB},0.95)`;
  ctx.fill(path);
  ctx.restore();
}

/**
 * Draw a point ghost: the family's PNG sprite when it is loaded, else the
 * Path2D silhouette fallback (task 16.5). Both are drawn at the sprite's
 * opacity. The sprite fills a box of side `2*radius` centred at (cx, cy).
 */
function drawGhost(
  ctx: Ctx2D,
  sprite: GhostSprite,
  cx: number,
  cy: number,
  radius: number,
  loader: SpriteImageLoader,
): void {
  const entry = loader.load(sprite.family);
  if (entry.loaded && entry.image) {
    ctx.save();
    ctx.globalAlpha = clamp01(sprite.opacity) * 0.95;
    const side = radius * 2;
    ctx.drawImage(entry.image, cx - radius, cy - radius, side, side);
    ctx.restore();
    return;
  }
  // Fallback silhouette.
  const path = familyPaths()[sprite.family];
  if (!path) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(radius, radius);
  ctx.globalAlpha = clamp01(sprite.opacity) * 0.92;
  ctx.fillStyle = 'rgba(236,240,248,0.92)';
  ctx.fill(path);
  ctx.restore();
}

/**
 * The opacity floor at which a ghost/chip is still "visible at all" (task
 * 25.4): when its sprite opacity is at or above this, its label plate is drawn
 * at FULL opacity (the text must stay readable even while the ghost image is
 * dimmed by the face band or a fade). Below it the whole label is skipped.
 */
export const LABEL_VISIBLE_FLOOR = 0.15;

/**
 * Draw a label on a dark backing plate so it meets WCAG AA contrast over any
 * video (Req 6.4, 10.2), at the plate rectangle `placeLabels` resolved (tasks
 * 22.1, 22.2).
 *
 * Task 25.4 — the plate and text are drawn at FULL opacity whenever the ghost
 * or chip is visible at all (`opacity >= LABEL_VISIBLE_FLOOR`), on a darker
 * near-opaque plate (rgba 8,10,16,0.94). Only the ghost IMAGE dims (face band,
 * fades), never the text plate, so a label is never drawn at a washed-out alpha
 * (measured defect: the vehicle label at 7.3 s was drawn at alpha 0.55). Below
 * the floor the label is omitted entirely with its ghost.
 */
function drawLabelAt(ctx: Ctx2D, label: string, rect: LabelRect, opacity: number, bold = false): void {
  if (clamp01(opacity) < LABEL_VISIBLE_FLOOR) return;
  ctx.save();
  ctx.font = `${bold ? 'bold ' : ''}${LABEL_FONT_PX}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const plateX = rect.x - rect.w / 2;
  const plateY = rect.y;

  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(8,10,16,0.94)';
  ctx.fillRect(plateX, plateY, rect.w, rect.h);

  ctx.fillStyle = 'rgba(240,242,248,1)';
  ctx.fillText(label, rect.x, plateY + LABEL_PAD_Y);
  ctx.restore();
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Dialogue subtitle typography (task 19.2), larger than the ghost labels. */
const DIALOGUE_FONT_PX = 22;
const DIALOGUE_LINE_PX = 30;
const DIALOGUE_PAD_X = 12;
const DIALOGUE_PAD_Y = 8;
/** Bottom margin of the dialogue plate as a fraction of the viewport height. */
const DIALOGUE_BOTTOM_FRAC = 0.03;
/** At most two lines are shown (task 19.2). */
const DIALOGUE_MAX_LINES = 2;

/**
 * Split a dialogue cue into at most two display lines (task 19.2). Explicit
 * newlines in the cue are honoured first; a long single line is wrapped on
 * word boundaries using the measured text width against `maxWidth`. If the
 * text still does not fit in two lines, the second line is truncated with an
 * ellipsis so the plate never grows past two lines.
 */
export function wrapDialogueLines(
  ctx: Pick<Ctx2D, 'measureText' | 'font'>,
  text: string,
  maxWidth: number,
): string[] {
  const prevFont = ctx.font;
  ctx.font = `${DIALOGUE_FONT_PX}px sans-serif`;
  const fits = (s: string) => ctx.measureText(s).width <= maxWidth;

  const rawLines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const out: string[] = [];
  for (const raw of rawLines) {
    if (out.length >= DIALOGUE_MAX_LINES) break;
    if (fits(raw)) {
      out.push(raw);
      continue;
    }
    // Word-wrap this line into as many display lines as needed.
    const words = raw.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate) || line === '') {
        line = candidate;
      } else {
        out.push(line);
        line = word;
        if (out.length >= DIALOGUE_MAX_LINES) break;
      }
    }
    if (line && out.length < DIALOGUE_MAX_LINES) out.push(line);
  }

  const limited = out.slice(0, DIALOGUE_MAX_LINES);
  // Ellipsis the last line if we had to drop content.
  if (
    limited.length === DIALOGUE_MAX_LINES &&
    (out.length > DIALOGUE_MAX_LINES || rawLines.join(' ').length > limited.join(' ').length)
  ) {
    let last = limited[DIALOGUE_MAX_LINES - 1]!;
    while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
    limited[DIALOGUE_MAX_LINES - 1] = `${last}…`;
  }
  ctx.font = prevFont;
  return limited;
}

/**
 * The fraction of the viewport height the rendered dialogue cue occupies (task
 * 19.2), so the layout can raise the caption band to match: taller cues push
 * ghosts further up. Returns 0 for an empty cue. The value includes the plate
 * padding and the bottom margin, matching what `drawDialogue` paints.
 */
export function measureDialogueBandFrac(
  ctx: Pick<Ctx2D, 'measureText' | 'font' | 'canvas'>,
  text: string | null | undefined,
): number {
  if (text == null || text.trim().length === 0) return 0;
  const H = ctx.canvas.height;
  if (H <= 0) return 0;
  const maxWidth = ctx.canvas.width * 0.9 - DIALOGUE_PAD_X * 2;
  const lines = wrapDialogueLines(ctx, text, maxWidth);
  if (lines.length === 0) return 0;
  const plateH = lines.length * DIALOGUE_LINE_PX + DIALOGUE_PAD_Y * 2;
  const totalPx = plateH + H * DIALOGUE_BOTTOM_FRAC;
  return totalPx / H;
}

/**
 * Draw the active dialogue cue in the bottom caption band (task 19.2): white
 * text on a dark plate at AA contrast (Req 10.2), centred horizontally, at most
 * two lines (longer cues wrap then ellipsis). The plate sits just above the
 * bottom edge. Ghosts, labels and edge fog are kept out of this band by the
 * caller passing the measured band fraction to `layout`/`draw`.
 */
function drawDialogue(ctx: Ctx2D, text: string, W: number, H: number): void {
  const maxWidth = W * 0.9 - DIALOGUE_PAD_X * 2;
  const lines = wrapDialogueLines(ctx, text, maxWidth);
  if (lines.length === 0) return;

  ctx.save();
  ctx.font = `${DIALOGUE_FONT_PX}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  let widest = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > widest) widest = w;
  }
  const plateW = widest + DIALOGUE_PAD_X * 2;
  const plateH = lines.length * DIALOGUE_LINE_PX + DIALOGUE_PAD_Y * 2;
  const plateX = W / 2 - plateW / 2;
  const plateY = H - plateH - H * DIALOGUE_BOTTOM_FRAC;

  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(10,12,18,0.82)';
  ctx.fillRect(plateX, plateY, plateW, plateH);

  ctx.fillStyle = 'rgba(245,247,252,1)';
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, plateY + DIALOGUE_PAD_Y + i * DIALOGUE_LINE_PX);
  });
  ctx.restore();
}
