// Synthetic stereo PCM generator for tests (task 3.1).
//
// Every analysis step downstream of decode/classify is a pure function over
// typed arrays (NFR-5), so to test direction, loudness ranking, onset
// detection and event merging we need stereo audio whose ground truth we know
// exactly (NFR-7). This module builds such audio from a list of bursts and
// returns both the {@link StereoPcm} and the ground truth that generated it.
//
// It lives in test/ (not src/) because it is only ever used by tests; keeping
// it out of src/ keeps the app's type/footprint surface honest.

import type { StereoPcm } from '../src/shared/types.ts';

/** One sound burst to place into the generated audio. */
export interface BurstSpec {
  /** Waveform: a pure sine `tone` at {@link freq}, or broadband white `noise`. */
  kind: 'tone' | 'noise';
  /** Burst start in seconds. */
  start: number;
  /** Burst end in seconds (exclusive). Must be > start. */
  end: number;
  /** Linear amplitude 0..1 before panning. Louder bursts rank higher (P4). */
  gain: number;
  /**
   * Stereo pan, -1 (hard left) .. +1 (hard right). For a travelling sound give
   * `[from, to]` and the pan sweeps linearly from `from` at {@link start} to
   * `to` at {@link end}. Default 0 (centred).
   */
  pan?: number | [number, number];
  /** Tone frequency in Hz. Required for `kind: 'tone'`, ignored for noise. */
  freq?: number;
}

/** What the generator actually wrote, so a test can assert against truth. */
export interface BurstTruth {
  kind: 'tone' | 'noise';
  start: number;
  end: number;
  gain: number;
  /** Pan at the burst's start (equals end when not travelling). */
  panStart: number;
  /** Pan at the burst's end. */
  panEnd: number;
  /** True when panStart !== panEnd (a travelling sound). */
  travelling: boolean;
  freq: number | null;
}

/** The generated audio together with the ground truth that produced it. */
export interface SynthResult {
  pcm: StereoPcm;
  truth: BurstTruth[];
}

/** Options for {@link synthesize}. */
export interface SynthOptions {
  sampleRate?: number;
  /** Total duration in seconds. Defaults to just past the last burst end. */
  duration?: number;
  /**
   * Seed for the noise generator so results are deterministic (property tests
   * must be reproducible). Defaults to a fixed seed.
   */
  seed?: number;
}

/**
 * Equal-power stereo pan gains for a pan in -1..1. At pan 0 both channels get
 * ~0.707 (−3 dB), so a centred burst has balance 0; at the extremes one
 * channel is silent, giving balance ±1. This matches how `measure` computes
 * `balance = (R − L) / (R + L)` on energy.
 */
function panGains(pan: number): { l: number; r: number } {
  const p = Math.max(-1, Math.min(1, pan));
  // Map -1..1 to the 0..π/2 pan law angle.
  const angle = ((p + 1) / 2) * (Math.PI / 2);
  return { l: Math.cos(angle), r: Math.sin(angle) };
}

/** A tiny deterministic PRNG (mulberry32) so noise bursts are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build stereo PCM from a list of bursts and return it with ground truth.
 *
 * Bursts are summed, so overlapping bursts add (as real sounds do); keep them
 * separated in time when a test needs clean per-event truth. Samples are not
 * clipped — keep `gain` and overlap within 1.0 to stay in range.
 */
export function synthesize(bursts: BurstSpec[], options: SynthOptions = {}): SynthResult {
  const sampleRate = options.sampleRate ?? 16000;
  const lastEnd = bursts.reduce((m, b) => Math.max(m, b.end), 0);
  const duration = options.duration ?? lastEnd + 0.1;
  const n = Math.max(1, Math.round(duration * sampleRate));

  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const rand = mulberry32(options.seed ?? 0x9e3779b9);

  const truth: BurstTruth[] = [];

  for (const b of bursts) {
    if (b.end <= b.start) {
      throw new Error(`burst end (${b.end}) must be greater than start (${b.start})`);
    }
    const [panStart, panEnd]: [number, number] = Array.isArray(b.pan)
      ? b.pan
      : [b.pan ?? 0, b.pan ?? 0];
    const travelling = panStart !== panEnd;
    const freq = b.kind === 'tone' ? b.freq ?? 440 : null;

    const i0 = Math.max(0, Math.round(b.start * sampleRate));
    const i1 = Math.min(n, Math.round(b.end * sampleRate));
    const span = Math.max(1, i1 - i0);

    for (let i = i0; i < i1; i++) {
      const t = i / sampleRate;
      const sample =
        b.kind === 'tone'
          ? Math.sin(2 * Math.PI * (freq as number) * t)
          : rand() * 2 - 1; // white noise in -1..1
      const s = sample * b.gain;

      // Linear pan sweep across the burst for travelling sounds.
      const frac = (i - i0) / span;
      const pan = panStart + (panEnd - panStart) * frac;
      const g = panGains(pan);
      left[i] = (left[i] ?? 0) + s * g.l;
      right[i] = (right[i] ?? 0) + s * g.r;
    }

    truth.push({
      kind: b.kind,
      start: b.start,
      end: b.end,
      gain: b.gain,
      panStart,
      panEnd,
      travelling,
      freq,
    });
  }

  const pcm: StereoPcm = {
    sampleRate,
    left,
    right,
    mono: false,
    duration,
  };
  return { pcm, truth };
}
