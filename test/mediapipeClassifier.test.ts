// Tests for the MediaPipe + YAMNet classifier adapter (task 10.2).
//
// The real `@mediapipe/tasks-audio` runtime and the self-hosted model only
// exist in the browser at run time, not in the test environment. The package
// is a real (optional) dependency as of task 10, so we cannot rely on its mere
// absence to exercise the failure path. What the spec requires and we pin here
// is the *contract* around loading, by injecting a loader that fails the way a
// missing/broken runtime would:
//   - constructing the adapter is lazy and cheap: it must not try to load the
//     model, so merely calling the factory never throws;
//   - when the module/model cannot load, `classify` rejects. The pipeline
//     (`analyse`) catches that and produces an unknown-only, labels-unavailable
//     track (Req 2.5) — exercised through `analyse` below;
//   - `isClassifierAvailable()` reports false without throwing when the runtime
//     is absent.
//
// Injecting the loader keeps these assertions deterministic regardless of
// whether the optional package and its wasm assets happen to be installed.

import { describe, it, expect } from 'vitest';
import {
  makeMediapipeClassifier,
  isClassifierAvailable,
  WINDOW_LENGTH,
} from '../src/classify/mediapipeClassifier.ts';
import { analyse } from '../src/events/analyse.ts';
import type { StereoPcm } from '../src/shared/types.ts';

/** A loader that fails the way an absent/broken MediaPipe runtime would. */
const failingLoader = async (): Promise<never> => {
  throw new Error('MediaPipe runtime unavailable (test).');
};

function tinyPcm(): StereoPcm {
  const n = 16000; // 1 s at 16 kHz.
  const left = new Float32Array(n).fill(0.1);
  const right = new Float32Array(n).fill(0.1);
  return { sampleRate: 16000, left, right, mono: false, duration: 1 };
}

describe('mediapipeClassifier (task 10.2)', () => {
  it('uses the YAMNet nominal window length', () => {
    expect(WINDOW_LENGTH).toBeCloseTo(0.975, 6);
  });

  it('constructs lazily without attempting to load the model', () => {
    // No throw, no async work: the factory just returns a Classifier.
    expect(() => makeMediapipeClassifier()).not.toThrow();
    const c = makeMediapipeClassifier({ modelAssetPath: '/models/yamnet.tflite' });
    expect(typeof c.classify).toBe('function');
  });

  it('rejects classify when the runtime cannot load (routes to Req 2.5)', async () => {
    const c = makeMediapipeClassifier({ loadModule: failingLoader });
    await expect(c.classify(new Float32Array(16000), 16000)).rejects.toBeTruthy();
  });

  it('reports unavailable (not throwing) when the runtime is absent', async () => {
    await expect(isClassifierAvailable(failingLoader)).resolves.toBe(false);
  });

  it('a failing real classifier still yields an unknown-only track via analyse (Req 2.5)', async () => {
    const track = await analyse(tinyPcm(), makeMediapipeClassifier({ loadModule: failingLoader }), {
      yieldToEventLoop: async () => {},
    });
    expect(track.labelsAvailable).toBe(false);
    // Every event, if any, is the unknown family — never a guessed label.
    for (const ev of track.events) {
      expect(ev.family).toBe('unknown');
      expect(ev.topLabel).toBeNull();
    }
  });
});
