# Implementation Plan — Ghost Captions (소리의 유령)

Order: scaffold → types & config → synthetic signals → pure measurement → events → export → overlay layout → classifier adapter → UI wiring → demo clips → hooks → browser check → deploy → README. Every pure module lands with property tests before UI uses it. The app shell is wired early (task 9) so the real screen is never a placeholder.

- [x] 1. Project scaffold
  - [x] 1.1 Vite + React + TypeScript (strict, `exactOptionalPropertyTypes`), folders `src/{shared,audio,classify,measure,events,config,overlay,export,i18n,ui}`, `test/`.
    - _Requirements: NFR-3, NFR-5_
  - [x] 1.2 Vitest + jsdom + fast-check, `test` and `typecheck` scripts, smoke test.
    - _Requirements: NFR-7_
  - [x] 1.3 MIT `LICENSE`, `.gitignore` (not ignoring `/.kiro`), `wrangler.toml` for static Pages.
    - _Requirements: NFR-3, NFR-4_

- [x] 2. Types and configuration
  - [x] 2.1 `src/shared/types.ts` with `Family`, `Side`, `StereoPcm`, `ClassWindow`, `Frame`, `SoundEvent`, `EventTrack`, `GhostSprite`.
    - _Requirements: 3.1, 4.2, 5.1_
  - [x] 2.2 `src/config/ghost.config.ts` with every threshold, prior and weight from design.md, each with a `why` string.
    - _Requirements: NFR-6_
  - [x] 2.3 `src/events/familyMap.ts` mapping all YAMNet category names (the full list is in `test/fixtures/yamnet_class_map.csv`, column `display_name`) to a family or `speech`; test that every name in the bundled label list is mapped.
    - _Requirements: 3.1, 3.2_

- [x] 3. Synthetic signals and fixtures
  - [x] 3.1 `test/synth.ts`: generate stereo PCM with bursts (tone/noise), start/end, pan, gain, and travelling pan; return ground truth.
    - _Requirements: NFR-7_
  - [x] 3.2 Convert the recorded raw output `test/fixtures/sintel.windows.txt` into `test/fixtures/sintel.windows.json` (`ClassWindow[]`, end = start + 0.975) (category names and scores only, no audio).
    - _Requirements: 3.1_

- [x] 4. Measurement (pure)
  - [x] 4.1 FFT, `frames()` with band energy, balance, flux, lowShare; chunked runner that yields between slices.
    - _Requirements: 2.4, 2.6_
  - [x] 4.2 Tests: balance sign matches pan on synthetic bursts; flux peaks at burst onsets; lowShare high for a 100 Hz tone and low for 4 kHz.
    - _Requirements: 2.4_

- [x] 5. Event building (pure)
  - [x] 5.1 `buildEvents()` steps 1–3 (family per window, merge, short-event drop with onset keep) and `activeEvents()`.
    - _Requirements: 3.3, 3.4, 3.5, 3.6_
  - [x] 5.2 Side, side track, loudness percentile, trend.
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 5.1, 5.4_
  - [x] 5.3 Ominousness and beat period.
    - _Requirements: 5.2, 5.3_
  - [x] 5.4 Property tests P1–P4 from design.md, plus example tests on the Sintel fixture (families appear in scene order; speech is never a ghost).
    - _Requirements: 4.3, NFR-7_

- [x] 6. Export (pure)
  - [x] 6.1 `toWebVtt(track, lang)` with i18n phrases; no speech cues; direction phrase only for known sides.
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 6.2 Property test P5 with a small WebVTT parser.
    - _Requirements: 8.1, NFR-7_

- [x] 7. i18n
  - [x] 7.1 `en.ts`, `ko.ts`, `t()` helper, default English; key-parity test.
    - _Requirements: 9.1, 9.2_

- [x] 8. Overlay layout and drawing
  - [x] 8.1 Pure `layout()` (bands, size, fog, tremble, travel, caption-band exclusion) with property test P6.
    - _Requirements: 6.2, 6.5_
  - [x] 8.2 `draw()` on canvas: one silhouette per family, fog, label backing plate, reduced-motion path, tremble cap (no flashes > 3 Hz).
    - _Requirements: 6.3, 6.4, 6.6, 10.2, 10.3_

- [x] 9. App shell wired end to end with the fake classifier
  - [x] 9.1 `App` states intake → analysing → watch; `DropZone`, `Progress`, `Player` (video + overlay canvas synced by `requestVideoFrameCallback`/rAF incl. seek, pause, rate).
    - _Requirements: 1.1, 2.1, 6.1_
  - [x] 9.2 `Timeline`, `EventList` (keyboard, current-event highlight), `Settings` (language, reduced motion, size, family toggles), `AboutGhosts`, `ExportButton`.
    - _Requirements: 6.7, 7.1, 7.2, 7.3, 8.4, 10.1, 10.4, 11.1, 11.2_
  - [x] 9.3 Component test: loading a synthetic clip shows ghosts, list entries and a working export, using the fake classifier.
    - _Requirements: 6.1, 7.2, 8.1_

- [x] 10. Real decoding and classifier
  - [x] 10.1 `decodeFile()`, `toMono16k()`, `DecodeError`, mono notice.
    - _Requirements: 1.2, 2.2_
  - [x] 10.2 `mediapipeClassifier` with self-hosted `public/models/yamnet.tflite` and bundled wasm; failure path to labels-unavailable.
    - _Requirements: 2.3, 2.5_
  - [x] 10.3 Wire the real classifier into `App`; keep the fake for tests.
    - _Requirements: 2.1_

- [x] 11. Demo clips
  - [x] 11.1 Add two or three redistributable clips under `public/demo/` with `CREDITS.md`; `DemoPicker` showing title, author, licence.
    - _Requirements: 1.3, NFR-4_

- [ ] 12. Kiro hooks
  - [ ] 12.1 Run module tests on save for `src/measure`, `src/events`, `src/export`; secret scan before commit; review hook for `familyMap.ts` / `ghost.config.ts` (`why` kept on every value).
    - _Requirements: NFR-6_

- [ ] 13. Browser check of the built site
  - [ ] 13.1 Build, serve, open in a browser: load each demo clip, confirm ghosts appear in time, labels readable, reduced motion works, export downloads a valid file; record console errors. Fix before deploy.
    - _Requirements: 6.1, 8.1, NFR-1_

- [ ] 14. Deploy and README
  - [ ] 14.1 Deploy to Cloudflare Pages; add the live URL to README.
    - _Requirements: NFR-3_
  - [ ] 14.2 README: what it is (story order from steering), how to try it in 30 s, how it works, limits, credits and licences, "How we used Kiro".
    - _Requirements: 11.1, NFR-4_
