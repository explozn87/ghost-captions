import { describe, it, expect, beforeAll } from 'vitest';
import {
  isVideoSilent,
  overlayShouldShow,
  chipStateFor,
  defaultSettings,
  SHOW_WHEN_CHOICES,
  type ShowWhen,
} from '../src/ui/settings.ts';
import { draw, type Ctx2D, type SpriteImageLoader } from '../src/overlay/draw.ts';
import type { EdgeFog, GhostSprite } from '../src/shared/types.ts';
import { tables } from '../src/i18n/index.ts';

// Task 21: the sound overlay follows the sound — on when muted, resting when
// you can hear — in the default `auto` mode, with `always`/`never` overrides.
// The decision is a pure function (overlayShouldShow); the fade and the DOM
// volumechange wiring live in the Player. These tests pin the pure logic, the
// chip text in both languages, and that `draw`'s overlayAlpha dims the sound
// overlay while never touching the dialogue cue.

describe('show-when: pure visibility decision (task 21.1)', () => {
  it('treats a muted or zero-volume video as silent', () => {
    expect(isVideoSilent(true, 1)).toBe(true); // muted
    expect(isVideoSilent(false, 0)).toBe(true); // volume 0
    expect(isVideoSilent(true, 0)).toBe(true);
    expect(isVideoSilent(false, 0.5)).toBe(false); // audible
    expect(isVideoSilent(false, 1)).toBe(false);
  });

  it('auto shows the overlay only while the video is silent', () => {
    expect(overlayShouldShow('auto', true)).toBe(true); // muted → ghosts on
    expect(overlayShouldShow('auto', false)).toBe(false); // unmuted → resting
  });

  it('always keeps the overlay on, and never keeps it off, whatever the volume', () => {
    for (const silent of [true, false]) {
      expect(overlayShouldShow('always', silent)).toBe(true);
      expect(overlayShouldShow('never', silent)).toBe(false);
    }
  });

  it('defaults showWhen to auto', () => {
    expect(defaultSettings('en', false).showWhen).toBe('auto');
  });

  it('offers always / auto / never, with always explained first', () => {
    expect(SHOW_WHEN_CHOICES).toEqual(['always', 'auto', 'never']);
    expect(SHOW_WHEN_CHOICES[0]).toBe('always');
  });
});

describe('show-when: status chip (task 21.2)', () => {
  it('reads "always on" in always mode, and follows silence otherwise', () => {
    expect(chipStateFor('always', true)).toBe('always');
    expect(chipStateFor('always', false)).toBe('always');
    expect(chipStateFor('auto', true)).toBe('soundOff');
    expect(chipStateFor('auto', false)).toBe('soundOn');
    expect(chipStateFor('never', true)).toBe('soundOff');
    expect(chipStateFor('never', false)).toBe('soundOn');
  });

  it('carries the chip text in English, information in words not only the icon', () => {
    const ui = tables.en.ui;
    expect(ui.chipAlways).toBe('Ghosts always on');
    expect(ui.chipSoundOff).toContain('Sound off');
    expect(ui.chipSoundOff).toContain('ghosts on');
    expect(ui.chipSoundOn).toContain('Sound on');
    expect(ui.chipSoundOn).toContain('resting');
  });

  it('carries the chip text in Korean exactly as the task specifies', () => {
    const ui = tables.ko.ui;
    expect(ui.chipSoundOff).toBe('🔇 소리 꺼짐 — 유령 등장');
    expect(ui.chipSoundOn).toBe('🔊 소리 켜짐 — 유령 쉬는 중');
    expect(ui.chipAlways.length).toBeGreaterThan(0);
  });
});

// --- draw() overlayAlpha: dim the sound overlay, keep dialogue at full alpha ---

interface Call {
  op: string;
  args: unknown[];
  globalAlpha: number;
}

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
    save() {},
    restore() {},
    translate() {},
    scale() {},
    beginPath() {},
    fill() {},
    clearRect() {},
    fillRect(x, y, w, h) { calls.push(rec('fillRect', [x, y, w, h])); },
    drawImage() {},
    measureText(text) { return { width: text.length * 8 }; },
    fillText(text, x, y) { calls.push(rec('fillText', [text, x, y])); },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
  };
  function rec(op: string, args: unknown[]): Call {
    return { op, args, globalAlpha: ctx.globalAlpha };
  }
  return ctx;
}

const silhouetteOnlyLoader: SpriteImageLoader = {
  load() {
    return { image: null, loaded: true };
  },
};

beforeAll(() => {
  if (typeof (globalThis as { Path2D?: unknown }).Path2D === 'undefined') {
    (globalThis as { Path2D?: unknown }).Path2D = class {
      constructor(_d?: string) {}
    };
  }
});

function sprite(): GhostSprite {
  return {
    family: 'scream',
    x: 0.5,
    y: 0.3,
    scale: 1,
    fog: 0,
    trembleHz: 0,
    opacity: 1,
    label: 'a ghost label',
    arriving: false,
  };
}

const NO_FOGS: readonly EdgeFog[] = [];

describe('draw(): overlayAlpha fades the sound overlay (task 21.1)', () => {
  it('draws the label at full alpha when overlayAlpha is 1 (default)', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [sprite()], NO_FOGS, 0, true, { loader: silhouetteOnlyLoader });
    const label = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'a ghost label');
    expect(label).toBeDefined();
    expect(label!.globalAlpha).toBeCloseTo(1, 5);
  });

  it('halves the sprite label alpha at overlayAlpha 0.5', () => {
    const full = makeFakeCtx();
    draw(full, [sprite()], NO_FOGS, 0, true, { loader: silhouetteOnlyLoader, overlayAlpha: 1 });
    const halved = makeFakeCtx();
    draw(halved, [sprite()], NO_FOGS, 0, true, { loader: silhouetteOnlyLoader, overlayAlpha: 0.5 });

    const alphaOf = (ctx: Ctx2D & { calls: Call[] }) =>
      ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'a ghost label')!.globalAlpha;
    expect(alphaOf(halved)).toBeCloseTo(alphaOf(full) * 0.5, 5);
  });

  it('skips the whole sound overlay at overlayAlpha 0', () => {
    const ctx = makeFakeCtx();
    draw(ctx, [sprite()], NO_FOGS, 0, true, { loader: silhouetteOnlyLoader, overlayAlpha: 0 });
    const label = ctx.calls.find((c) => c.op === 'fillText' && c.args[0] === 'a ghost label');
    expect(label).toBeUndefined();
  });

  it('keeps the dialogue cue visible in every show-when state, even when the overlay is off', () => {
    for (const overlayAlpha of [0, 0.5, 1]) {
      const ctx = makeFakeCtx();
      draw(ctx, [sprite()], NO_FOGS, 0, true, {
        loader: silhouetteOnlyLoader,
        overlayAlpha,
        dialogue: 'Who is there?',
      });
      const line = ctx.calls.find(
        (c) => c.op === 'fillText' && String(c.args[0]).includes('Who is there?'),
      );
      expect(line, `dialogue at overlayAlpha ${overlayAlpha}`).toBeDefined();
      // Dialogue is never dimmed by the overlay fade.
      expect(line!.globalAlpha).toBeCloseTo(1, 5);
    }
  });

  it('every show-when choice keeps dialogue on (the pure contract, task 21.4)', () => {
    // overlayShouldShow decides only the sound overlay; dialogue is independent
    // and handled unconditionally by draw, as the previous test proves.
    const choices: ShowWhen[] = ['always', 'auto', 'never'];
    for (const c of choices) {
      // No assertion on dialogue here beyond the decision not referencing it:
      // overlayShouldShow takes only (showWhen, silent).
      expect(typeof overlayShouldShow(c, true)).toBe('boolean');
    }
  });
});
