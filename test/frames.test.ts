import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  frames,
  framesChunked,
  defaultFrameOptions,
  percentile,
  clipLoudness,
  type FrameOptions,
} from '../src/measure/frames.ts';
import { synthesize } from './synth.ts';
import type { Frame } from '../src/shared/types.ts';

// Task 4.2: the three contracts design.md calls out —
//   (a) balance sign matches pan on synthetic bursts;
//   (b) flux peaks at burst onsets;
//   (c) lowShare is high for a 100 Hz tone and low for a 4 kHz tone.
// Plus the chunked runner must produce identical frames to the synchronous
// one (Req 2.6), and the small helpers are pinned.

/** Options at 16 kHz so synth defaults line up; same band maths as production. */
const opts: FrameOptions = { ...defaultFrameOptions, frameSize: 1024, hop: 512 };

/** Frames whose centre time falls within [start, end). */
function framesIn(fs: Frame[], start: number, end: number): Frame[] {
  return fs.filter((f) => f.t >= start && f.t < end);
}

/** Energy-weighted mean balance over a set of frames. */
function weightedBalance(fs: Frame[]): number {
  let num = 0;
  let den = 0;
  for (const f of fs) {
    num += f.balance * f.energy;
    den += f.energy;
  }
  return den > 0 ? num / den : 0;
}

describe('frames: balance (task 4.2a)', () => {
  it('balance is near zero for a centred burst', () => {
    const { pcm } = synthesize(
      [{ kind: 'tone', start: 0.2, end: 0.8, gain: 0.6, freq: 1000, pan: 0 }],
      { sampleRate: 16000, duration: 1 },
    );
    const fs = framesIn(frames(pcm, opts), 0.25, 0.75);
    expect(Math.abs(weightedBalance(fs))).toBeLessThan(0.1);
  });

  it('property: balance sign matches the sign of a static pan for |pan| >= 0.6', () => {
    fc.assert(
      fc.property(fc.integer({ min: 6, max: 10 }), fc.boolean(), (mag, positive) => {
        const pan = (positive ? 1 : -1) * (mag / 10);
        const { pcm } = synthesize(
          [{ kind: 'tone', start: 0, end: 0.6, gain: 0.6, freq: 1200, pan }],
          { sampleRate: 16000, duration: 0.6 },
        );
        const b = weightedBalance(framesIn(frames(pcm, opts), 0.05, 0.55));
        return positive ? b > 0 : b < 0;
      }),
      { numRuns: 25 },
    );
  });

  it('a hard-left burst reads strongly negative, hard-right strongly positive', () => {
    const l = synthesize([{ kind: 'noise', start: 0, end: 0.6, gain: 0.5, pan: -1 }], {
      sampleRate: 16000,
      duration: 0.6,
      seed: 3,
    }).pcm;
    const r = synthesize([{ kind: 'noise', start: 0, end: 0.6, gain: 0.5, pan: 1 }], {
      sampleRate: 16000,
      duration: 0.6,
      seed: 3,
    }).pcm;
    expect(weightedBalance(framesIn(frames(l, opts), 0.05, 0.55))).toBeLessThan(-0.6);
    expect(weightedBalance(framesIn(frames(r, opts), 0.05, 0.55))).toBeGreaterThan(0.6);
  });
});

describe('frames: flux (task 4.2b)', () => {
  it('flux peaks at a burst onset, not during steady sustain or silence', () => {
    // Silence, then a sudden tone at 0.5 s held to 1.0 s, then silence.
    const { pcm } = synthesize(
      [{ kind: 'tone', start: 0.5, end: 1.0, gain: 0.8, freq: 1500, pan: 0 }],
      { sampleRate: 16000, duration: 1.5 },
    );
    const fs = frames(pcm, opts);

    // The frame with the largest flux should sit right around the 0.5 s onset.
    let peakT = fs[0]!.t;
    let peak = -Infinity;
    for (const f of fs) {
      if (f.flux > peak) {
        peak = f.flux;
        peakT = f.t;
      }
    }
    expect(peakT).toBeGreaterThan(0.45);
    expect(peakT).toBeLessThan(0.6);

    // Onset flux dwarfs the mid-sustain flux (steady tone -> little change).
    const sustain = framesIn(fs, 0.7, 0.9);
    const meanSustain = sustain.reduce((s, f) => s + f.flux, 0) / Math.max(1, sustain.length);
    expect(peak).toBeGreaterThan(meanSustain * 5);
  });

  it('the first frame has zero flux (no previous frame)', () => {
    const { pcm } = synthesize([{ kind: 'noise', start: 0, end: 0.3, gain: 0.5 }], {
      sampleRate: 16000,
    });
    expect(frames(pcm, opts)[0]!.flux).toBe(0);
  });
});

describe('frames: lowShare (task 4.2c)', () => {
  it('lowShare is high for a 100 Hz tone and low for a 4 kHz tone', () => {
    const low = synthesize([{ kind: 'tone', start: 0, end: 0.8, gain: 0.7, freq: 100, pan: 0 }], {
      sampleRate: 16000,
      duration: 0.8,
    }).pcm;
    const high = synthesize([{ kind: 'tone', start: 0, end: 0.8, gain: 0.7, freq: 4000, pan: 0 }], {
      sampleRate: 16000,
      duration: 0.8,
    }).pcm;

    const lowShareLow =
      framesIn(frames(low, opts), 0.1, 0.7).reduce((s, f) => s + f.lowShare, 0) /
      Math.max(1, framesIn(frames(low, opts), 0.1, 0.7).length);
    const lowShareHigh =
      framesIn(frames(high, opts), 0.1, 0.7).reduce((s, f) => s + f.lowShare, 0) /
      Math.max(1, framesIn(frames(high, opts), 0.1, 0.7).length);

    expect(lowShareLow).toBeGreaterThan(0.8);
    expect(lowShareHigh).toBeLessThan(0.1);
  });
});

describe('frames: structure and energy', () => {
  it('frame times are evenly spaced by hop / sampleRate', () => {
    const { pcm } = synthesize([{ kind: 'noise', start: 0, end: 1, gain: 0.4 }], {
      sampleRate: 16000,
      duration: 1,
    });
    const fs = frames(pcm, opts);
    expect(fs.length).toBeGreaterThan(1);
    const step = opts.hop / 16000;
    for (let i = 1; i < fs.length; i++) {
      expect(fs[i]!.t - fs[i - 1]!.t).toBeCloseTo(step, 6);
    }
  });

  it('louder bursts yield more in-burst energy at the same pan', () => {
    const mk = (g: number) =>
      frames(
        synthesize([{ kind: 'tone', start: 0, end: 0.6, gain: g, freq: 800, pan: 0 }], {
          sampleRate: 16000,
          duration: 0.6,
        }).pcm,
        opts,
      );
    const eLo = framesIn(mk(0.2), 0.1, 0.5).reduce((s, f) => s + f.energy, 0);
    const eHi = framesIn(mk(0.8), 0.1, 0.5).reduce((s, f) => s + f.energy, 0);
    expect(eHi).toBeGreaterThan(eLo);
  });

  it('silence yields zero energy, balance and lowShare without NaN', () => {
    const { pcm } = synthesize([{ kind: 'tone', start: 10, end: 10.1, gain: 0.1, freq: 440 }], {
      sampleRate: 16000,
      duration: 0.5,
    });
    for (const f of frames(pcm, opts)) {
      expect(f.energy).toBe(0);
      expect(f.balance).toBe(0);
      expect(f.lowShare).toBe(0);
      expect(Number.isNaN(f.flux)).toBe(false);
    }
  });

  it('rejects a non-positive hop', () => {
    const { pcm } = synthesize([{ kind: 'noise', start: 0, end: 0.2, gain: 0.3 }], {
      sampleRate: 16000,
    });
    expect(() => frames(pcm, { ...opts, hop: 0 })).toThrow();
  });
});

describe('framesChunked (Req 2.6)', () => {
  it('produces frames identical to the synchronous runner', async () => {
    const { pcm } = synthesize(
      [
        { kind: 'noise', start: 0, end: 0.5, gain: 0.4, pan: -0.5 },
        { kind: 'tone', start: 0.6, end: 1.2, gain: 0.6, freq: 900, pan: 0.5 },
      ],
      { sampleRate: 16000, duration: 1.5, seed: 11 },
    );
    const sync = frames(pcm, opts);
    const chunked = await framesChunked(pcm, opts, { sliceFrames: 8 });
    expect(chunked.length).toBe(sync.length);
    for (let i = 0; i < sync.length; i++) {
      expect(chunked[i]!.t).toBeCloseTo(sync[i]!.t, 9);
      expect(chunked[i]!.energy).toBeCloseTo(sync[i]!.energy, 9);
      expect(chunked[i]!.balance).toBeCloseTo(sync[i]!.balance, 9);
      expect(chunked[i]!.flux).toBeCloseTo(sync[i]!.flux, 9);
      expect(chunked[i]!.lowShare).toBeCloseTo(sync[i]!.lowShare, 9);
    }
  });

  it('reports monotonic non-decreasing progress ending at 1', async () => {
    const { pcm } = synthesize([{ kind: 'noise', start: 0, end: 2, gain: 0.4 }], {
      sampleRate: 16000,
      duration: 2,
    });
    const seen: number[] = [];
    await framesChunked(pcm, opts, { sliceFrames: 4, onProgress: (p) => seen.push(p) });
    expect(seen.length).toBeGreaterThan(0);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(seen[seen.length - 1]!).toBe(1);
  });

  it('yields to the event loop between slices', async () => {
    const { pcm } = synthesize([{ kind: 'noise', start: 0, end: 1, gain: 0.4 }], {
      sampleRate: 16000,
      duration: 1,
    });
    let yields = 0;
    await framesChunked(pcm, opts, {
      sliceFrames: 4,
      yieldToEventLoop: () => {
        yields++;
        return Promise.resolve();
      },
    });
    expect(yields).toBeGreaterThan(0);
  });
});

describe('percentile and clipLoudness helpers', () => {
  it('percentile returns the extremes and interpolates the middle', () => {
    const v = [0, 10, 20, 30, 40];
    expect(percentile(v, 0)).toBe(0);
    expect(percentile(v, 1)).toBe(40);
    expect(percentile(v, 0.5)).toBe(20);
    expect(percentile(v, 0.25)).toBe(10);
  });

  it('percentile clamps p and handles the empty case', () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([5], 0.9)).toBe(5);
    expect(percentile([1, 2, 3], -1)).toBe(1);
    expect(percentile([1, 2, 3], 2)).toBe(3);
  });

  it('percentile does not mutate its input', () => {
    const v = [3, 1, 2];
    percentile(v, 0.5);
    expect(v).toEqual([3, 1, 2]);
  });

  it('clipLoudness returns frame energies sorted ascending', () => {
    const fs: Frame[] = [
      { t: 0, energy: 5, balance: 0, flux: 0, lowShare: 0 },
      { t: 1, energy: 1, balance: 0, flux: 0, lowShare: 0 },
      { t: 2, energy: 3, balance: 0, flux: 0, lowShare: 0 },
    ];
    expect(clipLoudness(fs)).toEqual([1, 3, 5]);
  });
});
