# Demo media — files to place here

The app reads its demo-clip list from `src/ui/demoClips.ts`. Each entry points
at a media file that must sit in this folder (served at `/demo/...`). The media
are binaries and are **not** committed by the agent; download them from the
sources in `CREDITS.md` and drop them in with these exact names:

- `sintel-trailer.webm` — the *Sintel* trailer (Blender Foundation, CC BY 3.0),
  from https://durian.blender.org/ . Any short VP8/VP9 + Vorbis/Opus WebM the
  browser can decode works; keep it under ~15 MB for a fast demo.
- `highway-field.ogg` — a public-domain stereo field recording, from
  https://commons.wikimedia.org/wiki/File:Highway_from_bridge_center.ogg .

Until the files are present, the demo picker still renders with full attribution
(title, author, licence, source link); clicking a clip shows a "could not load"
notice instead of crashing, and the user can still open their own file. Once the
files are in place, a clicked clip is fetched as the app's own same-origin asset
(allowed by Requirement 1.5) and runs through the same analysis pipeline as a
dropped file.

The picker logic, attribution rendering, licence allow-list and the
fetch→`File` conversion are all covered by `test/demoPicker.test.tsx` and
`test/demoClips.test.ts`, which inject a fake `fetch` so they do not depend on
the binaries being present.
