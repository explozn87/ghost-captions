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
  /** How fast edge fog rises when an ambient event starts/grows (0..1/frame-ish). */
  edgeFogAttack: Tuned;
  /** How slowly edge fog decays once the sound stops rising. */
  edgeFogRelease: Tuned;
  /** Hard cap on edge-fog opacity so the centre stays clear (<= 0.45). */
  edgeFogMaxOpacity: Tuned;
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
}

/**
 * How a point ghost moves over its lifetime (task 17.3). Ambient families are
 * drawn as edge fog and never use these.
 */
export type MotionKind = 'cross' | 'edgeReact' | 'hover';

export const ghostConfig = {
  labelThreshold: {
    value: 0.3,
    why: 'Best category score must reach 0.3 to assign a family; below it the sound is shown as unknown rather than a guessed label (Req 3.5). Matches the 11-08 run where real cues sat at 0.3+ and noise below.',
  },
  specificLabelThreshold: {
    value: 0.3,
    why: 'The specific classifier label (e.g. "Wind", "Thunder") is shown in the ghost label, event list, timeline tooltip and WebVTT cue only when its score reaches 0.3; below it the label falls back to the broader family name. Set equal to labelThreshold so a window that was confident enough to earn a family is also confident enough to name the specific sound, while never naming an unknown event (task 15.1).',
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
    value: 0.12,
    why: 'Edge-fog opacity rises by at most ~0.12 per overlay frame when an ambient event starts or its loudness rises, so the fog swells in under a second rather than snapping on — a gentle arrival, never a flash (Req 10.3, task 16.3).',
  },
  edgeFogRelease: {
    value: 0.03,
    why: 'Once the sound stops rising the fog decays by ~0.03 per frame, a slow fade over a couple of seconds so an ended ambient sound lingers and withdraws rather than vanishing abruptly (task 16.3).',
  },
  edgeFogMaxOpacity: {
    value: 0.45,
    why: 'Edge fog never exceeds 0.45 opacity and only touches the outer edges, so the central 60% of the frame is always clear and readable (Req 6.5, task 16.3).',
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
