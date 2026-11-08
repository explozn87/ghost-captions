// Shared data types for the whole pipeline (task 2.1).
//
// These mirror the "Data types" section of design.md exactly. Everything
// downstream of decode/classify is a pure function over these plain objects
// and typed arrays (NFR-5), so keeping them in one place lets every module
// agree on the same shapes.

/**
 * The fixed set of ghost families a sound can belong to (Requirement 3.1).
 * `unknown` is used when the classifier is unsure or a category is not mapped;
 * it is never a guessed label. `speech` is deliberately NOT a family here:
 * speech is carried on {@link SoundEvent.isSpeech}, because spoken words belong
 * to ordinary captions, not to ghosts (Requirement 3.2).
 */
export type Family =
  | 'footsteps'
  | 'door'
  | 'voice'
  | 'tenseMusic'
  | 'calmMusic'
  | 'impact'
  | 'vehicle'
  | 'animal'
  | 'weather'
  | 'alarm'
  | 'glass'
  | 'unknown';

/**
 * The outcome of mapping a single classifier category name. A category maps
 * either to a ghost {@link Family} or to the special `'speech'` marker
 * (Requirement 3.2). Used by `familyMap.ts` (task 2.3).
 */
export type FamilyOrSpeech = Family | 'speech';

/**
 * Where a sound came from. `centre-unknown` means the side could not be
 * measured with confidence and must not be printed as a direction word
 * (Requirement 4.2, 4.4).
 */
export type Side = 'left' | 'right' | 'centre-unknown';

/**
 * How an event's loudness changes over its duration (Requirement 5.4).
 */
export type Trend = 'rising' | 'falling' | 'steady';

/**
 * Decoded stereo audio at the file's native sample rate. Both channels are
 * kept for direction measurement; when the source is mono, `left` and `right`
 * are the same data and `mono` is true so every event's side becomes unknown
 * (Requirement 2.2).
 */
export interface StereoPcm {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
  mono: boolean;
  duration: number;
}

/**
 * One classifier window (~0.975 s) with its top categories and scores
 * (Requirement 2.3). `end` is `start + 0.975` for YAMNet windows.
 */
export interface ClassWindow {
  start: number;
  end: number;
  categories: { name: string; score: number }[];
}

/**
 * One short measurement frame (~46 ms) of pure DSP output (Requirement 2.4).
 * `balance` is `(R - L) / (R + L)` in -1..1; `lowShare` is the fraction of
 * energy below the low-frequency cutoff, in 0..1.
 */
export interface Frame {
  t: number;
  energy: number;
  /** Left/right energy balance, -1 (hard left) .. 1 (hard right). */
  balance: number;
  /** Onset strength (half-wave-rectified spectral flux). */
  flux: number;
  /** Energy below the low-frequency cutoff over total energy, 0..1. */
  lowShare: number;
}

/**
 * A single grouped sound, drawn as one ghost (Requirement 3.3). Built by
 * `buildEvents()` from windows and frames.
 */
export interface SoundEvent {
  id: string;
  start: number;
  end: number;
  family: Family;
  /** True for speech events, which are shown as a small marker, never a ghost. */
  isSpeech: boolean;
  /** The classifier's top category name, or null when below the label threshold. */
  topLabel: string | null;
  labelScore: number;
  side: Side;
  /** Side sampled over time (~0.5 s) so a travelling sound's ghost can move. */
  sideTrack: { t: number; side: Side }[];
  /** 0..1 confidence that the chosen side is correct. */
  sideConfidence: number;
  /** 0..1 percentile rank of the event's energy within the clip. */
  loudness: number;
  trend: Trend;
  /** 0..1 ominousness score. */
  ominous: number;
  /** Beat period in seconds, or null when no periodic onset was found. */
  beatPeriod: number | null;
}

/**
 * The finished analysis of a whole clip: sorted events plus flags the UI needs
 * (mono notice, labels-unavailable notice).
 */
export interface EventTrack {
  duration: number;
  events: SoundEvent[];
  mono: boolean;
  labelsAvailable: boolean;
}

/**
 * A ghost ready to draw (task 8.1). `layout()` produces these; `draw()`
 * consumes them. Kept here so overlay layout and drawing share one shape.
 */
export interface GhostSprite {
  family: Family;
  /** Horizontal position in 0..1 of the viewport width. */
  x: number;
  /** Vertical position in 0..1 of the viewport height. */
  y: number;
  /** Size multiplier driven by loudness. */
  scale: number;
  /** Fog density in 0..1 driven by ominousness. */
  fog: number;
  /** Tremble frequency in Hz driven by beat; 0 when no beat. */
  trembleHz: number;
  /** Overall opacity in 0..1 (e.g. fading in/out at event edges). */
  opacity: number;
  /** The text label drawn with the ghost (never only motion/colour). */
  label: string;
}
