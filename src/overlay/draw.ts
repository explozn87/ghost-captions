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

import type { EdgeFog, Family, FogEdge, FogTexture, GhostSprite } from '../shared/types.ts';
import { FOG_CLEAR_CENTRE, baseRadiusFrac, CAPTION_BAND } from './layout.ts';

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

    // Ambient edge fog sits behind the ghosts.
    for (const fog of fogs) {
      drawEdgeFog(octx, fog, time, reducedMotion, loader, minDim, captionBand);
    }

    for (const sprite of sprites) {
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
      drawLabel(octx, sprite.label, cx + dx, cy + dy + radius * 0.2, sprite.opacity);
    }
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
 * Draw one ambient event as an edge vignette (tasks 16.3, 18.1–18.3). A linear
 * gradient of pale lavender light fades from the covered edge to fully
 * transparent by `FOG_CLEAR_CENTRE` of the way across, so the central 60% of
 * the frame is never covered (Req 6.5). Whole-frame fog paints both the left
 * and right edges; a known side paints only that edge. The opacity, already
 * capped and smoothed by layout, is shown as-is (no brightness oscillation — a
 * slow steady vignette, so thunder reads as one slow pulse, never a white
 * flash, Req 10.3).
 *
 * Inside the band it adds a per-family motion texture (task 18.2: wind
 * streaks, rain streaks, a thunder swell, drifting notes) and the family's
 * sprite at half the point-ghost size with the label on a backing plate (task
 * 18.3), both in the upper part of the band so the viewer can identify the
 * sound without the animation (Req 6.3, 6.4) and nothing reaches the caption
 * band (Req 6.5). Reduced motion freezes the texture at the same density.
 */
function drawEdgeFog(
  ctx: Ctx2D,
  fog: EdgeFog,
  time: number,
  reducedMotion: boolean,
  loader: SpriteImageLoader,
  minDim: number,
  captionBand: number,
): void {
  if (fog.opacity <= 0) return;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  // Band width: half of the cleared-centre complement, so left+right together
  // leave the central FOG_CLEAR_CENTRE untouched.
  const sideFrac = (1 - FOG_CLEAR_CENTRE) / 2;
  const bandW = W * sideFrac;

  const paintEdge = (which: 'left' | 'right') => {
    const x0 = which === 'left' ? 0 : W;
    const x1 = which === 'left' ? bandW : W - bandW;
    const grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, `rgba(${FOG_RGB},${fog.opacity.toFixed(3)})`);
    grad.addColorStop(1, `rgba(${FOG_RGB},0)`);
    ctx.save();
    ctx.fillStyle = grad as unknown as CanvasGradient;
    ctx.globalAlpha = 1;
    const rectX = which === 'left' ? 0 : W - bandW;
    // The vignette stops at the top of the caption band so it never covers the
    // dialogue subtitle (task 19.2); the central 60% is already clear.
    ctx.fillRect(rectX, 0, bandW, H * (1 - captionBand));
    ctx.restore();
  };

  const edges: FogEdge = fog.edge;
  const paintedEdges: Array<'left' | 'right'> = edges === 'all' ? ['left', 'right'] : [edges];
  for (const e of paintedEdges) paintEdge(e);

  // Band texture inside each covered edge (task 18.2).
  for (const e of paintedEdges) {
    const bandX = e === 'left' ? 0 : W - bandW;
    drawFogTexture(ctx, fog, bandX, bandW, H, time, reducedMotion, captionBand);
  }

  // The family's sprite at half the point-ghost size, in the upper band (task
  // 18.3), so the sound is identifiable without the animation.
  const spriteX = edgeLabelX(fog.edge, W, bandW);
  const ambientRadius = baseRadiusFrac() * 0.5 * minDim;
  drawAmbientSprite(ctx, fog.family, spriteX, H * 0.22, ambientRadius, fog.opacity, loader);

  // Label on a dark backing plate near the edge, above the sprite in the upper
  // part of the band — never in the caption band (Req 6.4, 6.5, 10.2).
  drawLabel(ctx, fog.label, spriteX, H * 0.1, 1);
}

/**
 * Draw the per-family motion texture inside one fog band (task 18.2). The band
 * occupies `[bandX, bandX+bandW] × [0, H]`; shapes stay inside it. Motion is
 * driven by `time` and dropped under reduced motion (a static texture at the
 * same density). Density (count of shapes) scales with `fog.textureDensity`.
 * All shapes use the same lavender light as the fog, so nothing flashes
 * (Req 10.3).
 */
function drawFogTexture(
  ctx: Ctx2D,
  fog: EdgeFog,
  bandX: number,
  bandW: number,
  H: number,
  time: number,
  reducedMotion: boolean,
  captionBand: number,
): void {
  const texture: FogTexture = fog.texture;
  if (texture === 'none') return;
  // The texture lives above the caption band, clear of the dialogue subtitle.
  const topH = H * (1 - captionBand);
  // A few shapes, more when denser; at least one so the texture always reads.
  const count = 2 + Math.round(fog.textureDensity * 4);
  const alpha = Math.min(1, fog.opacity * 1.4);
  const colour = `rgba(${FOG_RGB},${alpha.toFixed(3)})`;

  ctx.save();
  ctx.fillStyle = colour;
  ctx.globalAlpha = 1;

  // Draw a rect clamped to the band [bandX, bandX+bandW] so no texture shape
  // ever reaches the central 60% of the frame (Req 6.5).
  const bandEnd = bandX + bandW;
  const bandRect = (x: number, y: number, w: number, h: number) => {
    const x0 = Math.max(bandX, x);
    const x1 = Math.min(bandEnd, x + w);
    if (x1 <= x0) return;
    ctx.fillRect(x0, y, x1 - x0, h);
  };

  for (let i = 0; i < count; i++) {
    // A per-shape base position spread across the band and height.
    const fracX = (i + 0.5) / count;
    const fracY = ((i * 0.37) % 1);
    const baseX = bandX + fracX * bandW;
    const baseY = fracY * topH;

    if (texture === 'windStreaks') {
      // Soft horizontal streaks drifting across the band.
      const drift = reducedMotion ? 0 : ((time * 40 + i * 30) % bandW);
      const x = bandX + ((fracX * bandW + drift) % bandW);
      const w = bandW * 0.5;
      const h = Math.max(2, H * 0.012);
      bandRect(x, baseY, w, h);
    } else if (texture === 'rainStreaks') {
      // Thin falling streaks.
      const fall = reducedMotion ? 0 : ((time * 120 + i * 50) % topH);
      const y = (baseY + fall) % topH;
      const w = Math.max(1, bandW * 0.02);
      const h = H * 0.06;
      bandRect(baseX, y, w, h);
    } else if (texture === 'thunderSwell') {
      // One slow edge swell: a single broad bar whose width breathes slowly,
      // never a flash (Req 10.3). Only one shape regardless of density.
      if (i > 0) continue;
      const swell = reducedMotion ? 0.6 : 0.6 + 0.3 * Math.sin(2 * Math.PI * 0.2 * time);
      bandRect(bandX, 0, bandW * swell, topH);
    } else if (texture === 'notesTense' || texture === 'notesCalm') {
      // A few note shapes drifting slowly; tense drifts faster and sharper.
      const speed = texture === 'notesTense' ? 50 : 22;
      const size = (texture === 'notesTense' ? 0.05 : 0.07) * H;
      const drift = reducedMotion ? 0 : ((time * speed + i * 40) % topH);
      const y = (baseY + drift) % topH;
      // Note head (square) with a stem.
      bandRect(baseX, y, size, size);
      bandRect(baseX + size * 0.8, y - size, Math.max(1, size * 0.15), size * 1.2);
    }
  }
  ctx.restore();
}

/**
 * Draw an ambient event's family sprite inside its fog band at reduced size
 * (task 18.3): the PNG when loaded, else the Path2D silhouette fallback (task
 * 16.5), both at the fog's opacity. Centred at (cx, cy) in a box of side
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
    ctx.globalAlpha = clamp01(opacity) * 0.95;
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
  ctx.globalAlpha = clamp01(opacity) * 0.92;
  ctx.fillStyle = `rgba(${FOG_RGB},0.95)`;
  ctx.fill(path);
  ctx.restore();
}

/** Horizontal anchor (device px) for an edge fog's label. */
function edgeLabelX(edge: FogEdge, W: number, bandW: number): number {
  if (edge === 'left') return bandW / 2;
  if (edge === 'right') return W - bandW / 2;
  return W / 2; // whole-frame fog: centre the label at the top
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
 * Draw the label on a dark backing plate so it meets WCAG AA contrast over any
 * video (Req 6.4, 10.2). The plate is sized to the measured text; text is
 * near-white on a near-opaque dark plate (contrast ratio > 12:1). `opacity`
 * fades the whole label with its ghost/fog while keeping the contrast ratio
 * (plate and text fade together).
 */
function drawLabel(ctx: Ctx2D, label: string, cx: number, cy: number, opacity: number): void {
  const a = clamp01(opacity);
  if (a <= 0) return;
  ctx.save();
  ctx.font = `${LABEL_FONT_PX}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const metrics = ctx.measureText(label);
  const textW = metrics.width;
  const plateW = textW + LABEL_PAD_X * 2;
  const plateH = LABEL_FONT_PX + LABEL_PAD_Y * 2;
  const plateX = cx - plateW / 2;
  const plateY = cy;

  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(12,14,20,0.9)';
  ctx.fillRect(plateX, plateY, plateW, plateH);

  ctx.fillStyle = 'rgba(240,242,248,1)';
  ctx.fillText(label, cx, plateY + LABEL_PAD_Y);
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
