---
inclusion: always
---

# Ghost Captions (소리의 유령) — product steering

## What we are building
Ghost Captions is a web app that lets people watch a video **with the sound off** and still feel the sound. Ordinary captions turn a door creaking behind you into `[door creaks]`. Ghost Captions turns it into a ghost that drifts in from the side the sound came from, sized by how loud it was, wrapped in fog when the moment is ominous, and trembling on the beat. Every ghost also carries a plain text label, so the information never depends on reading the animation.

The metaphor: **a ghost is something that is there but cannot be heard or seen. Unheard sounds are ghosts.** The Halloween theme is the carrier of real information, not decoration.

Who it is for: Deaf and hard-of-hearing viewers first; then everyone who watches on mute (commuters, offices, late at night).

## Story order (video, README, write-up)
1. Open on a muted clip. Ordinary captions say `[music]`. Ghosts say much more.
2. Show what the ghosts mean: where, how loud, how tense, what rhythm.
3. Show the caption file export: the same information as richer WebVTT captions anyone can publish with their own video.
Do not name or compare with any other product, game or app in the video, README or UI.

## Principles
- **Honesty over spectacle.** A ghost appears at a side only when the side is measured with confidence. Otherwise it appears in the centre. A sound we cannot classify is not shown at all (2026-11-08: a screen full of "unknown" reads as unfinished, not honest); never a guessed label.
- **Information is never only motion or colour.** Every ghost has a text label and a direction word when known. Reduced-motion mode removes shake and drift but keeps every piece of information.
- **The video never leaves the browser.** All analysis runs on the user's device. No upload, no server, no account.
- **Measured, not invented.** Labels come from the on-device sound classifier; direction, loudness and rhythm come from signal measurements. No LLM writes captions in V1.
- Demo clips are public domain or CC0/CC BY with attribution in the app and README.
- The UI follows the browser language (Korean browsers get Korean, everyone else English). The English UI gets the same care as Korean, because judges read English.
- **Ghosts follow the sound.** By default they come out only while the video is muted and rest when the sound is on; "Always on" is offered first for viewers who cannot hear even with sound.

## Hackathon requirements we must keep satisfying
- Keep `/.kiro` (specs, hooks, steering) at the repository root; never add it to `.gitignore`.
- Public GitHub repository with an open-source license, a working app URL, a demo video of 3 minutes or less, and a write-up of how Kiro was used.
- Use Kiro deeply and visibly: spec-driven development, agent hooks, steering.
- Submission deadline: 2026-12-04 14:00 PT. Category to be confirmed against the official rules page before submission.
