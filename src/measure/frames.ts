// Pure per-frame DSP measurement (task 4.1).
//
// Given decoded stereo audio, we cut it into short overlapping frames
// (~46 ms at 2048 samples / 1024 hop on 44.1 kHz, design.md) and measure,
// per frame: band-limited energy, left/right energy balance, spectral flux
// (onset strength), and low-frequency energy share. These feed `buildEvents`
// (task 5): energy → loudness, balance → side, flux → onsets, lowShare →
// ominousness.
//
// Everything here is a pure function over typed arrays (NFR-5). The full-clip
// runner is chunked so no single task blocks the page for long (Req 2.6).

import type { Frame, StereoPcm } from '../shared/types.ts';
import { magnitudeSpectrum } from './fft.ts';

/** Tuning for {@link frames}, with the reason behind each default. */
export interface FrameOptions {
  /**
   * Samples per analysis frame; must be a power of two for the FFT. 2048 is
   * ~46 ms at 44.1 kHz, the "short frame" of Req 2.4 and design.md.
   */
  frameSize: number;
  /**
   * Samples advanced between frames. 1024 (half the frame) gives 50% overlap,
   * enough time resolution for onsets without doubling the work.
   */
  hop: number;
  /** Low edge of the measured band in Hz. Below this is rumble/DC (design.md: 200). */
  bandLowHz: number;
  /** High edge of the measured band in Hz (design.md: 8000, YAMNet's range). */
  bandHighHz: number;
  /** Cutoff for `lowShare`: energy below this over total (design.md: 250 Hz). */
  lowCutHz: number;
}

/**
 * Default frame tuning from design.md. These are measurement constants, not
 * event-level thresholds, so they live here next to the code that uses them
 * rather than in ghost.config.ts (which holds the event/overlay knobs).
 */
export const defaultFrameOptions: FrameOptions = {
  frameSize: 2048,
  hop: 1024,
  bandLowHz: 200,
  bandHighHz: 8000,
  lowCutHz: 250,
};

/** Band energy of a magnitude spectrum over [loBin, hiBin] (inclusive). */
function bandEnergy(mag: Float64Array, loBin: number, hiBin: number): number {
  let e = 0;
  const hi = Math.min(hiBin, mag.length - 1);
  for (let k = Math.max(0, loBin); k <= hi; k++) {
    const m = mag[k]!;
    e += m * m;
  }
  return e;
}

/** Clamp a frequency (Hz) to the nearest FFT bin index for this frame/rate. */
function hzToBin(hz: number, frameSize: number, sampleRate: number): number {
  return Math.round((hz * frameSize) / sampleRate);
}

/**
 * Measure a window of one channel into a magnitude spectrum. A Hann window is
 * applied first to reduce spectral leakage so band energy and flux are not
 * dominated by the rectangular-window edges.
 */
function framedSpectrum(ch: Float32Array, start: number, frameSize: number): Float64Array {
  const buf = new Float32Array(frameSize);
  const n = ch.length;
  for (let i = 0; i < frameSize; i++) {
    const idx = start + i;
    const s = idx < n ? ch[idx]! : 0;
    // Hann window.
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (frameSize - 1));
    buf[i] = s * w;
  }
  return magnitudeSpectrum(buf);
}

/**
 * Cut `pcm` into frames and measure each one. Pure: depends only on its
 * inputs and returns a fresh array.
 *
 * - `energy`  — summed band energy (L + R) over 200–8000 Hz.
 * - `balance` — `(R − L) / (R + L)` on band energy, in −1..1; 0 when silent.
 * - `flux`    — half-wave-rectified spectral flux of the mono (L+R) magnitude
 *               against the previous frame; 0 for the first frame.
 * - `lowShare`— energy below `lowCutHz` over total band energy, 0..1.
 */
export function frames(pcm: StereoPcm, options: FrameOptions = defaultFrameOptions): Frame[] {
  const { frameSize, hop, bandLowHz, bandHighHz, lowCutHz } = options;
  if (hop <= 0) throw new Error(`hop must be positive, got ${hop}`);
  const { left, right, sampleRate } = pcm;
  const n = Math.min(left.length, right.length);

  const loBin = hzToBin(bandLowHz, frameSize, sampleRate);
  const hiBin = hzToBin(bandHighHz, frameSize, sampleRate);
  const lowBin = hzToBin(lowCutHz, frameSize, sampleRate);

  const out: Frame[] = [];
  // Previous frame's in-band mono magnitudes, for spectral flux.
  let prevMag: Float64Array | null = null;

  // Advance while any part of the frame has real samples.
  for (let start = 0; start < n; start += hop) {
    const magL = framedSpectrum(left, start, frameSize);
    const magR = framedSpectrum(right, start, frameSize);

    const eL = bandEnergy(magL, loBin, hiBin);
    const eR = bandEnergy(magR, loBin, hiBin);
    const total = eL + eR;
    const balance = total > 0 ? (eR - eL) / total : 0;

    // Mono magnitude for flux and lowShare.
    const hiClamped = Math.min(hiBin, magL.length - 1);
    const monoMag = new Float64Array(hiClamped + 1);
    let lowE = 0;
    let bandE = 0;
    for (let k = 0; k <= hiClamped; k++) {
      const m = magL[k]! + magR[k]!;
      monoMag[k] = m;
      if (k >= loBin) {
        const p = m * m;
        bandE += p;
        if (k < lowBin) lowE += p;
      }
    }
    const lowShare = bandE > 0 ? lowE / bandE : 0;

    // Spectral flux: sum of positive magnitude increases vs the previous frame.
    let flux = 0;
    if (prevMag) {
      const lim = Math.min(monoMag.length, prevMag.length);
      for (let k = Math.max(0, loBin); k < lim; k++) {
        const d = monoMag[k]! - prevMag[k]!;
        if (d > 0) flux += d;
      }
    }
    prevMag = monoMag;

    out.push({
      t: start / sampleRate,
      energy: total,
      balance,
      flux,
      lowShare,
    });
  }

  return out;
}

/**
 * Chunked, yielding version of {@link frames} for the whole clip (Req 2.6).
 *
 * The overlay must stay responsive while a long clip is measured, so we run
 * the frame loop in slices and `await` a macrotask between slices, letting the
 * browser paint and handle input. The maths is identical to {@link frames};
 * only the scheduling differs. Pass `onProgress` to drive a progress bar.
 */
export async function framesChunked(
  pcm: StereoPcm,
  options: FrameOptions = defaultFrameOptions,
  runner: {
    /** Frames computed per slice before yielding. */
    sliceFrames?: number;
    /** Yields to the event loop; defaults to a macrotask. */
    yieldToEventLoop?: () => Promise<void>;
    onProgress?: (fraction: number) => void;
  } = {},
): Promise<Frame[]> {
  const { frameSize, hop, bandLowHz, bandHighHz, lowCutHz } = options;
  if (hop <= 0) throw new Error(`hop must be positive, got ${hop}`);
  const sliceFrames = runner.sliceFrames ?? 64;
  const yieldToEventLoop =
    runner.yieldToEventLoop ?? (() => new Promise<void>((r) => setTimeout(r, 0)));

  const { left, right, sampleRate } = pcm;
  const n = Math.min(left.length, right.length);
  const loBin = hzToBin(bandLowHz, frameSize, sampleRate);
  const hiBin = hzToBin(bandHighHz, frameSize, sampleRate);
  const lowBin = hzToBin(lowCutHz, frameSize, sampleRate);

  const starts: number[] = [];
  for (let start = 0; start < n; start += hop) starts.push(start);

  const out: Frame[] = [];
  let prevMag: Float64Array | null = null;

  for (let s = 0; s < starts.length; s++) {
    const start = starts[s]!;
    const magL = framedSpectrum(left, start, frameSize);
    const magR = framedSpectrum(right, start, frameSize);

    const eL = bandEnergy(magL, loBin, hiBin);
    const eR = bandEnergy(magR, loBin, hiBin);
    const total = eL + eR;
    const balance = total > 0 ? (eR - eL) / total : 0;

    const hiClamped = Math.min(hiBin, magL.length - 1);
    const monoMag = new Float64Array(hiClamped + 1);
    let lowE = 0;
    let bandE = 0;
    for (let k = 0; k <= hiClamped; k++) {
      const m = magL[k]! + magR[k]!;
      monoMag[k] = m;
      if (k >= loBin) {
        const p = m * m;
        bandE += p;
        if (k < lowBin) lowE += p;
      }
    }
    const lowShare = bandE > 0 ? lowE / bandE : 0;

    let flux = 0;
    if (prevMag) {
      const lim = Math.min(monoMag.length, prevMag.length);
      for (let k = Math.max(0, loBin); k < lim; k++) {
        const d = monoMag[k]! - prevMag[k]!;
        if (d > 0) flux += d;
      }
    }
    prevMag = monoMag;

    out.push({ t: start / sampleRate, energy: total, balance, flux, lowShare });

    if ((s + 1) % sliceFrames === 0) {
      runner.onProgress?.((s + 1) / starts.length);
      await yieldToEventLoop();
    }
  }
  runner.onProgress?.(1);

  return out;
}

/** Linear-interpolated percentile `p` (0..1) of `values`. Pure helper. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const clampedP = Math.max(0, Math.min(1, p));
  const idx = clampedP * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/**
 * Loudness reference for a clip: the sorted frame energies, used by
 * `buildEvents` to turn an event's energy into a 0..1 percentile rank
 * (Req 5.1). Returned sorted ascending.
 */
export function clipLoudness(framesList: Frame[]): number[] {
  return framesList.map((f) => f.energy).sort((a, b) => a - b);
}
