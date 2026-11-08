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

- [x] 12. Kiro hooks
  - [x] 12.1 Run module tests on save for `src/measure`, `src/events`, `src/export`; secret scan before commit; review hook for `familyMap.ts` / `ghost.config.ts` (`why` kept on every value).
    - _Requirements: NFR-6_

- [ ] 13. Browser check of the built site
  - [ ] 13.1 Build, serve, open in a browser: load each demo clip, confirm ghosts appear in time, labels readable, reduced motion works, export downloads a valid file; record console errors. Fix before deploy.
    - _Requirements: 6.1, 8.1, NFR-1_

- [ ] 14. Deploy and README
  - [ ] 14.1 Deploy to Cloudflare Pages; add the live URL to README.
    - _Requirements: NFR-3_
  - [ ] 14.2 README: what it is (story order from steering), how to try it in 30 s, how it works, limits, credits and licences, "How we used Kiro".
    - _Requirements: 11.1, NFR-4_

- [x] 15. Specific sound labels (feedback from browser check, 2026-11-08)
  - [x] 15.1 Ghost labels, the event list, the timeline tooltip and WebVTT cues show the specific classifier label (`SoundEvent.topLabel`, e.g. "Wind", "Thunder", "Car", "Choir") when its score is at or above a new config value `specificLabelThreshold` (default 0.3, with a `why`); otherwise they fall back to the family name. Families still decide the ghost silhouette. Never show a specific label for `unknown` events.
    - _Requirements: 3.1, 3.5, 6.4, 7.2, 8.1, 8.2_
  - [x] 15.2 Add `src/i18n/soundLabels.ko.ts`: a natural Korean name for every `display_name` in `test/fixtures/yamnet_class_map.csv` (521 entries; short everyday words a viewer would say, e.g. "Wind" → "바람", "Wind noise (microphone)" → "마이크 바람 소리", "Artillery fire" → "포격"). English uses the display_name as is. Test: every class-map name has a non-empty Korean entry, and the Sintel fixture events show "바람"/"Wind" where the top label is Wind.
    - _Requirements: 9.1, 9.2_

- [x] 16. Twenty ghost families, edge fog, sprite art (feedback from browser check, 2026-11-08)
  - [x] 16.1 Replace the 12 families with 20: `footsteps, door, knock, scream, laughter, crying, tenseMusic, calmMusic, singing, impact, gunshot, vehicle, siren, animal, wind, rain, thunder, fire, glass, unknown`. Update `Family`, `familyMap.ts` (every class-map name still mapped; e.g. Wind/Rustling leaves → wind, Rain/Raindrop/Water → rain, Thunder/Thunderstorm → thunder, Fire/Crackle → fire, Knock/Tap → knock, Door/Slam/Squeak → door, Screaming/Shout/Yell → scream, Laughter → laughter, Crying/Sobbing/Whimper → crying, Choir/Singing/Vocal music → singing, Gunshot/Machine gun/Artillery fire → gunshot, Explosion/Boom/Bang/Thump → impact, Siren/Alarm/Bell/Buzzer → siren), priors in `ghost.config.ts` (each with `why`), i18n family names, and all tests.
    - _Requirements: 3.1, 5.2, 9.1_
  - [x] 16.2 Merged-event label: an event's `topLabel` is the single highest-scoring category across all windows merged into it (not the last or first window).
    - _Requirements: 3.3, 6.4_
  - [x] 16.3 Ambient vs. point families in config: `wind, rain, thunder, tenseMusic, calmMusic` are **ambient**; all others are **point**. Ambient events are drawn as edge fog (a vignette from the screen edges), not as a ghost: whole-frame edges when side is `centre-unknown`, only that side's edge when side is known. Fog strength follows loudness and ominousness, rises only when the event starts or its loudness rises, then decays slowly (config: `edgeFogAttack`, `edgeFogRelease`, `edgeFogMaxOpacity` ≤ 0.45); the central 60 % of the frame is never covered. Thunder is a single slow edge pulse, never a white flash (Req 10.3). The text label of an ambient event is shown near that edge on a backing plate.
    - _Requirements: 4.4, 5.1, 6.2, 6.4, 10.3_
  - [x] 16.4 Point ghosts with a known side enter from that screen edge (emerging from the fog band) and withdraw back out when the event ends; `centre-unknown` point ghosts fade in place in the upper area, never covering the centre-bottom caption band.
    - _Requirements: 4.4, 6.2, 6.5_
  - [x] 16.5 Sprite art: `draw()` paints `public/ghosts/<family>.png` (512×512, transparent) scaled to the sprite size, with the configured opacity; it preloads all images once and falls back to the existing Path2D silhouette for any image that is missing or not yet loaded. Reduced motion keeps the same images without drift/tremble. Tests cover the fallback path with a fake image loader.
    - _Requirements: 6.3, 6.6_

- [x] 17. Bigger ghosts and motion by sound type (feedback 2026-11-08: ghosts too small to recognise; review by Elsa)
  - [x] 17.1 Size: default ghost diameter = 30 % of the viewport's shorter side (180 px at 600 px), replacing BASE_RADIUS 0.08. Narrow the loudness multiplier to 0.85–1.15 so loudness still reads but small ghosts stay recognisable. Move these to `ghost.config.ts` (`ghostDiameterFrac`, `loudScaleMin`, `loudScaleMax`, each with a `why`). The size control in Settings offers 24 % / 30 % / 36 % (small / normal / large).
    - _Requirements: 5.1, 6.2, 6.7_
  - [x] 17.2 One big ghost at a time: only the loudest active point event is drawn at full size; other simultaneous point events are drawn as small markers (25 % of full size) with their labels, so large ghosts never pile up over faces.
    - _Requirements: 3.6, 6.2_
  - [x] 17.3 Motion by family (config table `motionByFamily`):
    - `vehicle`, `footsteps`: **cross** — the ghost travels across the frame only when the event's `sideTrack` shows a measured side change (e.g. left → right); it follows the measured track, never an invented path. Without a measured change it glides in from its side and out, as now.
    - `gunshot`, `impact`, `knock`, `door`, `glass`, `scream`: **edge react** — appear at the source side's edge with a short scale-pop (one pulse, no flashing), then withdraw.
    - `singing`, `laughter`, `crying`, `siren`, `animal`, `fire`, `unknown`: **hover** — stay in the upper band with a slow gentle sway.
    - Ambient families keep edge fog (task 16.3).
    Reduced motion: no travel or sway, same positions and sizes.
    - _Requirements: 4.4, 4.5, 6.2, 6.6, 10.3_
  - [x] 17.4 Keep ghosts out of the caption band and keep the central face region light: a full-size ghost's opacity drops to 0.55 while its centre is inside the central 40 % of the frame.
    - _Requirements: 6.5_
