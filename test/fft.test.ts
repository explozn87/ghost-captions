import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { fftInPlace, isPowerOfTwo, magnitudeSpectrum } from '../src/measure/fft.ts';

// Task 4.1 support: the frame measurement depends on the FFT being correct, so
// pin it against a naive DFT and against known single-tone inputs before any
// higher-level test trusts band energy / lowShare.

/** Naive O(n^2) DFT magnitude spectrum, for cross-checking the FFT. */
function naiveMagnitude(signal: Float32Array): number[] {
  const n = signal.length;
  const half = n >> 1;
  const out: number[] = [];
  for (let k = 0; k <= half; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const ang = (-2 * Math.PI * k * i) / n;
      re += signal[i]! * Math.cos(ang);
      im += signal[i]! * Math.sin(ang);
    }
    out.push(Math.hypot(re, im));
  }
  return out;
}

describe('fft (task 4.1)', () => {
  it('recognises powers of two', () => {
    expect(isPowerOfTwo(1)).toBe(true);
    expect(isPowerOfTwo(2)).toBe(true);
    expect(isPowerOfTwo(2048)).toBe(true);
    expect(isPowerOfTwo(3)).toBe(false);
    expect(isPowerOfTwo(0)).toBe(false);
    expect(isPowerOfTwo(1000)).toBe(false);
  });

  it('rejects non-power-of-two lengths', () => {
    expect(() => magnitudeSpectrum(new Float32Array(3))).toThrow();
    expect(() => fftInPlace(new Float64Array(3), new Float64Array(3))).toThrow();
  });

  it('rejects mismatched re/im lengths', () => {
    expect(() => fftInPlace(new Float64Array(4), new Float64Array(8))).toThrow();
  });

  it('a single-bin cosine concentrates energy in that bin', () => {
    const n = 64;
    const bin = 8;
    const sig = new Float32Array(n);
    for (let i = 0; i < n; i++) sig[i] = Math.cos((2 * Math.PI * bin * i) / n);
    const mag = magnitudeSpectrum(sig);
    const peak = mag.indexOf(Math.max(...Array.from(mag)));
    expect(peak).toBe(bin);
  });

  it('matches a naive DFT on random signals', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 16, maxLength: 16 }),
        (arr) => {
          const sig = Float32Array.from(arr);
          const fast = Array.from(magnitudeSpectrum(sig));
          const slow = naiveMagnitude(sig);
          for (let k = 0; k < fast.length; k++) {
            expect(fast[k]!).toBeCloseTo(slow[k]!, 4);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
