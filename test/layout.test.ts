import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  layout,
  spriteLabel,
  CAPTION_BAND,
  MAX_TREMBLE_HZ,
  type Viewport,
  type OverlaySettings,
} from '../src/overlay/layout.ts';
import { tables } from '../src/i18n/index.ts';
import type { Family, Side, SoundEvent, Trend } from '../src/shared/types.ts';

// Task 8.1: `layout()` is pure, so every positioning rule is tested on
// constructed events with known values. Property P6 from design.md — a sprite
// is never placed in the bottom caption band — gets fast-check coverage over
// arbitrary events, viewports and sizes. The other rules (side → band,
// loudness → size, beat → capped tremble, reduced motion, muting, speech
// skip, label contents) get direct example tests.

const FAMILIES: Family[] = [
  'footsteps', 'door', 'voice', 'tenseMusic', 'calmMusic', 'impact',
  'vehicle', 'animal', 'weather', 'alarm', 'glass', 'unknown',
];
const SIDES: Side[] = ['left', 'right', 'centre-unknown'];
const TRENDS: Trend[] = ['rising', 'falling', 'steady'];

/** A full SoundEvent with sensible defaults, overridable per field. */
function makeEvent(over: Partial<SoundEvent> = {}): SoundEvent {
  return {
    id: 'e0',
    start: 0,
    end: 2,
    family: 'unknown',
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

const defaultSettings: OverlaySettings = {
  lang: 'en',
  reducedMotion: false,
  sizeScale: 1,
  mutedFamilies: new Set<Family>(),
};

const BASE_RADIUS = 0.08; // must match layout's BASE_RADIUS

describe('layout: property P6 — never in the caption band (task 8.1)', () => {
  it('no sprite (centre plus its drawn radius) reaches the bottom caption band', () => {
    const eventArb = fc.record({
      family: fc.constantFrom(...FAMILIES),
      side: fc.constantFrom(...SIDES),
      trend: fc.constantFrom(...TRENDS),
      loudness: fc.double({ min: 0, max: 1, noNaN: true }),
      ominous: fc.double({ min: 0, max: 1, noNaN: true }),
      start: fc.double({ min: 0, max: 50, noNaN: true }),
      dur: fc.double({ min: 0.1, max: 20, noNaN: true }),
      beat: fc.option(fc.double({ min: 0.3, max: 1.5, noNaN: true }), { nil: null }),
    });

    fc.assert(
      fc.property(
        fc.array(eventArb, { minLength: 1, maxLength: 6 }),
        fc.integer({ min: 100, max: 4000 }), // viewport width
        fc.integer({ min: 100, max: 3000 }), // viewport height
        fc.double({ min: 0.5, max: 3, noNaN: true }), // sizeScale
        fc.double({ min: 0, max: 60, noNaN: true }), // time
        (specs, width, height, sizeScale, t) => {
          const events = specs.map((s, i) =>
            makeEvent({
              id: `e${i}`,
              family: s.family,
              side: s.side,
              trend: s.trend,
              loudness: s.loudness,
              ominous: s.ominous,
              start: s.start,
              end: s.start + s.dur,
              beatPeriod: s.beat,
            }),
          );
          const viewport: Viewport = { width, height };
          const sprites = layout(events, t, viewport, { ...defaultSettings, sizeScale });

          const minDim = Math.min(width, height);
          const bandTopFrac = 1 - CAPTION_BAND;
          for (const sp of sprites) {
            // The drawn radius as a fraction of viewport height.
            const radiusFracH = (BASE_RADIUS * sp.scale * minDim) / height;
            // Centre plus radius must not cross into the caption band.
            expect(sp.y + radiusFracH).toBeLessThanOrEqual(bandTopFrac + 1e-9);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('layout: band placement by side (task 8.1)', () => {
  it('left sits in 15–30%, right in 70–85%, centre in 40–60%', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    const left = layout([makeEvent({ side: 'left' })], 0, vp, defaultSettings)[0]!;
    const right = layout([makeEvent({ side: 'right' })], 0, vp, defaultSettings)[0]!;
    const centre = layout([makeEvent({ side: 'centre-unknown' })], 0, vp, defaultSettings)[0]!;
    expect(left.x).toBeGreaterThanOrEqual(0.15);
    expect(left.x).toBeLessThanOrEqual(0.3);
    expect(right.x).toBeGreaterThanOrEqual(0.7);
    expect(right.x).toBeLessThanOrEqual(0.85);
    expect(centre.x).toBeGreaterThanOrEqual(0.4);
    expect(centre.x).toBeLessThanOrEqual(0.6);
  });
});

describe('layout: loudness → size (task 8.1)', () => {
  it('a louder event produces a larger sprite', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    const quiet = layout([makeEvent({ loudness: 0.1 })], 0, vp, defaultSettings)[0]!;
    const loud = layout([makeEvent({ loudness: 0.9 })], 0, vp, defaultSettings)[0]!;
    expect(loud.scale).toBeGreaterThan(quiet.scale);
  });

  it('the global size control scales every sprite', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    const normal = layout([makeEvent()], 0, vp, defaultSettings)[0]!;
    const big = layout([makeEvent()], 0, vp, { ...defaultSettings, sizeScale: 2 })[0]!;
    expect(big.scale).toBeCloseTo(normal.scale * 2, 5);
  });
});

describe('layout: ominousness → fog, beat → capped tremble (task 8.1)', () => {
  it('fog follows ominousness and tremble frequency is capped below 3 Hz', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    // beatPeriod 0.2 s would be 5 Hz; must be capped.
    const sp = layout([makeEvent({ ominous: 0.8, beatPeriod: 0.2 })], 0, vp, defaultSettings)[0]!;
    expect(sp.fog).toBeCloseTo(0.8, 5);
    expect(sp.trembleHz).toBeLessThanOrEqual(MAX_TREMBLE_HZ);
    expect(sp.trembleHz).toBeLessThan(3);
  });

  it('no beat means no tremble', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    const sp = layout([makeEvent({ beatPeriod: null })], 0, vp, defaultSettings)[0]!;
    expect(sp.trembleHz).toBe(0);
  });
});

describe('layout: reduced motion keeps information, drops motion (task 8.1)', () => {
  it('removes tremble and the travel offset but keeps position, size, fog, label', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    const travelling = makeEvent({
      side: 'left',
      beatPeriod: 0.5,
      sideTrack: [
        { t: 0, side: 'left' },
        { t: 1, side: 'right' },
        { t: 2, side: 'right' },
      ],
    });
    const reduced = layout([travelling], 1, vp, { ...defaultSettings, reducedMotion: true })[0]!;
    expect(reduced.trembleHz).toBe(0);
    // Still has a label and fog.
    expect(reduced.label.length).toBeGreaterThan(0);
    expect(reduced.fog).toBeGreaterThan(0);
    // Position is the mean band, not the moving interpolation.
    expect(reduced.x).toBeGreaterThan(0.4);
    expect(reduced.x).toBeLessThan(0.6);
  });
});

describe('layout: travelling sound interpolates across bands (task 8.1)', () => {
  it('x moves from the left band toward the right band over the event', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    const ev = makeEvent({
      side: 'left',
      start: 0,
      end: 2,
      sideTrack: [
        { t: 0, side: 'left' },
        { t: 2, side: 'right' },
      ],
    });
    const early = layout([ev], 0.1, vp, defaultSettings)[0]!;
    const late = layout([ev], 1.9, vp, defaultSettings)[0]!;
    expect(late.x).toBeGreaterThan(early.x);
  });
});

describe('layout: speech skipped and families muted (task 8.1)', () => {
  it('speech events produce no sprite', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    const sprites = layout([makeEvent({ isSpeech: true, family: 'voice' })], 0, vp, defaultSettings);
    expect(sprites).toHaveLength(0);
  });

  it('a muted family produces no sprite', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    const muted = new Set<Family>(['vehicle']);
    const sprites = layout(
      [makeEvent({ family: 'vehicle' }), makeEvent({ id: 'e1', family: 'door' })],
      0,
      vp,
      { ...defaultSettings, mutedFamilies: muted },
    );
    expect(sprites).toHaveLength(1);
    expect(sprites[0]!.family).toBe('door');
  });
});

describe('spriteLabel: label contents (task 8.1)', () => {
  it('includes family, direction only for a known side, trend only when not steady', () => {
    const s = tables.en;
    const left = spriteLabel(makeEvent({ family: 'footsteps', side: 'left', trend: 'rising' }), s);
    expect(left).toBe('footsteps, from the left, getting louder');

    const centre = spriteLabel(makeEvent({ family: 'door', side: 'centre-unknown', trend: 'steady' }), s);
    expect(centre).toBe('door');
    expect(centre).not.toMatch(/from the/);
  });

  it('uses the selected language', () => {
    const sprite = layout(
      [makeEvent({ family: 'footsteps', side: 'right', trend: 'steady' })],
      0,
      { width: 1000, height: 1000 },
      { ...defaultSettings, lang: 'ko' },
    )[0]!;
    // Korean family name differs from English; just assert it is the ko table value.
    expect(sprite.label).toContain(tables.ko.family.footsteps);
    expect(sprite.label).toContain(tables.ko.side.right);
  });
});
