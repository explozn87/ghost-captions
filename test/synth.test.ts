import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { synthesize, type BurstSpec } from './synth.ts';

// Task 3.1: the synthetic generator is the ground-truth source for the
// property tests in tasks 4 and 5, so it must itself be trustworthy. These
// tests pin its contract: shape, ground truth, pan → energy balance, gain →
// energy, and a travelling pan that actually moves across the burst.

/** Energy (sum of squares) of a channel slice over [i0, i1). */
function energy(ch: Float32Array, i0: number, i1: number): number {
  let e = 0;
  for (let i = i0; i < i1; i++) e += ch[i]! * ch[i]!;
  return e;
}

/** Balance (R − L)/(R + L) over a slice, matching how `measure` defines it. */
function balance(pcm: { left: Float32Array; right: Float32Array }, i0: number, i1: number): number {
  const l = energy(pcm.left, i0, i1);
  const r = energy(pcm.right, i0, i1);
  return (r - l) / (r + l);
}

describe('synthesize (task 3.1)', () => {
  it('produces stereo PCM of the requested rate and duration', () => {
    const { pcm } = synthesize([{ kind: 'tone', start: 0.1, end: 0.3, gain: 0.5, freq: 440 }], {
      sampleRate: 16000,
      duration: 1,
    });
    expect(pcm.sampleRate).toBe(16000);
    expect(pcm.mono).toBe(false);
    expect(pcm.left).toHaveLength(16000);
    expect(pcm.right).toHaveLength(16000);
    expect(pcm.duration).toBe(1);
  });

  it('defaults duration to just past the last burst', () => {
    const { pcm } = synthesize([{ kind: 'noise', start: 0, end: 2, gain: 0.3 }], {
      sampleRate: 8000,
    });
    expect(pcm.duration).toBeCloseTo(2.1, 5);
    expect(pcm.left).toHaveLength(Math.round(2.1 * 8000));
  });

  it('returns one ground-truth entry per burst with resolved pan', () => {
    const bursts: BurstSpec[] = [
      { kind: 'tone', start: 0, end: 0.5, gain: 0.4, freq: 220, pan: -0.8 },
      { kind: 'noise', start: 1, end: 1.5, gain: 0.6, pan: [-1, 1] },
    ];
    const { truth } = synthesize(bursts, { sampleRate: 16000 });
    expect(truth).toHaveLength(2);
    expect(truth[0]).toMatchObject({ kind: 'tone', panStart: -0.8, panEnd: -0.8, travelling: false, freq: 220 });
    expect(truth[1]).toMatchObject({ kind: 'noise', panStart: -1, panEnd: 1, travelling: true, freq: null });
  });

  it('is deterministic for a fixed seed and differs across seeds', () => {
    const spec: BurstSpec = { kind: 'noise', start: 0, end: 0.5, gain: 0.5 };
    const a = synthesize([spec], { sampleRate: 8000, seed: 1 }).pcm.left;
    const b = synthesize([spec], { sampleRate: 8000, seed: 1 }).pcm.left;
    const c = synthesize([spec], { sampleRate: 8000, seed: 2 }).pcm.left;
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('rejects a burst whose end is not after its start', () => {
    expect(() => synthesize([{ kind: 'tone', start: 0.5, end: 0.5, gain: 0.5, freq: 440 }])).toThrow();
  });

  it('a centred burst has balance near zero', () => {
    const sr = 16000;
    const { pcm } = synthesize([{ kind: 'tone', start: 0, end: 1, gain: 0.5, freq: 1000, pan: 0 }], {
      sampleRate: sr,
      duration: 1,
    });
    expect(Math.abs(balance(pcm, 0, sr))).toBeLessThan(0.02);
  });

  it('a hard-left burst has strongly negative balance, hard-right strongly positive', () => {
    const sr = 16000;
    const left = synthesize([{ kind: 'tone', start: 0, end: 1, gain: 0.5, freq: 1000, pan: -1 }], {
      sampleRate: sr,
      duration: 1,
    }).pcm;
    const right = synthesize([{ kind: 'tone', start: 0, end: 1, gain: 0.5, freq: 1000, pan: 1 }], {
      sampleRate: sr,
      duration: 1,
    }).pcm;
    expect(balance(left, 0, sr)).toBeLessThan(-0.95);
    expect(balance(right, 0, sr)).toBeGreaterThan(0.95);
  });

  it('a travelling pan moves balance from negative at the start to positive at the end', () => {
    const sr = 16000;
    const { pcm } = synthesize([{ kind: 'noise', start: 0, end: 1, gain: 0.5, pan: [-1, 1] }], {
      sampleRate: sr,
      duration: 1,
      seed: 7,
    });
    const firstQuarter = balance(pcm, 0, Math.round(sr * 0.25));
    const lastQuarter = balance(pcm, Math.round(sr * 0.75), sr);
    expect(firstQuarter).toBeLessThan(-0.5);
    expect(lastQuarter).toBeGreaterThan(0.5);
  });

  it('property: the sign of balance matches the sign of a static pan for |pan| >= 0.6', () => {
    const sr = 16000;
    fc.assert(
      fc.property(
        fc.integer({ min: 6, max: 10 }), // |pan| in 0.6..1.0, in tenths
        fc.boolean(), // sign
        (mag, positive) => {
          const pan = (positive ? 1 : -1) * (mag / 10);
          const { pcm } = synthesize(
            [{ kind: 'tone', start: 0, end: 0.5, gain: 0.5, freq: 800, pan }],
            { sampleRate: sr, duration: 0.5 },
          );
          const b = balance(pcm, 0, Math.round(sr * 0.5));
          return positive ? b > 0 : b < 0;
        },
      ),
    );
  });

  it('property: higher gain yields more in-burst energy at the same pan', () => {
    const sr = 16000;
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 0.4, noNaN: true }),
        fc.double({ min: 0.5, max: 0.9, noNaN: true }),
        (lowGain, highGain) => {
          const mk = (g: number) =>
            synthesize([{ kind: 'tone', start: 0, end: 0.5, gain: g, freq: 500, pan: 0 }], {
              sampleRate: sr,
              duration: 0.5,
            }).pcm;
          const lo = mk(lowGain);
          const hi = mk(highGain);
          const span = Math.round(sr * 0.5);
          const eLo = energy(lo.left, 0, span) + energy(lo.right, 0, span);
          const eHi = energy(hi.left, 0, span) + energy(hi.right, 0, span);
          return eHi > eLo;
        },
      ),
    );
  });
});
