import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  draw,
  isDarkFrame,
  labelFontPx,
  dialogueFontPx,
  type Ctx2D,
  type SpriteImageLoader,
} from '../src/overlay/draw.ts';
import type { EdgeFog, GhostSprite } from '../src/shared/types.ts';
import { ghostConfig } from '../src/config/ghost.config.ts';
import { en } from '../src/i18n/en.ts';
import { ko } from '../src/i18n/ko.ts';

// Task 27.3: labels must be readable at every frame size and on dark scenes.
//   - `labelFontPx(H, dark)` is max(labelMinPx, labelFrameFrac*H), boosted by
//     labelDarkFrameScale on a dark frame — pure, so it is pinned here;
//   - `isDarkFrame(pixels)` is a pure mean-luma test of a tiny downsample;
//   - `draw` sizes every overlay label with that font, so a dark frame makes
//     the drawn label font larger.
// Task 27.1: the compare phase strings (chip, step marker, caption-band plate)
// exist in both languages and carry the step placeholders.

/** One recorded drawing call, capturing the font in force. */
interface Call {
  op: string;
  args: unknown[];
  font: string;
}

/** A recording fake 2D context implementing the structural Ctx2D. */
function makeFakeCtx(width = 1000, height = 600): Ctx2D & { calls: Call[] } {
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
    save() {},
    restore() {},
    translate() {},
    scale() {},
    beginPath() {},
    fill() {},
    clearRect() {},
    fillRect() {},
    drawImage() {},
    measureText(text) { return { width: text.length * 8 }; },
    fillText(text, x, y) { calls.push({ op: 'fillText', args: [text, x, y], font: ctx.font }); },
    strokeText(text, x, y) { calls.push({ op: 'strokeText', args: [text, x, y], font: ctx.font }); },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
  };
  return ctx;
}

/** A loader that always reports no image, so draw uses the silhouette path. */
const silhouetteOnlyLoader: SpriteImageLoader = {
  load() { return { image: null, loaded: true }; },
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

/** Parse the px size out of a `"16px sans-serif"` / `"bold 16px ..."` font. */
function fontPxOf(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : NaN;
}

describe('labelFontPx (task 27.3)', () => {
  const cfg = ghostConfig;

  it('is the floor on a small frame and scales with frame height', () => {
    // 0.03 * 300 = 9 < labelMinPx (14) → floor wins.
    expect(labelFontPx(300)).toBe(cfg.labelMinPx.value);
    // On a 600 px frame the label is the larger of its own fraction and the
    // dialogue floor (task 36.1): labelFrameFrac*600 = 18 but the dialogue font
    // (dialogueFrameFrac*600 ≈ 22) is larger, so the label is floored to it so
    // the sound name is never smaller than the dialogue words.
    expect(labelFontPx(600)).toBe(
      Math.max(Math.round(cfg.labelFrameFrac.value * 600), dialogueFontPx(600)),
    );
    // Taller frame → larger font.
    expect(labelFontPx(1200)).toBeGreaterThan(labelFontPx(600));
  });

  it('never drops below labelMinPx (task 27.3)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4000 }), fc.boolean(), (H, dark) => {
        expect(labelFontPx(H, dark)).toBeGreaterThanOrEqual(cfg.labelMinPx.value);
      }),
    );
  });

  it('boosts the font by labelDarkFrameScale on a dark frame', () => {
    const light = labelFontPx(600, false);
    const dark = labelFontPx(600, true);
    expect(dark).toBe(Math.round(light * cfg.labelDarkFrameScale.value));
    expect(dark).toBeGreaterThan(light);
  });
});

describe('isDarkFrame (task 27.3)', () => {
  const luma = ghostConfig.labelDarkFrameLuma.value; // 40

  /** Build an RGBA buffer of `n` pixels all at grey level `v`. */
  function greyPixels(v: number, n = 16 * 9): Uint8ClampedArray {
    const px = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      px[i * 4] = v;
      px[i * 4 + 1] = v;
      px[i * 4 + 2] = v;
      px[i * 4 + 3] = 255;
    }
    return px;
  }

  it('is true for a near-black frame and false for a bright one', () => {
    expect(isDarkFrame(greyPixels(5))).toBe(true);
    expect(isDarkFrame(greyPixels(200))).toBe(false);
  });

  it('splits exactly at labelDarkFrameLuma', () => {
    // Grey value just below the threshold is dark; just above is not.
    expect(isDarkFrame(greyPixels(luma - 2))).toBe(true);
    expect(isDarkFrame(greyPixels(luma + 2))).toBe(false);
  });

  it('is false for an empty buffer (no evidence to boost on)', () => {
    expect(isDarkFrame(new Uint8ClampedArray(0))).toBe(false);
  });

  it('uses the mean luma, not any single pixel (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), (v) => {
        // A uniform grey frame is dark iff its luma (== v) is below the cut.
        expect(isDarkFrame(greyPixels(v))).toBe(v < luma);
      }),
    );
  });
});

describe('draw sizes labels by frame and dark-frame boost (task 27.3)', () => {
  const sprites: GhostSprite[] = [sprite()];
  const fogs: EdgeFog[] = [];

  it('draws the ghost label at the frame-scaled font', () => {
    const ctx = makeFakeCtx(1000, 600);
    draw(ctx, sprites, fogs, 0, true, { loader: silhouetteOnlyLoader });
    const labelCall = ctx.calls.find((c) => c.args[0] === 'Gunshot');
    expect(labelCall).toBeDefined();
    expect(fontPxOf(labelCall!.font)).toBe(labelFontPx(600, false));
  });

  it('draws the ghost label larger on a dark frame', () => {
    const light = makeFakeCtx(1000, 600);
    draw(light, sprites, fogs, 0, true, { loader: silhouetteOnlyLoader, darkFrame: false });
    const dark = makeFakeCtx(1000, 600);
    draw(dark, sprites, fogs, 0, true, { loader: silhouetteOnlyLoader, darkFrame: true });

    const lightFont = fontPxOf(light.calls.find((c) => c.args[0] === 'Gunshot')!.font);
    const darkFont = fontPxOf(dark.calls.find((c) => c.args[0] === 'Gunshot')!.font);
    expect(darkFont).toBeGreaterThan(lightFont);
    expect(darkFont).toBe(labelFontPx(600, true));
  });
});

describe('ghost.config: readable-label values (task 27.3)', () => {
  it('carries labelMinPx/labelFrameFrac/dark-frame values, each with a why', () => {
    for (const t of [
      ghostConfig.labelMinPx,
      ghostConfig.labelFrameFrac,
      ghostConfig.labelDarkFrameScale,
      ghostConfig.labelDarkFrameLuma,
    ]) {
      expect(typeof t.value).toBe('number');
      expect(typeof t.why).toBe('string');
      expect(t.why.trim().length).toBeGreaterThan(0);
    }
    // Documented values and sane ranges.
    expect(ghostConfig.labelMinPx.value).toBe(14);
    expect(ghostConfig.labelFrameFrac.value).toBeGreaterThan(0);
    expect(ghostConfig.labelDarkFrameScale.value).toBeGreaterThan(1);
    expect(ghostConfig.labelDarkFrameLuma.value).toBeGreaterThan(0);
    expect(ghostConfig.labelDarkFrameLuma.value).toBeLessThan(255);
  });
});

describe('compare phase strings (task 27.1)', () => {
  for (const [name, strings] of [['en', en], ['ko', ko]] as const) {
    it(`${name}: carries the chip, step-marker and captions-only plate strings`, () => {
      expect(strings.ui.compareCaptionsOnly.trim().length).toBeGreaterThan(0);
      expect(strings.ui.compareWithGhosts.trim().length).toBeGreaterThan(0);
      expect(strings.ui.compareCaptionsOnlyPlate.trim().length).toBeGreaterThan(0);
      expect(strings.ui.tryThisFirst.trim().length).toBeGreaterThan(0);
      // The step marker carries both placeholders.
      expect(strings.ui.compareStep).toContain('{step}');
      expect(strings.ui.compareStep).toContain('{total}');
    });

    it(`${name}: a filled step marker reads "1/2" and "2/2"`, () => {
      const first = strings.ui.compareStep.replace('{step}', '1').replace('{total}', '2');
      const second = strings.ui.compareStep.replace('{step}', '2').replace('{total}', '2');
      expect(first).toBe('1/2');
      expect(second).toBe('2/2');
    });
  }

  it('the two languages give different wording for the captions-only plate', () => {
    expect(en.ui.compareCaptionsOnlyPlate).not.toBe(ko.ui.compareCaptionsOnlyPlate);
  });
});
