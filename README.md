# Ghost Captions

**Shows the sounds that captions leave out.**

Speech gets automatic captions almost everywhere. The sounds between the lines (footsteps, a door, the wind, a gunshot off to the right) are still written by hand, or not at all. Ghost Captions finds those sounds on your own device and shows each one as a ghost: where it came from, how loud it was, and what it was, in plain words.

Mute the video and the ghosts come out. Turn the sound on and they go back to rest.

**Try it:** https://ghost-captions.pages.dev/ (pick a demo clip, or drop in your own video)

## What it does

- **Names the sound.** An on-device sound classifier labels each second of audio ("Wind", "Thunderstorm", "Choir", "Gunshot"). Only sounds it is confident about are shown.
- **Shows where it came from.** Stereo balance is measured. A ghost appears on the left or right only when the side is clear; otherwise it stays in the centre.
- **Shows how it feels.** Loud sounds make bigger ghosts. Steady background sounds (wind, rain, music) become fog at the edges of the frame instead of a ghost in the middle of the picture.
- **Stays out of the way of dialogue.** Load your subtitle file (.srt or .vtt), or say the video has burned-in subtitles. Ghosts never enter the subtitle band.
- **Follows the sound.** In Auto mode the ghosts appear only while the video is muted. "Always on" is there for viewers who cannot hear the sound even when it plays.
- **Exports captions.** Download a WebVTT file with the sound captions (merged with your dialogue subtitles, if loaded) and publish it with your own video.
- **Never uploads your video.** All analysis runs in the browser. No server, no account.

Every ghost carries a text label, so no information depends on motion or colour alone. Reduced-motion mode keeps all of it.

## How it works

1. The browser decodes the audio with Web Audio.
2. A sound classifier (YAMNet, run with MediaPipe Tasks Audio in WebAssembly) scores each ~1 s window against 521 sound classes.
3. The classes are grouped into 20 ghost families (footsteps, door, knock, scream, wind, rain, thunder, vehicle, music and more). Windows are merged into events, and silence and low-confidence windows are dropped.
4. Signal measurements add direction (left/right energy balance), loudness and onset strength.
5. A canvas over the video draws the ghosts and edge fog, keeping clear of the subtitle band.

Stack: Vite, React, TypeScript (strict), Vitest with property-based tests (fast-check).

## Built with Kiro

The whole app was built spec-first in Kiro. Everything is in [`/.kiro`](.kiro):

- **Spec** (`.kiro/specs/ghost-captions/`): requirements, design and a task list. The task list grew from 14 to 37 tasks as real-screen feedback came in: specific sound names, edge fog for ambient sounds, bigger ghosts, dialogue subtitles, hiding unknown sounds, ghosts that follow the mute button, an end card that counts what captions alone would have missed, a with/without comparison, and keeping sounds that happen under dialogue.
- **Steering** (`.kiro/steering/project.md`): the product principles Kiro reads on every task — honesty over spectacle, information never only in motion or colour, the video never leaves the browser.
- **Agent** (`.kiro/agents/builder.json`): a builder agent that may only read and write files and run the project's typecheck and test scripts.
- **Hooks** (`.kiro/hooks/`): three hooks are configured: run module tests on save, review config and family-map changes, and scan for secrets before commit. Most tasks were run through the Kiro CLI, where these IDE hooks do not fire, so we do not claim they ran on every change; the test suite itself was run before every commit.

Kiro implemented the tasks one at a time, and each was committed only after typecheck and the full test suite passed (495 tests at the time of writing). A few small fixes found while checking the real screen were made by hand, with tests.

## Run locally

```
npm install
npm run dev
```

`npm test` runs the test suite. `npm run build` writes the static site to `dist/`.

## Credits

- Demo clips: see [`public/demo/CREDITS.md`](public/demo/CREDITS.md) (Tears of Steel and Sintel © Blender Foundation, CC BY 3.0; field recording in the public domain).
- Sound classifier: YAMNet, Apache License 2.0.
- Ghost illustrations: see [`public/ghosts/README.md`](public/ghosts/README.md).

## Licence

MIT. See [LICENSE](LICENSE).
