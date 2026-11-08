// Tests for the real audio decode module (task 10.1).
//
// `decodeFile` and `toMono16k` need Web Audio, which jsdom does not provide, so
// these tests stub a minimal AudioContext / AudioBuffer on globalThis. That is
// enough to pin the behaviours the spec cares about without a real codec:
//   - a decode failure throws DecodeError naming the file (Req 1.2);
//   - a mono source sets `mono: true` and copies its one channel into both
//     left and right (Req 2.2);
//   - a stereo source keeps both channels at the native rate;
//   - toMono16k downmixes to one 16 kHz channel (linear fallback, since jsdom
//     has no OfflineAudioContext), with the expected length and values.

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  decodeFile,
  toMono16k,
  DecodeError,
  CLASSIFIER_SAMPLE_RATE,
} from '../src/audio/decode.ts';
import type { StereoPcm } from '../src/shared/types.ts';

/** A fake AudioBuffer holding given channel data at a given rate. */
function fakeAudioBuffer(channels: Float32Array[], sampleRate: number) {
  return {
    sampleRate,
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    duration: (channels[0]?.length ?? 0) / sampleRate,
    getChannelData: (i: number) => channels[i] ?? new Float32Array(0),
  };
}

/** Install a fake AudioContext whose decodeAudioData does `impl`. */
function stubAudioContext(
  impl: (buffer: ArrayBuffer) => Promise<unknown>,
): { close: ReturnType<typeof vi.fn> } {
  const close = vi.fn(async () => {});
  class FakeCtx {
    decodeAudioData(buffer: ArrayBuffer) {
      return impl(buffer);
    }
    close() {
      return close();
    }
  }
  (globalThis as { AudioContext?: unknown }).AudioContext =
    FakeCtx as unknown as typeof AudioContext;
  return { close };
}

afterEach(() => {
  delete (globalThis as { AudioContext?: unknown }).AudioContext;
  delete (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext;
  vi.restoreAllMocks();
});

/**
 * Build a File with a working `arrayBuffer()`. jsdom's File does not implement
 * `arrayBuffer`, which a real browser's File does; patch it so these tests
 * exercise the real File branch of `decodeFile`.
 */
function fileWithBuffer(name: string, type: string): File {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const file = new File([bytes], name, { type });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(0),
  });
  return file;
}

describe('decodeFile (task 10.1)', () => {
  it('throws DecodeError naming the file when decoding rejects (Req 1.2)', async () => {
    const { close } = stubAudioContext(async () => {
      throw new Error('bad codec');
    });
    const file = fileWithBuffer('broken.mp4', 'video/mp4');

    await expect(decodeFile(file)).rejects.toBeInstanceOf(DecodeError);
    await expect(decodeFile(file)).rejects.toMatchObject({ fileName: 'broken.mp4' });
    // The context is always closed, even on failure.
    expect(close).toHaveBeenCalled();
  });

  it('throws DecodeError when decodeAudioData resolves to nothing', async () => {
    stubAudioContext(async () => undefined);
    const file = fileWithBuffer('empty.webm', 'video/webm');
    await expect(decodeFile(file)).rejects.toBeInstanceOf(DecodeError);
  });

  it('marks a mono source as mono and copies its channel to both sides (Req 2.2)', async () => {
    const chan = Float32Array.from([0.1, -0.2, 0.3, -0.4]);
    stubAudioContext(async () => fakeAudioBuffer([chan], 48000));
    const file = fileWithBuffer('mono.wav', 'audio/wav');

    const pcm = await decodeFile(file);
    expect(pcm.mono).toBe(true);
    expect(pcm.sampleRate).toBe(48000);
    expect(Array.from(pcm.left)).toEqual(Array.from(chan));
    expect(Array.from(pcm.right)).toEqual(Array.from(chan));
    expect(pcm.duration).toBeCloseTo(4 / 48000, 6);
  });

  it('keeps both channels of a stereo source at the native rate', async () => {
    const l = Float32Array.from([0.1, 0.2, 0.3]);
    const r = Float32Array.from([-0.1, -0.2, -0.3]);
    stubAudioContext(async () => fakeAudioBuffer([l, r], 44100));
    const file = fileWithBuffer('stereo.mp4', 'video/mp4');

    const pcm = await decodeFile(file);
    expect(pcm.mono).toBe(false);
    expect(pcm.sampleRate).toBe(44100);
    expect(Array.from(pcm.left)).toEqual(Array.from(l));
    expect(Array.from(pcm.right)).toEqual(Array.from(r));
  });

  it('accepts an ArrayBuffer directly', async () => {
    const chan = Float32Array.from([0, 0.5, 1]);
    stubAudioContext(async () => fakeAudioBuffer([chan], 16000));
    const pcm = await decodeFile(new Uint8Array([1, 2, 3]).buffer);
    expect(pcm.sampleRate).toBe(16000);
    expect(pcm.mono).toBe(true);
  });
});

describe('toMono16k (task 10.1)', () => {
  it('returns an empty array for empty audio', async () => {
    const pcm: StereoPcm = {
      sampleRate: 44100,
      left: new Float32Array(0),
      right: new Float32Array(0),
      mono: true,
      duration: 0,
    };
    expect((await toMono16k(pcm)).length).toBe(0);
  });

  it('downmixes to one 16 kHz channel with the expected length (linear fallback)', async () => {
    // No OfflineAudioContext in jsdom → linear path. Source already at 16 kHz
    // so the output length equals the input length and values are the L/R mean.
    const n = 320; // 20 ms at 16 kHz.
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      left[i] = Math.sin((2 * Math.PI * i) / 32);
      right[i] = left[i]! * 0.5;
    }
    const pcm: StereoPcm = {
      sampleRate: CLASSIFIER_SAMPLE_RATE,
      left,
      right,
      mono: false,
      duration: n / CLASSIFIER_SAMPLE_RATE,
    };

    const mono = await toMono16k(pcm);
    expect(mono.length).toBe(n);
    // First sample is the mean of L and R at index 0 (both 0 here).
    expect(mono[0]!).toBeCloseTo(0, 6);
    // A mid sample equals the L/R mean at that index.
    const i = 8;
    expect(mono[i]!).toBeCloseTo((left[i]! + right[i]!) / 2, 5);
  });

  it('resamples a higher-rate clip down to roughly 16 kHz length', async () => {
    const srcRate = 48000;
    const n = 4800; // 100 ms.
    const left = new Float32Array(n).fill(0.25);
    const right = new Float32Array(n).fill(0.25);
    const pcm: StereoPcm = {
      sampleRate: srcRate,
      left,
      right,
      mono: false,
      duration: n / srcRate,
    };
    const mono = await toMono16k(pcm);
    // 100 ms at 16 kHz ≈ 1600 samples.
    expect(mono.length).toBeCloseTo(1600, -1);
    // A constant 0.25 input stays ~0.25 after linear resampling.
    expect(mono[10]!).toBeCloseTo(0.25, 5);
  });
});
