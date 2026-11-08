import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  Family, FamilyOrSpeech, Side, Trend,
  StereoPcm, ClassWindow, Frame, SoundEvent, EventTrack, GhostSprite,
  EdgeFog, FogEdge,
} from '../src/shared/types.ts';

// Task 2.1: the shared types match the data-types section of design.md. These
// are compile-time checks (expectTypeOf) plus a couple of constructed values so
// the module is exercised at runtime too. If a type drifts from the design the
// typecheck step fails.

describe('shared types (task 2.1)', () => {
  it('Family is the fixed set from Req 3.1 (speech is not a family)', () => {
    expectTypeOf<Family>().toEqualTypeOf<
      | 'footsteps' | 'door' | 'knock' | 'scream' | 'laughter' | 'crying'
      | 'tenseMusic' | 'calmMusic' | 'singing' | 'impact' | 'gunshot'
      | 'vehicle' | 'siren' | 'animal' | 'wind' | 'rain' | 'thunder'
      | 'fire' | 'glass' | 'unknown'
    >();
  });

  it('FamilyOrSpeech adds the speech marker on top of Family', () => {
    expectTypeOf<FamilyOrSpeech>().toEqualTypeOf<Family | 'speech'>();
  });

  it('Side and Trend are the documented unions', () => {
    expectTypeOf<Side>().toEqualTypeOf<'left' | 'right' | 'centre-unknown'>();
    expectTypeOf<Trend>().toEqualTypeOf<'rising' | 'falling' | 'steady'>();
  });

  it('StereoPcm keeps both channels, a mono flag and duration (Req 2.2)', () => {
    const pcm: StereoPcm = {
      sampleRate: 48000,
      left: new Float32Array([0, 0.1, -0.1]),
      right: new Float32Array([0, 0.1, -0.1]),
      mono: false,
      duration: 3 / 48000,
    };
    expect(pcm.left.length).toBe(3);
    expectTypeOf(pcm.left).toEqualTypeOf<Float32Array>();
    expectTypeOf(pcm.right).toEqualTypeOf<Float32Array>();
  });

  it('ClassWindow carries top categories and scores (Req 2.3)', () => {
    const w: ClassWindow = {
      start: 0,
      end: 0.975,
      categories: [{ name: 'Music', score: 0.9 }],
    };
    expect(w.categories[0]?.name).toBe('Music');
  });

  it('Frame carries energy, balance, flux and lowShare (Req 2.4)', () => {
    const f: Frame = { t: 0, energy: 0.5, balance: -0.3, flux: 0.2, lowShare: 0.4 };
    expectTypeOf(f).toMatchTypeOf<{
      t: number; energy: number; balance: number; flux: number; lowShare: number;
    }>();
  });

  it('SoundEvent has every field from design.md', () => {
    const e: SoundEvent = {
      id: 'e1',
      start: 1,
      end: 2,
      family: 'door',
      isSpeech: false,
      topLabel: 'Slam',
      labelScore: 0.7,
      side: 'left',
      sideTrack: [{ t: 1, side: 'left' }],
      sideConfidence: 0.8,
      loudness: 0.6,
      trend: 'rising',
      ominous: 0.5,
      beatPeriod: null,
    };
    expect(e.family).toBe('door');
    expect(e.topLabel).toBe('Slam');
    // topLabel is nullable for below-threshold windows (Req 3.5).
    expectTypeOf<SoundEvent['topLabel']>().toEqualTypeOf<string | null>();
    expectTypeOf<SoundEvent['beatPeriod']>().toEqualTypeOf<number | null>();
  });

  it('EventTrack carries the mono and labelsAvailable notices', () => {
    const track: EventTrack = {
      duration: 10,
      events: [],
      mono: true,
      labelsAvailable: false,
    };
    expect(track.mono).toBe(true);
    expect(track.labelsAvailable).toBe(false);
  });

  it('GhostSprite always carries a text label (never only motion/colour)', () => {
    const s: GhostSprite = {
      family: 'scream',
      x: 0.2,
      y: 0.3,
      scale: 1.2,
      fog: 0.4,
      trembleHz: 0,
      opacity: 1,
      label: 'scream, from the left',
    };
    expectTypeOf<GhostSprite['label']>().toEqualTypeOf<string>();
    expect(s.label.length).toBeGreaterThan(0);
  });

  it('EdgeFog carries an edge, opacity and a text label (task 16.3)', () => {
    const f: EdgeFog = {
      family: 'thunder',
      edge: 'all',
      opacity: 0.3,
      label: 'thunder',
    };
    expectTypeOf<EdgeFog['edge']>().toEqualTypeOf<FogEdge>();
    expectTypeOf<FogEdge>().toEqualTypeOf<'left' | 'right' | 'all'>();
    expect(f.label.length).toBeGreaterThan(0);
  });
});
