# Requirements — Ghost Captions (소리의 유령)

## Introduction

Ghost Captions lets a viewer watch a video with the sound off and still perceive its non-speech sound. The user opens a local video file (or a bundled demo clip). The app analyses the audio track entirely in the browser: an on-device sound classifier says *what* each sound is, and signal measurements say *where* (left / centre / right), *how loud*, *how ominous*, and *what rhythm*. During playback, each sound event is drawn as a ghost over the video, always with a text label. The same events can be exported as an enriched WebVTT caption file.

Feasibility was measured before this spec (2026-11-08, browser, MediaPipe Audio Classifier + YAMNet):
- Classification: a 52 s film trailer was classified in 0.35 s; labels followed the scene order plausibly.
- Direction: on a hard-panned test signal, every window was correct. On a public-domain field recording, 18 of 60 one-second windows had a clear side. On a mixed film soundtrack, only 6 of 52 did, with weak coherence. **Therefore direction is optional per event and shown only above a confidence threshold.**

This document covers V1.

---

## Requirements

### Requirement 1 — Open a video

**User Story:** As a viewer, I want to open a video from my device or pick a demo clip, so that I can watch it with ghost captions.

#### Acceptance Criteria
1. WHEN the user drops or selects a local video or audio file THEN THE SYSTEM SHALL load it into the player without uploading it anywhere.
2. IF the file cannot be decoded by the browser THEN THE SYSTEM SHALL show a clear error naming the file and suggesting a common format (MP4/H.264 + AAC, WebM).
3. THE SYSTEM SHALL offer at least two bundled demo clips with known licences, and SHALL show each clip's title, author and licence before and during playback.
4. THE SYSTEM SHALL NOT fetch, embed or download videos from third-party video sites.
5. THE SYSTEM SHALL make no network request carrying the user's video or audio data. (Network requests for the app's own code, model and fonts are allowed.)

### Requirement 2 — Analyse the audio before playback

**User Story:** As a viewer, I want the analysis to finish quickly before playback, so that ghosts appear exactly in time with the video.

#### Acceptance Criteria
1. WHEN a clip is loaded THEN THE SYSTEM SHALL decode its audio, analyse the whole track, and show a progress indicator until the event track is ready.
2. THE SYSTEM SHALL keep both stereo channels for measurement; IF the clip is mono THEN THE SYSTEM SHALL mark every event's side as unknown and SHALL say once that direction is unavailable for mono audio.
3. THE SYSTEM SHALL classify the audio with an on-device classifier into windows of about one second and SHALL keep each window's top categories and scores.
4. THE SYSTEM SHALL measure, on short frames (about 50 ms), per-frame energy, left/right energy balance, and onset strength (spectral flux).
5. IF the classifier model fails to load THEN THE SYSTEM SHALL still produce events from measurements alone, labelled as unknown sounds, and SHALL tell the user that labels are unavailable.
6. WHILE analysis runs THE SYSTEM SHALL keep the page responsive (no single blocking task longer than about 200 ms).

### Requirement 3 — Build sound events

**User Story:** As a viewer, I want sounds grouped into meaningful events, so that I see one ghost per sound rather than a flicker every second.

#### Acceptance Criteria
1. THE SYSTEM SHALL map classifier categories into a fixed set of ghost families (for example: footsteps, door & knock, voice & scream, tense music, calm music, impact & explosion, engine & vehicle, animal, weather, alarm & siren, breaking glass, unknown), defined in one configuration table.
2. THE SYSTEM SHALL treat speech categories as speech, not as a ghost family; speech SHALL be shown only as a small "speech" marker, because spoken words belong to ordinary captions.
3. WHEN consecutive windows share a ghost family THEN THE SYSTEM SHALL merge them into one event with a start and an end time.
4. THE SYSTEM SHALL drop events shorter than a configured minimum duration unless their onset strength is in the top configured percentile (so sudden short sounds survive).
5. IF the best category score of a window is below the configured label threshold THEN THE SYSTEM SHALL assign the unknown family rather than a guessed label.
6. THE SYSTEM SHALL allow at most a configured number of simultaneous events on screen, keeping the loudest.

### Requirement 4 — Direction (left / centre / right)

**User Story:** As a viewer, I want to see which side a sound came from when that is known, and not be misled when it is not.

#### Acceptance Criteria
1. THE SYSTEM SHALL compute an event's side from the energy-weighted left/right balance of the frames inside the event, preferring onset frames when present.
2. THE SYSTEM SHALL assign `left` or `right` only WHEN the absolute balance meets the configured side threshold AND enough frames agree in sign; otherwise it SHALL assign `centre-unknown`.
3. THE SYSTEM SHALL never assign the opposite side to a signal whose true balance clearly favours one side (a property-based test SHALL check this on synthetic panned signals).
4. WHEN an event's side is `centre-unknown` THEN THE SYSTEM SHALL draw its ghost in the centre band and SHALL NOT print a direction word.
5. WHEN an event moves from one side to the other within its duration (e.g. a passing car) THEN THE SYSTEM SHALL record the side track over time so the ghost can travel.

### Requirement 5 — Loudness, ominousness and rhythm

**User Story:** As a viewer, I want to see how loud, how tense and how rhythmic a sound is.

#### Acceptance Criteria
1. THE SYSTEM SHALL compute each event's loudness relative to the clip (percentile of frame energy within the clip), so that quiet clips still show contrast.
2. THE SYSTEM SHALL compute an ominousness score in 0..1 from (a) a per-family prior in configuration (e.g. scream, tense music high; calm music low), (b) onset sharpness, and (c) low-frequency energy share; the formula and weights SHALL live in configuration.
3. THE SYSTEM SHALL detect a beat period for events whose onset strength is periodic, and SHALL leave it empty otherwise.
4. THE SYSTEM SHALL mark loudness rising or falling within an event when the change exceeds a configured amount.

### Requirement 6 — Draw ghosts over the video

**User Story:** As a viewer watching on mute, I want ghosts drawn over the video in sync, so that I perceive the sound without reading a log.

#### Acceptance Criteria
1. WHILE the video plays THE SYSTEM SHALL draw the events active at the current time on an overlay above the video, synchronised to the video's current time (also when seeking, pausing and changing speed).
2. THE SYSTEM SHALL map side → horizontal position, loudness → ghost size, ominousness → fog density around the ghost, beat → a tremble at the beat period, and rising/falling loudness → approaching/receding motion.
3. THE SYSTEM SHALL give each ghost family a distinct silhouette, so families are distinguishable without colour.
4. EVERY ghost SHALL carry a text label (family name, plus direction word when known, plus "getting louder/quieter" when marked), at a readable size and contrast over any video.
5. THE SYSTEM SHALL keep ghosts out of the bottom caption band so they do not cover ordinary subtitles.
6. WHEN the user turns on reduced motion (or the OS prefers reduced motion) THEN THE SYSTEM SHALL remove drift, tremble and fog animation while keeping position, size, label and a static fog level.
7. THE SYSTEM SHALL let the user mute individual ghost families and change ghost size.

### Requirement 7 — Text equivalents and timeline

**User Story:** As a viewer, I want the same information as text, so that I can review it and so that nothing depends only on the animation.

#### Acceptance Criteria
1. THE SYSTEM SHALL show a timeline strip under the video with one mark per event, coloured and shaped by family, that seeks to the event when clicked or activated by keyboard.
2. THE SYSTEM SHALL provide an event list (time, family, direction if known, loudness word, ominousness word) that is keyboard-navigable and screen-reader readable.
3. WHEN the user plays the video with the event list open THEN THE SYSTEM SHALL highlight the current event.

### Requirement 8 — Export enriched captions

**User Story:** As a creator, I want to export the sound events as a caption file, so that my own viewers get richer non-speech captions on any platform.

#### Acceptance Criteria
1. WHEN the user chooses export THEN THE SYSTEM SHALL produce a valid WebVTT file with one cue per event, e.g. `[footsteps, from the left, getting louder]`.
2. THE SYSTEM SHALL include a direction phrase only for events with a known side, and SHALL never include a label below the label threshold.
3. THE SYSTEM SHALL produce the export in the current UI language.
4. THE SYSTEM SHALL let the user download the file without any server round-trip.

### Requirement 9 — Language

#### Acceptance Criteria
1. THE SYSTEM SHALL default to English and offer Korean, switchable at any time, covering every UI string, ghost label and export phrase.
2. THE SYSTEM SHALL keep all strings in translation tables, none hard-coded in components.

### Requirement 10 — Accessibility of the app itself

#### Acceptance Criteria
1. THE SYSTEM SHALL be fully operable by keyboard, with visible focus.
2. THE SYSTEM SHALL meet WCAG 2.2 AA contrast for all text, including ghost labels over video (using a label backing plate).
3. THE SYSTEM SHALL never flash more than three times per second (WCAG 2.3.1), including tremble and fog effects.
4. THE SYSTEM SHALL respect `prefers-reduced-motion` and offer its own toggle.

### Requirement 11 — Honesty and limits

#### Acceptance Criteria
1. THE SYSTEM SHALL show an "about the ghosts" panel explaining what is measured, what is guessed by the classifier, and the known limits: mixed film soundtracks often hide direction; overlapping sounds are shown as one event; labels can be wrong.
2. THE SYSTEM SHALL NOT claim to replace professional captioning or audio description.

---

## Non-functional requirements
- **NFR-1 Performance:** analysis of a 60 s stereo clip completes in under 5 s on a mid-range laptop; overlay runs at 60 fps with up to the configured maximum ghosts.
- **NFR-2 Privacy:** no analytics, no cookies beyond language/settings in local storage; no user media leaves the device.
- **NFR-3 Static hosting:** the app is a static site (Cloudflare Pages); no server functions in V1.
- **NFR-4 Licences:** app code MIT; classifier model and runtime under their own licences, credited; demo clips public domain / CC0 / CC BY with attribution.
- **NFR-5 Testability:** every analysis step is a pure function over arrays, testable without a browser; the classifier sits behind an interface with a fake for tests.
- **NFR-6 Configuration:** thresholds, family map, priors and weights live in one versioned configuration module.
- **NFR-7 Property-based tests:** direction, merging, loudness ranking and WebVTT output are covered by property-based tests on synthetic signals with known truth.
