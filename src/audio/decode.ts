// Real browser audio decoding (task 10.1, design.md "src/audio/decode.ts").
//
// `decodeFile` turns the File (or ArrayBuffer) the user opened into
// `StereoPcm` at the file's native sample rate, using Web Audio's
// `decodeAudioData`. The native rate is kept because the measurement side
// (src/measure) wants full-resolution stereo for direction and loudness;
// `toMono16k` separately resamples to the 16 kHz mono the classifier expects
// (design.md: "Keeps native sample rate for measurement").
//
// Two honesty behaviours live here, both required:
//   - mono notice (Req 2.2): a one-channel source sets `mono: true` and copies
//     the single channel into both `left` and `right`, so every event's side
//     becomes unknown and the UI shows the mono notice once.
//   - decode error (Req 1.2): any failure to decode throws `DecodeError`
//     carrying the file name, which the UI turns into a clear message naming
//     the file and suggesting a common format.
//
// This module is browser-only (it needs Web Audio). It is deliberately not
// imported by the pure-module tests; the app shell injects it as the default
// decoder (task 10.3) and tests inject synthetic PCM instead (NFR-5).

import type { StereoPcm } from '../shared/types.ts';

/** The sample rate YAMNet expects; {@link toMono16k} resamples to this. */
export const CLASSIFIER_SAMPLE_RATE = 16000 as const;

/**
 * Thrown when the browser cannot decode the chosen file (Req 1.2). Carries the
 * file name so the UI can name it; `cause` keeps the underlying error for logs.
 */
export class DecodeError extends Error {
  /** The name of the file that failed to decode. */
  readonly fileName: string;

  constructor(fileName: string, cause?: unknown) {
    super(`Could not decode "${fileName}".`);
    this.name = 'DecodeError';
    this.fileName = fileName;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

/** The minimal Web Audio surface we use, found on window or webkit-prefixed. */
interface AudioContextCtor {
  new (): {
    decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
    close(): Promise<void>;
  };
}

/** Find an AudioContext constructor, defensively for odd/old browsers. */
function findAudioContext(): AudioContextCtor {
  const g = globalThis as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) {
    throw new Error('Web Audio is unavailable in this browser.');
  }
  return Ctor;
}

/** The OfflineAudioContext constructor, for high-quality resampling. */
interface OfflineAudioContextCtor {
  new (channels: number, length: number, sampleRate: number): {
    createBufferSource(): {
      buffer: AudioBuffer | null;
      connect(destination: unknown): void;
      start(): void;
    };
    readonly destination: unknown;
    createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
    startRendering(): Promise<AudioBuffer>;
  };
}

/** Find an OfflineAudioContext constructor, or null when unavailable. */
function findOfflineAudioContext(): OfflineAudioContextCtor | null {
  const g = globalThis as {
    OfflineAudioContext?: OfflineAudioContextCtor;
    webkitOfflineAudioContext?: OfflineAudioContextCtor;
  };
  return g.OfflineAudioContext ?? g.webkitOfflineAudioContext ?? null;
}

/**
 * Decode a File or ArrayBuffer into {@link StereoPcm} at the native rate.
 *
 * - Stereo sources keep both channels for direction measurement.
 * - Mono sources set `mono: true` and duplicate the single channel into both
 *   `left` and `right`, so downstream code treats every side as unknown and
 *   the UI shows the mono notice once (Req 2.2).
 * - Any decode failure throws {@link DecodeError} naming the file (Req 1.2).
 *
 * The data never leaves the device: decoding is a local Web Audio call, no
 * network request carries the media (Req 1.5).
 */
export async function decodeFile(input: File | ArrayBuffer): Promise<StereoPcm> {
  const fileName = input instanceof File ? input.name : 'audio';
  const buffer = input instanceof File ? await input.arrayBuffer() : input;

  const Ctor = findAudioContext();
  const ctx = new Ctor();
  try {
    let audio: AudioBuffer;
    try {
      // Some browsers reject the promise, others return undefined on failure.
      audio = await ctx.decodeAudioData(buffer);
    } catch (err) {
      throw new DecodeError(fileName, err);
    }
    if (!audio) {
      throw new DecodeError(fileName);
    }

    const mono = audio.numberOfChannels < 2;
    const left = new Float32Array(audio.getChannelData(0));
    const right = mono ? left : new Float32Array(audio.getChannelData(1));

    return {
      sampleRate: audio.sampleRate,
      left,
      right,
      mono,
      duration: audio.duration,
    };
  } finally {
    void ctx.close();
  }
}

/**
 * Downmix to mono and resample to 16 kHz for the classifier (Req 2.3).
 *
 * Prefers an OfflineAudioContext for its higher-quality resampler; when that
 * is unavailable (or the clip is empty), falls back to a plain linear
 * downmix+resample, which is faithful enough for YAMNet and keeps the function
 * usable everywhere. The result is a single Float32Array at 16 kHz.
 */
export async function toMono16k(pcm: StereoPcm): Promise<Float32Array> {
  const srcLen = Math.min(pcm.left.length, pcm.right.length);
  if (srcLen === 0) return new Float32Array(0);

  const Offline = findOfflineAudioContext();
  if (Offline) {
    try {
      return await resampleViaOffline(pcm, srcLen, Offline);
    } catch {
      // Fall through to the linear path if offline rendering fails.
    }
  }
  return linearMono16k(pcm, srcLen);
}

/** Resample+downmix with an OfflineAudioContext (higher quality). */
async function resampleViaOffline(
  pcm: StereoPcm,
  srcLen: number,
  Offline: OfflineAudioContextCtor,
): Promise<Float32Array> {
  const outLen = Math.max(
    1,
    Math.round((srcLen / pcm.sampleRate) * CLASSIFIER_SAMPLE_RATE),
  );
  const offline = new Offline(1, outLen, CLASSIFIER_SAMPLE_RATE);

  // Build a source buffer at the native rate holding the mono mix.
  const srcBuffer = offline.createBuffer(1, srcLen, pcm.sampleRate);
  const mix = srcBuffer.getChannelData(0);
  for (let i = 0; i < srcLen; i++) {
    mix[i] = ((pcm.left[i] ?? 0) + (pcm.right[i] ?? 0)) * 0.5;
  }

  const source = offline.createBufferSource();
  source.buffer = srcBuffer;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  return new Float32Array(rendered.getChannelData(0));
}

/** Plain linear downmix+resample to 16 kHz, browser-free fallback. */
function linearMono16k(pcm: StereoPcm, srcLen: number): Float32Array {
  const outLen = Math.max(
    1,
    Math.round((srcLen / pcm.sampleRate) * CLASSIFIER_SAMPLE_RATE),
  );
  const out = new Float32Array(outLen);
  const ratio = srcLen > 1 ? (srcLen - 1) / Math.max(1, outLen - 1) : 0;

  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(srcLen - 1, i0 + 1);
    const frac = srcPos - i0;
    const s0 = ((pcm.left[i0] ?? 0) + (pcm.right[i0] ?? 0)) * 0.5;
    const s1 = ((pcm.left[i1] ?? 0) + (pcm.right[i1] ?? 0)) * 0.5;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}
