// Overlay drawing (task 8.2): paint the laid-out sprites onto a 2D canvas.
//
// `draw(ctx, sprites, time, reducedMotion)` renders the `GhostSprite[]` that
// `layout()` produced (task 8.1). It is the only part of the overlay that
// touches a canvas; all positioning maths already happened in `layout`, so
// `draw` only turns sprites into pixels. The animated parts it adds — tremble
// and fog pulse — are driven by `time` (the video's current time in seconds)
// so the same frame redraws identically and tests can assert a given frame.
//
// The rules this file is responsible for (Requirements 6.3, 6.4, 6.6, 10.2,
// 10.3):
//   - one distinct silhouette per family, so families are told apart without
//     colour (Req 6.3): the shapes are baked `Path2D` outlines;
//   - every ghost's label sits on a dark backing plate at AA contrast so it is
//     readable over any video (Req 6.4, 10.2);
//   - reduced motion draws the static picture: no tremble offset, no fog
//     pulse, just the steady fog level, position, size and label (Req 6.6);
//   - tremble is a gentle positional wobble whose frequency `layout` already
//     capped below 3 Hz, and it moves the ghost rather than flashing its
//     brightness, so nothing flashes more than three times per second
//     (Req 10.3). The fog "pulse" is likewise a small opacity breathing well
//     under 3 Hz and is disabled under reduced motion.

import type { Family, GhostSprite } from '../shared/types.ts';

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
  fillStyle: string | CanvasGradient;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
}

/**
 * Per-family silhouette as an SVG path string drawn inside a unit box roughly
 * [-1,-1]..[1,1]. Each outline is visually distinct (Req 6.3): a classic sheet
 * ghost for unknown, and variations (ears, points, bars, waves) so a viewer
 * can tell families apart by shape alone. The paths are deliberately simple so
 * they stay crisp at any scale.
 */
const FAMILY_PATH_SOURCE: Record<Family, string> = {
  // Classic sheet ghost with a wavy hem — the base shape.
  unknown:
    'M -0.7 0.9 L -0.7 -0.1 A 0.7 0.7 0 0 1 0.7 -0.1 L 0.7 0.9 L 0.45 0.7 L 0.2 0.9 L 0 0.7 L -0.2 0.9 L -0.45 0.7 Z',
  // Ghost with two feet — footsteps.
  footsteps:
    'M -0.7 0.9 L -0.7 -0.1 A 0.7 0.7 0 0 1 0.7 -0.1 L 0.7 0.9 L 0.3 0.9 L 0.3 0.6 L -0.3 0.6 L -0.3 0.9 Z',
  // Ghost framed like a doorway — door & knock.
  door: 'M -0.6 0.9 L -0.6 -0.5 A 0.6 0.6 0 0 1 0.6 -0.5 L 0.6 0.9 Z',
  // Ghost with an open mouth — voice & scream.
  voice:
    'M -0.7 0.9 L -0.7 -0.1 A 0.7 0.7 0 0 1 0.7 -0.1 L 0.7 0.9 L 0.5 0.7 L 0 0.9 L -0.5 0.7 Z',
  // Jagged, spiky ghost — tense music.
  tenseMusic:
    'M -0.8 0.9 L -0.6 0.2 L -0.8 -0.2 L -0.4 -0.3 L -0.5 -0.8 L 0 -0.5 L 0.5 -0.8 L 0.4 -0.3 L 0.8 -0.2 L 0.6 0.2 L 0.8 0.9 Z',
  // Soft rounded blob — calm music.
  calmMusic: 'M 0 -0.8 A 0.8 0.8 0 1 1 -0.01 -0.8 Z',
  // Starburst — impact & explosion.
  impact:
    'M 0 -0.9 L 0.2 -0.25 L 0.85 -0.3 L 0.35 0.1 L 0.6 0.75 L 0 0.35 L -0.6 0.75 L -0.35 0.1 L -0.85 -0.3 L -0.2 -0.25 Z',
  // Rounded box on wheels — engine & vehicle.
  vehicle:
    'M -0.8 0.4 L -0.8 -0.1 L -0.4 -0.1 L -0.2 -0.5 L 0.8 -0.5 L 0.8 0.4 Z',
  // Ghost with pointed ears — animal.
  animal:
    'M -0.6 -0.3 L -0.8 -0.9 L -0.3 -0.5 A 0.6 0.6 0 0 1 0.3 -0.5 L 0.8 -0.9 L 0.6 -0.3 L 0.7 0.9 L -0.7 0.9 Z',
  // Wavy horizontal bands — weather.
  weather:
    'M -0.9 -0.5 Q -0.45 -0.8 0 -0.5 Q 0.45 -0.2 0.9 -0.5 L 0.9 0.5 Q 0.45 0.2 0 0.5 Q -0.45 0.8 -0.9 0.5 Z',
  // Bell outline — alarm & siren.
  alarm:
    'M 0 -0.8 C 0.6 -0.8 0.6 0.1 0.8 0.5 L -0.8 0.5 C -0.6 0.1 -0.6 -0.8 0 -0.8 Z',
  // Cracked shard — breaking glass.
  glass:
    'M -0.6 0.9 L -0.2 -0.2 L -0.5 -0.6 L 0.1 -0.3 L 0 -0.9 L 0.35 -0.25 L 0.7 -0.6 L 0.4 0.1 L 0.7 0.9 L 0 0.5 Z',
};

/**
 * The silhouettes baked lazily to `Path2D`. In a browser `Path2D` accepts an
 * SVG path string; where it is absent the renderer skips the fill (the label
 * still draws — information never depends only on the silhouette, Req 6.4).
 *
 * Baking is lazy and re-attempted while `Path2D` is still unavailable, so the
 * first real `draw` in a browser bakes once, and a test that provides a
 * `Path2D` before drawing also gets real paths.
 */
let bakedPaths: Record<Family, Path2D | null> | null = null;

function familyPaths(): Record<Family, Path2D | null> {
  const hasPath2D = typeof Path2D !== 'undefined';
  // Re-bake if we have not baked yet, or we baked without Path2D and it is now
  // available.
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

/** Base sprite radius in pixels before per-sprite scale (matches layout). */
const BASE_RADIUS_PX = 0.08;

/** Label typography. The backing plate guarantees AA contrast (Req 10.2). */
const LABEL_FONT_PX = 16;
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 4;

/**
 * Draw every sprite for one frame.
 *
 * @param ctx            the 2D context (or a structural fake in tests)
 * @param sprites        the laid-out ghosts from `layout()`
 * @param time           the video's current time in seconds, driving tremble
 *                       and fog pulse; ignored under reduced motion
 * @param reducedMotion  when true, no tremble offset and no fog pulse — the
 *                       steady picture only (Req 6.6)
 *
 * The canvas is cleared first, so the caller can redraw each frame. Positions
 * in sprites are fractions of the viewport; here they become device pixels
 * using the context's canvas size.
 */
export function draw(
  ctx: Ctx2D,
  sprites: readonly GhostSprite[],
  time: number,
  reducedMotion: boolean,
): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const minDim = Math.min(W, H);
  ctx.clearRect(0, 0, W, H);

  for (const sprite of sprites) {
    const cx = sprite.x * W;
    const cy = sprite.y * H;
    const radius = BASE_RADIUS_PX * sprite.scale * minDim;

    // Tremble: a small positional wobble at the sprite's (already capped)
    // frequency. It moves the ghost; it never changes brightness, so it cannot
    // cause a flash (Req 10.3). Off under reduced motion.
    let dx = 0;
    let dy = 0;
    if (!reducedMotion && sprite.trembleHz > 0) {
      const phase = 2 * Math.PI * sprite.trembleHz * time;
      dx = Math.sin(phase) * radius * TREMBLE_AMPLITUDE;
      dy = Math.cos(phase) * radius * TREMBLE_AMPLITUDE * 0.5;
    }

    drawFog(ctx, cx + dx, cy + dy, radius, sprite.fog, time, reducedMotion);
    drawSilhouette(ctx, sprite.family, cx + dx, cy + dy, radius);
    drawLabel(ctx, sprite.label, cx + dx, cy + dy + radius * 0.2);
  }
}

/**
 * Fog as a soft radial gradient around the ghost; denser for a more ominous
 * sound (Req 6.2). Under reduced motion the opacity is the steady `fog` level;
 * otherwise it breathes by a small amount at a sub-1-Hz rate (Req 6.6, 10.3).
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
 * Draw the family silhouette centred at (cx, cy), scaled so the unit path fills
 * a box of the given radius. A single near-white fill keeps families readable
 * by shape, not colour (Req 6.3). If `Path2D` is unavailable (jsdom) the fill
 * is skipped; the label still carries the information (Req 6.4).
 */
function drawSilhouette(
  ctx: Ctx2D,
  family: Family,
  cx: number,
  cy: number,
  radius: number,
): void {
  const path = familyPaths()[family];
  if (!path) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(radius, radius);
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = 'rgba(236,240,248,0.92)';
  ctx.fill(path);
  ctx.restore();
}

/**
 * Draw the label on a dark backing plate so it meets WCAG AA contrast over any
 * video (Req 6.4, 10.2). The plate is sized to the measured text; text is
 * near-white on a near-opaque dark plate (contrast ratio > 12:1).
 */
function drawLabel(ctx: Ctx2D, label: string, cx: number, cy: number): void {
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

  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(12,14,20,0.9)';
  ctx.fillRect(plateX, plateY, plateW, plateH);

  ctx.fillStyle = 'rgba(240,242,248,1)';
  ctx.fillText(label, cx, plateY + LABEL_PAD_Y);
  ctx.restore();
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
