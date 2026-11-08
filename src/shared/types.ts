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
  | 'knock'
  | 'scream'
  | 'laughter'
  | 'crying'
  | 'tenseMusic'
  | 'calmMusic'
  | 'singing'
  | 'impact'
  | 'gunshot'
  | 'vehicle'
  | 'siren'
  | 'animal'
  | 'wind'
  | 'rain'
  | 'thunder'
  | 'fire'
  | 'glass'
  | 'unknown';

/**
 * The outcome of mapping a single classifier category name. A category maps
 * either to a ghost {@link Family}, to the special `'speech'` marker
 * (Requirement 3.2), or to the `'silence'` marker for "no sound" categories
 * that must never create an event (task 20.1). Used by `familyMap.ts`.
 */
export type FamilyOrSpeech = Family | 'speech' | 'silence';

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
 * Only point families become sprites; ambient families become {@link EdgeFog}
 * (task 16.3).
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
  /**
   * True during the arrival window (task 23.5). The sprite scale already
   * carries the arrival pop when motion is allowed; under reduced motion the
   * pop is dropped and `draw` renders the label in bold for this window instead,
   * so the arrival still reads without any movement.
   */
  arriving: boolean;
}

/**
 * Which screen edge(s) an edge-fog vignette covers (task 16.3, extended in task
 * 23.4). `left`/`right` are used only when the side was measured; an ambient
 * sound with no known side uses `top` — a band along the top edge (above the
 * picture's centre, never the caption band) with ONE sprite + label — instead
 * of painting both side bands with two copies of the same sprite (task 23.4).
 */
export type FogEdge = 'left' | 'right' | 'top';

/**
 * The motion texture drawn inside an ambient event's fog band (task 18.2).
 * Mirrors the config `AmbientTexture` so `draw` can switch on it without
 * importing config types.
 */
export type FogTexture =
  | 'none'
  | 'windStreaks'
  | 'rainStreaks'
  | 'thunderSwell'
  | 'notesTense'
  | 'notesCalm';

/**
 * An ambient sound drawn as a vignette from the screen edges instead of a
 * ghost (task 16.3). `wind, rain, thunder, tenseMusic, calmMusic` produce
 * these. The central 60% of the frame is never covered; the text label sits
 * near the relevant edge on a backing plate. The fog band also carries a
 * motion texture (task 18.2) and the family's sprite at reduced size (task
 * 18.3) so the viewer can identify the sound without the animation.
 */
export interface EdgeFog {
  family: Family;
  /** Whole-frame edges when the side is unknown, else only that side's edge. */
  edge: FogEdge;
  /** Current fog opacity in 0..1 after attack/decay smoothing. */
  opacity: number;
  /** The text label shown near the edge (never only motion/colour). */
  label: string;
  /** The motion texture drawn inside the band (task 18.2). */
  texture: FogTexture;
  /**
   * Density of the texture in 0..1 (driven by loudness/ominousness), so the
   * texture is denser for a louder, more ominous ambient sound (task 18.2).
   */
  textureDensity: number;
  /**
   * Size multiplier for the band sprite (task 23.5): 1 normally, lifted to the
   * configured arrival pop just after the occurrence starts, then eased back.
   */
  spriteScale: number;
  /**
   * True once an ambient occurrence has been steady past the settle time (task
   * 23.5): the band fades and its texture thins, keeping the sprite and label.
   */
  settled: boolean;
  /**
   * True once an ambient occurrence has been steady past the longer
   * `settleSec` (task 25.3): it folds away into a small corner chip (sprite at
   * 40% + plain name) in the top-left and its band is no longer painted, so the
   * centre of the top edge is free for in-video titles. A new loudness rise
   * unfolds it (back to a band). `draw` reads this to switch between band and
   * chip.
   */
  folded: boolean;
  /**
   * The stacking index among the folded corner chips active at this instant,
   * and the count of them, so `draw` can stack several settled occurrences in
   * the top-left corner without overlapping (task 25.3).
   */
  foldSlot: number;
  foldCount: number;
  /**
   * Slot index among the top-band fogs active at this instant (task 23.4), so
   * `draw` can place several `top` fogs side by side without overlapping, and
   * the count of such fogs so each can take an equal share of the band.
   */
  topSlot: number;
  topCount: number;
  /**
   * True during the arrival window (task 23.5), so `draw` can render the band
   * label in bold under reduced motion (where `spriteScale` stays 1).
   */
  arriving: boolean;
}

/**
 * One dialogue subtitle cue parsed from an optional `.srt` or `.vtt` file the
 * viewer opens alongside the video (task 19.1). A muted viewer needs the
 * spoken words too, so these are shown verbatim in the bottom caption band
 * (task 19.2) and merged into the exported WebVTT alongside the sound cues
 * (task 19.4). `text` may contain embedded newlines for multi-line cues; the
 * player shows at most two lines.
 */
export interface DialogueCue {
  /** Start time in seconds. */
  start: number;
  /** End time in seconds (>= start). */
  end: number;
  /** The spoken text, possibly multi-line (lines joined by '\n'). */
  text: string;
}
