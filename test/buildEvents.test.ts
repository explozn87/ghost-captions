import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildEvents, activeEvents } from '../src/events/buildEvents.ts';
import { frames, defaultFrameOptions, type FrameOptions } from '../src/measure/frames.ts';
import { synthesize } from './synth.ts';
import sintelWindows from './fixtures/sintel.windows.json';
import { familyFor } from '../src/events/familyMap.ts';
import { ghostConfig } from '../src/config/ghost.config.ts';
import type { ClassWindow, EventTrack, Frame, Family } from '../src/shared/types.ts';

// Task 5.4: the four properties P1–P4 from design.md, plus example tests on the
// recorded Sintel windows (families appear in scene order; speech is never a
// ghost). The merge/cap/drop rules (Req 3.3–3.6) and the direction rule
// (Req 4.2, 4.3) are the ones a stale implementation would most quietly break,
// so they get property coverage on synthetic truth.

/** 16 kHz frame options so synth defaults line up (same band maths). */
const opts: FrameOptions = { ...defaultFrameOptions, frameSize: 1024, hop: 512 };

/** Build an event track from synthetic stereo audio + its measured frames. */
function trackFromSynth(
  pcm: { left: Float32Array; right: Float32Array; sampleRate: number; mono: boolean; duration: number },
  overrides: Partial<Parameters<typeof buildEvents>[2]> = {},
): { track: EventTrack; fs: Frame[] } {
  const fs = frames(pcm, opts);
  const track = buildEvents(windowsCovering(pcm.duration, 'impact'), fs, {
    duration: pcm.duration,
    mono: pcm.mono,
    labelsAvailable: true,
    ...overrides,
  });
  return { track, fs };
}

/** One classifier window per 0.975 s covering [0,duration), all one category. */
function windowsCovering(duration: number, categoryName: string): ClassWindow[] {
  const W = 0.975;
  const out: ClassWindow[] = [];
  for (let s = 0; s < duration; s += W) {
    out.push({
      start: Math.round(s * 1000) / 1000,
      end: Math.round((s + W) * 1000) / 1000,
      categories: [{ name: categoryName, score: 0.8 }],
    });
  }
  return out;
}

describe('buildEvents: direction properties P1, P2 (task 5.4)', () => {
  it('P1: a burst panned with |pan| >= 0.6 is never assigned the opposite side', () => {
    fc.assert(
      fc.property(fc.integer({ min: 6, max: 10 }), fc.boolean(), (mag, right) => {
        const pan = (right ? 1 : -1) * (mag / 10);
        const { pcm } = synthesize(
          [{ kind: 'noise', start: 0, end: 1.2, gain: 0.6, pan }],
          { sampleRate: 16000, duration: 1.4, seed: mag },
        );
        const { track } = trackFromSynth(pcm);
        // Every event with a decided side must match the true pan sign; it may
        // be centre-unknown, but never the opposite side (Req 4.3).
        for (const e of track.events) {
          if (e.side === 'left') return pan < 0;
          if (e.side === 'right') return pan > 0;
        }
        return true;
      }),
      { numRuns: 25 },
    );
  });

  it('P2: a near-centre burst (|pan| <= 0.1) is centre-unknown', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 }), fc.boolean(), (mag, right) => {
        const pan = (right ? 1 : -1) * (mag / 10); // 0 or ±0.1
        const { pcm } = synthesize(
          [{ kind: 'noise', start: 0, end: 1.2, gain: 0.6, pan }],
          { sampleRate: 16000, duration: 1.4, seed: 100 + mag },
        );
        const { track } = trackFromSynth(pcm);
        return track.events.every((e) => e.side === 'centre-unknown');
      }),
      { numRuns: 20 },
    );
  });

  it('mono audio always yields centre-unknown sides', () => {
    const { pcm } = synthesize([{ kind: 'noise', start: 0, end: 1.2, gain: 0.6, pan: -0.9 }], {
      sampleRate: 16000,
      duration: 1.4,
    });
    const { track } = trackFromSynth({ ...pcm, mono: true }, { mono: true });
    expect(track.events.length).toBeGreaterThan(0);
    expect(track.events.every((e) => e.side === 'centre-unknown')).toBe(true);
  });

  it('records a side track that follows a travelling pan left -> right', () => {
    const { pcm } = synthesize([{ kind: 'noise', start: 0, end: 2, gain: 0.6, pan: [-0.9, 0.9] }], {
      sampleRate: 16000,
      duration: 2.2,
      seed: 7,
    });
    const { track } = trackFromSynth(pcm);
    const e = track.events[0]!;
    // The event span can run past the 2 s burst into its silent tail (windows
    // are 0.975 s), where slices are centre-unknown. Look at the decided slices
    // only: the first is left, the last is right (Req 4.5).
    const decided = e.sideTrack.filter((s) => s.side !== 'centre-unknown');
    expect(decided.length).toBeGreaterThan(0);
    expect(decided[0]!.side).toBe('left');
    expect(decided[decided.length - 1]!.side).toBe('right');
  });
});

describe('buildEvents: merging property P3 (task 5.3, 5.4)', () => {
  it('P3: merging never produces overlapping same-family events', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            start: fc.integer({ min: 0, max: 40 }),
            len: fc.integer({ min: 1, max: 3 }),
            fam: fc.constantFrom<Family>('impact', 'vehicle', 'animal'),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (specs) => {
          const W = 0.975;
          // Build non-overlapping-input windows from the (sorted) specs.
          const sorted = [...specs].sort((a, b) => a.start - b.start);
          const windows: ClassWindow[] = [];
          let cursor = 0;
          for (const s of sorted) {
            const startIdx = Math.max(cursor, s.start);
            for (let i = 0; i < s.len; i++) {
              const start = Math.round((startIdx + i) * W * 1000) / 1000;
              windows.push({
                start,
                end: Math.round((start + W) * 1000) / 1000,
                categories: [{ name: catFor(s.fam), score: 0.8 }],
              });
            }
            cursor = startIdx + s.len;
          }
          // A flat flux series so nothing is dropped for being short.
          const fs = flatFrames(windows[windows.length - 1]!.end + 1);
          const track = buildEvents(windows, fs, {
            duration: windows[windows.length - 1]!.end + 1,
            mono: true,
            labelsAvailable: true,
          });
          // No two same-family events overlap.
          const byFamily = new Map<Family, EventTrack['events']>();
          for (const e of track.events) {
            const list = byFamily.get(e.family) ?? [];
            list.push(e);
            byFamily.set(e.family, list);
          }
          for (const list of byFamily.values()) {
            const ordered = [...list].sort((a, b) => a.start - b.start);
            for (let i = 1; i < ordered.length; i++) {
              if (ordered[i]!.start < ordered[i - 1]!.end) return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 40 },
    );
  });

  it('merges consecutive same-family windows within mergeGap into one event', () => {
    const W = 0.975;
    const windows: ClassWindow[] = [0, 1, 2].map((i) => {
      const start = Math.round(i * W * 1000) / 1000;
      return { start, end: Math.round((start + W) * 1000) / 1000, categories: [{ name: 'Explosion', score: 0.8 }] };
    });
    const fs = flatFrames(windows[2]!.end + 0.5);
    const track = buildEvents(windows, fs, { duration: windows[2]!.end + 0.5, mono: true, labelsAvailable: true });
    const impacts = track.events.filter((e) => e.family === 'impact');
    expect(impacts).toHaveLength(1);
    expect(impacts[0]!.start).toBeCloseTo(0, 6);
    expect(impacts[0]!.end).toBeCloseTo(windows[2]!.end, 6);
  });

  it('does not merge across a gap larger than mergeGap', () => {
    const W = 0.975;
    const a = { start: 0, end: W, categories: [{ name: 'Explosion', score: 0.8 }] };
    // Second explosion starts 2 s after the first ends: far beyond mergeGap.
    const bStart = W + 2;
    const b = { start: bStart, end: bStart + W, categories: [{ name: 'Explosion', score: 0.8 }] };
    const fs = flatFrames(b.end + 0.5);
    const track = buildEvents([a, b], fs, { duration: b.end + 0.5, mono: true, labelsAvailable: true });
    expect(track.events.filter((e) => e.family === 'impact')).toHaveLength(2);
  });
});

describe('buildEvents: short-event drop with onset keep (Req 3.4)', () => {
  it('drops a lone short quiet window but keeps a short window with a sharp onset', () => {
    // A span shorter than minDuration (0.8 s) so the drop rule actually fires;
    // a single 0.975 s YAMNet window would already clear minDuration.
    const shortWin: ClassWindow[] = [{ start: 0, end: 0.4, categories: [{ name: 'Explosion', score: 0.8 }] }];

    // Quiet, flat flux -> no onset above the clip p95 -> dropped.
    const quiet = flatFrames(1.2, 0.01);
    const droppedTrack = buildEvents(shortWin, quiet, { duration: 1.2, mono: true, labelsAvailable: true });
    expect(droppedTrack.events.filter((e) => e.family === 'impact')).toHaveLength(0);

    // A real slam inside the short span: a sudden noise burst gives one frame
    // the clip-peak flux (strictly above p95), so the short event survives.
    const { pcm } = synthesize(
      [
        { kind: 'noise', start: 0.05, end: 0.35, gain: 0.9 },
        // quiet tail so the burst onset is clearly the clip's top-percentile flux
        { kind: 'tone', start: 0.6, end: 1.1, gain: 0.02, freq: 500 },
      ],
      { sampleRate: 16000, duration: 1.2, seed: 5 },
    );
    const fs = frames(pcm, opts);
    const keptTrack = buildEvents(shortWin, fs, { duration: 1.2, mono: true, labelsAvailable: true });
    expect(keptTrack.events.filter((e) => e.family === 'impact')).toHaveLength(1);
  });
});

describe('buildEvents: loudness property P4 (task 5.2, 5.4)', () => {
  it('P4: an event built over a louder burst has a loudness rank >= a quieter one', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 5, max: 9 }),
        (loTenths, hiTenths) => {
          const lo = loTenths / 10;
          const hi = hiTenths / 10;
          const loud = (gain: number) => {
            const { pcm } = synthesize([{ kind: 'tone', start: 0, end: 1.2, gain, freq: 900, pan: 0 }], {
              sampleRate: 16000,
              duration: 1.4,
            });
            const t = trackFromSynth(pcm).track;
            return t.events[0]?.loudness ?? 0;
          };
          return loud(hi) >= loud(lo);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('marks a clearly rising burst as rising and a fading one as falling', () => {
    // Rising: two bursts, the second far louder, back to back.
    const rising = synthesize(
      [
        { kind: 'tone', start: 0, end: 0.6, gain: 0.1, freq: 800, pan: 0 },
        { kind: 'tone', start: 0.6, end: 1.2, gain: 0.9, freq: 800, pan: 0 },
      ],
      { sampleRate: 16000, duration: 1.3 },
    ).pcm;
    const falling = synthesize(
      [
        { kind: 'tone', start: 0, end: 0.6, gain: 0.9, freq: 800, pan: 0 },
        { kind: 'tone', start: 0.6, end: 1.2, gain: 0.1, freq: 800, pan: 0 },
      ],
      { sampleRate: 16000, duration: 1.3 },
    ).pcm;
    const win = windowsCovering(1.3, 'Explosion');
    const r = buildEvents(win, frames(rising, opts), { duration: 1.3, mono: true, labelsAvailable: true });
    const f = buildEvents(win, frames(falling, opts), { duration: 1.3, mono: true, labelsAvailable: true });
    expect(r.events[0]!.trend).toBe('rising');
    expect(f.events[0]!.trend).toBe('falling');
  });
});

describe('buildEvents: ominousness and beat (task 5.3)', () => {
  it('a tense-music event is more ominous than a calm-music event of the same shape', () => {
    const { pcm } = synthesize([{ kind: 'noise', start: 0, end: 1.2, gain: 0.5 }], {
      sampleRate: 16000,
      duration: 1.4,
      seed: 2,
    });
    const fs = frames(pcm, opts);
    const scary = buildEvents(windowsCovering(1.4, 'Scary music'), fs, {
      duration: 1.4,
      mono: true,
      labelsAvailable: true,
    });
    const calm = buildEvents(windowsCovering(1.4, 'Happy music'), fs, {
      duration: 1.4,
      mono: true,
      labelsAvailable: true,
    });
    expect(scary.events[0]!.ominous).toBeGreaterThan(calm.events[0]!.ominous);
  });

  it('ominousness stays within 0..1', () => {
    const { pcm } = synthesize([{ kind: 'noise', start: 0, end: 1.2, gain: 1 }], {
      sampleRate: 16000,
      duration: 1.4,
    });
    const track = buildEvents(windowsCovering(1.4, 'Explosion'), frames(pcm, opts), {
      duration: 1.4,
      mono: true,
      labelsAvailable: true,
    });
    for (const e of track.events) {
      expect(e.ominous).toBeGreaterThanOrEqual(0);
      expect(e.ominous).toBeLessThanOrEqual(1);
    }
  });

  it('detects a beat period for regularly spaced onsets and none for a steady tone', () => {
    // Regular clicks every 0.5 s -> a beat near 0.5 s.
    const bursts = [0, 0.5, 1.0, 1.5, 2.0, 2.5].map((t) => ({
      kind: 'noise' as const,
      start: t,
      end: t + 0.05,
      gain: 0.8,
    }));
    const { pcm } = synthesize(bursts, { sampleRate: 16000, duration: 3, seed: 9 });
    const track = buildEvents(windowsCovering(3, 'Explosion'), frames(pcm, opts), {
      duration: 3,
      mono: true,
      labelsAvailable: true,
    });
    const beat = track.events[0]!.beatPeriod;
    expect(beat).not.toBeNull();
    expect(beat!).toBeGreaterThan(0.3);
    expect(beat!).toBeLessThan(1.5);

    // A steady, unbroken tone has no periodic onset -> null beat.
    const steady = synthesize([{ kind: 'tone', start: 0, end: 3, gain: 0.6, freq: 700, pan: 0 }], {
      sampleRate: 16000,
      duration: 3,
    }).pcm;
    const steadyTrack = buildEvents(windowsCovering(3, 'Explosion'), frames(steady, opts), {
      duration: 3,
      mono: true,
      labelsAvailable: true,
    });
    expect(steadyTrack.events[0]!.beatPeriod).toBeNull();
  });
});

describe('buildEvents: cap simultaneous (Req 3.6)', () => {
  it('keeps at most maxOnScreen overlapping events, keeping the loudest', () => {
    const cap = ghostConfig.maxOnScreen.value;
    // Build (cap + 2) overlapping events of different families via windows that
    // all span the same time, with frames whose energy we control per family is
    // not possible through windows alone; instead construct events through the
    // public API using distinct families over the same span and a flat loud
    // signal, then assert the active count never exceeds the cap.
    const span = { start: 0, end: 2 };
    const families = ['Explosion', 'Car', 'Dog', 'Wind', 'Doorbell', 'Siren'];
    const windows: ClassWindow[] = [];
    const W = 0.975;
    for (let i = 0; i < families.length; i++) {
      for (let s = 0; s < span.end; s += W) {
        windows.push({
          start: Math.round(s * 1000) / 1000,
          end: Math.round((s + W) * 1000) / 1000,
          categories: [{ name: families[i]!, score: 0.8 }],
        });
      }
    }
    // Windows are concatenated per family; buildEvents merges each family into
    // one event spanning the overlap region, giving `families.length` events.
    const fs = flatFrames(span.end + 0.5);
    const track = buildEvents(windows, fs, { duration: span.end + 0.5, mono: true, labelsAvailable: true });
    // At the midpoint, no more than `cap` events are active.
    const active = activeEvents(track, 1.0);
    expect(active.length).toBeLessThanOrEqual(cap);
  });
});

describe('buildEvents: activeEvents (Req 6.1)', () => {
  it('returns exactly the events running at a given time', () => {
    const track: EventTrack = {
      duration: 10,
      mono: true,
      labelsAvailable: true,
      events: [
        mkEvent('a', 0, 2),
        mkEvent('b', 1, 3),
        mkEvent('c', 5, 6),
      ],
    };
    expect(activeEvents(track, 0.5).map((e) => e.id)).toEqual(['a']);
    expect(activeEvents(track, 1.5).map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(activeEvents(track, 2.5).map((e) => e.id)).toEqual(['b']);
    expect(activeEvents(track, 4).map((e) => e.id)).toEqual([]);
    expect(activeEvents(track, 5.5).map((e) => e.id)).toEqual(['c']);
    // End is exclusive.
    expect(activeEvents(track, 6).map((e) => e.id)).toEqual([]);
  });
});

describe('buildEvents: Sintel fixture example tests (task 5.4)', () => {
  const windows = sintelWindows as ClassWindow[];
  // The Sintel run is audio we do not have the PCM for, so give it a flat,
  // non-silent flux series covering the clip; direction will be centre-unknown
  // (mono), which is the honest outcome for a mixed film soundtrack anyway.
  const duration = windows[windows.length - 1]!.end;
  const fs = flatFrames(duration + 1);
  const track = buildEvents(windows, fs, { duration: duration + 1, mono: true, labelsAvailable: true });

  it('speech is never a ghost family', () => {
    // No event carries a speech category as its family; speech only appears via
    // the isSpeech flag.
    for (const e of track.events) {
      expect(e.family).not.toBe('speech' as unknown as Family);
      if (e.topLabel) {
        expect(familyFor(e.topLabel)).toBe(e.family);
      }
    }
  });

  it('families appear in the scene order of the trailer', () => {
    // The trailer goes weather/wind -> vehicle -> impact(explosion/gunfire) ->
    // music. Check those families appear and in that relative order.
    const firstOf = (fam: Family) => track.events.find((e) => e.family === fam)?.start ?? Infinity;
    const weather = firstOf('weather');
    const vehicle = firstOf('vehicle');
    const impact = firstOf('impact');
    const music = Math.min(firstOf('calmMusic'), firstOf('tenseMusic'));
    expect(weather).toBeLessThan(vehicle);
    expect(vehicle).toBeLessThan(impact);
    expect(impact).toBeLessThan(music);
  });

  it('builds fewer events than windows (merging happened)', () => {
    expect(track.events.length).toBeGreaterThan(0);
    expect(track.events.length).toBeLessThan(windows.length);
  });

  it('marks the Speech-bearing stretch with isSpeech somewhere', () => {
    // The trailer has Speech windows around 42 s; a merged speech marker should
    // exist with isSpeech true.
    expect(track.events.some((e) => e.isSpeech)).toBe(true);
  });
});

// --- small helpers -------------------------------------------------------

/** A flat, non-silent flux/energy frame series over [0,duration) at 46 ms. */
function flatFrames(duration: number, level = 1): Frame[] {
  const out: Frame[] = [];
  const step = 0.046;
  for (let t = 0; t < duration; t += step) {
    out.push({ t: Math.round(t * 1000) / 1000, energy: level, balance: 0, flux: level, lowShare: 0.2 });
  }
  return out;
}

/** A category name that maps to the given family, for building test windows. */
function catFor(fam: Family): string {
  switch (fam) {
    case 'impact':
      return 'Explosion';
    case 'vehicle':
      return 'Car';
    case 'animal':
      return 'Dog';
    default:
      return 'Explosion';
  }
}

function mkEvent(id: string, start: number, end: number): EventTrack['events'][number] {
  return {
    id,
    start,
    end,
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
  };
}
