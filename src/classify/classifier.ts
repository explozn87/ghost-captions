// The on-device sound classifier interface (design.md "src/classify/").
//
// The pipeline depends only on this interface, never on a concrete classifier,
// so the real MediaPipe + YAMNet adapter (task 10) and the deterministic fake
// used by tests (below, task 9) are interchangeable. This is the NFR-5 seam:
// "the classifier sits behind an interface with a fake for tests".
//
// `classify` takes mono audio resampled to 16 kHz (what YAMNet expects) and
// returns the per-window top categories and scores (~0.975 s windows,
// Requirement 2.3). A failure to load the model is surfaced by the caller as
// labels-unavailable (Requirement 2.5); implementations may throw and the
// pipeline turns that into an unknown-only track.

import type { ClassWindow } from '../shared/types.ts';

/** An on-device classifier from mono 16 kHz audio to labelled windows. */
export interface Classifier {
  /**
   * Classify mono audio at 16 kHz into ~1 s windows with top categories.
   * May reject if the model cannot run; the caller then falls back to an
   * unknown-only, labels-unavailable track (Req 2.5).
   */
  classify(mono16k: Float32Array, sampleRate: 16000): Promise<ClassWindow[]>;
}
