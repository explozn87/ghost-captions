import { describe, it, expect, beforeAll } from 'vitest';
import {
  draw,
  labelFontPx,
  dialogueFontPx,
  measureDialogueBandFrac,
  type Ctx2D,
  type SpriteImageLoader,
} from '../src/overlay/draw.ts';
import type { EdgeFog, GhostSprite } from '../src/shared/types.ts';
import { ghostConfig } from '../src/config/ghost.config.ts';

// Task 38: dialogue looks like ordinary US subtitles so it cannot be mistaken
// for a sound name.
//   - 38.1 dialogue = white sans-serif text, no plate, black outline + soft
//     shadow; font / wrapping / two-line limit / bottom margin / band
//     measurement unchanged.
//   - 38.2 sound labels keep their dark plate but are drawn in lavender
//     (soundLabelColor), contrast >= 4.5:1 on the plate.
//   - 38.3 tests on the fake 2D context.

// jsdom lacks Path2D; stub a minimal one so the silhouette fill path runs.
beforeAll(() => {
  if (typeof (globalThis as { Path2D?: unknown }).Path2D === 'undefined') {
    (globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(_d?: string) {}
    };
  }
});

/** One recorded drawing call, capturing the style in force at the call. */
interface Call {
  op: string;
  args: unknown[];
  fillStyle: string | CanvasGradient;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: string;
  globalAlpha: number;
}

/** A recording fake 2D context implementing the structural Ctx2D (task 38.3). */
function makeFakeCtx(width = 800, height = 600): Ctx2D & { calls: Call[] } {
  const calls: Call[] = [];
  const ctx: Ctx2D & { calls: Call[] } = {
    calls,
    canvas: { width, height },
    fillStyle: '#000',
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    strokeStyle: '#000',
    lineWidth: 1,
    lineJoin: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save() { calls.push(rec('save', [])); },
    restore() { calls.push(rec('restore', [])); },
    translate(x, y) { calls.push(rec('translate', [x, y])); },
    scale(x, y) { calls.push(rec('scale', [x, y])); },
    beginPath() { calls.push(rec('beginPath', [])); },
    fill(path) { calls.push(rec('fill', [path])); },
    clearRect(x, y, w, h) { calls.push(rec('clearRect', [x, y, w, h])); },
    fillRect(x, y, w, h) { calls.push(rec('fillRect', [x, y, w, h])); },
    drawImage(image, dx, dy, dw, dh) { calls.push(rec('drawImage', [image, dx, dy, dw, dh])); },
    measureText(text) { return { width: text.length * 8 }; },
    fillText(text, x, y) { calls.push(rec('fillText', [text, x, y])); },
    strokeText(text, x, y) { calls.push(rec('strokeText', [text, x, y])); },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
  };
  function rec(op: string, args: unknown[]): Call {
    return {
      op,
      args,
      fillStyle: ctx.fillStyle,
      strokeStyle: ctx.strokeStyle,
      lineWidth: ctx.lineWidth,
      lineJoin: ctx.lineJoin,
      globalAlpha: ctx.globalAlpha,
    };
  }
  return ctx;
}

const silhouetteOnlyLoader: SpriteImageLoader = {
  load() {
    return { image: null, loaded: true };
  },
};

function sprite(over: Partial<GhostSprite> = {}): GhostSprite {
  return {
    family: 'gunshot',
    x: 0.5,
    y: 0.3,
    scale: 1,
    fog: 0,
    trembleHz: 0,
    opacity: 1,
    label: 'Gunshot',
    arriving: false,
    ...over,
  };
}

function fog(over: Partial<EdgeFog> = {}): EdgeFog {
  return {
    family: 'wind',
    edge: 'left',
    opacity: 0.3,
    label: 'Wind',
    texture: 'windStreaks',
    textureDensity: 0.5,
    spriteScale: 1,
    settled: false,
    folded: false,
    foldSlot: 0,
    foldCount: 0,
    topSlot: 0,
    topCount: 1,
    arriving: false,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Contrast helpers (WCAG 2.x relative luminance / contrast ratio).
// ---------------------------------------------------------------------------

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function relLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
/** Composite a semi-transparent colour over an opaque background. */
function over(
  fg: [number, number, number],
  alpha: number,
  bg: [number, number, number],
): [number, number, number] {
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}
/** Parse a `#rrggbb` colour to an RGB triple. */
function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`bad hex ${hex}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

// ---------------------------------------------------------------------------
// 38.2 sound label colour + contrast.
// ---------------------------------------------------------------------------

describe('38.2: sound labels are lavender on the dark plate', () => {
  it('carries a soundLabelColor config value with a why', () => {
    expect(ghostConfig.soundLabelColor.value).toBe('#b9b3ff');
    expect(ghostConfig.soundLabelColor.why.trim().length).toBeGreaterThan(0);
  });

  it('the lavender text meets WCAG AA (>= 4.5:1) on the dark plate over any background', () => {
    const text = hexRgb(ghostConfig.soundLabelColor.value); // #b9b3ff
    const plate: [number, number, number] = [8, 10, 16];
    const plateAlpha = 0.94;
    // The near-opaque plate is darkest over black and lightest over white; the
    // worst case for contrast is the plate composited over white (brightest).
    for (const bg of [
      [0, 0, 0],
      [128, 128, 128],
      [255, 255, 255],
    ] as [number, number, number][]) {
      const effectivePlate = over(plate, plateAlpha, bg);
      expect(contrastRatio(text, effectivePlate)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('draws the label text in soundLabelColor, on the dark plate (task 38.3)', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [sprite({ label: 'Gunshot' })], [], 0, false, { loader: silhouetteOnlyLoader });
    const plate = ctx.calls.find(
      (c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('8,10,16'),
    );
    const text = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'Gunshot');
    expect(plate).toBeDefined();
    expect(text).toBeDefined();
    expect(text!.fillStyle).toBe(ghostConfig.soundLabelColor.value);
  });

  it('the folded corner chip uses the same lavender text colour (task 38.2)', () => {
    const ctx = makeFakeCtx(1000, 1000);
    draw(
      ctx,
      [],
      [fog({ edge: 'left', folded: true, foldSlot: 0, foldCount: 1, label: 'Wind' })],
      0,
      false,
      { loader: silhouetteOnlyLoader },
    );
    const text = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'Wind');
    expect(text).toBeDefined();
    expect(text!.fillStyle).toBe(ghostConfig.soundLabelColor.value);
  });
});

// ---------------------------------------------------------------------------
// 38.1 dialogue = plain US-streaming look (no plate, outline + white fill).
// ---------------------------------------------------------------------------

describe('38.1: dialogue has no plate and is white with a black outline', () => {
  it('makes no fillRect for the dialogue (no background plate)', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [], [], 0, false, { loader: silhouetteOnlyLoader, dialogue: 'Not my fault!' });
    // A dialogue-only frame paints no rectangle at all.
    expect(ctx.calls.filter((c) => c.op === 'fillRect')).toHaveLength(0);
  });

  it('strokes the black outline then fills white for each dialogue line', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [], [], 0, false, {
      loader: silhouetteOnlyLoader,
      dialogue: 'Line one\nLine two',
    });
    const strokes = ctx.calls.filter((c) => c.op === 'strokeText');
    const whiteFills = ctx.calls.filter(
      (c) => c.op === 'fillText' && typeof c.fillStyle === 'string' && c.fillStyle.includes('255,255,255'),
    );
    // Two lines → two stroke calls and two white fill calls.
    expect(strokes).toHaveLength(2);
    expect(whiteFills).toHaveLength(2);
    // Each line is stroked before it is filled.
    for (const line of ['Line one', 'Line two']) {
      const s = ctx.calls.findIndex((c) => c.op === 'strokeText' && c.args[0] === line);
      const f = ctx.calls.findIndex((c) => c.op === 'fillText' && c.args[0] === line);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(f).toBeGreaterThan(s);
    }
    // The outline uses a round line join (task 38.1).
    expect(strokes[0]!.lineJoin).toBe('round');
    // The outline stroke width is about 0.12 × the dialogue font.
    const expectedWidth = Math.max(1, dialogueFontPx(ctx.canvas.height) * 0.12);
    expect(strokes[0]!.lineWidth).toBeCloseTo(expectedWidth, 5);
  });

  it('draws nothing (no stroke/fill) when there is no dialogue cue', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [], [], 0, false, { loader: silhouetteOnlyLoader, dialogue: null });
    expect(ctx.calls.filter((c) => c.op === 'strokeText')).toHaveLength(0);
    expect(ctx.calls.filter((c) => c.op === 'fillText')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 38.3 unchanged invariants: band fraction and the 36.1 size guarantee.
// ---------------------------------------------------------------------------

describe('38.3: dialogue band measurement is unchanged by the restyle', () => {
  it('measureDialogueBandFrac matches the pre-task-38 formula for a given cue', () => {
    // The restyle keeps the font, line height, two-line limit, padding and
    // bottom margin, so the reserved band fraction is computed exactly as
    // before: (lines * linePx + 2*padY + H*bottomFrac) / H.
    const H = 600;
    const ctx = makeFakeCtx(800, H);
    const fontPx = dialogueFontPx(H);
    const linePx = Math.round(fontPx * 1.36); // DIALOGUE_LINE_FACTOR
    const padY = 8; // DIALOGUE_PAD_Y
    const bottomFrac = 0.03; // DIALOGUE_BOTTOM_FRAC

    const oneLine = (1 * linePx + 2 * padY + H * bottomFrac) / H;
    const twoLine = (2 * linePx + 2 * padY + H * bottomFrac) / H;
    expect(measureDialogueBandFrac(ctx, 'Short.')).toBeCloseTo(oneLine, 10);
    expect(measureDialogueBandFrac(ctx, 'First line\nSecond line')).toBeCloseTo(twoLine, 10);
  });

  it('labelFontPx >= dialogueFontPx still holds (task 36.1 preserved)', () => {
    for (const H of [300, 445, 600, 1080]) {
      expect(labelFontPx(H)).toBeGreaterThanOrEqual(dialogueFontPx(H));
      expect(labelFontPx(H, true)).toBeGreaterThanOrEqual(dialogueFontPx(H));
    }
  });
});
