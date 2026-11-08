// The analysis pipeline orchestrator (task 9).
//
// `analyse(pcm, classifier, options)` runs the whole before-playback pipeline
// from design.md's Overview:
//
//   StereoPcm ─┬─ classify (Classifier)        → ClassWindow[]
//              └─ measure  (framesChunked)      → Frame[]
//              → buildEvents(windows, frames)   → EventTrack
//
// It owns two things the pure modules deliberately do not:
//   - turning the stereo clip into the mono 16 kHz the classifier wants
//     (`downmixToMono16k`, a plain resample so tests need no browser — the
//     real `toMono16k` using OfflineAudioContext arrives with decode in
//     task 10, but the classifier interface is the same);
//   - the labels-unavailable fallback (Req 2.5): if the classifier throws, we
//     still build events from the measurements alone, all `unknown`, and flag
//     `labelsAvailable: false` so the UI can say labels are unavailable.
//
// Measurement runs through `framesChunked` so a long clip never blocks the
// page (Req 2.6); progress is reported 0..1 for the progress indicator
// (Req 2.1).

import type { ClassWindow, EventTrack, StereoPcm } from '../shared/types.ts';
import type { Classifier } from '../classify/classifier.ts';
import { framesChunked, defaultFrameOptions } from '../measure/frames.ts';
import { buildEvents } from '../events/buildEvents.ts';
import { ghostConfig, type GhostConfig } from '../config/ghost.config.ts';

/** The sample rate YAMNet expects. */
export const CLASSIFIER_SAMPLE_RATE = 16000 as const;

/** Options for {@link analyse}. */
export interface AnalyseOptions {
  /** 0..1 progress callback for the measurement phase (Req 2.1). */
  onProgress?: (fraction: number) => void;
  /** Event-building config; defaults to the shared {@link ghostConfig}. */
  config?: GhostConfig;
  /** Yields to the event loop between measurement slices; overridable in tests. */
  yieldToEventLoop?: () => Promise<void>;
}

/**
 * Downmix stereo to mono and resample to 16 kHz with linear interpolation.
 *
 * Pure and browser-free so tests can call it directly; the real decode path
 * (task 10) uses an OfflineAudioContext for higher quality, but the classifier
 * only needs a faithful-enough mono 16 kHz signal and this keeps the pipeline
 * testable without a browser (NFR-5).
 */
export function downmixToMono16k(pcm: StereoPcm): Float32Array {
  const srcRate = pcm.sampleRate;
  const srcLen = Math.min(pcm.left.length, pcm.right.length);
  const outLen = Math.max(1, Math.round((srcLen / srcRate) * CLASSIFIER_SAMPLE_RATE));
  const out = new Float32Array(outLen);
  const ratio = srcLen > 1 ? (srcLen - 1) / Math.max(1, outLen - 1) : 0;

  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(srcLen - 1, i0 + 1);
    const frac = srcPos - i0;
    const l0 = pcm.left[i0] ?? 0;
    const r0 = pcm.right[i0] ?? 0;
    const l1 = pcm.left[i1] ?? 0;
    const r1 = pcm.right[i1] ?? 0;
    const s0 = (l0 + r0) * 0.5;
    const s1 = (l1 + r1) * 0.5;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

/**
 * Run the full analysis of a decoded clip into an {@link EventTrack}.
 *
 * Classification and measurement are independent, so they run concurrently;
 * if classification fails we keep going with an unknown-only track so the user
 * still gets ghosts from the measured signal (Req 2.5).
 */
export async function analyse(
  pcm: StereoPcm,
  classifier: Classifier,
  options: AnalyseOptions = {},
): Promise<EventTrack> {
  const cfg = options.config ?? ghostConfig;

  const mono = downmixToMono16k(pcm);

  // Classify (may fail → labels unavailable) and measure in parallel.
  const classifyPromise: Promise<{ windows: ClassWindow[]; labelsAvailable: boolean }> =
    classifier
      .classify(mono, CLASSIFIER_SAMPLE_RATE)
      .then((windows) => ({ windows, labelsAvailable: true }))
      .catch(() => ({ windows: [] as ClassWindow[], labelsAvailable: false }));

  const measurePromise = framesChunked(pcm, defaultFrameOptions, {
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.yieldToEventLoop ? { yieldToEventLoop: options.yieldToEventLoop } : {}),
  });

  const [{ windows, labelsAvailable }, frames] = await Promise.all([
    classifyPromise,
    measurePromise,
  ]);

  return buildEvents(windows, frames, {
    duration: pcm.duration,
    mono: pcm.mono,
    labelsAvailable,
    config: cfg,
  });
}
