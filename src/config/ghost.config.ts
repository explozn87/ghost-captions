// The one versioned configuration module (NFR-6, task 2.2).
//
// Every threshold, prior and weight the pipeline uses lives here, and every
// value carries a one-line `why` so a reviewer (and the review hook from task
// 12) can see the reason behind each number. Where a number comes from the
// 2026-11-08 browser measurements recorded in requirements.md / design.md,
// the `why` says so.
//
// The shape is expressed with `satisfies` so the literal types (and the exact
// set of families in `priors`) are preserved for the rest of the codebase
// while still being checked against GhostConfig.

import type { Family } from '../shared/types.ts';

/** A number paired with the reason it has that value. */
export interface Tuned<T = number> {
  value: T;
  why: string;
}

/** Per-family ominousness prior, 0 (calm) .. 1 (dread), each with a reason. */
export type FamilyPriors = Record<Family, Tuned>;

export interface OminousWeights {
  /** Weight on the per-family prior. */
  w1: Tuned;
  /** Weight on onset sharpness. */
  w2: Tuned;
  /** Weight on low-frequency energy share. */
  w3: Tuned;
}

export interface GhostConfig {
  labelThreshold: Tuned;
  specificLabelThreshold: Tuned;
  /**
   * An unclassified (below-threshold) window becomes an `unknown` event only
   * when its energy is in the clip's top `unknownEnergyPercentile` AND it holds
   * an onset in the clip's top `unknownOnsetPercentile` (task 20.1). So an
   * unknown ghost means "something loud and sudden happened that we cannot
   * name", not "a quiet second we could not label" — which cuts the clutter of
   * stray unknowns the live demo complained about.
   */
  showUnknownEvents: Tuned<boolean>;
  unknownEnergyPercentile: Tuned;
  /** The onset (flux) percentile an unclassified window must clear to become an unknown event (task 20.1). */
  unknownOnsetPercentile: Tuned;
  mergeGap: Tuned;
  minDuration: Tuned;
  onsetKeepPercentile: Tuned;
  sideThreshold: Tuned;
  sideAgreement: Tuned;
  maxOnScreen: Tuned;
  beatMinCorr: Tuned;
  trendDb: Tuned;
  priors: FamilyPriors;
  weights: OminousWeights;
  /**
   * Families drawn as edge fog (a vignette from the screen edges) rather than
   * as a ghost sprite (task 16.3). Everything not listed here is a point
   * family drawn as a ghost.
   */
  ambientFamilies: { value: readonly Family[]; why: string };
  /** How fast edge fog rises when an ambient event starts/grows, in opacity per second (task 18.1). */
  edgeFogAttack: Tuned;
  /** How slowly edge fog decays once the sound stops rising, in opacity per second (task 18.1). */
  edgeFogRelease: Tuned;
  /** Hard cap on edge-fog opacity so the centre stays clear (<= 0.45). */
  edgeFogMaxOpacity: Tuned;
  /**
   * The opacity a medium-loud ambient event reaches at the outer edge once it
   * has fully attacked (task 18.1). The old dark-grey fog at ~0.2 was invisible
   * on the Sintel wind scene; a visible floor guarantees the fog reads.
   */
  edgeFogMinVisible: Tuned;
  /**
   * How each ambient family's fog band is textured (task 18.2): the motion
   * drawn inside the vignette so the viewer can tell wind from rain from music
   * without reading the label. Reduced motion freezes the texture at the same
   * density.
   */
  ambientTexture: { value: Record<Family, AmbientTexture>; why: string };
  /**
   * Default ghost diameter as a fraction of the viewport's shorter side, before
   * the loudness and size-control multipliers (task 17.1). Ghosts were too
   * small to recognise, so a mid-loudness ghost is now a large fraction of the
   * frame.
   */
  ghostDiameterFrac: Tuned;
  /** Loudness maps scale down to this multiplier for the quietest sound (task 17.1). */
  loudScaleMin: Tuned;
  /** Loudness maps scale up to this multiplier for the loudest sound (task 17.1). */
  loudScaleMax: Tuned;
  /**
   * How each point family moves (task 17.3). `cross` follows a measured side
   * change across the frame (else glides in from its side); `edgeReact`
   * appears at the source edge with a short scale-pop then withdraws; `hover`
   * stays in the upper band with a slow gentle sway. Ambient families keep
   * edge fog (task 16.3) and are not listed here.
   */
  motionByFamily: { value: Record<Family, MotionKind>; why: string };
  /**
   * How long the sound overlay (ghosts, edge fog, sound labels) takes to fade
   * out when the viewer unmutes, and back in when they mute again, in the
   * `auto` show-when mode (task 21.1). Dialogue subtitles are never affected.
   */
  overlayFadeSeconds: Tuned;
  /**
   * The gap (seconds) below which two shown events of the same group are
   * folded into one sound occurrence (task 23.1). The counter, the "+1" flash
   * and the end card count occurrences, not raw events, so a sound that the
   * pipeline split into touching pieces (e.g. music whose loudness trend
   * changed) is counted once.
   */
  occurrenceGapSec: Tuned;
  /**
   * Arrival rhythm (task 23.5): when a new occurrence starts, its ghost (point)
   * or band sprite (ambient) is drawn at `arrivalPopScale`× size for
   * `arrivalPopSec` seconds, then eases back. Under reduced motion there is no
   * scaling; the label is shown in bold for the same time instead.
   */
  arrivalPopScale: Tuned;
  arrivalPopSec: Tuned;
  /**
   * Settle rhythm (task 23.5): an ambient occurrence that has been steady for
   * more than `settleAfterSec` fades its band to `settleOpacityFactor` of its
   * opacity and multiplies its texture density by `settleTextureFactor`,
   * keeping its sprite and label; it rises again only on a new loudness rise.
   */
  settleAfterSec: Tuned;
  settleOpacityFactor: Tuned;
  settleTextureFactor: Tuned;
}

/**
 * How a point ghost moves over its lifetime (task 17.3). Ambient families are
 * drawn as edge fog and never use these.
 */
export type MotionKind = 'cross' | 'edgeReact' | 'hover';

/**
 * The motion texture drawn inside an ambient event's fog band (task 18.2).
 * Only the five ambient families use one; every other family is `none`.
 *   - `windStreaks`  horizontal streaks drifting across the band;
 *   - `rainStreaks`  thin falling streaks;
 *   - `thunderSwell` a single slow edge swell, never a flash (Req 10.3);
 *   - `notesTense` / `notesCalm` a few note shapes drifting slowly, sharper and
 *     faster for tense music.
 */
export type AmbientTexture =
  | 'none'
  | 'windStreaks'
  | 'rainStreaks'
  | 'thunderSwell'
  | 'notesTense'
  | 'notesCalm';

export const ghostConfig = {
  labelThreshold: {
    value: 0.3,
    why: 'Best category score must reach 0.3 to assign a family; below it the sound is shown as unknown rather than a guessed label (Req 3.5). Matches the 11-08 run where real cues sat at 0.3+ and noise below.',
  },
  specificLabelThreshold: {
    value: 0.3,
    why: 'The specific classifier label (e.g. "Wind", "Thunder") is shown in the ghost label, event list, timeline tooltip and WebVTT cue only when its score reaches 0.3; below it the label falls back to the broader family name. Set equal to labelThreshold so a window that was confident enough to earn a family is also confident enough to name the specific sound, while never naming an unknown event (task 15.1).',
  },
  showUnknownEvents: {
    value: false,
    why: 'Off by default (feedback 2026-11-08: "this is a hackathon"). On a dense trailer the loud-and-sudden gate still let four unknown ghosts through and split the music into fragments. Showing only what we can name keeps honesty (nothing guessed is shown) without filling the screen with "unknown". Turn on to see unclassified loud hits.',
  },
  unknownEnergyPercentile: {
    value: 0.85,
    why: 'An unclassified window becomes an unknown event only when its energy sits in the clip\'s top 15% (task 20.1). The live demo showed too many unknown ghosts for ordinary quiet seconds the classifier simply could not name; requiring top-15% loudness means an unknown ghost marks "something loud happened we cannot name", not background the viewer would not notice.',
  },
  unknownOnsetPercentile: {
    value: 0.9,
    why: 'Alongside the loudness gate, an unclassified window must also contain an onset in the clip\'s top 10% flux to become an unknown event (task 20.1), so unknown means loud AND sudden — a bang or crash we cannot name — rather than a steady unlabelled drone.',
  },
  mergeGap: {
    value: 0.5,
    why: 'Consecutive same-family windows within 0.5 s merge into one event, so a sustained sound is one ghost, not a flicker (Req 3.3).',
  },
  minDuration: {
    value: 0.8,
    why: 'Events shorter than 0.8 s are dropped unless their onset is a top-percentile hit, to avoid one-window noise (Req 3.4).',
  },
  onsetKeepPercentile: {
    value: 0.95,
    why: 'A short event survives the min-duration drop if it contains an onset above the clip 95th flux percentile, so sudden short sounds (a slam) still show (Req 3.4).',
  },
  sideThreshold: {
    value: 0.25,
    why: 'Absolute balance must reach 0.25 to call a side; below it stays centre-unknown. On the 11-08 mixed film clip only 6/52 windows had a clear side, so the bar is deliberately conservative to avoid misleading direction (Req 4.2).',
  },
  sideAgreement: {
    value: 0.7,
    why: '70% of the weighted frames must share the sign of the balance before a side is assigned, so a brief pan does not flip the whole event (Req 4.2).',
  },
  maxOnScreen: {
    value: 4,
    why: 'At most 4 simultaneous ghosts, keeping the loudest, so the overlay stays readable at 60 fps (Req 3.6, NFR-1).',
  },
  beatMinCorr: {
    value: 0.5,
    why: 'Autocorrelation of flux must peak at 0.5 or above to call a beat period; otherwise the event has no beat and does not tremble (Req 5.3).',
  },
  trendDb: {
    value: 4,
    why: 'Loudness is marked rising/falling only when the linear dB change over the event exceeds 4 dB, a just-noticeable change, so small drifts stay steady (Req 5.4).',
  },
  priors: {
    footsteps: { value: 0.3, why: 'Footsteps are mildly tense (approach), not inherently dreadful.' },
    door: { value: 0.4, why: 'A door opening/slamming is a classic suspense cue, moderately ominous.' },
    knock: { value: 0.5, why: 'An unexpected knock at a door is a stock suspense beat — who is there? — so a touch above the plain door.' },
    scream: { value: 0.85, why: 'A scream or shout is a strong alarm signal (Req 5.2 example: scream high).' },
    laughter: { value: 0.2, why: 'Laughter is usually warm; low dread unless the context (onset/low-share) says otherwise.' },
    crying: { value: 0.6, why: 'Crying/sobbing reads as distress, moderately high on the dread scale.' },
    tenseMusic: { value: 0.9, why: 'Scary/tense score is the strongest dread signal (Req 5.2 example).' },
    calmMusic: { value: 0.1, why: 'Calm/tender/happy music is the low anchor of the scale (Req 5.2 example).' },
    singing: { value: 0.2, why: 'A sung voice is close to calm music; low dread by default.' },
    impact: { value: 0.8, why: 'Explosions, booms and heavy thuds are sudden and threatening.' },
    gunshot: { value: 0.9, why: 'Gunfire is among the most alarming sounds; kept near the top so it is never softened.' },
    vehicle: { value: 0.3, why: 'Engines/vehicles are tense mainly through approach, handled by onset/low-share.' },
    siren: { value: 0.7, why: 'Sirens and alarms signal danger by design.' },
    animal: { value: 0.4, why: 'Growls and barks can menace, but many animal sounds are neutral.' },
    wind: { value: 0.45, why: 'Wind sets an uneasy atmosphere but is rarely a direct threat on its own.' },
    rain: { value: 0.35, why: 'Rain and water are mostly atmospheric; mild unease, not dread.' },
    thunder: { value: 0.7, why: 'Thunder is a sudden deep boom from the sky; carries real dread.' },
    fire: { value: 0.6, why: 'Crackling fire signals danger (a building ablaze) while sitting below a blast.' },
    glass: { value: 0.6, why: 'Breaking glass is a sharp, startling intrusion.' },
    unknown: { value: 0.3, why: 'An unclassified sound gets a neutral-low prior so it is not dramatised without evidence (honesty over spectacle).' },
  },
  weights: {
    w1: { value: 0.5, why: 'Family prior carries half the ominousness: what the sound is matters most (Req 5.2).' },
    w2: { value: 0.3, why: 'Onset sharpness adds 0.3: a sudden attack feels more alarming.' },
    w3: { value: 0.2, why: 'Low-frequency energy share adds 0.2: deep rumble raises dread.' },
  },
  ambientFamilies: {
    value: ['wind', 'rain', 'thunder', 'tenseMusic', 'calmMusic'],
    why: 'These sounds fill the whole scene rather than coming from one point, so they are drawn as edge fog from the screen edges (task 16.3) instead of a ghost: wind/rain/thunder are weather that surrounds the viewer, and music underscores the scene rather than emanating from an object. Every other family is a point sound drawn as a ghost.',
  },
  edgeFogAttack: {
    value: 1.2,
    why: 'Edge-fog opacity rises by up to 1.2 per second when an ambient event starts or its loudness rises, so the fog swells to a visible level in well under a second rather than snapping on — a gentle arrival, never a flash (Req 10.3). Expressed per second (task 18.1) so the fog looks the same at any overlay frame rate.',
  },
  edgeFogRelease: {
    value: 0.2,
    why: 'Once the sound stops rising the fog decays by 0.2 per second, a slow fade over roughly two seconds so an ended ambient sound lingers and withdraws rather than vanishing abruptly (task 16.3). Per second (task 18.1), and slower than the attack so fog swells in and lingers out.',
  },
  edgeFogMaxOpacity: {
    value: 0.45,
    why: 'Edge fog never exceeds 0.45 opacity and only touches the outer edges, so the central 60% of the frame is always clear and readable (Req 6.5, task 16.3).',
  },
  edgeFogMinVisible: {
    value: 0.3,
    why: 'A medium-loud ambient event reaches at least 0.30 opacity at the outer edge once attacked (task 18.1). The earlier dark grey-blue fog peaked around 0.2 and was invisible on the Sintel wind scene (measured mean edge change of only 4/255); 0.30 of the pale-lavender colour is a clearly visible band while staying under the 0.45 cap.',
  },
  ambientTexture: {
    value: {
      wind: 'windStreaks',
      rain: 'rainStreaks',
      thunder: 'thunderSwell',
      tenseMusic: 'notesTense',
      calmMusic: 'notesCalm',
      // Every point family has no fog band, so no texture.
      footsteps: 'none',
      door: 'none',
      knock: 'none',
      scream: 'none',
      laughter: 'none',
      crying: 'none',
      singing: 'none',
      impact: 'none',
      gunshot: 'none',
      vehicle: 'none',
      siren: 'none',
      animal: 'none',
      fire: 'none',
      glass: 'none',
      unknown: 'none',
    },
    why: 'Each ambient family gets a distinct motion inside its fog band so the viewer can tell the sounds apart without reading the label (task 18.2, Req 6.2): wind drifts as soft horizontal streaks, rain falls as thin streaks, thunder is one slow edge swell (never a flash, Req 10.3), and music drifts a few note shapes — sharper and faster for tense, softer and slower for calm. Point families carry no fog band and so have no texture.',
  },
  ghostDiameterFrac: {
    value: 0.3,
    why: 'A mid-loudness ghost is 30% of the viewport\'s shorter side (180 px at a 600 px side), replacing the old 0.08 radius that was too small to recognise (review by Elsa, task 17.1). This is a diameter, so the drawn radius is half of it.',
  },
  loudScaleMin: {
    value: 0.85,
    why: 'The quietest sound is still 0.85x the default diameter, not tiny: loudness still reads but a small ghost stays recognisable (task 17.1).',
  },
  loudScaleMax: {
    value: 1.15,
    why: 'The loudest sound is 1.15x the default diameter: a narrow 0.85–1.15 band so loudness is visible without a loud ghost swamping the frame (task 17.1).',
  },
  motionByFamily: {
    value: {
      vehicle: 'cross',
      footsteps: 'cross',
      gunshot: 'edgeReact',
      impact: 'edgeReact',
      knock: 'edgeReact',
      door: 'edgeReact',
      glass: 'edgeReact',
      scream: 'edgeReact',
      singing: 'hover',
      laughter: 'hover',
      crying: 'hover',
      siren: 'hover',
      animal: 'hover',
      fire: 'hover',
      unknown: 'hover',
      // Ambient families (edge fog, task 16.3). Listed to keep the record total
      // over Family; the overlay never reads them because ambient events are
      // drawn as fog, not ghosts.
      wind: 'hover',
      rain: 'hover',
      thunder: 'hover',
      tenseMusic: 'hover',
      calmMusic: 'hover',
    },
    why: 'Motion matches how each sound behaves (task 17.3): vehicles and footsteps CROSS the frame when a side change is measured (they travel through the scene); gunshot/impact/knock/door/glass/scream are sharp point events that EDGE-REACT with one scale-pop at the source edge then withdraw; singing/laughter/crying/siren/animal/fire/unknown HOVER with a slow sway as they have no single arrival. Ambient families are drawn as edge fog and never read this table.',
  },
  overlayFadeSeconds: {
    value: 0.6,
    why: 'In the default `auto` show-when mode the sound overlay fades out over 0.6 s when the viewer unmutes and fades back in over 0.6 s when they mute again (task 21.1). Long enough to read as a deliberate "the ghosts are resting because you can hear now" rather than a flicker, short enough that a judge toggling mute sees the effect at once. Dialogue subtitles ignore this and stay on in every mode.',
  },
  occurrenceGapSec: {
    value: 4,
    why: 'Shown events of the same group (all music families count as one "music" group) that overlap or sit within 4 s of each other are folded into one sound occurrence (task 23.1). The Sintel demo counted music three times and stacked two "Music" plates at 13 s because the pipeline split the long cue on loudness-trend changes; a 4 s bridge is wide enough to rejoin those touching fragments into one count while two genuinely separate sounds of the same family (e.g. two gunshots seconds apart) stay distinct.',
  },
  arrivalPopScale: {
    value: 1.6,
    why: 'A new occurrence announces itself by drawing its ghost/band sprite at 1.6× for a moment then easing back (task 23.5), so the viewer\'s eye is drawn to the arrival (fun review 2026-11-09 asked for rhythm). 1.6× is a clear pop without covering neighbouring faces; under reduced motion the label is bolded instead, no scaling.',
  },
  arrivalPopSec: {
    value: 0.8,
    why: 'The arrival pop lasts 0.8 s then eases back to the settled size (task 23.5): long enough to notice, short enough not to linger as an oversized ghost. One rise-and-fall, never a repeating flash (Req 10.3).',
  },
  settleAfterSec: {
    value: 3,
    why: 'An ambient occurrence steady for more than 3 s has made its point, so it settles — fading its band and thinning its texture (task 23.5) — until a new loudness rise brings it back. 3 s matches the live feel that a continuous wind or drone should recede into the background rather than hold the viewer\'s attention indefinitely.',
  },
  settleOpacityFactor: {
    value: 0.5,
    why: 'A settled ambient band fades to 50% of its opacity (task 23.5), keeping the sprite and label readable while making clear the sound is now background. Halving is a clear step down without the band disappearing.',
  },
  settleTextureFactor: {
    value: 0.5,
    why: 'A settled ambient band halves its texture density (task 23.5), so a steady wind or rain has visibly calmer motion once it has settled, matching the fade of the band itself.',
  },
} satisfies GhostConfig;

/**
 * True when a family is drawn as edge fog rather than a ghost sprite (task
 * 16.3). Reads the single `ambientFamilies` list so the overlay and tests
 * share one source of truth.
 */
export function isAmbientFamily(
  family: Family,
  cfg: GhostConfig = ghostConfig,
): boolean {
  return cfg.ambientFamilies.value.includes(family);
}

/**
 * The motion texture for a family's fog band (task 18.2). Point families return
 * `none`. Reads the single `ambientTexture` table so the overlay and tests
 * share one source of truth.
 */
export function ambientTextureOf(
  family: Family,
  cfg: GhostConfig = ghostConfig,
): AmbientTexture {
  return cfg.ambientTexture.value[family];
}
