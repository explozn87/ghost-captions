# Ghost sprite art

`draw()` paints one PNG per ghost family from this folder (task 16.5):

```
public/ghosts/<family>.png
```

where `<family>` is one of the 20 families in `src/shared/types.ts`:

```
footsteps door knock scream laughter crying tenseMusic calmMusic singing
impact gunshot vehicle siren animal wind rain thunder fire glass unknown
```

(Only the point families are drawn here as ghosts. The five ambient families —
`wind`, `rain`, `thunder`, `tenseMusic`, `calmMusic` — are drawn as edge fog by
`draw()`, so their PNGs are optional.)

## Format
- 512×512 px, transparent background (RGBA PNG).
- The ghost should fill most of the square; it is scaled to the sprite size and
  drawn at the sprite's opacity.

## Fallback
Every image is preloaded once on first draw. If a family's PNG is **missing or
not yet loaded**, `draw()` falls back to the built-in `Path2D` silhouette for
that family (one distinct shape per family, `FAMILY_PATH_SOURCE` in
`src/overlay/draw.ts`). The overlay is therefore never blank, and the text
label always carries the information regardless of the art (Req 6.4). Reduced
motion uses the same images without drift or tremble.

This fallback is covered by `test/draw.test.ts` with a fake image loader, so the
app works with or without the PNGs present.

## Per-label sprite overrides (task 36.3)

Some specific classifier labels are drawn with their own sprite even though they
map to a broader family. The override map lives in
`ghostConfig.spriteOverrideByLabel` (keyed by the English `display_name`):

```
Helicopter → public/ghosts/helicopter.png
```

A Helicopter maps to the `vehicle` family (so counts, the event list and the
export treat it like any vehicle), but a wheeled-car ghost next to the label
"Helicopter" reads as wrong, so `draw()` paints `helicopter.png` for that label
only. If the override PNG is **missing or not yet loaded**, `draw()` falls back
to a built-in rotor `Path2D` silhouette for the label (not the wheeled-vehicle
ghost), covered by `test/draw.test.ts` with the fake image loader.

- `helicopter.png`: 512×512, transparent, generated 2026-11-09 by Elsa (same
  terms as the other 20 ghosts above). Redistribution rights depend on the
  image service terms: confirm before public release.

## Credits

20 PNGs (512x512, transparent) generated 2026-11-08 by Elsa (team Codex seat, built-in image generation tool; model name not reported). Redistribution rights depend on the image service terms: confirm before public release.
