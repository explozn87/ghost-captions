import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  layout,
  edgeFogs,
  fogDecayDuration,
  spriteLabel,
  CAPTION_BAND,
  MAX_TREMBLE_HZ,
  type Viewport,
  type OverlaySettings,
} from '../src/overlay/layout.ts';
import { tables } from '../src/i18n/index.ts';
import { ghostConfig } from '../src/config/ghost.config.ts';
import type { Family, Side, SoundEvent, Trend } from '../src/shared/types.ts';

// Task 8.1 (extended in task 16.3–16.4): `layout()`/`edgeFogs()` are pure, so
// every positioning rule is tested on constructed events with known values.
// Property P6 from design.md — a sprite is never placed in the bottom caption
// band — gets fast-check coverage over arbitrary events, viewports and sizes.
// The other rules (side → band, loudness → size, beat → capped tremble,
// reduced motion, muting, speech skip, ambient→fog, label contents) get direct
// example tests.

// Only POINT families appear as sprites; ambient ones become edge fog.
const FAMILIES: Family[] = [
  'footsteps', 'door', 'knock', 'scream', 'laughter', 'crying',
  'singing', 'impact', 'gunshot', 'vehicle', 'siren', 'animal',
  'fire', 'glass', 'unknown',
];
const AMBIENT: Family[] = ['wind', 'rain', 'thunder', 'tenseMusic', 'calmMusic'];
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
  it('left sits in 15–30%, right in 70–85%, centre in 40–60% once settled', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    // Sample at t=1 (mid-event, past the 0.4 s enter glide) so the ghost has
    // reached its settled band (task 16.4 adds the edge glide at the ends).
    const ev = (side: Side) => makeEvent({ side, start: 0, end: 2 });
    const left = layout([ev('left')], 1, vp, defaultSettings)[0]!;
    const right = layout([ev('right')], 1, vp, defaultSettings)[0]!;
    const centre = layout([ev('centre-unknown')], 1, vp, defaultSettings)[0]!;
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
      side: 'centre-unknown', // no edge glide, so the travel is the only motion
      start: 0,
      end: 4,
      sideTrack: [
        { t: 0, side: 'left' },
        { t: 4, side: 'right' },
      ],
    });
    // Both samples are well inside the event (centre-unknown has no glide).
    const early = layout([ev], 1, vp, defaultSettings)[0]!;
    const late = layout([ev], 3, vp, defaultSettings)[0]!;
    expect(late.x).toBeGreaterThan(early.x);
  });
});

describe('layout: speech skipped and families muted (task 8.1)', () => {
  it('speech events produce no sprite', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    const sprites = layout([makeEvent({ isSpeech: true, family: 'scream' })], 0, vp, defaultSettings);
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

describe('layout: ambient families become edge fog, not sprites (task 16.3)', () => {
  const vp: Viewport = { width: 1000, height: 1000 };

  it('ambient events produce no point sprite', () => {
    for (const family of AMBIENT) {
      const sprites = layout([makeEvent({ family, start: 0, end: 2 })], 1, vp, defaultSettings);
      expect(sprites).toHaveLength(0);
    }
  });

  it('edgeFogs covers the whole frame for a centre-unknown ambient event', () => {
    const ev = makeEvent({ family: 'wind', side: 'centre-unknown', loudness: 0.8, ominous: 0.6, start: 0, end: 5 });
    const fogs = edgeFogs([ev], 3, defaultSettings);
    expect(fogs).toHaveLength(1);
    expect(fogs[0]!.edge).toBe('all');
    expect(fogs[0]!.opacity).toBeGreaterThan(0);
  });

  it('edge fog follows the known side and never exceeds the opacity cap', () => {
    const left = makeEvent({ family: 'thunder', side: 'left', loudness: 1, ominous: 1, start: 0, end: 5 });
    const right = makeEvent({ id: 'e1', family: 'rain', side: 'right', loudness: 1, ominous: 1, start: 0, end: 5 });
    const fogsLeft = edgeFogs([left], 3, defaultSettings);
    const fogsRight = edgeFogs([right], 3, defaultSettings);
    expect(fogsLeft[0]!.edge).toBe('left');
    expect(fogsRight[0]!.edge).toBe('right');
    for (const f of [...fogsLeft, ...fogsRight]) {
      expect(f.opacity).toBeLessThanOrEqual(ghostConfig.edgeFogMaxOpacity.value + 1e-9);
    }
  });

  it('fog rises from zero at the start (attack) and decays after the end (release)', () => {
    const ev = makeEvent({ family: 'wind', side: 'centre-unknown', loudness: 1, ominous: 1, start: 1, end: 3 });
    const atStart = edgeFogs([ev], 1.0, defaultSettings);
    const settled = edgeFogs([ev], 2.9, defaultSettings);
    const justAfter = edgeFogs([ev], 3.1, defaultSettings);
    const longAfter = edgeFogs([ev], 3 + fogDecayDuration() + 0.5, defaultSettings);
    // At the very start the attack has barely begun (near zero).
    const startOpacity = atStart[0]?.opacity ?? 0;
    expect(startOpacity).toBeLessThan(settled[0]!.opacity);
    // After the end it is decaying but still visible, then gone.
    expect(justAfter[0]!.opacity).toBeGreaterThan(0);
    expect(longAfter).toHaveLength(0);
  });

  it('carries the ambient event label near the edge (never only colour)', () => {
    const ev = makeEvent({ family: 'thunder', topLabel: 'Thunder', labelScore: 0.8, start: 0, end: 5 });
    const fogs = edgeFogs([ev], 2, defaultSettings);
    expect(fogs[0]!.label.length).toBeGreaterThan(0);
    expect(fogs[0]!.label).toContain('Thunder');
  });

  it('a muted ambient family produces no fog', () => {
    const ev = makeEvent({ family: 'wind', start: 0, end: 5 });
    const fogs = edgeFogs([ev], 2, { ...defaultSettings, mutedFamilies: new Set<Family>(['wind']) });
    expect(fogs).toHaveLength(0);
  });

  it('reduced motion shows a steady fog while active and none once ended', () => {
    const ev = makeEvent({ family: 'rain', loudness: 0.8, ominous: 0.4, start: 1, end: 3 });
    const reduced: OverlaySettings = { ...defaultSettings, reducedMotion: true };
    const a = edgeFogs([ev], 1.1, reduced)[0]!.opacity;
    const b = edgeFogs([ev], 2.9, reduced)[0]!.opacity;
    // Steady: same opacity at any active time (no attack ramp under reduced motion).
    expect(a).toBeCloseTo(b, 6);
    // Nothing once ended.
    expect(edgeFogs([ev], 3.5, reduced)).toHaveLength(0);
  });
});

describe('layout: point ghosts enter from the edge and withdraw (task 16.4)', () => {
  const vp: Viewport = { width: 1000, height: 1000 };

  it('a known-side ghost starts off its edge, reaches its band, then withdraws', () => {
    const ev = makeEvent({ family: 'footsteps', side: 'left', start: 0, end: 3 });
    const entering = layout([ev], 0.01, vp, defaultSettings)[0]!;
    const settled = layout([ev], 1.5, vp, defaultSettings)[0]!;
    const withdrawing = layout([ev], 2.99, vp, defaultSettings)[0]!;
    // Enters from off the left edge (x below the band), settles in the band,
    // then withdraws back toward the edge.
    expect(entering.x).toBeLessThan(0.15);
    expect(settled.x).toBeGreaterThanOrEqual(0.15);
    expect(settled.x).toBeLessThanOrEqual(0.3);
    expect(withdrawing.x).toBeLessThan(settled.x);
  });

  it('a right-side ghost enters from off the right edge', () => {
    const ev = makeEvent({ family: 'footsteps', side: 'right', start: 0, end: 3 });
    const entering = layout([ev], 0.01, vp, defaultSettings)[0]!;
    expect(entering.x).toBeGreaterThan(0.85);
  });

  it('a centre-unknown ghost fades in place (opacity), staying in its band', () => {
    const ev = makeEvent({ family: 'footsteps', side: 'centre-unknown', start: 0, end: 3 });
    const fadingIn = layout([ev], 0.01, vp, defaultSettings)[0]!;
    const settled = layout([ev], 1.5, vp, defaultSettings)[0]!;
    // Position stays in the centre band; only opacity ramps.
    expect(fadingIn.x).toBeGreaterThanOrEqual(0.4);
    expect(fadingIn.x).toBeLessThanOrEqual(0.6);
    expect(fadingIn.opacity).toBeLessThan(settled.opacity);
    expect(settled.opacity).toBeCloseTo(1, 5);
  });

  it('reduced motion skips the glide: a side ghost sits in its band from the start', () => {
    const ev = makeEvent({ family: 'footsteps', side: 'left', start: 0, end: 3 });
    const sp = layout([ev], 0.01, vp, { ...defaultSettings, reducedMotion: true })[0]!;
    expect(sp.x).toBeGreaterThanOrEqual(0.15);
    expect(sp.x).toBeLessThanOrEqual(0.3);
    expect(sp.opacity).toBeCloseTo(1, 5);
  });
});
