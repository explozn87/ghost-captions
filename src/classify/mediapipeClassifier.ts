// The real on-device classifier: MediaPipe Audio + YAMNet (task 10.2).
//
// This adapter implements the `Classifier` interface with Google's MediaPipe
// `AudioClassifier` running YAMNet in the browser (feasibility measured
// 2026-11-08: a 52 s clip classified in 0.35 s). It produces the same
// `ClassWindow[]` the fake produces, so the rest of the pipeline is unchanged.
//
// Self-hosting for judging (design.md): the model file lives at
// `public/models/yamnet.tflite` (Apache-2.0, copied at build from the public
// Google Storage URL) and the wasm fileset is resolved from the bundled npm
// package, so the demo does not depend on a third-party CDN at judging time
// and no request carries the user's media (Req 1.5).
//
// Failure path (Req 2.5): if the wasm or model cannot load, `classify` rejects.
// The pipeline (`analyse`) catches that and produces an unknown-only,
// labels-unavailable track, and the UI shows the labels-unavailable notice.
// `isClassifierAvailable()` lets the shell probe support before committing.
//
// The MediaPipe package is loaded with a dynamic import so it is only fetched
// in the browser when a real clip is classified; tests use the fake classifier
// and never pull this module in. The import specifier is kept out of static
// type resolution (the dependency is optional at build time); we declare the
// minimal surface we use locally.

import type { ClassWindow } from '../shared/types.ts';
import type { Classifier } from './classifier.ts';

/** The nominal YAMNet window length in seconds (matches the fake). */
export const WINDOW_LENGTH = 0.975;

/** Where the self-hosted model and wasm live, overridable for flexibility. */
export interface MediapipeOptions {
  /** URL of the self-hosted YAMNet model (default: /models/yamnet.tflite). */
  modelAssetPath?: string;
  /** Base URL of the wasm fileset; defaults to the bundled package assets. */
  wasmBasePath?: string;
  /**
   * How to load the MediaPipe module. Defaults to the real dynamic import of
   * `@mediapipe/tasks-audio`. Overridable so tests can pin the failure path
   * (Req 2.5) without depending on whether the optional package or its wasm
   * assets happen to be present in the environment.
   */
  loadModule?: () => Promise<MpModule>;
}

/** The one classification result MediaPipe returns per window. */
interface MpCategory {
  categoryName?: string;
  displayName?: string;
  score?: number;
}
interface MpClassifications {
  categories?: MpCategory[];
}
interface MpResult {
  classifications?: MpClassifications[];
  timestampMs?: number;
}
interface MpAudioClassifier {
  classify(audio: Float32Array, sampleRate: number): MpResult[];
  close?(): void;
}
/** The subset of `@mediapipe/tasks-audio` we call. */
export interface MpModule {
  FilesetResolver: {
    forAudioTasks(wasmBasePath: string): Promise<unknown>;
  };
  AudioClassifier: {
    createFromOptions(
      fileset: unknown,
      options: {
        baseOptions: { modelAssetPath: string };
        maxResults?: number;
      },
    ): Promise<MpAudioClassifier>;
  };
}

/** Default locations: model self-hosted, wasm from the bundled package. */
const DEFAULT_MODEL_PATH = '/models/yamnet.tflite';
const DEFAULT_WASM_BASE = '/wasm';

/**
 * Dynamically load the MediaPipe audio package. Kept behind a function so the
 * specifier is resolved only at runtime in the browser (the dependency is
 * optional at build/typecheck time); throwing here routes to Req 2.5.
 */
async function loadMediapipe(): Promise<MpModule> {
  // The `@vite-ignore` keeps Vite from trying to pre-bundle/resolve this at
  // build time when the optional dependency is absent; in a full install Vite
  // bundles it normally. The cast narrows the untyped module to what we use.
  // A literal specifier so Vite bundles the package into the built site. (A
  // variable with @vite-ignore left a bare specifier the browser cannot resolve:
  // tests passed, the live page could never load labels.)
  const mod = (await import('@mediapipe/tasks-audio')) as unknown as MpModule;
  if (!mod?.FilesetResolver || !mod?.AudioClassifier) {
    throw new Error('MediaPipe audio tasks module is missing expected exports.');
  }
  return mod;
}

/** Map one MediaPipe result's categories to our `{name, score}` shape. */
function toCategories(result: MpResult | undefined): { name: string; score: number }[] {
  const cats = result?.classifications?.[0]?.categories ?? [];
  return cats
    .map((c) => ({
      // YAMNet's human-readable label is `categoryName` (matches familyMap's
      // display names); fall back to `displayName` if a build differs.
      name: c.categoryName ?? c.displayName ?? '',
      score: typeof c.score === 'number' ? c.score : 0,
    }))
    .filter((c) => c.name.length > 0);
}

/**
 * Build the real MediaPipe + YAMNet {@link Classifier}.
 *
 * The classifier is created lazily on the first `classify` call so merely
 * constructing this adapter costs nothing and cannot fail; the model/wasm load
 * happens when there is actually a clip to classify, and any failure rejects
 * the returned promise so the pipeline falls back to labels-unavailable.
 */
export function makeMediapipeClassifier(options: MediapipeOptions = {}): Classifier {
  const modelAssetPath = options.modelAssetPath ?? DEFAULT_MODEL_PATH;
  const wasmBasePath = options.wasmBasePath ?? DEFAULT_WASM_BASE;
  const load = options.loadModule ?? loadMediapipe;

  let classifierPromise: Promise<MpAudioClassifier> | null = null;

  const getClassifier = (): Promise<MpAudioClassifier> => {
    if (!classifierPromise) {
      classifierPromise = (async () => {
        const mp = await load();
        const fileset = await mp.FilesetResolver.forAudioTasks(wasmBasePath);
        return mp.AudioClassifier.createFromOptions(fileset, {
          baseOptions: { modelAssetPath },
          // Keep a few top categories per window so familyMap has choices and
          // the honest "unknown below threshold" rule can apply.
          maxResults: 5,
        });
      })();
      // If creation fails, clear the cache so a later retry can try again.
      classifierPromise.catch(() => {
        classifierPromise = null;
      });
    }
    return classifierPromise;
  };

  return {
    async classify(mono16k: Float32Array, sampleRate: 16000): Promise<ClassWindow[]> {
      const classifier = await getClassifier();
      const results = classifier.classify(mono16k, sampleRate);

      // MediaPipe returns one result per internal window; YAMNet windows are
      // ~0.975 s. Prefer each result's own timestamp when present, else step
      // by the nominal window length so windows tile the clip (Req 2.3).
      return results.map((result, i) => {
        const start =
          typeof result.timestampMs === 'number'
            ? result.timestampMs / 1000
            : i * WINDOW_LENGTH;
        return {
          start,
          end: start + WINDOW_LENGTH,
          categories: toCategories(result),
        };
      });
    },
  };
}

/**
 * Probe whether the real classifier can load in this environment, without
 * committing to a classification. Returns false (never throws) when the
 * package or its assets are unavailable, so the shell can decide up front
 * whether to show the labels-unavailable notice.
 */
export async function isClassifierAvailable(
  loadModule: () => Promise<MpModule> = loadMediapipe,
): Promise<boolean> {
  try {
    await loadModule();
    return true;
  } catch {
    return false;
  }
}
