# Demo clip credits

Ghost Captions ships a few short clips so anyone can try the app in seconds
without supplying their own video. Every clip here is redistributable under a
public-domain / CC0 / CC BY licence, as the project steering requires. The same
attribution is shown in the app's demo picker and while a clip plays.

| File | Title | Author | Licence | Source |
| --- | --- | --- | --- | --- |
| `sintel-trailer.webm` | Sintel (trailer) | Blender Foundation | CC BY 3.0 | https://durian.blender.org/ |
| `highway-field.ogg` | Highway from a bridge (field recording) | Wikimedia Commons contributor | Public domain | https://commons.wikimedia.org/wiki/File:Highway_from_bridge_center.ogg |

## Why these two

- **Sintel (trailer)** is a real film with a mixed soundtrack. It is the honest
  case the write-up leans on: on a mixed soundtrack, direction is often unknown,
  so most ghosts sit in the centre with no direction word. It shows the app
  telling the truth instead of guessing.
- **Highway from a bridge** is a stereo field recording with a clearer
  left/right balance, so some ghosts take a side with confidence.

## Licence terms kept

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
