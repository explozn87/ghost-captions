// A deterministic fake classifier (task 9, design.md "src/classify/").
//
// The real MediaPipe + YAMNet adapter is task 10; until then — and forever in
// tests — the app shell runs against this fake so the whole intake → analysing
// → watch pipeline and the component test have a classifier that needs no
// model download and gives the same answer every run (NFR-5, NFR-7).
//
// It does NOT look at the audio. It simply emits one ~0.975 s window per step
// across the clip's duration and labels each window from a supplied script
// (category name + score) or, with no script, as low-confidence windows that
// fall below the label threshold (so they become `unknown`). A test that wants
// footsteps on the left at 2 s hands a script saying so; the measurement side
// of the pipeline reads the real synthetic audio for direction/loudness.

import type { ClassWindow } from '../shared/types.ts';
import type { Classifier } from './classifier.ts';

/** The nominal YAMNet window length in seconds (design.md). */
export const WINDOW_LENGTH = 0.975;
/** The step between window starts; YAMNet hops roughly one window. */
const WINDOW_STEP = 0.975;

/** One entry of a fake script: a category to emit over a time range. */
export interface FakeLabel {
  /** YAMNet display name, e.g. 'Walk, footsteps' (mapped by familyMap). */
  name: string;
  /** Classifier score 0..1. */
  score: number;
  /** Start of the range this label covers, in seconds. */
  from: number;
  /** End of the range this label covers, in seconds. */
  to: number;
}

/** Options for {@link makeFakeClassifier}. */
export interface FakeOptions {
  /**
   * Labels to emit. For each window, every script entry whose [from,to)
   * overlaps the window centre is included as a category. Windows with no
   * matching entry get a single sub-threshold 'Silence' category so they map
   * to `unknown`, exactly as a real quiet stretch would.
   */
  script?: FakeLabel[];
  /** Window length override (seconds); defaults to the YAMNet nominal. */
  windowLength?: number;
}

/**
 * Build a {@link Classifier} that emits deterministic windows from a script.
 *
 * The clip duration is taken from the audio length (`mono16k.length /
 * sampleRate`), so windows cover exactly the clip the measurement side also
 * sees, keeping classifier windows and measurement frames aligned in time.
 */
export function makeFakeClassifier(options: FakeOptions = {}): Classifier {
  const script = options.script ?? [];
  const windowLength = options.windowLength ?? WINDOW_LENGTH;

  return {
    async classify(mono16k: Float32Array, sampleRate: 16000): Promise<ClassWindow[]> {
      const duration = mono16k.length / sampleRate;
      const windows: ClassWindow[] = [];

      for (let start = 0; start < Math.max(duration, windowLength); start += WINDOW_STEP) {
        const end = start + windowLength;
        const centre = (start + end) / 2;
        const categories = script
          .filter((l) => centre >= l.from && centre < l.to)
          .map((l) => ({ name: l.name, score: l.score }));

        windows.push({
          start,
          end,
          categories:
            categories.length > 0 ? categories : [{ name: 'Silence', score: 0.05 }],
        });
      }

      return windows;
    },
  };
}

/**
 * A classifier whose model always fails to load, for exercising the
 * labels-unavailable path (Req 2.5) in the shell and in tests.
 */
export function makeFailingClassifier(): Classifier {
  return {
    async classify(): Promise<ClassWindow[]> {
      throw new Error('model failed to load');
    },
  };
}
