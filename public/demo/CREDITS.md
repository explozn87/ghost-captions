# Demo clip credits

Ghost Captions ships a few short clips so anyone can try the app in seconds
without supplying their own video. Every clip here is redistributable under a
public-domain / CC0 / CC BY licence, as the project steering requires. The same
attribution is shown in the app's demo picker and while a clip plays.

| File | Title | Author | Licence | Source |
| --- | --- | --- | --- | --- |
| `tos-0807.webm`, `tos-0807.en.vtt` | Tears of Steel (00:08:07–00:08:32 excerpt, with official subtitles) | Blender Foundation | CC BY 3.0 | https://mango.blender.org/ |
| `sintel-trailer.webm` | Sintel (trailer) | Blender Foundation | CC BY 3.0 | https://durian.blender.org/ |
| `highway-field.ogg` | Highway from a bridge (field recording) | Wikimedia Commons contributor | Public domain | https://commons.wikimedia.org/wiki/File:Highway_from_bridge_center.ogg |

## Why these clips

- **Tears of Steel (excerpt, with subtitles)** is the clip that shows the core
  idea best: its official English subtitles read the spoken words while the
  ghosts read the sounds the words leave out (a crash, a helicopter, shattering
  glass, a vehicle roaring under a shout). It goes first in the picker.

- **Sintel (trailer)** is a real film with a mixed soundtrack. It is the honest
  case the write-up leans on: on a mixed soundtrack, direction is often unknown,
  so most ghosts sit in the centre with no direction word. It shows the app
  telling the truth instead of guessing.
- **Highway from a bridge** is a stereo field recording with a clearer
  left/right balance, so some ghosts take a side with confidence.

## Licence terms kept

- **CC BY 3.0** (Tears of Steel): the film and its official subtitles are
  © copyright Blender Foundation | [mango.blender.org](https://mango.blender.org/),
  licensed under
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Attribution and the
  statement of changes are shown on the source line while the clip plays:
  "Tears of Steel (2012) — (CC) Blender Foundation | mango.blender.org — CC BY
  3.0. Excerpt 00:08:07–00:08:32; subtitles re-timed and converted; Ghost
  Captions overlay added." The subtitles are the official English subtitles
  ([TOS-en.srt](https://download.blender.org/demo/movies/ToS/subtitles/TOS-en.srt),
  licence terms at [mango.blender.org/sharing](https://mango.blender.org/sharing/))
  cut to this range, shifted by −487 s and converted from SRT to WebVTT. Only
  the film's own mixed audio is used; the separate original soundtrack files
  (CC BY-ND 3.0) are **not** used. No endorsement by Blender is implied.
- **CC BY 3.0** (Sintel): attribution is given above and in the app (title,
  author, licence, and a link to the source). No endorsement is implied.
- **Public domain** (field recording): no rights reserved; attribution is kept
  as a courtesy and to show provenance.

## Adding or replacing a clip

The manifest the app reads lives in `src/ui/demoClips.ts`. Each entry must point
at a file in this folder and carry its title, author, licence and source URL.
Only the redistributable licences in that file's `SpdxLicence` union are
allowed, so a non-redistributable clip cannot be added by mistake. Keep this
table and that manifest in step.
