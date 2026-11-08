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
}

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
    door: { value: 0.4, why: 'A door/knock is a classic suspense cue, moderately ominous.' },
    voice: { value: 0.6, why: 'Covers screams and shouts, which read as high alarm (Req 5.2 example).' },
    tenseMusic: { value: 0.9, why: 'Scary/tense score is the strongest dread signal (Req 5.2 example).' },
    calmMusic: { value: 0.1, why: 'Calm/tender/happy music is the low anchor of the scale (Req 5.2 example).' },
    impact: { value: 0.8, why: 'Explosions and gunfire are sudden and threatening.' },
    vehicle: { value: 0.3, why: 'Engines/vehicles are tense mainly through approach, handled by onset/low-share.' },
    animal: { value: 0.4, why: 'Growls and barks can menace, but many animal sounds are neutral.' },
    weather: { value: 0.5, why: 'Thunder/storm carries moderate dread; wind alone less so.' },
    alarm: { value: 0.7, why: 'Sirens and alarms signal danger by design.' },
    glass: { value: 0.6, why: 'Breaking glass is a sharp, startling intrusion.' },
    unknown: { value: 0.3, why: 'An unclassified sound gets a neutral-low prior so it is not dramatised without evidence (honesty over spectacle).' },
  },
  weights: {
    w1: { value: 0.5, why: 'Family prior carries half the ominousness: what the sound is matters most (Req 5.2).' },
    w2: { value: 0.3, why: 'Onset sharpness adds 0.3: a sudden attack feels more alarming.' },
    w3: { value: 0.2, why: 'Low-frequency energy share adds 0.2: deep rumble raises dread.' },
  },
} satisfies GhostConfig;
