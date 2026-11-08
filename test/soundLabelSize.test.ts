import { describe, it, expect, beforeAll } from 'vitest';
import {
  draw,
  labelFontPx,
  dialogueFontPx,
  measureDialogueBandFrac,
  overridePathSource,
  type Ctx2D,
  type SpriteImageLoader,
} from '../src/overlay/draw.ts';
import { layout, spriteOverrideFor, type OverlaySettings, type Viewport } from '../src/overlay/layout.ts';
import { ghostConfig } from '../src/config/ghost.config.ts';
import type { Family, GhostSprite, SoundEvent } from '../src/shared/types.ts';

// Task 36: sound names read at least as large as the dialogue (36.1), arrive
// with their ghost (36.2), and match their picture (36.3).

// jsdom lacks Path2D; stub a minimal one so the silhouette/override fill paths
// run (the label still carries the info without it — Req 6.4).
beforeAll(() => {
  if (typeof (globalThis as { Path2D?: unknown }).Path2D === 'undefined') {
    (globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(_d?: string) {}
    };
  }
});

/** One recorded drawing call. */
interface Call {
  op: string;
  args: unknown[];
  fillStyle: string | CanvasGradient;
  globalAlpha: number;
}

/** A recording fake 2D context implementing the structural Ctx2D. */
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
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
  };
  function rec(op: string, args: unknown[]): Call {
    return { op, args, fillStyle: ctx.fillStyle, globalAlpha: ctx.globalAlpha };
  }
  return ctx;
}

const silhouetteOnlyLoader: SpriteImageLoader = {
  load() {
    return { image: null, loaded: true };
  },
};

/** A loader with a loaded image for every family AND every URL (task 36.3). */
function makeImageLoader(): SpriteImageLoader & { urls: string[] } {
  const urls: string[] = [];
  const fakeImage = { tag: 'fake-image' } as unknown as CanvasImageSource;
  return {
    urls,
    load() {
      return { image: fakeImage, loaded: true };
    },
    loadUrl(url: string) {
      urls.push(url);
      return { image: fakeImage, loaded: true };
    },
  };
}

/** A loader whose override URLs never resolve to an image (forces fallback). */
function makeMissingOverrideLoader(): SpriteImageLoader {
  const fakeImage = { tag: 'fake-image' } as unknown as CanvasImageSource;
  return {
    load() {
      // Family images load fine…
      return { image: fakeImage, loaded: true };
    },
    loadUrl() {
      // …but the override image is missing (loaded, no image → fallback path).
      return { image: null, loaded: true };
    },
  };
}

function sprite(over: Partial<GhostSprite> = {}): GhostSprite {
  return {
    family: 'unknown',
    x: 0.5,
    y: 0.3,
    scale: 1,
    fog: 0,
    trembleHz: 0,
    opacity: 1,
    label: 'unknown sound',
    arriving: false,
    ...over,
  };
}

function makeEvent(over: Partial<SoundEvent> = {}): SoundEvent {
  return {
    id: 'e0',
    start: 0,
    end: 2,
    family: 'vehicle',
    isSpeech: false,
    topLabel: null,
    labelScore: 0,
    side: 'centre-unknown',
    sideTrack: [],
    sideConfidence: 0,
    loudness: 0.5,
    trend: 'steady',
    ominous: 0.3,
    beatPeriod: null,
    ...over,
  };
}

const settings: OverlaySettings = {
  lang: 'en',
  reducedMotion: false,
  sizeScale: 1,
  mutedFamilies: new Set<Family>(),
};

// ---------------------------------------------------------------------------
// 36.1 Label size vs dialogue.
// ---------------------------------------------------------------------------

describe('36.1: sound labels never read smaller than the dialogue', () => {
  it('carries a dialogueFrameFrac config value with a why', () => {
    expect(typeof ghostConfig.dialogueFrameFrac.value).toBe('number');
    expect(ghostConfig.dialogueFrameFrac.value).toBeGreaterThan(0);
    expect(ghostConfig.dialogueFrameFrac.why.trim().length).toBeGreaterThan(0);
  });

  it('labelFontPx >= dialogueFontPx for every frame size (H = 300, 445, 600, 1080)', () => {
    for (const H of [300, 445, 600, 1080]) {
      expect(labelFontPx(H)).toBeGreaterThanOrEqual(dialogueFontPx(H));
      // The dark-frame boost only increases the label font, so the guarantee
      // still holds there.
      expect(labelFontPx(H, true)).toBeGreaterThanOrEqual(dialogueFontPx(H));
    }
  });

  it('both scale with the frame from config (not a fixed size)', () => {
    // A taller frame gives a larger dialogue font and a larger label font.
    expect(dialogueFontPx(1080)).toBeGreaterThan(dialogueFontPx(300));
    expect(labelFontPx(1080)).toBeGreaterThan(labelFontPx(300));
    // The dialogue font follows dialogueFrameFrac at a large frame.
    expect(dialogueFontPx(1080)).toBe(Math.round(ghostConfig.dialogueFrameFrac.value * 1080));
  });

  it('on the wide Tears of Steel frame (445 px) the label is at least the dialogue size', () => {
    // The measured defect: sound labels 14 px, dialogue 22 px. Now they tie or
    // the label wins.
    expect(labelFontPx(445)).toBeGreaterThanOrEqual(dialogueFontPx(445));
  });

  it('dialogue still fits its band: a two-line cue reserves more than a one-line cue (task 19.2)', () => {
    const ctx = makeFakeCtx(854, 445); // the ToS frame
    const oneLine = measureDialogueBandFrac(ctx, 'Not my fault!');
    const twoLine = measureDialogueBandFrac(ctx, 'Line one\nLine two');
    expect(oneLine).toBeGreaterThan(0);
    expect(twoLine).toBeGreaterThan(oneLine);
    // The band never swallows the frame: a single short line stays a small
    // fraction of the height.
    expect(oneLine).toBeLessThan(0.3);
  });
});

// ---------------------------------------------------------------------------
// 36.2 A ghost never appears without its name.
// ---------------------------------------------------------------------------

describe('36.2: the label is drawn in the same frame as the ghost, from arrival', () => {
  it('an arriving ghost whose sprite is faded in still draws its label at full opacity', () => {
    const ctx = makeFakeCtx(854, 445);
    // The arrival pop / fade-in can leave the sprite opacity near 0 on the
    // first frame; the label must still be present (Req 6.4).
    draw(ctx, [sprite({ label: 'volley', opacity: 0.02, arriving: true })], [], 0, false, {
      loader: silhouetteOnlyLoader,
    });
    const text = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'volley');
    expect(text).toBeDefined();
    expect(text!.globalAlpha).toBe(1);
    // Its backing plate is also at full opacity.
    const plate = ctx.calls.find(
      (c) => c.op === 'fillRect' && typeof c.fillStyle === 'string' && c.fillStyle.includes('8,10,16'),
    );
    expect(plate).toBeDefined();
    expect(plate!.globalAlpha).toBe(1);
  });

  it('at t0 and at t0 + one frame of an arrival the label is present (layout → draw)', () => {
    const viewport: Viewport = { width: 854, height: 445 };
    const event = makeEvent({ family: 'gunshot', start: 10, end: 10.6, topLabel: null, loudness: 0.8 });
    // t0 is the first arrival frame; the fade-in opacity is lowest here.
    const spritesT0 = layout([event], 10, viewport, settings);
    const spritesT1 = layout([event], 10 + 1 / 60, viewport, settings);
    expect(spritesT0.length).toBe(1);
    expect(spritesT0[0]!.arriving).toBe(true);
    for (const sprites of [spritesT0, spritesT1]) {
      const ctx = makeFakeCtx(viewport.width, viewport.height);
      draw(ctx, sprites, [], sprites === spritesT0 ? 10 : 10 + 1 / 60, false, {
        loader: silhouetteOnlyLoader,
      });
      const label = sprites[0]!.label;
      const text = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === label);
      expect(text).toBeDefined();
      expect(text!.globalAlpha).toBe(1);
    }
  });

  it('a non-arriving ghost that has faded below the floor still omits its label (task 25.4 unchanged)', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [sprite({ label: 'faint', opacity: 0.05, arriving: false })], [], 0, false, {
      loader: silhouetteOnlyLoader,
    });
    const text = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'faint');
    expect(text).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 36.3 Picture matches the name (per-label sprite override).
// ---------------------------------------------------------------------------

describe('36.3: per-label sprite override', () => {
  it('config maps Helicopter to its own sprite, with a why', () => {
    expect(ghostConfig.spriteOverrideByLabel.value.Helicopter).toBe('/ghosts/helicopter.png');
    expect(ghostConfig.spriteOverrideByLabel.why.trim().length).toBeGreaterThan(0);
  });

  it('a Helicopter event (vehicle family) carries the override URL from layout', () => {
    const event = makeEvent({
      family: 'vehicle',
      topLabel: 'Helicopter',
      labelScore: 0.9,
      side: 'centre-unknown',
    });
    const override = spriteOverrideFor(event);
    expect(override).toBe('/ghosts/helicopter.png');
    const sprites = layout([event], 0, { width: 854, height: 445 }, settings);
    expect(sprites).toHaveLength(1);
    expect(sprites[0]!.family).toBe('vehicle'); // family unchanged
    expect(sprites[0]!.spriteOverride).toBe('/ghosts/helicopter.png');
    expect(sprites[0]!.spriteOverrideKey).toBe('Helicopter');
  });

  it('other vehicle labels carry no override', () => {
    const car = makeEvent({ family: 'vehicle', topLabel: 'Car', labelScore: 0.9 });
    expect(spriteOverrideFor(car)).toBeUndefined();
    const sprites = layout([car], 0, { width: 854, height: 445 }, settings);
    expect(sprites[0]!.spriteOverride).toBeUndefined();
    // A vehicle with no confident label (topLabel null) also has no override.
    const plain = makeEvent({ family: 'vehicle', topLabel: null });
    expect(spriteOverrideFor(plain)).toBeUndefined();
  });

  it('draw paints the override image for a Helicopter sprite (not the family sprite)', () => {
    const loader = makeImageLoader();
    const ctx = makeFakeCtx(854, 445);
    draw(
      ctx,
      [sprite({ family: 'vehicle', label: 'Helicopter', spriteOverride: '/ghosts/helicopter.png', spriteOverrideKey: 'Helicopter' })],
      [],
      0,
      false,
      { loader },
    );
    // The override URL was requested, and an image was drawn.
    expect(loader.urls).toContain('/ghosts/helicopter.png');
    const images = ctx.calls.filter((c) => c.op === 'drawImage');
    expect(images).toHaveLength(1);
  });

  it('falls back to a built-in rotor silhouette when the override image is missing (not the car)', () => {
    const loader = makeMissingOverrideLoader();
    const ctx = makeFakeCtx(854, 445);
    draw(
      ctx,
      [sprite({ family: 'vehicle', label: 'Helicopter', spriteOverride: '/ghosts/helicopter.png', spriteOverrideKey: 'Helicopter' })],
      [],
      0,
      false,
      { loader },
    );
    // The override image was missing, so no drawImage — the rotor Path2D is
    // filled instead. The family's car image must NOT be used.
    const images = ctx.calls.filter((c) => c.op === 'drawImage');
    const fills = ctx.calls.filter((c) => c.op === 'fill');
    expect(images).toHaveLength(0);
    expect(fills).toHaveLength(1);
    // There is a built-in rotor fallback path for Helicopter.
    const rotor = overridePathSource.Helicopter;
    expect(typeof rotor).toBe('string');
    expect((rotor ?? '').length).toBeGreaterThan(0);
  });

  it('a normal vehicle (no override) still uses the family sprite', () => {
    const loader = makeImageLoader();
    const ctx = makeFakeCtx(854, 445);
    draw(ctx, [sprite({ family: 'vehicle', label: 'Car' })], [], 0, false, { loader });
    // No override URL requested; the family image is drawn.
    expect(loader.urls).not.toContain('/ghosts/helicopter.png');
    const images = ctx.calls.filter((c) => c.op === 'drawImage');
    expect(images).toHaveLength(1);
  });
});
