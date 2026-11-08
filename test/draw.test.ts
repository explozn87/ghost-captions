import { describe, it, expect, beforeAll } from 'vitest';
import {
  draw,
  familyPathSource,
  spriteImageUrl,
  type Ctx2D,
  type SpriteImageLoader,
} from '../src/overlay/draw.ts';
import type { EdgeFog, Family, GhostSprite } from '../src/shared/types.ts';

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
    ...over,
  };
}

function fog(over: Partial<EdgeFog> = {}): EdgeFog {
  return {
    family: 'wind',
    edge: 'all',
    opacity: 0.3,
    label: 'wind',
    texture: 'windStreaks',
    textureDensity: 0.5,
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
  it('paints an edge gradient and the fog label for a whole-frame fog', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [], [fog({ edge: 'all', label: 'wind' })], 0, false, { loader: silhouetteOnlyLoader });
    const rects = ctx.calls.filter((c) => c.op === 'fillRect');
    const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    // Whole-frame fog paints both side bands (two gradient rects) plus the
    // label plate.
    expect(rects.length).toBeGreaterThanOrEqual(2);
    expect(texts).toContain('wind');
  });

  it('a zero-opacity fog is not drawn', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [], [fog({ opacity: 0 })], 0, false, { loader: silhouetteOnlyLoader });
    const texts = ctx.calls.filter((c) => c.op === 'fillText');
    expect(texts).toHaveLength(0);
  });
});

describe('draw: label backing plate for contrast (task 8.2, Req 10.2)', () => {
  it('draws a dark plate then light text for each label', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [sprite({ label: 'glass' })], [], 0, false, { loader: silhouetteOnlyLoader });
    const plate = ctx.calls.find(
      (c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('12,14,20'),
    );
    const text = ctx.calls.find((c) => c.op === 'fillText');
    expect(plate).toBeDefined();
    expect(text).toBeDefined();
    expect(typeof text!.fillStyle === 'string' && text!.fillStyle.includes('240,242,248')).toBe(true);
    expect(text!.globalAlpha).toBe(1);
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

describe('draw: ambient band texture per family (task 18.2)', () => {
  function textureRects(texture: EdgeFog['texture'], time: number, reducedMotion: boolean) {
    const ctx = makeFakeCtx(400, 200);
    draw(ctx, [], [fog({ edge: 'left', texture, textureDensity: 0.8 })], time, reducedMotion, {
      loader: silhouetteOnlyLoader,
    });
    // Texture shapes use the lavender colour and are fillRects.
    return ctx.calls.filter(
      (c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('205,200,240'),
    );
  }

  it('draws lavender texture shapes for wind, rain, thunder and notes', () => {
    for (const texture of ['windStreaks', 'rainStreaks', 'thunderSwell', 'notesTense', 'notesCalm'] as const) {
      expect(textureRects(texture, 0, false).length).toBeGreaterThan(0);
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
    draw(ctx, [], [fog({ family: 'thunder', edge: 'all', label: 'thunder', texture: 'thunderSwell' })], 0, false, {
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
