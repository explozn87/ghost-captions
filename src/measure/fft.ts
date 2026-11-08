// A small in-place radix-2 Cooley–Tukey FFT (task 4.1).
//
// `measure` needs a magnitude spectrum per frame to compute band energy and
// low-frequency share. We keep our own tiny FFT rather than add a dependency:
// frame sizes are powers of two (2048 by default, design.md), the pipeline is
// a pure function over typed arrays (NFR-5), and a self-contained transform is
// trivially testable against a known DFT.
//
// The transform is real-input: callers pass a real signal and we return the
// magnitude of each of the first N/2 + 1 bins (the rest are mirror images for
// real input, so they carry no new information).

/** True when `n` is a power of two and at least 1. */
export function isPowerOfTwo(n: number): boolean {
  return n >= 1 && (n & (n - 1)) === 0;
}

/**
 * In-place complex FFT on paired real/imaginary arrays of length `n`
 * (a power of two). Decimation-in-time with a bit-reversal permutation; this
 * is the classic radix-2 algorithm. Arrays are mutated in place.
 */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length) {
    throw new Error('re and im must have the same length');
  }
  if (!isPowerOfTwo(n)) {
    throw new Error(`FFT length must be a power of two, got ${n}`);
  }
  if (n === 1) return;

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  // Butterflies over successively larger halves.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const aRe = re[i + k]!;
        const aIm = im[i + k]!;
        const bRe = re[i + k + half]!;
        const bIm = im[i + k + half]!;
        // t = cur * b
        const tRe = curRe * bRe - curIm * bIm;
        const tIm = curRe * bIm + curIm * bRe;
        re[i + k] = aRe + tRe;
        im[i + k] = aIm + tIm;
        re[i + k + half] = aRe - tRe;
        im[i + k + half] = aIm - tIm;
        // cur *= w
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Magnitude spectrum of a real signal. Returns the magnitudes of bins
 * `0 .. n/2` (length `n/2 + 1`), where bin `k` corresponds to frequency
 * `k * sampleRate / n`. `signal.length` must be a power of two.
 */
export function magnitudeSpectrum(signal: Float32Array): Float64Array {
  const n = signal.length;
  if (!isPowerOfTwo(n)) {
    throw new Error(`signal length must be a power of two, got ${n}`);
  }
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = signal[i]!;
  fftInPlace(re, im);
  const half = n >> 1;
  const mag = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) {
    mag[k] = Math.hypot(re[k]!, im[k]!);
  }
  return mag;
}
