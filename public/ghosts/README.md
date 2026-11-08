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
