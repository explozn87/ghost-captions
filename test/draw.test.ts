import { describe, it, expect, beforeAll } from 'vitest';
import { draw, familyPathSource, type Ctx2D } from '../src/overlay/draw.ts';
import type { Family, GhostSprite } from '../src/shared/types.ts';

// Task 8.2: `draw()` paints sprites on a 2D canvas. We test it against a small
// recording fake context (no real canvas needed, matching the pure-first
// approach) and assert the responsibilities from design.md and the
// requirements:
//   - one silhouette per family, distinct shapes (Req 6.3);
//   - every ghost gets a label on a backing plate (Req 6.4, 10.2);
//   - reduced motion draws a static picture — identical at every time, no
//     tremble (Req 6.6);
//   - no brightness flashing: fill colours/alpha used for a sprite do not
//     oscillate frame-to-frame in a way that could flash > 3 Hz (Req 10.3).

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
    measureText(text) { return { width: text.length * 8 }; },
    fillText(text, x, y) { calls.push(rec('fillText', [text, x, y])); },
    createRadialGradient() {
      return { addColorStop() {} };
    },
  };
  function rec(op: string, args: unknown[]): Call {
    return { op, args, fillStyle: ctx.fillStyle, globalAlpha: ctx.globalAlpha };
  }
  return ctx;
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

describe('draw: clears then paints (task 8.2)', () => {
  it('clears the whole canvas once before drawing', () => {
    const ctx = makeFakeCtx(800, 600);
    draw(ctx, [sprite()], 0, false);
    const clears = ctx.calls.filter((c) => c.op === 'clearRect');
    expect(clears).toHaveLength(1);
    expect(clears[0]!.args).toEqual([0, 0, 800, 600]);
  });

  it('draws every sprite label with fillText', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [sprite({ label: 'door' }), sprite({ label: 'alarm' })], 0, false);
    const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
    expect(texts).toContain('door');
    expect(texts).toContain('alarm');
  });
});

describe('draw: one silhouette per family (task 8.2)', () => {
  it('fills a Path2D for each sprite (one silhouette per ghost)', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [sprite(), sprite(), sprite()], 0, false);
    const fills = ctx.calls.filter((c) => c.op === 'fill');
    expect(fills).toHaveLength(3);
  });

  it('every family has a distinct silhouette path source (Req 6.3)', () => {
    const families = Object.keys(familyPathSource) as Family[];
    const sources = families.map((f) => familyPathSource[f]);
    // All present and non-empty.
    for (const src of sources) expect(src.length).toBeGreaterThan(0);
    // All distinct.
    expect(new Set(sources).size).toBe(families.length);
  });
});

describe('draw: label backing plate for contrast (task 8.2, Req 10.2)', () => {
  it('draws a dark plate then light text for each label', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [sprite({ label: 'glass' })], 0, false);
    // Find the fillRect that is the label plate (dark) and the following text.
    const plate = ctx.calls.find(
      (c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('12,14,20'),
    );
    const text = ctx.calls.find((c) => c.op === 'fillText');
    expect(plate).toBeDefined();
    expect(text).toBeDefined();
    // The light text colour is near-white at full opacity.
    expect(typeof text!.fillStyle === 'string' && text!.fillStyle.includes('240,242,248')).toBe(true);
    expect(text!.globalAlpha).toBe(1);
  });
});

describe('draw: reduced motion is static (task 8.2, Req 6.6)', () => {
  it('produces identical fillText positions at different times when reduced motion is on', () => {
    const s = sprite({ trembleHz: 2, fog: 0.9 });
    const ctxA = makeFakeCtx();
    const ctxB = makeFakeCtx();
    draw(ctxA, [s], 0, true);
    draw(ctxB, [s], 10, true);
    const posA = ctxA.calls.filter((c) => c.op === 'fillText').map((c) => [c.args[1], c.args[2]]);
    const posB = ctxB.calls.filter((c) => c.op === 'fillText').map((c) => [c.args[1], c.args[2]]);
    expect(posA).toEqual(posB);
  });

  it('with motion on, tremble moves the label position between frames', () => {
    const s = sprite({ trembleHz: 2 });
    const ctxA = makeFakeCtx();
    const ctxB = makeFakeCtx();
    // Half a tremble period apart, so the wobble offset differs.
    draw(ctxA, [s], 0, false);
    draw(ctxB, [s], 0.25, false);
    const posA = ctxA.calls.filter((c) => c.op === 'fillText').map((c) => [c.args[1], c.args[2]]);
    const posB = ctxB.calls.filter((c) => c.op === 'fillText').map((c) => [c.args[1], c.args[2]]);
    expect(posA).not.toEqual(posB);
  });
});

describe('draw: no brightness flashing (task 8.2, Req 10.3)', () => {
  it('silhouette, plate and text fill colours do not change across frames', () => {
    const s = sprite({ trembleHz: 2.5, fog: 0.9 });
    // Sample many frames across one second; the sprite's solid fill colours
    // (silhouette, label plate, text) must be constant — only position moves.
    const colourSets = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((t) => {
      const ctx = makeFakeCtx();
      draw(ctx, [s], t, false);
      // Collect the string fill colours of solid fills (ignore gradient fog).
      return ctx.calls
        .filter((c) => (c.op === 'fillRect' || c.op === 'fill' || c.op === 'fillText'))
        .map((c) => (typeof c.fillStyle === 'string' ? `${c.op}:${c.fillStyle}:${c.globalAlpha}` : `${c.op}:grad`));
    });
    for (const set of colourSets) {
      expect(set).toEqual(colourSets[0]);
    }
  });
});
