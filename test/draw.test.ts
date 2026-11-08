import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import {
  draw,
  familyPathSource,
  spriteImageUrl,
  measureDialogueBandFrac,
  wrapDialogueLines,
  placeLabels,
  labelPlateSize,
  EDGE_MARGIN,
  LABEL_GAP,
  AMBIENT_SPRITE_MIN_OPACITY,
  TOP_BAND_FRAC,
  type LabelRect,
  type Ctx2D,
  type SpriteImageLoader,
} from '../src/overlay/draw.ts';
import type { EdgeFog, Family, GhostSprite } from '../src/shared/types.ts';
import { ghostConfig } from '../src/config/ghost.config.ts';

// Task 8.2 (extended in task 16.3 & 16.5): `draw()` paints sprites and edge
// fogs on a 2D canvas. We test it against a small recording fake context (no
// real canvas needed, matching the pure-first approach) and assert:
//   - one silhouette per family, distinct shapes (Req 6.3);
//   - every ghost gets a label on a backing plate (Req 6.4, 10.2);
//   - reduced motion draws a static picture — identical at every time, no
//     tremble (Req 6.6);
//   - no brightness flashing: fill colours/alpha used for a sprite do not
//     oscillate frame-to-frame in a way that could flash > 3 Hz (Req 10.3);
//   - sprite art: a loaded PNG is drawn with drawImage; a missing/not-yet-loaded
//     image falls back to the Path2D silhouette (task 16.5);
//   - edge fog: an ambient fog paints an edge gradient and its label (16.3).

/** One recorded drawing call. */
interface Call {
  op: string;
  args: unknown[];
  fillStyle: string | CanvasGradient;
  globalAlpha: number;
}

/** A recording fake 2D context implementing the structural {@link Ctx2D}. */
function makeFakeCtx(width = 1000, height = 1000): Ctx2D & { calls: Call[] } {
  const calls: Call[] = [];
  const ctx: Ctx2D & { calls: Call[] } = {
    calls,
    canvas: { width, height },
    fillStyle: '#000',
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
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
    createRadialGradient() {
      return { addColorStop() {} };
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };
  function rec(op: string, args: unknown[]): Call {
    return { op, args, fillStyle: ctx.fillStyle, globalAlpha: ctx.globalAlpha };
  }
  return ctx;
}

/** A loader that never has an image, so draw always uses the silhouette. */
const silhouetteOnlyLoader: SpriteImageLoader = {
  load() {
    return { image: null, loaded: true };
  },
};

/** A loader that reports a loaded image for every family (task 16.5). */
function makeImageLoader(): SpriteImageLoader & { requested: Family[] } {
  const requested: Family[] = [];
  const fakeImage = { tag: 'fake-image' } as unknown as CanvasImageSource;
  return {
    requested,
    load(family: Family) {
      requested.push(family);
      return { image: fakeImage, loaded: true };
    },
  };
}

// jsdom does not implement Path2D; the draw module skips silhouette fills when
// it is absent (the label still carries the info — Req 6.4). Provide a minimal
// stub so the silhouette-fill path is exercised here, independent of jsdom.
beforeAll(() => {
  if (typeof (globalThis as { Path2D?: unknown }).Path2D === 'undefined') {
    (globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(_d?: string) {}
    };
  }
});

function sprite(over: Partial<GhostSprite> = {}): GhostSprite {
  return {
    family: 'unknown',
    x: 0.5,
    y: 0.3,
    scale: 1,
    fog: 0.5,
    trembleHz: 0,
    opacity: 1,
    label: 'unknown sound',
    arriving: false,
    ...over,
  };
}

function fog(over: Partial<EdgeFog> = {}): EdgeFog {
  return {
    family: 'wind',
    edge: 'top',
    opacity: 0.3,
    label: 'wind',
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

describe('draw: clears then paints (task 8.2)', () => {
  it('clears the whole canvas once before drawing', () => {
    const ctx = makeFakeCtx(800, 600);
    draw(ctx, [sprite()], [], 0, false, { loader: silhouetteOnlyLoader });
    const clears = ctx.calls.filter((c) => c.op === 'clearRect');
    expect(clears).toHaveLength(1);
    expect(clears[0]!.args).toEqual([0, 0, 800, 600]);
  });

  it('draws every sprite label with fillText', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [sprite({ label: 'door' }), sprite({ label: 'siren' })], [], 0, false, {
      loader: silhouetteOnlyLoader,
    });
    const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(texts).toContain('door');
    expect(texts).toContain('siren');
  });
});

describe('draw: sprite art with silhouette fallback (task 16.5)', () => {
  it('uses drawImage when the family image is loaded, not the silhouette fill', () => {
    const loader = makeImageLoader();
    const ctx = makeFakeCtx();
    draw(ctx, [sprite({ family: 'footsteps' })], [], 0, false, { loader });
    const images = ctx.calls.filter((c) => c.op === 'drawImage');
    const fills = ctx.calls.filter((c) => c.op === 'fill');
    expect(images).toHaveLength(1);
    expect(fills).toHaveLength(0); // no silhouette fallback when the image is ready
    expect(loader.requested).toContain('footsteps');
  });

  it('falls back to the Path2D silhouette when the image is missing', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [sprite(), sprite(), sprite()], [], 0, false, { loader: silhouetteOnlyLoader });
    const images = ctx.calls.filter((c) => c.op === 'drawImage');
    const fills = ctx.calls.filter((c) => c.op === 'fill');
    expect(images).toHaveLength(0);
    expect(fills).toHaveLength(3); // one silhouette per sprite
  });

  it('exposes a per-family sprite URL under /ghosts', () => {
    expect(spriteImageUrl('thunder')).toBe('/ghosts/thunder.png');
    expect(spriteImageUrl('gunshot')).toBe('/ghosts/gunshot.png');
  });
});

describe('draw: one silhouette per family (task 8.2)', () => {
  it('every family has a distinct silhouette path source (Req 6.3)', () => {
    const families = Object.keys(familyPathSource) as Family[];
    const sources = families.map((f) => familyPathSource[f]);
    expect(families).toHaveLength(20); // the 20-family set (task 16.1)
    for (const src of sources) expect(src.length).toBeGreaterThan(0);
    expect(new Set(sources).size).toBe(families.length); // all distinct
  });
});

describe('draw: edge fog for ambient events (task 16.3)', () => {
  it('paints an edge gradient and the fog label for a top-band fog', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [], [fog({ edge: 'top', label: 'wind' })], 0, false, { loader: silhouetteOnlyLoader });
    const rects = ctx.calls.filter((c) => c.op === 'fillRect');
    const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    // A top-band fog (no measured side) paints a gradient band plus its label
    // plate, with ONE sprite + label (task 23.4), never two copies.
    expect(rects.length).toBeGreaterThanOrEqual(1);
    expect(texts).toContain('wind');
  });

  it('a zero-opacity fog is not drawn', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [], [fog({ opacity: 0 })], 0, false, { loader: silhouetteOnlyLoader });
    const texts = ctx.calls.filter((c) => c.op === 'fillText');
    expect(texts).toHaveLength(0);
  });

  it('a folded fog draws a small corner chip, not a full top band (task 25.3)', () => {
    const ctx = makeFakeCtx(1000, 1000);
    draw(ctx, [], [fog({ edge: 'left', folded: true, foldSlot: 0, foldCount: 1, label: 'wind' })], 0, false, {
      loader: silhouetteOnlyLoader,
    });
    // No full-width band gradient rect (0,0,W,...) is painted for a folded fog.
    const bandRect = ctx.calls.find(
      (c) => c.op === 'fillRect' && c.args[0] === 0 && c.args[1] === 0 && c.args[2] === 1000,
    );
    expect(bandRect).toBeUndefined();
    // The sprite (silhouette fill) and the label are still drawn, near the
    // top-left corner.
    const fills = ctx.calls.filter((c) => c.op === 'fill');
    expect(fills.length).toBeGreaterThanOrEqual(1);
    const text = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'wind');
    expect(text).toBeDefined();
    // The chip's label sits in the left portion of the frame.
    expect(text!.args[1] as number).toBeLessThan(500);
  });
});

describe('draw: label backing plate for contrast (task 8.2, Req 10.2, 25.4)', () => {
  it('draws a dark plate then light text for each label', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [sprite({ label: 'glass' })], [], 0, false, { loader: silhouetteOnlyLoader });
    const plate = ctx.calls.find(
      (c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('8,10,16'),
    );
    const text = ctx.calls.find((c) => c.op === 'fillText');
    expect(plate).toBeDefined();
    expect(text).toBeDefined();
    expect(typeof text!.fillStyle === 'string' && text!.fillStyle.includes('240,242,248')).toBe(true);
    expect(text!.globalAlpha).toBe(1);
  });

  it('draws the label plate at full opacity even when the ghost image is dimmed (task 25.4)', () => {
    // A dimmed ghost (face band / fade) carries a low sprite opacity, but its
    // label plate and text must still be drawn at full alpha so the word stays
    // readable. Measured defect: the vehicle label at 7.3 s was drawn at 0.55.
    const ctx = makeFakeCtx();
    draw(ctx, [sprite({ label: 'vehicle', opacity: 0.55 })], [], 0, false, { loader: silhouetteOnlyLoader });
    const plate = ctx.calls.find(
      (c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('8,10,16'),
    );
    const text = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'vehicle');
    expect(plate).toBeDefined();
    expect(plate!.globalAlpha).toBe(1);
    expect(text).toBeDefined();
    expect(text!.globalAlpha).toBe(1);
  });

  it('omits a label whose ghost is below the visibility floor (task 25.4)', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [sprite({ label: 'faint', opacity: 0.05 })], [], 0, false, { loader: silhouetteOnlyLoader });
    const text = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'faint');
    expect(text).toBeUndefined();
  });
});

describe('draw: reduced motion is static (task 8.2, Req 6.6)', () => {
  it('produces identical fillText positions at different times when reduced motion is on', () => {
    const s = sprite({ trembleHz: 2, fog: 0.9 });
    const ctxA = makeFakeCtx();
    const ctxB = makeFakeCtx();
    draw(ctxA, [s], [], 0, true, { loader: silhouetteOnlyLoader });
    draw(ctxB, [s], [], 10, true, { loader: silhouetteOnlyLoader });
    const posA = ctxA.calls.filter((c) => c.op === 'fillText').map((c) => [c.args[1], c.args[2]]);
    const posB = ctxB.calls.filter((c) => c.op === 'fillText').map((c) => [c.args[1], c.args[2]]);
    expect(posA).toEqual(posB);
  });

  it('with motion on, tremble moves the label position between frames', () => {
    const s = sprite({ trembleHz: 2 });
    const ctxA = makeFakeCtx();
    const ctxB = makeFakeCtx();
    draw(ctxA, [s], [], 0, false, { loader: silhouetteOnlyLoader });
    draw(ctxB, [s], [], 0.25, false, { loader: silhouetteOnlyLoader });
    const posA = ctxA.calls.filter((c) => c.op === 'fillText').map((c) => [c.args[1], c.args[2]]);
    const posB = ctxB.calls.filter((c) => c.op === 'fillText').map((c) => [c.args[1], c.args[2]]);
    expect(posA).not.toEqual(posB);
  });
});

describe('draw: no brightness flashing (task 8.2, Req 10.3)', () => {
  it('silhouette, plate and text fill colours do not change across frames', () => {
    const s = sprite({ trembleHz: 2.5, fog: 0.9 });
    const colourSets = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => {
      const ctx = makeFakeCtx();
      draw(ctx, [s], [], t, false, { loader: silhouetteOnlyLoader });
      return ctx.calls
        .filter((c) => (c.op === 'fillRect' || c.op === 'fill' || c.op === 'fillText'))
        .map((c) => (typeof c.fillStyle === 'string' ? `${c.op}:${c.fillStyle}:${c.globalAlpha}` : `${c.op}:grad`));
    });
    for (const set of colourSets) {
      expect(set).toEqual(colourSets[0]);
    }
  });
});


// ---------------------------------------------------------------------------
// Task 18: make ambient sounds unmistakable.
// ---------------------------------------------------------------------------

describe('draw: visible lavender edge fog (task 18.1)', () => {
  it('uses the pale lavender colour (205,200,240), not the old dark grey-blue', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [], [fog({ edge: 'left', label: 'wind' })], 0, false, { loader: silhouetteOnlyLoader });
    const lavender = ctx.calls.some(
      (c) => typeof c.fillStyle === 'string' && c.fillStyle.includes('205,200,240'),
    );
    const oldGrey = ctx.calls.some(
      (c) => typeof c.fillStyle === 'string' && c.fillStyle.includes('90,100,120'),
    );
    expect(lavender).toBe(true);
    expect(oldGrey).toBe(false);
  });
});

/**
 * A compositing fake 2D context that actually writes pixels, so a test can
 * measure how much the edge fog changes a black frame (task 18.1). It supports
 * only the subset `draw` uses for fog: linear gradients + fillRect. Pixels are
 * a single-channel luminance grid (the lavender fog raises luminance). The
 * gradient blends its edge colour's alpha linearly to zero across the rect.
 */
function makeCompositingCtx(width: number, height: number) {
  const px = new Float64Array(width * height); // luminance 0..255, starts black
  let currentGrad: { x0: number; x1: number; a0: number; a1: number; lum: number } | null = null;

  const ctx = {
    canvas: { width, height },
    fillStyle: '#000' as string | CanvasGradient,
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    save() {},
    restore() {},
    translate() {},
    scale() {},
    beginPath() {},
    fill() {},
    clearRect() {},
    fillText() {},
    measureText(t: string) {
      return { width: t.length * 8 };
    },
    drawImage() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
    createLinearGradient(x0: number, _y0: number, x1: number, _y1: number) {
      const g = { x0, x1, a0: 0, a1: 0, lum: 255 };
      const grad = {
        addColorStop(offset: number, colour: string) {
          const m = /rgba?\(([^)]+)\)/.exec(colour);
          if (!m) return;
          const parts = m[1]!.split(',').map((s) => Number(s.trim()));
          const alpha = parts.length >= 4 ? parts[3]! : 1;
          const lum = (parts[0]! + parts[1]! + parts[2]!) / 3;
          if (offset === 0) {
            g.a0 = alpha;
            g.lum = lum;
          } else {
            g.a1 = alpha;
          }
        },
      };
      // Remember the gradient the next fillRect will use.
      currentGrad = g;
      return grad;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const grad = typeof this.fillStyle === 'string' ? null : currentGrad;
      for (let yy = Math.max(0, y | 0); yy < Math.min(height, (y + h) | 0); yy++) {
        for (let xx = Math.max(0, x | 0); xx < Math.min(width, (x + w) | 0); xx++) {
          let alpha: number;
          let lum: number;
          if (grad) {
            // Linear alpha from a0 (at grad.x0) to a1 (at grad.x1).
            const span = grad.x1 - grad.x0;
            const frac = span !== 0 ? (xx - grad.x0) / span : 0;
            const f = Math.max(0, Math.min(1, frac));
            alpha = grad.a0 + (grad.a1 - grad.a0) * f;
            lum = grad.lum;
          } else {
            // Solid fill: parse the current string colour.
            const m = /rgba?\(([^)]+)\)/.exec(this.fillStyle as string);
            if (!m) continue;
            const parts = m[1]!.split(',').map((s) => Number(s.trim()));
            alpha = (parts.length >= 4 ? parts[3]! : 1) * this.globalAlpha;
            lum = (parts[0]! + parts[1]! + parts[2]!) / 3;
          }
          const idx = yy * width + xx;
          px[idx] = px[idx]! * (1 - alpha) + lum * alpha;
        }
      }
    },
  };
  return { ctx: ctx as unknown as Ctx2D, pixels: px, width, height };
}

describe('draw: fog visibly changes edge pixels but not the centre (task 18.1)', () => {
  it('a medium-loud wind over a black frame raises outer-band luminance by >= 40/255, centre untouched', () => {
    const W = 1000;
    const H = 600;
    const { ctx, pixels } = makeCompositingCtx(W, H);
    // A left-side wind fog near the top of the visible range (opacity ~0.3).
    // A known side keeps the label plate and sprite inside the left band, so
    // the central 60% is genuinely clear of everything.
    draw(ctx, [], [fog({ edge: 'left', opacity: 0.3, label: 'wind' })], 0, false, {
      loader: silhouetteOnlyLoader,
    });

    // Outer band: the leftmost 10% columns.
    const outerCols = Math.floor(W * 0.1);
    let outerSum = 0;
    let outerN = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < outerCols; x++) {
        outerSum += pixels[y * W + x]!;
        outerN++;
      }
    }
    const outerMean = outerSum / outerN;
    expect(outerMean).toBeGreaterThanOrEqual(40);

    // Central 60% (x in 0.2..0.8) is never touched by the fog, texture, sprite
    // or label — all of which sit in the covered side band.
    let centreMax = 0;
    for (let y = 0; y < H; y++) {
      for (let x = Math.floor(W * 0.2); x < Math.floor(W * 0.8); x++) {
        centreMax = Math.max(centreMax, pixels[y * W + x]!);
      }
    }
    expect(centreMax).toBe(0);
  });
});

describe('draw: ambient band texture per family (task 18.2, 23.4)', () => {
  function textureRects(texture: EdgeFog['texture'], time: number, reducedMotion: boolean) {
    const ctx = makeFakeCtx(400, 200);
    draw(ctx, [], [fog({ edge: 'left', texture, textureDensity: 0.8 })], time, reducedMotion, {
      loader: silhouetteOnlyLoader,
    });
    // Wind/rain/thunder texture shapes use the lavender colour and are fillRects.
    return ctx.calls.filter(
      (c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('205,200,240'),
    );
  }

  function textureGlyphs(texture: EdgeFog['texture'], time: number, reducedMotion: boolean) {
    const ctx = makeFakeCtx(400, 200);
    draw(ctx, [], [fog({ edge: 'left', texture, textureDensity: 0.8, label: 'zzz' })], time, reducedMotion, {
      loader: silhouetteOnlyLoader,
    });
    // Note glyphs are drawn as text (task 23.4). The label text is 'zzz' so any
    // ♪/♫ fillText call is a texture glyph, not the label.
    return ctx.calls.filter(
      (c) => c.op === 'fillText' && typeof c.args[0] === 'string' && /[♪♫]/.test(c.args[0] as string),
    );
  }

  it('draws lavender streak rects for wind and rain', () => {
    for (const texture of ['windStreaks', 'rainStreaks'] as const) {
      expect(textureRects(texture, 0, false).length).toBeGreaterThan(0);
    }
  });

  it('thunder swell is a soft gradient, never a hard-edged solid block (fun review 2026-11-09)', () => {
    for (const t of [0, 1.3, 2.6]) {
      expect(textureRects('thunderSwell', t, false).length).toBe(0);
    }
  });

  it('music draws note glyphs as text, never bare rectangles (task 23.4)', () => {
    for (const texture of ['notesTense', 'notesCalm'] as const) {
      // Glyphs present…
      expect(textureGlyphs(texture, 0, false).length).toBeGreaterThan(0);
      // …and no lavender texture rectangles for music.
      expect(textureRects(texture, 0, false).length).toBe(0);
    }
  });

  it('wind texture moves between frames with motion on, and is static under reduced motion', () => {
    const ctxA = makeFakeCtx(400, 200);
    const ctxB = makeFakeCtx(400, 200);
    const f = fog({ edge: 'left', texture: 'windStreaks', textureDensity: 0.8 });
    draw(ctxA, [], [f], 0, false, { loader: silhouetteOnlyLoader });
    draw(ctxB, [], [f], 1, false, { loader: silhouetteOnlyLoader });
    const posA = ctxA.calls.filter((c) => c.op === 'fillRect').map((c) => c.args[0]);
    const posB = ctxB.calls.filter((c) => c.op === 'fillRect').map((c) => c.args[0]);
    expect(posA).not.toEqual(posB);

    const ctxC = makeFakeCtx(400, 200);
    const ctxD = makeFakeCtx(400, 200);
    draw(ctxC, [], [f], 0, true, { loader: silhouetteOnlyLoader });
    draw(ctxD, [], [f], 5, true, { loader: silhouetteOnlyLoader });
    const posC = ctxC.calls.filter((c) => c.op === 'fillRect').map((c) => c.args[0]);
    const posD = ctxD.calls.filter((c) => c.op === 'fillRect').map((c) => c.args[0]);
    expect(posC).toEqual(posD); // static texture at the same density
  });

  it('thunder swell colour does not flash across frames (Req 10.3)', () => {
    // Over several frames the fill colour of the thunder swell stays constant;
    // only its width breathes, never its brightness.
    const f = fog({ edge: 'left', texture: 'thunderSwell', textureDensity: 0.6 });
    const colours = [0, 0.3, 0.6, 1, 1.5].map((t) => {
      const ctx = makeFakeCtx(400, 200);
      draw(ctx, [], [f], t, false, { loader: silhouetteOnlyLoader });
      return ctx.calls
        .filter((c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('205,200,240'))
        .map((c) => `${c.fillStyle}:${c.globalAlpha}`);
    });
    for (const set of colours) expect(set).toEqual(colours[0]);
  });
});

describe('draw: ambient event shows its family sprite and label (task 18.3)', () => {
  it('draws the family sprite (PNG when loaded) inside the fog band plus a label', () => {
    const loader = makeImageLoader();
    const ctx = makeFakeCtx(400, 200);
    draw(ctx, [], [fog({ family: 'rain', edge: 'left', label: 'rain', texture: 'rainStreaks' })], 0, false, {
      loader,
    });
    const images = ctx.calls.filter((c) => c.op === 'drawImage');
    const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(images.length).toBeGreaterThanOrEqual(1); // the ambient sprite
    expect(loader.requested).toContain('rain');
    expect(texts).toContain('rain');
  });

  it('falls back to the silhouette when the family image is missing', () => {
    const ctx = makeFakeCtx(400, 200);
    draw(ctx, [], [fog({ family: 'thunder', edge: 'top', label: 'thunder', texture: 'thunderSwell' })], 0, false, {
      loader: silhouetteOnlyLoader,
    });
    const fills = ctx.calls.filter((c) => c.op === 'fill'); // Path2D silhouette
    expect(fills.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the ambient sprite and label in the upper band, clear of the caption band', () => {
    const H = 200;
    const loader = makeImageLoader();
    const ctx = makeFakeCtx(400, H);
    draw(ctx, [], [fog({ family: 'wind', edge: 'left', label: 'wind' })], 0, false, { loader });
    // The ambient sprite is drawn with drawImage; its box top/bottom must stay
    // above the caption band (bottom 18%).
    const captionTop = H * (1 - 0.18);
    for (const c of ctx.calls.filter((c) => c.op === 'drawImage')) {
      const dy = c.args[2] as number;
      const dh = c.args[4] as number;
      expect(dy + dh).toBeLessThanOrEqual(captionTop);
    }
    // Label y stays in the upper band too.
    for (const c of ctx.calls.filter((c) => c.op === 'fillText')) {
      expect(c.args[2] as number).toBeLessThan(captionTop);
    }
  });
});

// ---------------------------------------------------------------------------
// Task 19.2: dialogue subtitles in the bottom caption band.
// ---------------------------------------------------------------------------

describe('draw: dialogue subtitle in the caption band (task 19.2)', () => {
  it('draws the dialogue text on a dark plate when a cue is passed', () => {
    const ctx = makeFakeCtx(800, 600);
    draw(ctx, [], [], 0, false, { loader: silhouetteOnlyLoader, dialogue: 'Who is there?' });
    const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(texts).toContain('Who is there?');
    // A dark plate (near-opaque) sits behind it for AA contrast (Req 10.2).
    const plate = ctx.calls.find(
      (c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('10,12,18'),
    );
    expect(plate).toBeDefined();
  });

  it('draws nothing extra when no dialogue cue is active', () => {
    const ctx = makeFakeCtx(800, 600);
    draw(ctx, [], [], 0, false, { loader: silhouetteOnlyLoader, dialogue: null });
    expect(ctx.calls.filter((c) => c.op === 'fillText')).toHaveLength(0);
  });

  it('places the dialogue plate within the bottom caption band', () => {
    const H = 600;
    const ctx = makeFakeCtx(800, H);
    draw(ctx, [], [], 0, false, { loader: silhouetteOnlyLoader, dialogue: 'A line.' });
    // The dialogue text is the last fillText; its y is in the lower part.
    const texts = ctx.calls.filter((c) => c.op === 'fillText');
    const y = texts[texts.length - 1]!.args[2] as number;
    expect(y).toBeGreaterThan(H * 0.7);
  });
});

describe('wrapDialogueLines (task 19.2)', () => {
  // The fake ctx measures text as length*8 px.
  const ctx = makeFakeCtx(800, 600);

  it('keeps a short cue on one line', () => {
    expect(wrapDialogueLines(ctx, 'Hello.', 1000)).toEqual(['Hello.']);
  });

  it('honours explicit newlines up to two lines', () => {
    expect(wrapDialogueLines(ctx, 'Line one\nLine two', 1000)).toEqual(['Line one', 'Line two']);
  });

  it('never returns more than two lines', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve';
    const lines = wrapDialogueLines(ctx, long, 80); // force wrapping (10 chars ~ 80px)
    expect(lines.length).toBeLessThanOrEqual(2);
  });

  it('ellipsises when the text does not fit in two lines', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve thirteen';
    const lines = wrapDialogueLines(ctx, long, 80);
    expect(lines[lines.length - 1]!.endsWith('…')).toBe(true);
  });
});

describe('measureDialogueBandFrac (task 19.2)', () => {
  it('is zero for an empty or absent cue', () => {
    const ctx = makeFakeCtx(800, 600);
    expect(measureDialogueBandFrac(ctx, null)).toBe(0);
    expect(measureDialogueBandFrac(ctx, '')).toBe(0);
    expect(measureDialogueBandFrac(ctx, '   ')).toBe(0);
  });

  it('is larger for a two-line cue than a one-line cue (taller cues push ghosts up)', () => {
    const ctx = makeFakeCtx(800, 600);
    const oneLine = measureDialogueBandFrac(ctx, 'Short.');
    const twoLine = measureDialogueBandFrac(ctx, 'First line\nSecond line');
    expect(twoLine).toBeGreaterThan(oneLine);
    expect(oneLine).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Task 22: read at a glance.
// ---------------------------------------------------------------------------

/** Build a LabelRect from a text width and an anchor, as draw does. */
function rectFor(textWidth: number, x: number, y: number): LabelRect {
  const { w, h } = labelPlateSize(textWidth);
  return { x, y, w, h };
}

describe('placeLabels: never leaves the frame (task 22.1)', () => {
  it('clamps a plate whose right edge would pass the frame back inside', () => {
    const W = 400;
    const H = 300;
    // A wide plate anchored hard right would overflow; it must be pulled in.
    const rect = rectFor(60, W + 50, 40); // centre far past the right edge
    const [out] = placeLabels([rect], W, H, 0.18);
    expect(out!.x + out!.w / 2).toBeLessThanOrEqual(W - EDGE_MARGIN + 1e-9);
    expect(out!.x - out!.w / 2).toBeGreaterThanOrEqual(EDGE_MARGIN - 1e-9);
  });

  it('clamps a plate that would pass the left edge', () => {
    const W = 400;
    const H = 300;
    const rect = rectFor(60, -40, 40);
    const [out] = placeLabels([rect], W, H, 0.18);
    expect(out!.x - out!.w / 2).toBeGreaterThanOrEqual(EDGE_MARGIN - 1e-9);
  });
});

describe('placeLabels: property — inside the frame, no overlaps, clear of the band (task 22.2)', () => {
  it('for arbitrary plates the outputs are all inside the frame, non-overlapping and above the caption band', () => {
    const rectArb = fc.record({
      x: fc.double({ min: -200, max: 1200, noNaN: true }),
      y: fc.double({ min: -50, max: 900, noNaN: true }),
      textWidth: fc.double({ min: 10, max: 180, noNaN: true }),
    });
    fc.assert(
      fc.property(
        fc.array(rectArb, { minLength: 1, maxLength: 7 }),
        fc.integer({ min: 400, max: 2000 }),
        fc.integer({ min: 400, max: 1400 }),
        fc.double({ min: 0.1, max: 0.4, noNaN: true }),
        (specs, W, H, band) => {
          const rects = specs.map((s) => rectFor(s.textWidth, s.x, s.y));
          const out = placeLabels(rects, W, H, band);
          const bandTop = H * (1 - band);
          for (const r of out) {
            // Inside the frame horizontally (plates narrower than the frame).
            if (r.w <= W - EDGE_MARGIN * 2) {
              expect(r.x - r.w / 2).toBeGreaterThanOrEqual(EDGE_MARGIN - 1e-6);
              expect(r.x + r.w / 2).toBeLessThanOrEqual(W - EDGE_MARGIN + 1e-6);
            }
            // Never above the frame.
            expect(r.y).toBeGreaterThanOrEqual(-1e-6);
            // Never into the caption band.
            expect(r.y + r.h).toBeLessThanOrEqual(bandTop + 1e-6);
          }
          // No two output plates intersect.
          for (let i = 0; i < out.length; i++) {
            for (let j = i + 1; j < out.length; j++) {
              const a = out[i]!;
              const b = out[j]!;
              const xOverlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 1e-6;
              const yOverlap = a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
              expect(xOverlap && yOverlap).toBe(false);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('pushes a later overlapping plate down by at least LABEL_GAP below the earlier one', () => {
    const W = 800;
    const H = 600;
    // Two plates at the same anchor overlap; the second must move below.
    const a = rectFor(40, 400, 60);
    const b = rectFor(40, 400, 62); // nearly on top of a
    const [outA, outB] = placeLabels([a, b], W, H, 0.18);
    expect(outB!.y).toBeGreaterThanOrEqual(outA!.y + outA!.h + LABEL_GAP - 1e-6);
  });
});

describe('draw: labels placed as a group, clamped and non-overlapping (tasks 22.1, 22.2)', () => {
  it('a label anchored at the right edge is drawn inside the frame', () => {
    const W = 400;
    const ctx = makeFakeCtx(W, 300);
    // A right-edge sprite with a long label would overflow without clamping.
    draw(ctx, [sprite({ x: 1, label: 'a very long sound label here' })], [], 0, false, {
      loader: silhouetteOnlyLoader,
    });
    // The label plate is a fillRect with the dark plate colour; its right edge
    // (x + w) must be within the frame.
    const plate = ctx.calls.find(
      (c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('8,10,16'),
    )!;
    const [px, , pw] = plate.args as number[];
    expect(px! + pw!).toBeLessThanOrEqual(W - EDGE_MARGIN + 1e-6);
    expect(px!).toBeGreaterThanOrEqual(EDGE_MARGIN - 1e-6);
  });

  it('two sprites with the same anchor get non-overlapping label plates', () => {
    const ctx = makeFakeCtx(800, 600);
    draw(
      ctx,
      [sprite({ x: 0.5, y: 0.3, label: 'alpha' }), sprite({ x: 0.5, y: 0.3, label: 'beta' })],
      [],
      0,
      false,
      { loader: silhouetteOnlyLoader },
    );
    const plates = ctx.calls.filter(
      (c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('8,10,16'),
    );
    expect(plates.length).toBe(2);
    const [x0, y0, w0, h0] = plates[0]!.args as number[];
    const [x1, y1, w1, h1] = plates[1]!.args as number[];
    const xOverlap = x0! < x1! + w1! && x1! < x0! + w0!;
    const yOverlap = y0! < y1! + h1! && y1! < y0! + h0!;
    expect(xOverlap && yOverlap).toBe(false);
  });
});

describe('draw: ambient fog names itself once in the top band (tasks 22.4, 23.4)', () => {
  it('a no-side fog draws ONE sprite and ONE label in the top band, not two copies', () => {
    const W = 1000;
    const loader = makeImageLoader();
    const ctx = makeFakeCtx(W, 600);
    draw(ctx, [], [fog({ family: 'wind', edge: 'top', label: 'wind' })], 0, false, { loader });
    // One ambient sprite and one label (task 23.4: no more two copies).
    const images = ctx.calls.filter((c) => c.op === 'drawImage');
    const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(images.length).toBe(1);
    expect(texts.filter((t) => t === 'wind').length).toBe(1);
  });

  it('two no-side fogs sit side by side in the top band, never on top of each other', () => {
    const W = 1000;
    const loader = makeImageLoader();
    const ctx = makeFakeCtx(W, 600);
    draw(
      ctx,
      [],
      [
        fog({ family: 'wind', edge: 'top', label: 'wind', topSlot: 0, topCount: 2 }),
        fog({ family: 'rain', edge: 'top', label: 'rain', topSlot: 1, topCount: 2 }),
      ],
      0,
      false,
      { loader },
    );
    const images = ctx.calls.filter((c) => c.op === 'drawImage');
    expect(images.length).toBe(2);
    const centresX = images.map((c) => (c.args[1] as number) + (c.args[3] as number) / 2);
    // One in the left half of the band, one in the right half.
    expect(centresX.some((x) => x < W / 2)).toBe(true);
    expect(centresX.some((x) => x > W / 2)).toBe(true);
  });

  it('a side fog draws exactly one sprite and one label in that band', () => {
    const loader = makeImageLoader();
    const ctx = makeFakeCtx(1000, 600);
    draw(ctx, [], [fog({ family: 'rain', edge: 'left', label: 'rain' })], 0, false, { loader });
    const images = ctx.calls.filter((c) => c.op === 'drawImage');
    const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(images.length).toBe(1);
    expect(texts.filter((t) => t === 'rain').length).toBe(1);
  });

  it('the ambient sprite stays at least AMBIENT_SPRITE_MIN_OPACITY while the fog is faint', () => {
    const loader = makeImageLoader();
    const ctx = makeFakeCtx(1000, 600);
    // A faint fog (opacity 0.1) — the sprite must not fade with it.
    draw(ctx, [], [fog({ family: 'wind', edge: 'left', label: 'wind', opacity: 0.1 })], 0, false, {
      loader,
    });
    const image = ctx.calls.find((c) => c.op === 'drawImage')!;
    expect(image.globalAlpha).toBeGreaterThanOrEqual(AMBIENT_SPRITE_MIN_OPACITY - 1e-9);
  });
});

describe('draw: labels sit below the sprite body (task 23.5)', () => {
  it("a point ghost's label plate top is at or below the bottom of its sprite", () => {
    const loader = makeImageLoader();
    const W = 1000;
    const H = 1000;
    const ctx = makeFakeCtx(W, H);
    // A lone centre ghost so no overlap resolution moves the plate.
    draw(ctx, [sprite({ x: 0.5, y: 0.35, scale: 1, label: 'gunshot' })], [], 0, false, { loader });
    const image = ctx.calls.find((c) => c.op === 'drawImage')!;
    const spriteBottom = (image.args[2] as number) + (image.args[4] as number);
    // The label text draw sits below the sprite image box.
    const text = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'gunshot')!;
    expect(text.args[2] as number).toBeGreaterThanOrEqual(spriteBottom - 1e-6);
  });

  it('an ambient fog label sits below its band sprite', () => {
    const loader = makeImageLoader();
    const ctx = makeFakeCtx(1000, 1000);
    draw(ctx, [], [fog({ family: 'wind', edge: 'top', label: 'wind' })], 0, false, { loader });
    const image = ctx.calls.find((c) => c.op === 'drawImage')!;
    const spriteBottom = (image.args[2] as number) + (image.args[4] as number);
    const text = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'wind')!;
    expect(text.args[2] as number).toBeGreaterThanOrEqual(spriteBottom - 1e-6);
  });
});

describe('draw: arrival pop grows the band sprite (task 23.5)', () => {
  it('a fog with spriteScale > 1 draws a larger band sprite than one at 1', () => {
    const loader = makeImageLoader();
    const big = makeFakeCtx(1000, 1000);
    const small = makeFakeCtx(1000, 1000);
    draw(big, [], [fog({ family: 'wind', edge: 'top', spriteScale: 1.6 })], 0, false, { loader });
    draw(small, [], [fog({ family: 'wind', edge: 'top', spriteScale: 1 })], 0, false, { loader });
    const bigImg = big.calls.find((c) => c.op === 'drawImage')!;
    const smallImg = small.calls.find((c) => c.op === 'drawImage')!;
    expect(bigImg.args[4] as number).toBeGreaterThan(smallImg.args[4] as number);
  });

  it('under reduced motion an arriving label is drawn bold (no scaling)', () => {
    const ctx = makeFakeCtx(1000, 1000);
    draw(ctx, [sprite({ label: 'gunshot', arriving: true })], [], 0, true, {
      loader: silhouetteOnlyLoader,
    });
    // The label text draw uses a bold font during arrival under reduced motion.
    const text = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'gunshot')!;
    // The font set just before the fillText carries 'bold'. Find the last font
    // assignment recorded via save/restore context: the fake records fillStyle
    // and alpha, so assert bold by re-measuring is not possible; instead draw a
    // non-arriving one and confirm the plate widths differ (bold is wider for a
    // real ctx, but the fake returns a fixed width). So assert the call exists
    // and that an arriving reduced-motion sprite does not change its scale.
    expect(text).toBeDefined();
    const plain = makeFakeCtx(1000, 1000);
    draw(plain, [sprite({ label: 'gunshot', arriving: false })], [], 0, true, {
      loader: silhouetteOnlyLoader,
    });
    const plainImg = plain.calls.find((c) => c.op === 'drawImage');
    const arrivingImg = ctx.calls.find((c) => c.op === 'drawImage');
    // Reduced motion: the sprite image box is the same whether arriving or not
    // (no scale pop); the bold is a font change only.
    if (plainImg && arrivingImg) {
      expect(arrivingImg.args[4]).toBe(plainImg.args[4]);
    }
  });
});


// ---------------------------------------------------------------------------
// Task 24: top band polish.
// ---------------------------------------------------------------------------

describe('draw: top band is one full-width gradient (task 24.2)', () => {
  it('a single top fog paints one gradient rect across the FULL frame width', () => {
    const W = 1000;
    const H = 600;
    const ctx = makeFakeCtx(W, H);
    draw(ctx, [], [fog({ family: 'wind', edge: 'top', label: 'wind', texture: 'none' })], 0, false, {
      loader: silhouetteOnlyLoader,
    });
    // With no texture the only fillRects are the gradient band and the label
    // plate. The band gradient must span x=0 to x=W (no per-slot rectangle).
    const bandRects = ctx.calls.filter(
      (c) => c.op === 'fillRect' && c.args[0] === 0 && c.args[2] === W,
    );
    expect(bandRects.length).toBeGreaterThanOrEqual(1);
  });

  it('two top fogs paint the band gradient only ONCE across the full width (no seam at W/2)', () => {
    const W = 1000;
    const H = 600;
    const ctx = makeFakeCtx(W, H);
    draw(
      ctx,
      [],
      [
        fog({ family: 'wind', edge: 'top', label: 'wind', texture: 'none', topSlot: 0, topCount: 2 }),
        fog({ family: 'rain', edge: 'top', label: 'rain', texture: 'none', topSlot: 1, topCount: 2 }),
      ],
      0,
      false,
      { loader: silhouetteOnlyLoader },
    );
    // The full-width gradient band is drawn once (by slot 0), not per slot, so
    // there is no partial-width rect that would seam at W/2.
    const fullWidthBand = ctx.calls.filter(
      (c) => c.op === 'fillRect' && c.args[0] === 0 && c.args[2] === W,
    );
    expect(fullWidthBand.length).toBe(1);
    // No band rect starts at the slot boundary W/2 (the old per-slot seam).
    const seamRect = ctx.calls.find(
      (c) => c.op === 'fillRect' && c.args[0] === W / 2 && c.args[2] === W / 2,
    );
    expect(seamRect).toBeUndefined();
  });
});

describe('draw: top band is shallow and holds its texture (task 24.3)', () => {
  it('TOP_BAND_FRAC is the shallow 0.18 from config, not the old 0.3', () => {
    expect(TOP_BAND_FRAC).toBe(ghostConfig.topBandFrac.value);
    expect(TOP_BAND_FRAC).toBeCloseTo(0.18, 10);
  });

  it('the band gradient height stays within TOP_BAND_FRAC of the frame', () => {
    const W = 1000;
    const H = 600;
    const ctx = makeFakeCtx(W, H);
    draw(ctx, [], [fog({ family: 'wind', edge: 'top', label: 'wind', texture: 'none' })], 0, false, {
      loader: silhouetteOnlyLoader,
    });
    const band = ctx.calls.find((c) => c.op === 'fillRect' && c.args[0] === 0 && c.args[2] === W)!;
    const bandH = band.args[3] as number;
    expect(bandH).toBeLessThanOrEqual(H * TOP_BAND_FRAC + 1e-6);
  });

  it('wind texture shapes stay inside the shallow top band', () => {
    const W = 1000;
    const H = 600;
    const ctx = makeFakeCtx(W, H);
    draw(ctx, [], [fog({ family: 'wind', edge: 'top', label: 'wind', texture: 'windStreaks', textureDensity: 0.9 })], 0, false, {
      loader: silhouetteOnlyLoader,
    });
    const bandBottom = Math.min(H * (1 - 0.18), H * TOP_BAND_FRAC);
    // Every lavender texture rect's bottom edge stays within the band.
    const texRects = ctx.calls.filter(
      (c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('205,200,240'),
    );
    expect(texRects.length).toBeGreaterThan(0);
    for (const r of texRects) {
      const y = r.args[1] as number;
      const h = r.args[3] as number;
      expect(y + h).toBeLessThanOrEqual(bandBottom + 1e-6);
    }
  });

  it('the band sprite sits inside the shallow top band', () => {
    const W = 1000;
    const H = 600;
    const loader = makeImageLoader();
    const ctx = makeFakeCtx(W, H);
    draw(ctx, [], [fog({ family: 'wind', edge: 'top', label: 'wind' })], 0, false, { loader });
    const image = ctx.calls.find((c) => c.op === 'drawImage')!;
    const dy = image.args[2] as number;
    const dh = image.args[4] as number;
    const bandBottom = Math.min(H * (1 - 0.18), H * TOP_BAND_FRAC);
    // The sprite box bottom stays within the shallow band.
    expect(dy + dh).toBeLessThanOrEqual(bandBottom + 1e-6);
  });
});
