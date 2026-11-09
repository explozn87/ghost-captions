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

- [x] 18. Make ambient sounds unmistakable (feedback 2026-11-08: the wind edge fog was invisible — measured mean change of only 4/255 at the edges over the Sintel wind scene)
  - [x] 18.1 Visible fog: pale lavender light (e.g. rgb(205,200,240)) instead of dark grey-blue, blended so it shows on dark and bright video; the target opacity of a medium-loud ambient event reaches at least 0.30 at the outer edge (cap stays `edgeFogMaxOpacity`), and the attack/release are expressed per second (not per frame) so the fog looks the same at any frame rate. Add a test that a medium-loud wind event over a black frame changes edge pixels by a clearly visible amount (mean ≥ 40/255 in the outer band) while the central 60 % stays untouched.
    - _Requirements: 6.2, 6.5_
  - [x] 18.2 Motion texture per ambient family inside the fog band (config table `ambientTexture`): `wind` → soft horizontal streaks drifting across the band (from the source side when known); `rain` → thin falling streaks; `thunder` → a single slow edge swell (no flash, Req 10.3); `tenseMusic` / `calmMusic` → a few note shapes drifting slowly in the band (sharper and faster for tense). Reduced motion: static texture at the same density.
    - _Requirements: 6.2, 6.6, 10.3_
  - [x] 18.3 Identity: every ambient event also shows its family sprite (`public/ghosts/<family>.png`) at reduced size (50 % of the point-ghost size) inside its fog band, plus its text label on a backing plate, so the viewer can tell what the sound is without the animation (Req 6.4). The sprite and label sit in the upper part of the band, never in the caption band.
    - _Requirements: 6.3, 6.4, 6.5_

- [x] 19. Dialogue subtitles alongside the ghosts (feedback 2026-11-08: a muted viewer also needs the dialogue)
  - [x] 19.1 The intake accepts an optional subtitle file (`.srt` or `.vtt`) with the video (drop both, or add the subtitle after the video). Parse SRT and WebVTT into cues with a pure, tested parser (malformed cues are skipped, not fatal).
    - _Requirements: 1.1, 7.2_
  - [x] 19.2 During playback the active dialogue cue is shown in the bottom caption band (white text on a dark plate, AA contrast, 2 lines max). Ghosts, labels and edge fog never enter that band; when a dialogue cue is on screen the band's height is measured from the rendered cue so taller cues push ghosts further up.
    - _Requirements: 6.5, 10.2_
  - [x] 19.3 Burned-in subtitles: keep the bottom caption band free even without a subtitle file (unchanged), and add a Settings toggle "Video has burned-in subtitles" that enlarges the reserved bottom band to 22 % of the frame.
    - _Requirements: 6.5_
  - [x] 19.4 Export: when dialogue cues are loaded, the exported WebVTT merges dialogue cues and sound cues in time order (sound cues in brackets as now), so a creator gets one complete SDH-style file.
    - _Requirements: 8.1, 8.2_

- [x] 20. Fewer unknowns, quieter settings (feedback 2026-11-08 on the live demo: "settings are messy; why so many unknown sounds?")
  - [x] 20.1 No ghost for nothing: map `Silence` (and other "no sound" categories) to a new `silence` value that never creates an event. A window whose best score is below `labelThreshold` no longer becomes an `unknown` event by default; it is dropped. An `unknown` event is created only when the window is both unclassified AND loud and sudden (energy in the clip's top 15 % and an onset in the top 10 %), so unknown means "something loud happened that we cannot name". Add config values with a `why`. Update Req 3.5's behaviour in tests. On the Sintel fixture, assert that at most 2 unknown events remain.
    - _Requirements: 3.4, 3.5_
  - [x] 20.2 Adjacent windows of the same family separated only by a dropped low-score window are merged into one event (so music does not flicker into many short events).
    - _Requirements: 3.3_
  - [x] 20.3 Settings: hidden behind a single "Settings" (gear) button next to Export; the panel shows only Language, Ghost size (Small/Normal/Large), Reduced motion and Burned-in subtitles. The per-family hide toggles move into a collapsed "Hide sound types" disclosure inside the panel. The watch screen by default shows only: the video with overlay, the timeline, and one row of buttons (Export captions, Add dialogue subtitles, Settings, About). The event list is collapsed behind "Show sound list".
    - _Requirements: 6.7, 7.2, 10.1_

- [x] 21. Ghosts follow the sound: on when muted, off when you can hear (feedback 2026-11-08: "captions should come on only when the sound is off, and turn off when the sound is on — and that should be part of the pitch")
  - [x] 21.1 New setting `showWhen`: `auto` (default) | `always` | `never`. In `auto`, the sound overlay (ghosts, edge fog, sound labels) is shown only while the video is muted or its volume is 0; when the viewer unmutes, the overlay fades out over 0.6 s, and fades back in over 0.6 s when muted again. Listen to the video's `volumechange` event; no polling. Dialogue subtitles (task 19) are NOT affected — they stay on in every mode. `always` is for viewers who cannot hear the sound even when it plays (deaf and hard-of-hearing viewers), and is offered first in the settings explanation. Config values with a `why`. Store the choice with the other settings.
    - _Requirements: 6.7, 10.1_
  - [x] 21.2 A small status chip in the player's top-left corner, shown for 2 s after every change and whenever the pointer is over the player: "🔇 Sound off — ghosts on" / "🔊 Sound on — ghosts resting" (ko: "🔇 소리 꺼짐 — 유령 등장" / "🔊 소리 켜짐 — 유령 쉬는 중"). Information is in text, not only the icon. In `always` mode it reads "Ghosts always on". Clicking it opens the Settings panel at `showWhen`.
  - [x] 21.3 The demo player starts muted (browsers require muted autoplay anyway), so a judge sees the ghosts at once and sees them rest when they unmute.
  - [x] 21.4 Tests: muting/unmuting a jsdom video toggles overlay visibility in `auto`; `always` and `never` ignore volume; dialogue cue stays visible in all three; chip text in en and ko.

- [x] 22. Read at a glance (fun review 2026-11-09, both reviewers 5/10; defects measured with canvas instrumentation on the Sintel demo)
  - [x] 22.1 Labels never leave the frame: after all labels of a frame are measured, each plate is clamped horizontally to `[8 px, W - 8 px]` (the plate moves, the ghost does not). Measured defect: at 9.6 s the gunshot label's right edge was 81 px past the frame.
  - [x] 22.2 Labels never overlap: `draw()` first collects every label plate of the frame (point ghosts and ambient fogs), then resolves overlaps deterministically — in order of priority (big ghost, then ambient, then markers) each later plate is pushed down below the earlier one it intersects (4 px gap), and if that would enter the caption band it is pushed up above instead. Pure helper `placeLabels(rects, W, H, captionBand)` with property tests: no two output plates intersect, all are inside the frame, none in the caption band. Measured defect: at 7.3 s the wind label (y 64) and car label (y 82) were 18 px apart.
  - [x] 22.3 Ghost heads stay in the frame: in `layout()`, a sprite's `y` is at least `radiusFracH + 0.02`, so the top of the ghost image is never above the frame (and the caption-band rule still wins on very small viewports, where the ghost shrinks instead). Measured defect: car and gunshot ghosts were clipped by 30-50 px at the top.
  - [x] 22.4 Ambient textures carry their name: every painted fog band shows its own sprite and label in the upper part of that band (for a whole-frame fog, both the left and the right band, not one label in the top centre), so the drifting streaks or notes always sit next to the word that names them. While an ambient event is active its sprite opacity is at least 0.6 (it no longer fades to a faint shape while the label is still on).
  - [x] 22.5 "Sounds the captions missed" counter: a chip in the player's top-right corner (DOM inside the player, so it also shows in full screen), reading "Sounds captions miss: N" (ko: "자막이 놓친 소리: N"), where N is the number of shown sound events (non-speech, not hidden by the unknown rule or by a hidden sound type) whose start time is at or before the current time. When N increases the chip does one gentle scale pulse (no flash; none under reduced motion) and briefly shows the new sound's name ("+1 Gunshot" / "+1 총성"). When the video ends, the chip becomes a centred end card: "Captions would have missed N sounds in this clip." (ko: "자막만 봤다면 이 영상에서 소리 N개를 놓쳤습니다.") with a "Watch again" button. It follows the show-when overlay visibility (task 21). Pure function `missedCount(events, t, settings)` with tests; chip and card text in en and ko.
    - _Requirements: 6.4, 6.5, 6.6, 10.2_

- [x] 23. Count honestly, end with evidence, give it rhythm (fun review round 2, 2026-11-09: Ruby 6/10, Max 6.5/10)
  - [x] 23.1 Occurrences, not raw events: a pure function `occurrences(events, cfg)` groups shown events into sound occurrences — events of the same family (all music families count as one group, "music") that overlap or are separated by less than `occurrenceGapSec` (config, 4 s, with a `why`) form one occurrence; a change of loudness trend ("getting louder/quieter") inside an occurrence updates its label but is NOT a new occurrence. The counter, the "+1" flash and the end card count occurrences. Only one label per occurrence is on screen at a time (never two stacked "Music" plates). Property tests: splitting one event into touching pieces never changes the count; a trend change never increments the count. Measured defect: the Sintel demo counted music three times and showed two "Music" plates at 13 s.
  - [x] 23.2 Honest definition of "missed": when a subtitle file is loaded, an occurrence is NOT counted if a subtitle cue overlapping it already describes a sound (text in square brackets or a ♪ cue). The end card shows one small line under the number stating the basis: no file → "Counted against dialogue-only captions." / "대사 자막 기준으로 셌습니다."; with a file → "Counted against the subtitles you loaded." / "불러온 자막과 대조했습니다."
  - [x] 23.3 End card with the evidence: below the sentence, a list of the counted occurrences, one row each: time (m:ss), the family's small sprite, and the label (e.g. "0:09 Gunshot, from the right"). Clicking (or Enter on) a row seeks to 0.5 s before that occurrence and plays. More than 8 rows scroll inside the card. Keep "Watch again". Keyboard reachable, rows are buttons with text (not only icons).
  - [x] 23.4 Ambient sounds without a known side no longer paint both side bands with two copies of the same sprite and label: they use a band along the top edge (above the picture's centre, never the caption band), with ONE sprite + label in it; left/right bands are used only when the side is measured (so a side band always means a side). When several ambient occurrences are active, their sprites + labels sit side by side in the band, never on top of each other. Music texture uses note glyphs (♪ ♫) drawn as text, never rectangles; wind uses horizontal streaks; rain thin falling lines — no bare rectangles or bars remain in any texture. Measured defect: at 4.5 s the thunder and wind sprites were drawn at the same position (62, 87).
  - [x] 23.5 Rhythm: (a) arrival — when a new occurrence starts, its ghost (point) or band sprite (ambient) is drawn at 1.6× size for 0.8 s then eases back (reduced motion: no scaling, label shown in bold for 0.8 s instead); (b) settle — an ambient occurrence that has been steady for more than 3 s fades its band to 50 % and halves its texture density, keeping its sprite and label; it rises again only on a new loudness rise. Labels are always placed outside the sprite body (below it), so they never sit on top of the ghost image. Config values with a `why`.
    - _Requirements: 3.3, 6.2, 6.4, 6.5, 6.6, 8.1, 10.2_

- [x] 24. Top band polish (measured on the Sintel demo after task 23, 2026-11-09)
  - [x] 24.1 One fog per occurrence: `edgeFogs()` merges simultaneously active ambient events that belong to the same occurrence group (task 23.1 — all music families are one group) into ONE fog: opacity = the max of the members, label = the member with the highest loudness, texture = that member's texture. Measured defect: at 13.0 s two top-band slots showed "Music, getting louder" and "Music" side by side.
  - [x] 24.2 The top band is ONE vertical gradient across the full frame width (no per-slot rectangles, so no hard vertical edge between slots); slots only position the sprites and labels. Measured defect: a hard vertical edge at x = W/2 in the top band.
  - [x] 24.3 The top band is shallower: `TOP_BAND_FRAC` 0.3 → 0.18 (config with a `why`: stays above faces in typical framing), and its texture shapes (notes, streaks) stay inside the band. Sprite and label still sit inside the band (label may extend just below it on its plate, never into the caption band). Tests for all three.
    - _Requirements: 6.2, 6.4, 6.5_

- [x] 25. A judge's minute: compare, trim, settle (fun review round 3, 2026-11-09: Ruby 7/10, Elsa 7.5/10)
  - [x] 25.1 Spans in the evidence: each end-card row shows the occurrence's span when it lasts 3 s or more ("0:10–0:52 · Music"), else its start; times are rounded to the nearest second of the first moment the sound is shown (not floored). Choir/singing is its own occurrence group again (not folded into "music"), so a ghost on screen is always in the list. Tests.
  - [x] 25.2 Trend words are transient: "getting louder / quieter" is appended to a label only for 3 s after the trend starts (config `trendLabelSec`, with a `why`), then the label returns to the plain name.
  - [x] 25.3 Settled ambient folds away: an ambient occurrence steady for more than `settleSec` (3 s) collapses to a small chip (sprite at 40 % size + plain name) in the top-left corner of the frame; the band fades out; a new loudness rise unfolds it again. Several settled occurrences stack in that corner without overlapping. The centre of the top edge is then free (in-video titles and credits stay uncovered). Reduced motion: same states, no animation.
  - [x] 25.4 Labels always readable: label plates are drawn at full opacity whenever their ghost or chip is visible at all (≥ 0.15), with a darker plate (rgba 8,10,16,0.94); only the ghost image dims (face band, fades), never the text plate. Measured: the vehicle label at 7.3 s was drawn at alpha 0.55.
  - [x] 25.5 Compare on the end card: every evidence row has a second button "Compare" / "비교해 보기". It plays the 3 s around that occurrence twice: first with the sound overlay hidden and a chip "Captions only" / "자막만", then with the overlay shown and a chip "With Ghost Captions" / "소리의 유령과 함께"; then returns to the end card. Uses the existing show-when overlay alpha (no new rendering path). Keyboard reachable, text labels. Tests for the sequence (state machine is a pure function of time).
  - [x] 25.6 Short demo: a demo clip may declare `endAt` (seconds). Playback treats reaching `endAt` as the end (pauses, shows the end card, counts only occurrences before it). Sintel gets `endAt: 25` with a `why` (the remaining half is title, music and credits; the clip's attribution stays in the picker and in the source line above the player). User files have no `endAt`.
  - [x] 25.7 Basis sentence for files without subtitles: "This demo has no subtitle file, so we counted against captions that contain dialogue only." / "이 데모에는 자막 파일이 없어, 대사만 적힌 자막을 가정하고 셌습니다." (with a subtitle file the 23.2 sentence stays).
    - _Requirements: 3.3, 6.4, 6.5, 6.6, 6.7, 10.2_

- [x] 26. Nothing sits on anything (measured on the Sintel demo after task 25, 2026-11-09)
  - [x] 26.1 Point ghosts and the top band never overlap: `draw()` treats every drawn point-ghost box (sprite box) as an obstacle when placing top-band ambient sprites + labels; each top-band item takes the first candidate centre (W/2, then W·0.25, then W·0.75, then W·0.12) whose sprite box and label plate intersect no ghost box and no other placed item. Labels of point ghosts are placed below their own ghost and are also kept off other ghosts' boxes by `placeLabels`. Measured defect: at 7.5 s the vehicle ghost covered the "Wind" sprite and label; at 22 s the choir ghost covered "Music". Property test: for random ghost boxes and top-band items, no output sprite box or plate intersects a ghost box (when a free candidate exists).
  - [x] 26.2 Settling is measured per occurrence, not per event piece: an ambient occurrence settles (task 23.5) and folds to the corner chip (task 25.3) after `settleSec` from the occurrence's start, unless a loudness rise began within the last `trendLabelSec`; a long "rising" piece no longer blocks settling for its whole length. Measured defect: at 22 s, music that started at 11 s had not folded. Tests.
    - _Requirements: 6.2, 6.4, 6.5_

- [x] 27. Make the comparison the moment (fun review round 4, 2026-11-09: Ruby 8/10, Elsa 8/10)
  - [x] 27.1 Compare phases say what you are looking at: during "Captions only" a plate in the caption band reads "Captions only — these captions say nothing about this sound." / "자막만 — 이 장면의 자막에는 이 소리가 없습니다." (with a loaded subtitle file that has a cue there, show that cue's text instead); during the second pass the chip reads "With Ghost Captions" / "소리의 유령과 함께". Both chips are large (≥ 20 px text at a 600 px tall frame, scaling with the frame) and carry a step marker "1/2" / "2/2". Tests in en and ko.
  - [x] 27.2 One obvious first click: the end-card row of the loudest point occurrence (the gunshot on the Sintel demo) is highlighted, carries a "Try this first" / "먼저 눌러 보세요" tag, and its Compare button is the primary style and receives focus when the end card opens. Other rows keep a quieter Compare button.
  - [x] 27.3 Readable labels everywhere: label text is never smaller than `labelMinPx` = max(14, 3 % of frame height) (config with a `why`); the folded corner chip shrinks only its icon, never its text. On dark frames (mean luma of a 16×9 downsample of the current video frame below 40/255, sampled at most every 0.5 s in the browser, nothing leaves the device) labels are drawn 1.3× larger. Pure function `isDarkFrame(pixels)` with tests.
  - [x] 27.4 The end card always fits: the card is `max-height: 100%` of the player with the evidence list scrolling inside it, and "Watch again" stays visible below the list (not inside the scroll area), in the inline player and in full screen.
    - _Requirements: 6.4, 6.7, 10.2_

- [x] 28. The first click is clean and the numbers agree (fun review round 5, 2026-11-09: Ruby 8/10, Elsa 8/10; defects measured in the browser on the Sintel demo)
  - [x] 28.1 The highlighted end-card row never wraps letter by letter: measured on the Sintel demo the gunshot row is 169 px tall against 34 px for the others, because "총성, 오른쪽에서" plus the "먼저 눌러 보세요" tag are squeezed into a ~171 px label column next to the Compare button. Move the "Try this first" / "먼저 눌러 보세요" tag out of the label column (a small line above the row, or inside the primary Compare button itself, e.g. "▶ 먼저 비교해 보기"), let the label wrap only at word boundaries (`word-break: keep-all`, at most two lines), and give the label column a sensible min-width. Test: in jsdom, the first row renders the tag outside `.player__endcard-label`; in CSS the label has `word-break: keep-all`. Also: when focus moves to the primary Compare button on open, the evidence list must not scroll so that the first row is cut at the top (use `focus({ preventScroll: true })` or scroll-padding so row 1 stays fully visible when the list fits).
  - [x] 28.2 The end card's headline count never changes: measured, after running a Compare (which seeks back to ~8 s and ends near 11 s) the end card reappears saying "소리 5개를 놓쳤습니다" while its list still has 6 rows; before Compare it said 6. The headline must be derived from the same occurrence list that the end card shows (occurrences before the clip's end / `endAt`), never from the live counter at the current playback position. Test: open end card (6), run compare, return → still 6 and equal to the number of rows.
  - [x] 28.3 "Captions only" really shows captions only: during step 1/2 of a Compare, hide the missed-sound counter (`.player__missed`) as well as ghosts and labels (measured: the counter "자막이 놓친 소리: 3" is visible in step 1). It reappears in step 2/2 and after. Test.
  - [x] 28.4 A trimmed demo is trimmed everywhere: when a clip has `endAt`, the timeline region shows no occurrence buttons at or after `endAt` (measured: buttons at 25.4 s, 39.0 s and 43.9 s remain on the 25 s Sintel demo), the player's time display shows `endAt` as the duration (0:25, not 0:52), and the progress bar spans 0..endAt. A music span that runs past `endAt` is listed as ending at `endAt` (already done on the end card) and its ghost/label stays visible until `endAt` (measured: no music label at 23.5–24.5 s although the list says 0:11–0:25 — keep the long-running music shown, folded as a corner chip if needed, until the span ends). Tests.
    - _Requirements: 6.4, 6.7, 10.2_

- [x] 29. The overlay is never stale, and the demo closes cleanly (fun review round 6, 2026-11-09: Ruby 8/10, Elsa 8.5/10; defects measured in the browser on the Sintel demo)
  - [x] 29.1 Redraw on seek, follow video time: measured with a canvas hash during playback, the overlay content changes only about once per second (normal play from 7.5 s: changes at 7.94, 8.95, 9.96 s). After a seek during playback (Compare seeks back to ~8.3 s) the overlay keeps showing the state from before the seek (the 11 s music ghost, "음악, 점점 커짐") until the next tick at 9.24 s, so step 2/2 "With Ghost Captions" opens on the wrong ghost and the gunshot shows only 9.24–10.23 s instead of from ~8.8 s. Fix: on `seeked` (and on `play` after a seek) recompute the active occurrences for `video.currentTime` and redraw immediately; derive which ghosts are active from `video.currentTime` every animation frame (cheap lookup over the precomputed occurrence list), not from a wall-clock interval. Test with fake timers / a fake video: seek from 11 s to 8.3 s while playing → the very next draw uses the 8.3 s state; at 8.9 s the gunshot is active.
  - [x] 29.2 One time display: the native `<video controls>` shows 0:52 next to the player's own "0:24 / 0:25" (measured `video.controls === true`, duration 52.2). Hide native controls when the player's own controls are present (or always in the demo), keeping keyboard play/pause and the player's own progress bar, so only the trimmed time shows.
  - [x] 29.3 End-card polish: the primary button text "▶ 먼저 비교해 보기" is clipped and the evidence list shows a horizontal scrollbar. Give the primary Compare button enough width (or shorten to "▶ 먼저 비교" / "▶ Try first"), set the list `overflow-x: hidden` and row columns `min-width: 0` so nothing scrolls sideways at 1280×900, 1366×768, 1280×720. Test the strings and CSS rules.
  - [x] 29.4 Music label until the span ends: measured, the canvas is empty (0 points) at 23.5, 24.0 and 24.5 s while the end-card list says "0:11–0:25 음악". When a sustained occurrence (music) spans past the current time, keep its label visible (folded as the small corner chip is fine) until the span's end or the clip's `endAt`. If the analysis really has no music after 23.3 s, end the listed span at the last frame where it is shown instead — the picture and the list must agree. Test.
  - [x] 29.5 Close the comparison with one sentence: when Compare finishes and the end card returns, show for that row a short line under the headline: ko "방금 본 「총성, 오른쪽에서」는 자막만으로는 알 수 없던 소리입니다." / en "The “gunshot, from the right” you just saw is a sound the captions alone never told you." (use the row's own label; no claims beyond the label). It stays until another Compare or Watch again. Test in en and ko.
    - _Requirements: 6.4, 6.7, 10.2_

- [x] 30. Draw on every display frame (measured after task 29, 2026-11-09)
  - [x] 30.1 The overlay loop must not depend on `requestVideoFrameCallback` cadence. Measured in the review browser: while the Sintel demo plays, `requestVideoFrameCallback` fires only once per second (mediaTime 5.83, 6.83 …) although `requestAnimationFrame` runs at ~58/s and the video decodes at 24 fps, so the overlay content changes only once per second, and after a Compare seek (11.2 s → 8.3 s) the canvas still shows the 11 s music ghost until ~9.2 s even with the task 29.1 `seeked` redraw. Browsers may throttle video-frame callbacks (occluded windows, power saving), so drive the overlay with `requestAnimationFrame` always (paused or playing), reading `video.currentTime` on each tick; keep `requestVideoFrameCallback` only as an optional extra trigger if useful. Also call the immediate redraw from the Compare `step` right after it sets `v.currentTime` (do not rely on `seeked` alone). Test with a fake video whose rVFC never fires while playing: the overlay still redraws on each rAF and reflects a seek on the next frame.
    - _Requirements: 6.4, 10.2_

- [x] 31. The end card stays inside the video box on small screens (fun review round 7, 2026-11-09: Ruby 8.5/10, Elsa 9/10)
  - [x] 31.1 At 1366×768 and 1280×720 the end-card list and "Watch again" run past the bottom edge of the video box, the headline's first line touches the top edge, and at 1280×720 the last row ("0:21 합창") is partly hidden and the gunshot label is ellipsised ("총성, 오른쪽…"). Make the end card a flex column inside the player box (`max-height: 100%`, `box-sizing: border-box`, inner padding top/bottom ≥ 12 px); headline and "Watch again" are fixed-size, the evidence list takes the remaining height (`flex: 1 1 auto; min-height: 0; overflow-y: auto`) with `padding-bottom` so its last row is never clipped; labels wrap at word boundaries (no `text-overflow: ellipsis`). If the box is too short, shrink the headline font one step before the list. CSS tests for these rules.
    - _Requirements: 6.4, 10.2_

- [x] 32. The end card covers the picture only (measured after task 31, 2026-11-09)
  - [x] 32.1 `.player__endcard` is `position: absolute; inset: 0` inside `.player`, which also contains the `.player__progress` bar, so the card covers the progress bar: measured on the Sintel demo the video box spans y 172–773 but the card spans 172–808 and "Watch again" ends at 792 (same 35 px overrun at 1366×768 and 1280×720). Render the end card inside `.player__stage` (the element that holds the video and the overlay canvas, so `inset: 0` equals the picture), keeping the progress bar visible and usable below it, in the inline player and in full screen. Test in jsdom that the end card is a descendant of `.player__stage`.
    - _Requirements: 6.4, 10.2_

- [x] 33. The exported captions say exactly what the screen said (fun review proposals round 1, 2026-11-09: Ruby found it reading the code; Anna confirmed)
  - [x] 33.1 `ExportButton` passes the whole `track` to `toWebVtt`, which iterates `track.events` — every raw event over the full file. On the Sintel demo (trimmed with `endAt: 25`) the downloaded .vtt therefore covers the whole 52 s trailer, includes music after 25 s, and has a different number of sound cues than the end card's 6 rows. Make the export use the same source as the end card: the shown occurrences (`occurrences()` with the same `isShownEvent` filter), only those starting before the clip's `endAt` when it has one, each cue ending at `occurrenceShownEnd(occ, effectiveEnd)` (so a span running past `endAt` ends at `endAt`), labelled with the same phrase as the end-card row (family label plus direction / loudness words as shown). Dialogue cues (task 19.4) are kept but also clipped to `endAt`. Without `endAt` the export covers the whole file as before, still from the shown occurrences. Keep `toWebVtt` pure: add a pure `toWebVttFromOccurrences(...)` (or an `endAt` + occurrences parameter) and have `ExportButton` receive `endAt` from `App`.
  - [x] 33.2 Tests: on a fixture shaped like the Sintel demo (events past 25 s, `endAt` 25) the number of sound cues equals the number of end-card rows, no cue starts at or after 25 s, the music cue ends at 25 s (or where its shown span ends), and each cue's text equals the row's label in en and ko. Existing WebVTT format tests still pass.
    - _Requirements: 8.1, 8.2, 6.4_

- [x] 34. A short sound stays long enough to read (fun proposal round 2, Ruby, scored 75/100 on the proposal rubric)
  - [x] 34.1 Minimum display time: an occurrence shorter than `ghostMinDisplaySeconds` = 2.0 s (config with a `why`: like the minimum display time of a caption, a viewer who cannot hear needs time to read the label) keeps its ghost and label on screen until start + 2.0 s. The part after the measured end is drawn at reduced opacity (`ghostLingerAlpha` = 0.5, config with a `why`) and fades out smoothly, so it reads as "just happened", not as a sound still going on. Long occurrences are unchanged. Measured on the Sintel demo before this task: the gunshot ghost is visible only from ~8.95 to ~9.6 s (canvas points 16,193 at 9.0 s, 4,498 at 9.6 s, 0 at 10.0 s).
  - [x] 34.2 Honesty: the extension never changes counts or times — the missed-sounds counter, the end-card list, the timeline and the WebVTT export keep the measured start/end. When a new occurrence arrives while one is lingering, the newcomer takes the big-ghost slot at once (task 17.2 rule) and the lingering one drops to its small form or disappears.
  - [x] 34.3 Reduced motion: the linger is shown as a static half-opacity label without fade animation.
  - [x] 34.4 Tests: a 0.6 s event is drawn at t = start + 1.5 s with alpha ≈ 0.5 and not at start + 2.1 s; a 5 s event is unaffected; counter/list/export unchanged; a newcomer during the linger takes the big slot.
    - _Requirements: 6.4, 10.2_

- [x] 35. A second demo with dialogue: the captions read the words, the ghosts read the rest (fun proposal round 2, Ruby, scored 81/100; licence checked by Elsa 2026-11-09 from mango.blender.org/sharing and the official download page)
  - [x] 35.1 Assets are already in `public/demo/` (prepared by Anna, do not re-encode): `tos-0658.webm` (Tears of Steel, original 00:06:58–00:07:23, 25 s, 854×356 VP9 + Opus stereo, 4.3 MB) and `tos-0658.en.vtt` (the official English subtitles `TOS-en.srt` cut to that range, shifted by −418 s, converted to WebVTT; 4 cues: "Not my fault!", "This time.", "Quiet on set!", "We're out of time!"). Add a `DemoClip` entry `tears-of-steel-0658`, title "Tears of Steel (00:06:58–00:07:23 excerpt, with official subtitles)", author "Blender Foundation", licence `CC-BY-3`, sourceUrl `https://mango.blender.org/`, and a new optional field `subtitles: '/demo/tos-0658.en.vtt'` that the player loads automatically as the dialogue track (the same path as a user-loaded subtitle file, task 19) when this clip is picked. Put it FIRST in the picker list (it shows the core idea best); Sintel stays second.
  - [x] 35.2 Attribution exactly (CC BY 3.0 §4(b), changes stated): on the source line while it plays — "Tears of Steel (2012) — (CC) Blender Foundation | mango.blender.org — CC BY 3.0. Excerpt 00:06:58–00:07:23; subtitles re-timed and converted; Ghost Captions overlay added." Add the row to `public/demo/CREDITS.md` with links to https://mango.blender.org/sharing/, https://download.blender.org/demo/movies/ToS/subtitles/TOS-en.srt and https://creativecommons.org/licenses/by/3.0/, and a note that the separate original soundtrack files (CC BY-ND 3.0) are NOT used — only the film's own mixed audio. No wording that suggests Blender endorses the app.
  - [x] 35.3 Measured by Anna in the browser with the current build (clip + subtitles loaded by hand): end card "자막만 봤다면 이 영상에서 소리 4개를 놓쳤습니다. / 불러온 자막과 대조했습니다." with rows 0:05–0:09 차량 소리, 0:14 헬리콥터 (first), 0:17–0:22 음악, 0:22 일제 사격. With the auto-loaded subtitles the end card must say the same; the dialogue band shows the official lines and no ghost or label is drawn inside it (task 19 rule).
  - [x] 35.4 Tests: the manifest test accepts the new entry (licence allowed, files exist, subtitles path exists), picking the clip loads 4 dialogue cues, the basis sentence is the "compared with the loaded subtitles" one, and the credits row exists.
    - _Requirements: 1.3, 6.4, 19, NFR-4_

- [x] 36. Sound names read at least as large as the dialogue, arrive with their ghost, and match their picture (fun review round 8, 2026-11-09: Ruby 8.5/10, Elsa 8.5/10)
  - [x] 36.1 Label size vs dialogue: measured in code, sound labels use `max(labelMinPx, labelFrameFrac × H)` = max(14, 0.03 × 445) = 14 px on the wide Tears of Steel frame (445 px tall), while dialogue cues use a fixed `DIALOGUE_FONT_PX = 22`, so the sound names read smaller than the words — wrong for viewers who cannot hear. Make both scale with the frame from one config (`dialogueFrameFrac`, with a `why`) and guarantee `labelFontPx >= dialogueFontPx` for every frame size (the dark-frame 1.3× boost stays on top of that). Keep the folded corner chip text at the same minimum. Test: for H = 300, 445, 600, 1080 the label font is ≥ the dialogue font; dialogue still fits its band (task 19.2 measurement).
  - [x] 36.2 A ghost never appears without its name: on the Tears of Steel demo at 22.5 s the volley ghost is drawn translucent with no label, and the label appears only at 23.0 s. Whenever a ghost (point or band sprite) is drawn, its label is drawn in the same frame, at full label opacity from the first frame of arrival (the arrival pop may scale the ghost, not hide the label). Requirement 6.4: the text label always carries the information. Test with an arrival at t0: at t0 + one frame the label is present.
  - [x] 36.3 Picture matches the name: the Helicopter class maps to the `vehicle` family, so it is drawn with the wheeled vehicle ghost while its label says "헬리콥터 / Helicopter". Add an optional per-label sprite override map in config (`spriteOverrideByLabel`, with a `why`), starting with `Helicopter → /ghosts/helicopter.png`. If the override image is missing or not loaded, fall back to a built-in `Path2D` rotor silhouette for that label (not the wheeled vehicle). Family, counts, list and export are unchanged. Update `public/ghosts/README.md` (credit line: helicopter.png generated by Elsa 2026-11-09, same terms as the other 20). Tests with the fake image loader: helicopter label → override sprite; missing file → rotor path; other vehicle labels unchanged.
    - _Requirements: 6.4, 10.2_

- [x] 37. Sounds under dialogue are not thrown away (fun review round 9, 2026-11-09: Max 8.5 saw no frame with dialogue and a ghost together; Anna traced the cause in code; proposal rubric 83/100)
  - [x] 37.1 Cause: `labelWindow` (src/events/buildEvents.ts) returns `kind: 'family'` with `isSpeech: sawSpeech` when a sound family clears the threshold in a window that ALSO has speech above threshold. Those windows merge into events with `isSpeech: true`, and every consumer drops `isSpeech` events (`isShownEvent` in occurrences.ts, webvtt.ts, layout.ts, Timeline.tsx). So a gunshot, door or vehicle heard while someone talks is never shown, counted, listed or exported — exactly the sounds captions miss. Fix: keep `isSpeech` meaning "a speech-only marker event" (no family). A family window with speech present becomes a normal family event with a new field `overSpeech: true` (`isSpeech: false`). Merging (`sameKind`) compares family and `isSpeech` as before, so a family run is not split by speech presence. Speech-only windows are unchanged (still `kind: 'speech'`, never shown).
  - [x] 37.2 Display while dialogue is on screen: an `overSpeech` occurrence is drawn like any other point/ambient ghost but must stay out of the dialogue band (task 19 rule) — no other change. Counting (`missedOccurrences`) treats it like any other occurrence: missed unless a loaded cue describes the sound (task 23.2).
  - [x] 37.3 Honesty: the threshold is not lowered; only confident family scores (the existing `labelThreshold`) become ghosts. Add a config note (`why`) on `labelThreshold` that it now also governs sounds under speech.
  - [x] 37.4 Tests: a window list with [speech 0.8 + Gunshot 0.6] produces one gunshot event with `overSpeech: true`, shown, counted and exported; [speech 0.8 only] produces a speech marker that is not shown; existing build-events tests still pass (update the ones that encoded the old drop, with a comment pointing to this task).
    - _Requirements: 3.2, 6.4, 8.1_

- [x] 38. Dialogue looks like ordinary US subtitles, so it cannot be mistaken for a sound name (owner feedback, 2026-11-09: "the dialogue subtitles and our sound captions look the same, I can't tell which is which")
  - [x] 38.1 Cause: `drawDialogue` and `drawLabelAt` (src/overlay/draw.ts) both paint near-white sans-serif text on a near-black rectangular plate (dialogue `rgba(10,12,18,0.82)`, labels `rgba(8,10,16,0.94)`), and since task 36.1 at similar sizes. Fix the dialogue to the common US streaming subtitle look (as in the Netflix Timed Text Style Guide for English (USA)): white sans-serif text, centred at the bottom, at most two lines, **no background plate**, with a black outline (stroke ≈ 0.12 × font px, `lineJoin = 'round'`) plus a soft black drop shadow so it stays readable on bright frames. Keep `dialogueFontPx`, wrapping, the two-line limit, the bottom margin and the dialogue band measurement (`measureDialogueBandFrac`) exactly as they are, so layout keeps ghosts out of the band.
  - [x] 38.2 Sound labels keep their dark plate and get a distinct text colour: lavender `#b9b3ff` (from one config value `soundLabelColor`, with a `why`: sound names must never look like dialogue). Contrast of `#b9b3ff` on the label plate must stay ≥ 4.5:1 (Req 10.2) — compute it in a test. The folded corner chip uses the same colour. Opacity rules, sizes, positions and the bold variant are unchanged.
  - [x] 38.3 Tests (fake 2D context): drawing a frame with a dialogue cue makes no `fillRect` for the dialogue (no plate), calls `strokeText` then `fillText` with white for each dialogue line; a sound label is drawn with `fillStyle` equal to `soundLabelColor`; the dialogue band fraction for a given cue is unchanged from before this task; `labelFontPx >= dialogueFontPx` still holds (task 36.1).
    - _Requirements: 6.4, 10.2_
