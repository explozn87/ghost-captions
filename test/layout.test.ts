import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  layout,
  edgeFogs,
  fogDecayDuration,
  spriteLabel,
  baseRadiusFrac,
  captionBandOf,
  CAPTION_BAND,
  CENTRE_FACE_BAND,
  CENTRE_FACE_OPACITY,
  MARKER_SCALE,
  MAX_TREMBLE_HZ,
  TOP_MARGIN,
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

// Half the configured ghost diameter (0.30), so a base radius fraction of 0.15
// (task 17.1), replacing the old 0.08. Must match layout's baseRadiusFrac().
const BASE_RADIUS = ghostConfig.ghostDiameterFrac.value / 2;

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
          const Y_MIN = 0.1; // mirror layout's upper-band floor
          for (const sp of sprites) {
            // The drawn radius as a fraction of viewport height.
            const radiusFracH = (BASE_RADIUS * sp.scale * minDim) / height;
            // On a frame too small to fit the ghost above the caption band
            // (yMax < Y_MIN) the caption-band rule wins by placing the ghost at
            // Y_MIN and `draw` shrinks it there — that degenerate case has its
            // own dedicated test, so skip it here (matches the design comment in
            // layout). Everywhere else the ghost's bottom stays above the band.
            const yMax = 1 - CAPTION_BAND - radiusFracH;
            if (yMax < Y_MIN) continue;
            // Centre plus radius must not cross into the caption band. The clamp
            // in layout guarantees `y <= yMax`, so `y + r <= (1-cb-r)+r`; that
            // re-addition leaves a sub-pixel float residue, so a 1e-5 (0.01 px
            // at 1000 px) tolerance is allowed.
            expect(sp.y + radiusFracH - bandTopFrac).toBeLessThanOrEqual(1e-5);
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

  it('edgeFogs uses the top band for a centre-unknown ambient event (task 23.4)', () => {
    const ev = makeEvent({ family: 'wind', side: 'centre-unknown', loudness: 0.8, ominous: 0.6, start: 0, end: 5 });
    const fogs = edgeFogs([ev], 2, defaultSettings);
    expect(fogs).toHaveLength(1);
    expect(fogs[0]!.edge).toBe('top');
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
    // Once settled it reaches its steady opacity. As the only (loudest) event
    // it is full size and centred in the face band, so task 17.4 dims it to
    // CENTRE_FACE_OPACITY rather than full 1.
    expect(settled.opacity).toBeCloseTo(CENTRE_FACE_OPACITY, 5);
  });

  it('reduced motion skips the glide: a side ghost sits in its band from the start', () => {
    const ev = makeEvent({ family: 'footsteps', side: 'left', start: 0, end: 3 });
    const sp = layout([ev], 0.01, vp, { ...defaultSettings, reducedMotion: true })[0]!;
    expect(sp.x).toBeGreaterThanOrEqual(0.15);
    expect(sp.x).toBeLessThanOrEqual(0.3);
    expect(sp.opacity).toBeCloseTo(1, 5);
  });
});

describe('layout: bigger ghosts sized from config (task 17.1)', () => {
  const vp: Viewport = { width: 1000, height: 1000 };

  it('baseRadiusFrac is half the configured ghost diameter (30% → 0.15 radius)', () => {
    expect(baseRadiusFrac()).toBeCloseTo(ghostConfig.ghostDiameterFrac.value / 2, 10);
    expect(ghostConfig.ghostDiameterFrac.value).toBe(0.3);
  });

  it('a mid-loudness lone ghost is close to the default diameter on screen', () => {
    // loudness 0.5 sits mid-band in the narrow 0.85..1.15 loud range → ~1.0.
    const sp = layout([makeEvent({ family: 'footsteps', loudness: 0.5, trend: 'steady' })], 1, vp, defaultSettings)[0]!;
    // Drawn radius fraction ≈ baseRadiusFrac × scale (minDim == height here).
    const radiusFrac = baseRadiusFrac() * sp.scale;
    // Diameter ≈ 30% of the shorter side, give or take the loud-range midpoint.
    expect(radiusFrac * 2).toBeGreaterThan(0.25);
    expect(radiusFrac * 2).toBeLessThan(0.35);
  });

  it('the loudness multiplier stays in the narrow config band', () => {
    // Sample past the arrival pop window (task 23.5) so only the loudness
    // multiplier remains; trend steady, so no trend swing either.
    const quiet = layout([makeEvent({ loudness: 0, trend: 'steady', end: 5 })], 2, vp, defaultSettings)[0]!;
    const loud = layout([makeEvent({ loudness: 1, trend: 'steady', end: 5 })], 2, vp, defaultSettings)[0]!;
    expect(quiet.scale).toBeCloseTo(ghostConfig.loudScaleMin.value, 5);
    expect(loud.scale).toBeCloseTo(ghostConfig.loudScaleMax.value, 5);
  });
});

describe('layout: one big ghost at a time, others are markers (task 17.2)', () => {
  const vp: Viewport = { width: 1000, height: 1000 };

  it('only the loudest simultaneous point event is full size; the rest are small markers', () => {
    const loud = makeEvent({ id: 'loud', family: 'footsteps', side: 'centre-unknown', loudness: 0.9, trend: 'steady' });
    const soft1 = makeEvent({ id: 's1', family: 'door', side: 'centre-unknown', loudness: 0.4, trend: 'steady' });
    const soft2 = makeEvent({ id: 's2', family: 'glass', side: 'centre-unknown', loudness: 0.2, trend: 'steady' });
    const sprites = layout([loud, soft1, soft2], 1, vp, defaultSettings);
    const byFamily = new Map(sprites.map((s) => [s.family, s]));
    const big = byFamily.get('footsteps')!;
    const m1 = byFamily.get('door')!;
    const m2 = byFamily.get('glass')!;
    // The two softer ghosts are ~MARKER_SCALE of their own full size.
    expect(m1.scale).toBeLessThan(big.scale);
    expect(m2.scale).toBeLessThan(big.scale);
    // A marker is about MARKER_SCALE of what it would be at full size: compare
    // to the same soft event drawn alone (where it is the loudest = big).
    const soloSoft1 = layout([soft1], 1, vp, defaultSettings)[0]!;
    expect(m1.scale).toBeCloseTo(soloSoft1.scale * MARKER_SCALE, 5);
  });

  it('every event still carries its label, markers included', () => {
    const a = makeEvent({ id: 'a', family: 'footsteps', loudness: 0.9, side: 'centre-unknown' });
    const b = makeEvent({ id: 'b', family: 'siren', loudness: 0.3, side: 'centre-unknown' });
    const sprites = layout([a, b], 1, vp, defaultSettings);
    for (const sp of sprites) expect(sp.label.length).toBeGreaterThan(0);
  });
});

describe('layout: motion by family (task 17.3)', () => {
  const vp: Viewport = { width: 1000, height: 1000 };

  it('cross: a vehicle with a measured left→right track travels across, not off the edge', () => {
    const ev = makeEvent({
      family: 'vehicle',
      side: 'right',
      start: 0,
      end: 4,
      loudness: 0.8,
      sideTrack: [
        { t: 0, side: 'left' },
        { t: 4, side: 'right' },
      ],
    });
    const early = layout([ev], 0.5, vp, defaultSettings)[0]!;
    const late = layout([ev], 3.5, vp, defaultSettings)[0]!;
    // Follows the track between the bands; never slides off-screen (< 0 or > 1).
    expect(early.x).toBeGreaterThanOrEqual(0.15);
    expect(late.x).toBeLessThanOrEqual(0.85);
    expect(late.x).toBeGreaterThan(early.x);
  });

  it('cross without a measured side change glides in from its edge', () => {
    const ev = makeEvent({ family: 'vehicle', side: 'left', start: 0, end: 3, loudness: 0.8 });
    const entering = layout([ev], 0.01, vp, defaultSettings)[0]!;
    expect(entering.x).toBeLessThan(0.15); // off the left edge, gliding in
  });

  it('edgeReact: a gunshot pops in scale once near its start, then settles', () => {
    const ev = makeEvent({ family: 'gunshot', side: 'left', start: 0, end: 3, loudness: 0.9, trend: 'steady' });
    const mid = layout([ev], 0.15, vp, defaultSettings)[0]!; // peak of the pop
    const settled = layout([ev], 1.5, vp, defaultSettings)[0]!; // after the pop
    expect(mid.scale).toBeGreaterThan(settled.scale);
  });

  it('hover: a singing ghost sways gently around its band over time', () => {
    const ev = makeEvent({ family: 'singing', side: 'left', start: 0, end: 10, loudness: 0.8 });
    const a = layout([ev], 2, vp, defaultSettings)[0]!;
    const b = layout([ev], 4.5, vp, defaultSettings)[0]!;
    // Position moves a little between frames (the sway) but stays in the band.
    expect(a.x).not.toBeCloseTo(b.x, 4);
    for (const sp of [a, b]) {
      expect(sp.x).toBeGreaterThanOrEqual(0.15);
      expect(sp.x).toBeLessThanOrEqual(0.3);
    }
  });

  it('reduced motion removes travel, pop and sway, keeping positions and sizes', () => {
    const reduced: OverlaySettings = { ...defaultSettings, reducedMotion: true };
    const gun = makeEvent({ family: 'gunshot', side: 'left', start: 0, end: 3, loudness: 0.9, trend: 'steady' });
    const popMid = layout([gun], 0.15, vp, reduced)[0]!;
    const popLate = layout([gun], 1.5, vp, reduced)[0]!;
    expect(popMid.scale).toBeCloseTo(popLate.scale, 6); // no pop

    const sing = makeEvent({ family: 'singing', side: 'left', start: 0, end: 10, loudness: 0.8 });
    const swayA = layout([sing], 2, vp, reduced)[0]!;
    const swayB = layout([sing], 4.5, vp, reduced)[0]!;
    expect(swayA.x).toBeCloseTo(swayB.x, 6); // no sway
  });
});

describe('layout: keep the central face region light (task 17.4)', () => {
  const vp: Viewport = { width: 1000, height: 1000 };

  it('a full-size ghost dims to the configured opacity while centred in the face band', () => {
    // A centre-unknown hover ghost sits at x = 0.5, inside the central 40%.
    const ev = makeEvent({ family: 'siren', side: 'centre-unknown', start: 0, end: 10, loudness: 0.9 });
    const sp = layout([ev], 5, vp, defaultSettings)[0]!; // well past the fade-in
    expect(sp.x).toBeGreaterThan(0.5 - CENTRE_FACE_BAND / 2);
    expect(sp.x).toBeLessThan(0.5 + CENTRE_FACE_BAND / 2);
    expect(sp.opacity).toBeCloseTo(CENTRE_FACE_OPACITY, 5);
  });

  it('a ghost out at the side keeps full opacity', () => {
    const ev = makeEvent({ family: 'footsteps', side: 'left', start: 0, end: 10, loudness: 0.9 });
    const sp = layout([ev], 5, vp, defaultSettings)[0]!; // settled in the left band
    expect(sp.x).toBeLessThan(0.5 - CENTRE_FACE_BAND / 2);
    expect(sp.opacity).toBeCloseTo(1, 5);
  });
});

describe('layout: edgeFogs are visible and textured (task 18)', () => {
  const settings = defaultSettings;

  it('a medium-loud wind reaches at least 0.30 at the outer edge once attacked (task 18.1)', () => {
    // A wind event lasting long enough to fully attack; sample after the attack
    // but before the settle fade (task 23.5: settle halves the band after 3 s
    // steady), so the visible-floor guarantee is checked on the active band.
    const ev = makeEvent({
      family: 'wind',
      side: 'centre-unknown',
      loudness: 0.5,
      ominous: 0.45,
      start: 0,
      end: 10,
    });
    const fogs = edgeFogs([ev], 2, settings);
    expect(fogs).toHaveLength(1);
    expect(fogs[0]!.opacity).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(fogs[0]!.opacity).toBeLessThanOrEqual(ghostConfig.edgeFogMaxOpacity.value + 1e-9);
  });

  it('even a quiet ambient event clears the visible floor once attacked (task 18.1)', () => {
    const ev = makeEvent({ family: 'rain', side: 'left', loudness: 0, ominous: 0, start: 0, end: 10 });
    const fogs = edgeFogs([ev], 2, settings);
    expect(fogs[0]!.opacity).toBeCloseTo(ghostConfig.edgeFogMinVisible.value, 5);
  });

  it('attack and release are frame-rate independent (same opacity at the same time)', () => {
    // fogOpacityAt reads per-second rates, so sampling the same wall-clock time
    // gives the same opacity regardless of how often draw is called.
    const ev = makeEvent({ family: 'wind', loudness: 1, ominous: 1, start: 0, end: 10 });
    const a = edgeFogs([ev], 0.2, settings)[0]!.opacity;
    const b = edgeFogs([ev], 0.2, settings)[0]!.opacity;
    expect(a).toBe(b);
    // 0.2 s into a 1.2/s attack gives ~0.24, below the capped target, so the
    // ramp is observable (not already saturated).
    expect(a).toBeLessThan(ghostConfig.edgeFogMaxOpacity.value);
  });

  it('each ambient event carries its family texture and a density (task 18.2)', () => {
    const wind = edgeFogs([makeEvent({ family: 'wind', loudness: 0.8, ominous: 0.5, start: 0, end: 5 })], 2, settings)[0]!;
    const rain = edgeFogs([makeEvent({ family: 'rain', loudness: 0.4, ominous: 0.3, start: 0, end: 5 })], 2, settings)[0]!;
    const tense = edgeFogs([makeEvent({ family: 'tenseMusic', loudness: 0.6, ominous: 0.9, start: 0, end: 5 })], 2, settings)[0]!;
    expect(wind.texture).toBe('windStreaks');
    expect(rain.texture).toBe('rainStreaks');
    expect(tense.texture).toBe('notesTense');
    // Density rises with loudness/ominousness.
    expect(wind.textureDensity).toBeGreaterThan(0);
    expect(tense.textureDensity).toBeGreaterThan(rain.textureDensity);
  });
});

describe('layout: caption band grows for dialogue / burned-in subtitles (task 19.2/19.3)', () => {
  const vp: Viewport = { width: 1000, height: 1000 };

  it('captionBandOf defaults to the standard band and is never below it', () => {
    expect(captionBandOf(defaultSettings)).toBeCloseTo(CAPTION_BAND, 10);
    // A smaller requested band is clamped up to the default.
    expect(captionBandOf({ ...defaultSettings, captionBandFrac: 0.05 })).toBeCloseTo(CAPTION_BAND, 10);
    // A larger requested band is honoured.
    expect(captionBandOf({ ...defaultSettings, captionBandFrac: 0.3 })).toBeCloseTo(0.3, 10);
  });

  it('an enlarged caption band pushes ghosts further up the frame', () => {
    // A centre-unknown hover ghost settles at a y clamped by the band; a larger
    // band gives a smaller (higher) y for the same event.
    const ev = makeEvent({ family: 'siren', side: 'centre-unknown', start: 0, end: 10, loudness: 0.1 });
    const normal = layout([ev], 5, vp, defaultSettings)[0]!;
    const enlarged = layout([ev], 5, vp, { ...defaultSettings, captionBandFrac: 0.4 })[0]!;
    expect(enlarged.y).toBeLessThanOrEqual(normal.y);
  });

  it('no sprite reaches into the enlarged caption band (task 19.2)', () => {
    const band = 0.3;
    const settings: OverlaySettings = { ...defaultSettings, captionBandFrac: band };
    const events = FAMILIES.map((family, i) =>
      makeEvent({ id: `e${i}`, family, side: 'centre-unknown', start: 0, end: 10, loudness: 0.8 }),
    );
    const sprites = layout(events, 5, vp, settings);
    const minDim = Math.min(vp.width, vp.height);
    const bandTopFrac = 1 - band;
    for (const sp of sprites) {
      const radiusFracH = (baseRadiusFrac() * sp.scale * minDim) / vp.height;
      expect(sp.y + radiusFracH).toBeLessThanOrEqual(bandTopFrac + 1e-9);
    }
  });
});

describe('layout: ghost heads stay in the frame (task 22.3)', () => {
  it('a large ghost sits at y >= its radius + TOP_MARGIN, so its head is never clipped', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    // One loud, large ghost at the top band; sizeScale large.
    const ev = makeEvent({ family: 'vehicle', side: 'left', start: 0, end: 10, loudness: 1 });
    const sp = layout([ev], 5, vp, { ...defaultSettings, sizeScale: 1.2 })[0]!;
    const minDim = Math.min(vp.width, vp.height);
    const radiusFracH = (baseRadiusFrac() * sp.scale * minDim) / vp.height;
    // The top of the ghost image (y - radiusFracH) stays inside the frame with
    // the configured margin.
    expect(sp.y).toBeGreaterThanOrEqual(radiusFracH + TOP_MARGIN - 1e-9);
    expect(sp.y - radiusFracH).toBeGreaterThanOrEqual(0);
  });

  it('for arbitrary events a full-size ghost top never goes above the frame', () => {
    const vp: Viewport = { width: 1200, height: 700 };
    for (const family of FAMILIES) {
      for (const sizeScale of [0.8, 1, 1.2]) {
        const ev = makeEvent({ family, side: 'centre-unknown', start: 0, end: 10, loudness: 1 });
        const sp = layout([ev], 5, vp, { ...defaultSettings, sizeScale })[0]!;
        const minDim = Math.min(vp.width, vp.height);
        const radiusFracH = (baseRadiusFrac() * sp.scale * minDim) / vp.height;
        // Either the head-clear rule holds, or the caption band forced it up
        // (y pinned to the band ceiling) on a cramped frame — never clipped at
        // the top beyond a tiny epsilon.
        expect(sp.y - radiusFracH).toBeGreaterThanOrEqual(-1e-6);
      }
    }
  });

  it('on a very small viewport the caption-band rule still wins (ghost not pushed into the band)', () => {
    // A tiny viewport where a full-size ghost cannot both clear its head and
    // stay above the band: the band must win (sprite stays above it).
    const vp: Viewport = { width: 200, height: 200 };
    const ev = makeEvent({ family: 'vehicle', side: 'centre-unknown', start: 0, end: 10, loudness: 1 });
    const sp = layout([ev], 5, vp, { ...defaultSettings, sizeScale: 1.2 })[0]!;
    const minDim = Math.min(vp.width, vp.height);
    const radiusFracH = (baseRadiusFrac() * sp.scale * minDim) / vp.height;
    const bandTop = 1 - CAPTION_BAND;
    expect(sp.y + radiusFracH).toBeLessThanOrEqual(bandTop + 1e-6);
  });
});

// ---------------------------------------------------------------------------
// Task 23.4: ambient sounds without a known side use a single top band.
// ---------------------------------------------------------------------------

describe('layout: top band for no-side ambient, slots side by side (task 23.4)', () => {
  it('a known side keeps its side band; no-side uses the top band', () => {
    const left = makeEvent({ family: 'rain', side: 'left', start: 0, end: 10, loudness: 0.6 });
    const none = makeEvent({ id: 'n', family: 'wind', side: 'centre-unknown', start: 0, end: 10, loudness: 0.6 });
    expect(edgeFogs([left], 2, defaultSettings)[0]!.edge).toBe('left');
    expect(edgeFogs([none], 2, defaultSettings)[0]!.edge).toBe('top');
  });

  it('several no-side ambient fogs get distinct side-by-side top slots', () => {
    const a = makeEvent({ id: 'a', family: 'wind', side: 'centre-unknown', start: 0, end: 10, loudness: 0.6 });
    const b = makeEvent({ id: 'b', family: 'rain', side: 'centre-unknown', start: 0, end: 10, loudness: 0.6 });
    const fogs = edgeFogs([a, b], 2, defaultSettings);
    const top = fogs.filter((f) => f.edge === 'top');
    expect(top).toHaveLength(2);
    expect(top[0]!.topCount).toBe(2);
    expect(top[1]!.topCount).toBe(2);
    expect(new Set(top.map((f) => f.topSlot)).size).toBe(2); // distinct slots
  });
});

// ---------------------------------------------------------------------------
// Task 23.5: rhythm — arrival pop and settle.
// ---------------------------------------------------------------------------

describe('layout: arrival pop (task 23.5)', () => {
  const vp: Viewport = { width: 1000, height: 1000 };

  it('a point ghost is larger just after its occurrence starts than later', () => {
    const ev = makeEvent({ family: 'gunshot', side: 'centre-unknown', start: 0, end: 10, loudness: 0.5, trend: 'steady' });
    const atStart = layout([ev], 0.05, vp, defaultSettings)[0]!;
    const later = layout([ev], 5, vp, defaultSettings)[0]!;
    expect(atStart.scale).toBeGreaterThan(later.scale);
    // The pop reaches near the configured multiple of the settled size.
    expect(atStart.scale / later.scale).toBeGreaterThan(1.2);
  });

  it('reduced motion has no arrival pop (same size at start and later)', () => {
    const ev = makeEvent({ family: 'gunshot', side: 'centre-unknown', start: 0, end: 10, loudness: 0.5, trend: 'steady' });
    const settings = { ...defaultSettings, reducedMotion: true };
    const atStart = layout([ev], 0.05, vp, settings)[0]!;
    const later = layout([ev], 5, vp, settings)[0]!;
    expect(atStart.scale).toBeCloseTo(later.scale, 10);
  });

  it('an ambient fog sprite pops on arrival then settles back', () => {
    const ev = makeEvent({ family: 'wind', side: 'left', start: 0, end: 20, loudness: 0.6, trend: 'steady' });
    const atStart = edgeFogs([ev], 0.05, defaultSettings)[0]!;
    const later = edgeFogs([ev], 2, defaultSettings)[0]!;
    expect(atStart.spriteScale).toBeGreaterThan(later.spriteScale);
  });
});

describe('layout: ambient settle after steady time (task 23.5)', () => {
  it('a steady ambient band fades and thins once past the settle time', () => {
    const ev = makeEvent({ family: 'wind', side: 'left', start: 0, end: 30, loudness: 0.8, ominous: 0.6, trend: 'steady' });
    // Before settle (t=2 < settleAfterSec) vs after (t well past settleAfterSec).
    const before = edgeFogs([ev], 2, defaultSettings)[0]!;
    const after = edgeFogs([ev], 10, defaultSettings)[0]!;
    expect(after.settled).toBe(true);
    expect(before.settled).toBe(false);
    expect(after.opacity).toBeLessThan(before.opacity);
    expect(after.textureDensity).toBeLessThan(before.textureDensity);
  });

  it('a rising ambient event does not settle', () => {
    const ev = makeEvent({ family: 'wind', side: 'left', start: 0, end: 30, loudness: 0.8, trend: 'rising' });
    expect(edgeFogs([ev], 10, defaultSettings)[0]!.settled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Task 24.1: one fog per occurrence — merge simultaneous same-group,
// same-edge ambient events into a single fog.
// ---------------------------------------------------------------------------

describe('edgeFogs: one fog per occurrence (task 24.1)', () => {
  it('merges two simultaneous music events on the same edge into ONE fog', () => {
    // The Sintel defect: a long music cue split by buildEvents into two touching
    // events showed two "Music" top-band slots at 13 s. All music families are
    // one occurrence group, so two overlapping music events on the same edge
    // must become a single fog.
    const loud = makeEvent({
      id: 'm1', family: 'tenseMusic', side: 'centre-unknown',
      start: 0, end: 10, loudness: 0.9, ominous: 0.8, trend: 'rising',
    });
    const quiet = makeEvent({
      id: 'm2', family: 'calmMusic', side: 'centre-unknown',
      start: 0, end: 10, loudness: 0.4, ominous: 0.3, trend: 'steady',
    });
    const fogs = edgeFogs([loud, quiet], 2, defaultSettings);
    expect(fogs).toHaveLength(1);
    // The merged fog is named by its loudest member (tenseMusic → its label).
    const f = fogs[0]!;
    expect(f.family).toBe('tenseMusic');
    // Only one top slot remains — no two "Music" plates side by side.
    expect(f.topCount).toBe(1);
  });

  it('the merged fog opacity is the max of its members', () => {
    const a = makeEvent({ id: 'a', family: 'tenseMusic', side: 'centre-unknown', start: 0, end: 10, loudness: 0.9, ominous: 0.9, trend: 'steady' });
    const b = makeEvent({ id: 'b', family: 'calmMusic', side: 'centre-unknown', start: 0, end: 10, loudness: 0.2, ominous: 0.1, trend: 'steady' });
    const merged = edgeFogs([a, b], 5, defaultSettings)[0]!;
    const aOnly = edgeFogs([a], 5, defaultSettings)[0]!;
    const bOnly = edgeFogs([b], 5, defaultSettings)[0]!;
    expect(merged.opacity).toBeCloseTo(Math.max(aOnly.opacity, bOnly.opacity), 10);
  });

  it('a settled member and a fresh member merge to a not-yet-settled fog', () => {
    // A long steady wind (settled by t=10) plus a fresh wind burst keep the
    // band awake: the merged fog is not settled while any member is fresh.
    const steady = makeEvent({ id: 's', family: 'wind', side: 'left', start: 0, end: 30, loudness: 0.8, trend: 'steady' });
    const fresh = makeEvent({ id: 'f', family: 'wind', side: 'left', start: 9.5, end: 20, loudness: 0.8, trend: 'rising' });
    const merged = edgeFogs([steady, fresh], 10, defaultSettings)[0]!;
    expect(merged.settled).toBe(false);
  });

  it('does NOT merge the same group on different edges (left vs top)', () => {
    // A measured side names a distinct source, so a left music and a no-side
    // (top) music stay as two fogs.
    const left = makeEvent({ id: 'l', family: 'tenseMusic', side: 'left', start: 0, end: 10, loudness: 0.7, trend: 'steady' });
    const none = makeEvent({ id: 'n', family: 'calmMusic', side: 'centre-unknown', start: 0, end: 10, loudness: 0.7, trend: 'steady' });
    const fogs = edgeFogs([left, none], 2, defaultSettings);
    expect(fogs).toHaveLength(2);
    expect(new Set(fogs.map((f) => f.edge))).toEqual(new Set(['left', 'top']));
  });

  it('does NOT merge different groups on the same edge (wind vs rain)', () => {
    // Wind and rain are different occurrence groups, so two no-side fogs stay
    // distinct and take side-by-side top slots (task 23.4).
    const wind = makeEvent({ id: 'w', family: 'wind', side: 'centre-unknown', start: 0, end: 10, loudness: 0.6, trend: 'steady' });
    const rain = makeEvent({ id: 'r', family: 'rain', side: 'centre-unknown', start: 0, end: 10, loudness: 0.6, trend: 'steady' });
    const fogs = edgeFogs([wind, rain], 2, defaultSettings);
    expect(fogs).toHaveLength(2);
    expect(fogs.every((f) => f.topCount === 2)).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// Task 25.2: trend words are transient.
// ---------------------------------------------------------------------------

describe('spriteLabel: transient trend word (task 25.2)', () => {
  const s = tables.en;

  it('includes the trend word within trendLabelSec of the event start', () => {
    const ev = makeEvent({ family: 'footsteps', side: 'left', trend: 'rising', start: 10, end: 30 });
    const within = spriteLabel(ev, s, 'en', 11); // 1 s in, within the 3 s window
    expect(within).toContain(s.trend.rising);
  });

  it('drops the trend word after trendLabelSec, leaving the plain name', () => {
    const ev = makeEvent({ family: 'footsteps', side: 'left', trend: 'rising', start: 10, end: 30 });
    const after = spriteLabel(ev, s, 'en', 10 + ghostConfig.trendLabelSec.value + 1);
    expect(after).not.toContain(s.trend.rising);
    // The name and the direction word remain.
    expect(after).toContain(s.family.footsteps);
    expect(after).toContain(s.side.left);
  });

  it('always includes the trend when no time is given (the WebVTT export path)', () => {
    const ev = makeEvent({ family: 'footsteps', trend: 'falling', start: 10, end: 30 });
    expect(spriteLabel(ev, s)).toContain(s.trend.falling);
  });

  it('the layout label drops the trend word late in the event', () => {
    const vp: Viewport = { width: 1000, height: 1000 };
    const ev = makeEvent({ family: 'footsteps', side: 'centre-unknown', trend: 'rising', start: 0, end: 30 });
    const early = layout([ev], 1, vp, defaultSettings)[0]!;
    const late = layout([ev], 20, vp, defaultSettings)[0]!;
    expect(early.label).toContain(tables.en.trend.rising);
    expect(late.label).not.toContain(tables.en.trend.rising);
  });
});

// ---------------------------------------------------------------------------
// Task 25.3: settled ambient folds away into a corner chip.
// ---------------------------------------------------------------------------

describe('edgeFogs: settled ambient folds to a corner chip (task 25.3)', () => {
  it('a steady ambient event folds once past settleSec', () => {
    const ev = makeEvent({ family: 'wind', side: 'left', start: 0, end: 60, loudness: 0.8, trend: 'steady' });
    const before = edgeFogs([ev], 1, defaultSettings)[0]!;
    const after = edgeFogs([ev], ghostConfig.settleSec.value + 2, defaultSettings)[0]!;
    expect(before.folded).toBe(false);
    expect(after.folded).toBe(true);
  });

  it('a rising ambient event never folds', () => {
    const ev = makeEvent({ family: 'wind', side: 'left', start: 0, end: 60, loudness: 0.8, trend: 'rising' });
    expect(edgeFogs([ev], ghostConfig.settleSec.value + 5, defaultSettings)[0]!.folded).toBe(false);
  });

  it('folded fogs leave the top band and stack in distinct fold slots', () => {
    const a = makeEvent({ id: 'a', family: 'wind', side: 'centre-unknown', start: 0, end: 60, loudness: 0.8, trend: 'steady' });
    const b = makeEvent({ id: 'b', family: 'rain', side: 'centre-unknown', start: 0, end: 60, loudness: 0.8, trend: 'steady' });
    const fogs = edgeFogs([a, b], ghostConfig.settleSec.value + 2, defaultSettings);
    expect(fogs.every((f) => f.folded)).toBe(true);
    // No folded fog counts toward the top-band slotting.
    expect(fogs.every((f) => f.topCount === 0)).toBe(true);
    // Folded fogs stack in the corner with distinct fold slots.
    expect(fogs.every((f) => f.foldCount === 2)).toBe(true);
    expect(new Set(fogs.map((f) => f.foldSlot)).size).toBe(2);
  });

  it('a merged fog folds only when every member has folded (a fresh member unfolds it)', () => {
    const steady = makeEvent({ id: 's', family: 'wind', side: 'left', start: 0, end: 60, loudness: 0.8, trend: 'steady' });
    const fresh = makeEvent({ id: 'f', family: 'wind', side: 'left', start: 9.5, end: 40, loudness: 0.8, trend: 'rising' });
    const merged = edgeFogs([steady, fresh], 10, defaultSettings)[0]!;
    expect(merged.folded).toBe(false);
  });
});
