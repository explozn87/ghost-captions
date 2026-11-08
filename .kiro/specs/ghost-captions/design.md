# Design — Ghost Captions (소리의 유령)

## Overview

A static single-page app (Vite + React + TypeScript). The pipeline runs once per clip, before playback:

```
file / demo clip
  → decode (Web Audio decodeAudioData)            src/audio/decode.ts
  → StereoPcm { sampleRate, left, right }
  ├→ classify (MediaPipe AudioClassifier + YAMNet) src/classify/   → ClassWindow[] (~0.975 s)
  └→ measure (pure DSP)                           src/measure/    → Frame[] (~46 ms)
  → buildEvents(ClassWindow[], Frame[], config)   src/events/     → SoundEvent[]
  → EventTrack (sorted, indexed by time)
playback:
  <video> currentTime → activeEvents(track, t) → OverlayRenderer (canvas)   src/overlay/
                                              → Timeline, EventList         src/ui/
export:
  toWebVtt(track, lang) → Blob download                                     src/export/
```

Everything except `decode`, `classify` and the canvas/React layer is a pure function over typed arrays and plain objects (NFR-5).

## Feasibility evidence (2026-11-08)
- MediaPipe `@mediapipe/tasks-audio@0.10.14` + `yamnet.tflite` (float32) ran in the browser; 52 s classified in 0.35 s.
- Direction by energy balance: perfect on a hard-panned signal; 18/60 windows clear on a PD field recording; 6/52 on a mixed film trailer. Arrival-time difference (GCC-PHAT) gave nothing useful on either real clip and is **not** used in V1.
- Consequence: side is optional per event, with a threshold (Requirement 4).

## Data types (`src/shared/types.ts`)

```ts
type Family = 'footsteps'|'door'|'voice'|'tenseMusic'|'calmMusic'|'impact'|'vehicle'|'animal'|'weather'|'alarm'|'glass'|'unknown';
type Side = 'left'|'right'|'centre-unknown';

interface StereoPcm { sampleRate: number; left: Float32Array; right: Float32Array; mono: boolean; duration: number }
interface ClassWindow { start: number; end: number; categories: { name: string; score: number }[] }
interface Frame { t: number; energy: number; balance: number /* -1..1 */; flux: number; lowShare: number /* 0..1 */ }
interface SoundEvent {
  id: string; start: number; end: number;
  family: Family; isSpeech: boolean; topLabel: string | null; labelScore: number;
  side: Side; sideTrack: { t: number; side: Side }[]; sideConfidence: number;
  loudness: number /* 0..1 clip percentile */; trend: 'rising'|'falling'|'steady';
  ominous: number /* 0..1 */; beatPeriod: number | null;
}
interface EventTrack { duration: number; events: SoundEvent[]; mono: boolean; labelsAvailable: boolean }
```

## Modules

### `src/audio/decode.ts`
`decodeFile(file: File | ArrayBuffer): Promise<StereoPcm>` via `AudioContext.decodeAudioData`. Keeps native sample rate for measurement. `toMono16k(pcm)` resamples with `OfflineAudioContext` for the classifier. Error → `DecodeError` (Req 1.2).

### `src/classify/`
- `Classifier` interface: `classify(mono16k: Float32Array, sampleRate: 16000): Promise<ClassWindow[]>`.
- `mediapipeClassifier.ts`: loads the wasm fileset and model. The model file is **self-hosted under `public/models/yamnet.tflite`** (copied at build from the public Google Storage URL, licence Apache-2.0) so the demo does not depend on a third-party CDN at judging time; wasm from the pinned npm package bundled by Vite.
- `fakeClassifier.ts`: deterministic windows for tests.
- Failure → `labelsAvailable=false`, all windows `unknown` (Req 2.5).

### `src/measure/` (pure)
- `frames(pcm, {frameSize:2048, hop:1024})` → `Frame[]`: band-limited (200–8000 Hz) L/R energy via a small radix-2 FFT, `balance=(R−L)/(R+L)`, spectral flux (half-wave rectified magnitude difference), `lowShare` = energy below 250 Hz / total.
- `percentile(values, p)`, `clipLoudness(frames)` helpers.
- Long tasks are chunked: `frames` runs over slices and yields to the event loop between slices (Req 2.6).

### `src/events/` (pure)
- `familyMap.ts`: table YAMNet category name → `Family | 'speech'` (all 521 names listed; unmapped → `unknown`). One file, reviewed by hook.
- `buildEvents(windows, frames, config)`:
  1. assign each window a family (best score ≥ `labelThreshold`, else `unknown`);
  2. merge consecutive same-family windows (gap ≤ `mergeGap`);
  3. drop short events unless an onset in the event is above the `onsetKeepPercentile` (Req 3.4);
  4. side: energy-weighted balance over onset frames (flux ≥ clip p90) inside the event, else all frames; `left/right` if `|b| ≥ sideThreshold` (default 0.25) and ≥ `sideAgreement` (default 0.7) of weighted frames share the sign; also a `sideTrack` per 0.5 s for travelling sounds;
  5. loudness = percentile rank of the event's mean energy among all frames;
  6. trend from linear fit of dB over the event;
  7. ominous = clamp(w1·prior[family] + w2·onsetSharpness + w3·lowShare);
  8. beat = autocorrelation of flux in the event, period in 0.3–1.5 s if peak ≥ `beatMinCorr`;
  9. cap simultaneous events at `maxOnScreen`, keep loudest.
- `activeEvents(track, t)` binary search.

### `src/config/ghost.config.ts`
Versioned object: `labelThreshold 0.3, mergeGap 0.5, minDuration 0.8, onsetKeepPercentile 0.95, sideThreshold 0.25, sideAgreement 0.7, maxOnScreen 4, priors per family, weights {w1:0.5,w2:0.3,w3:0.2}, beatMinCorr 0.5, trendDb 4`. Each value carries a one-line `why` (from the 11-08 measurements where applicable).

### `src/overlay/` (canvas)
- `layout(events, t, viewport, settings)` (pure) → `GhostSprite[]` { x, y, scale, fog, trembleHz, label, family, opacity }. x: left band 15–30 %, right 70–85 %, centre 40–60 %; y in the upper 70 % (Req 6.5). Rising → scale grows over the event; travelling → x interpolates `sideTrack`.
- `draw(ctx, sprites, time, reducedMotion)`: one silhouette per family (SVG paths baked to `Path2D`), fog as radial gradient, label on a dark backing plate (AA contrast). Tremble amplitude capped; no luminance flashes > 3 Hz (Req 10.3).
- Driven by `requestVideoFrameCallback` when available, else `requestAnimationFrame`, reading `video.currentTime`.

### `src/ui/`
`App` (intake → analysing → watch), `DropZone`, `DemoPicker` (with attribution), `Progress`, `Player` (video + overlay canvas), `Timeline`, `EventList` (aria-live polite for current event, off by default), `Settings` (language, reduced motion, size, family toggles), `AboutGhosts` (Req 11), `ExportButton`.

### `src/export/webvtt.ts` (pure)
`toWebVtt(track, lang)` → string. Cue text built from i18n phrases; direction phrase only when side known; times `HH:MM:SS.mmm`; no cue for speech events. Validated by a small parser in tests.

### `src/i18n/`
`en.ts`, `ko.ts` with identical keys (a test enforces key parity), default `en`.

## Demo clips
`public/demo/` holds two or three short clips whose licences allow redistribution. Candidates found 11-08: Wikimedia Commons "Highway from bridge center.ogg" (public domain, stereo field recording — audio only, to be paired with a still or generated visual) and the Blender Foundation *Sintel* trailer (CC BY 3.0, shows the honest "direction unknown" case). A clip with clear left-right movement and real video is still to be found (task 3). Attribution lives in `public/demo/CREDITS.md` and in the picker.

## Error handling
Decode error → message (Req 1.2). Model load failure → labels unavailable banner (Req 2.5). Mono → one notice (Req 2.2). Very long clip (> 10 min) → warn about analysis time, still allowed.

## Testing strategy
- Vitest + jsdom; **fast-check** for property-based tests (NFR-7).
- Synthetic signal generator `test/synth.ts`: tones/noise bursts at given times, pans and gains, with ground truth.
- Properties: (P1) a burst panned with |pan| ≥ 0.6 is never assigned the opposite side; (P2) with |pan| ≤ 0.1 the side is `centre-unknown`; (P3) merging never produces overlapping same-family events and preserves total covered time within `mergeGap`; (P4) loudness rank is monotonic in gain; (P5) `toWebVtt` output always parses, cue times are ordered, and contains no direction phrase for `centre-unknown`; (P6) `layout` never places a sprite in the bottom caption band.
- Example tests on the recorded `ClassWindow[]` from the Sintel trailer (saved as a fixture from the 11-08 run) so family mapping is checked on real classifier output.
- One browser smoke test (manual + Aside script) on the built site: load demo, analyse, see ghosts, export — required before calling the build working.

## Kiro usage
Spec (this folder), steering (`project.md`), hooks: run the module's tests on save for `src/measure`, `src/events`, `src/export`; secret scan before commit; a review hook when `familyMap.ts` or `ghost.config.ts` changes (every value must keep its `why`).
