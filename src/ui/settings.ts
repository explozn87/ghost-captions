// Shared UI settings and small presentation helpers (task 9).
//
// `Settings` is the single bag of user/OS preferences the watch screen reads:
// language, reduced motion, ghost size and muted families (Requirements 6.6,
// 6.7, 9.1, 10.4). The overlay's `OverlaySettings` is derived from it so the
// layout stays decoupled from the UI.
//
// `loudnessBand` / `ominousBand` turn the measured 0..1 numbers into the words
// the event list and screen readers use (Req 7.2), so nothing on screen is a
// bare number the viewer must interpret.

import type { DialogueCue, Family, SoundEvent } from '../shared/types.ts';
import type { Lang, LoudnessBand, OminousBand } from '../i18n/index.ts';
import type { OverlaySettings } from '../overlay/layout.ts';
import { missedOccurrences, type Occurrence } from '../events/occurrences.ts';

/**
 * When the sound overlay (ghosts, edge fog, sound labels) is shown (task 21.1):
 *   - `auto`   — shown only while the video is muted or at zero volume, so the
 *                ghosts come on when the sound is off and rest when you can
 *                hear; the metaphor itself ("captions for when the sound is
 *                off") is the pitch;
 *   - `always` — shown whatever the volume, for viewers who cannot hear the
 *                sound even when it plays (deaf and hard-of-hearing viewers);
 *   - `never`  — the overlay is off; only dialogue subtitles and the text list
 *                remain.
 * Dialogue subtitles (task 19) are never affected by this choice.
 */
export type ShowWhen = 'auto' | 'always' | 'never';

/** The show-when choices in display order; `always` is explained first (task 21.1). */
export const SHOW_WHEN_CHOICES: ShowWhen[] = ['always', 'auto', 'never'];

/** The user/OS preferences the watch screen holds. */
export interface Settings {
  lang: Lang;
  reducedMotion: boolean;
  /** Global ghost-size multiplier (Req 6.7). */
  sizeScale: number;
  /** Families the user has muted (Req 6.7). */
  mutedFamilies: ReadonlySet<Family>;
  /**
   * Whether the video already has subtitles burned into the picture (task
   * 19.3). When true the reserved bottom band is enlarged so ghosts and fog
   * stay clear of the baked-in text.
   */
  burnedInSubtitles: boolean;
  /**
   * When the sound overlay is shown (task 21.1): `auto` shows ghosts only while
   * the sound is off, `always` keeps them on, `never` hides them. Default
   * `auto`. Dialogue subtitles ignore this.
   */
  showWhen: ShowWhen;
}

/** Sensible defaults; reduced motion follows the OS at first mount. */
export function defaultSettings(lang: Lang, prefersReducedMotion: boolean): Settings {
  return {
    lang,
    reducedMotion: prefersReducedMotion,
    sizeScale: 1,
    mutedFamilies: new Set<Family>(),
    burnedInSubtitles: false,
    showWhen: 'auto',
  };
}

/**
 * The three ghost-size choices offered in Settings (task 17.1): small, normal
 * and large map to 24% / 30% / 36% of the viewport's shorter side. The base
 * ghost diameter is 30% (`ghostDiameterFrac`), so these are sizeScale
 * multipliers 0.8 / 1.0 / 1.2.
 */
export type SizeChoice = 'small' | 'normal' | 'large';
export const SIZE_SCALES: Record<SizeChoice, number> = {
  small: 0.8, // 24% of the shorter side (0.8 × 30%)
  normal: 1.0, // 30%
  large: 1.2, // 36%
};
export const SIZE_CHOICES: SizeChoice[] = ['small', 'normal', 'large'];

/**
 * The reserved bottom caption band when the viewer declares the video already
 * has subtitles burned into the picture (task 19.3): 22% of the frame, so
 * ghosts and fog stay clear of the baked-in text even without a subtitle file.
 */
export const BURNED_IN_CAPTION_BAND = 0.22;

/** The size choice nearest a stored sizeScale, for showing the current option. */
export function sizeChoiceFor(sizeScale: number): SizeChoice {
  let best: SizeChoice = 'normal';
  let bestDist = Infinity;
  for (const choice of SIZE_CHOICES) {
    const d = Math.abs(SIZE_SCALES[choice] - sizeScale);
    if (d < bestDist) {
      bestDist = d;
      best = choice;
    }
  }
  return best;
}

/** Derive the overlay's view of the settings (what `layout()` needs). */
export function toOverlaySettings(settings: Settings): OverlaySettings {
  return {
    lang: settings.lang,
    reducedMotion: settings.reducedMotion,
    sizeScale: settings.sizeScale,
    mutedFamilies: settings.mutedFamilies,
  };
}

/** Band an event's 0..1 loudness into a word (Req 7.2). */
export function loudnessBand(loudness: number): LoudnessBand {
  if (loudness < 1 / 3) return 'quiet';
  if (loudness < 2 / 3) return 'medium';
  return 'loud';
}

/** Band an event's 0..1 ominousness into a word (Req 7.2). */
export function ominousBand(ominous: number): OminousBand {
  if (ominous < 1 / 3) return 'calm';
  if (ominous < 2 / 3) return 'uneasy';
  return 'dread';
}

/** Toggle a family in a muted set, returning a new set (immutably). */
export function toggleMuted(set: ReadonlySet<Family>, family: Family): Set<Family> {
  const next = new Set(set);
  if (next.has(family)) next.delete(family);
  else next.add(family);
  return next;
}

/** Format a time in seconds as `M:SS` for the event list and timeline. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

/** The current event in the list given the playhead: last event that started. */
export function currentEventIndex(events: readonly SoundEvent[], t: number): number {
  let idx = -1;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.start <= t && e.end > t) idx = i;
  }
  return idx;
}

/**
 * How many sound OCCURRENCES the ordinary captions would have missed by time
 * `t` (task 22.5, counting occurrences not raw events since task 23.1): the
 * count of shown, honest-checked occurrences whose start is at or before `t`.
 * "Shown" means the occurrence is actually drawn for the viewer:
 *   - speech is excluded (spoken words belong to ordinary captions, Req 3.2);
 *   - an occurrence of a family the viewer has hidden ("Hide sound types") is
 *     excluded;
 *   - unknown events hidden by the unknown rule never reach the track in the
 *     first place (`showUnknownEvents` off, task 20.1), so the track already
 *     reflects that and this function needs no extra check for it.
 *
 * When `dialogue` is provided an occurrence is NOT counted if a loaded subtitle
 * cue overlapping it already describes a sound (task 23.2), so the number is
 * always "sounds the loaded captions did not already cover".
 *
 * Pure: it reads only the events, the time, the settings and the dialogue, so
 * the counter chip, the "+1" flash and the end card (tasks 22.5, 23) are all
 * driven by a tested function rather than ad-hoc counting in the component.
 */
export function missedCount(
  events: readonly SoundEvent[],
  t: number,
  settings: Pick<Settings, 'mutedFamilies'>,
  dialogue: readonly DialogueCue[] = [],
): number {
  return missedOccurrences(events, t, settings, dialogue).length;
}

/**
 * The most recent counted missed OCCURRENCE at or before time `t` (task 22.5,
 * occurrence-based since task 23.1), or null when none — used to name the
 * newest missed sound ("+1 Gunshot") when the counter increases. Honours the
 * same shown and honest-check rules as {@link missedCount}.
 */
export function latestMissedOccurrence(
  events: readonly SoundEvent[],
  t: number,
  settings: Pick<Settings, 'mutedFamilies'>,
  dialogue: readonly DialogueCue[] = [],
): Occurrence | null {
  const missed = missedOccurrences(events, t, settings, dialogue);
  let latest: Occurrence | null = null;
  for (const occ of missed) {
    if (latest === null || occ.start >= latest.start) latest = occ;
  }
  return latest;
}

/**
 * A SoundEvent-shaped view of the newest missed occurrence (task 22.5), so the
 * caller can reuse {@link import('../i18n/soundLabel.ts').soundNoun} to name
 * it. Returns null when no occurrence is counted yet. The loudest event of the
 * occurrence is returned, which already carries the occurrence's family, label
 * and side.
 */
export function latestMissedEvent(
  events: readonly SoundEvent[],
  t: number,
  settings: Pick<Settings, 'mutedFamilies'>,
  dialogue: readonly DialogueCue[] = [],
): SoundEvent | null {
  const occ = latestMissedOccurrence(events, t, settings, dialogue);
  if (!occ) return null;
  // The occurrence's loudest event names it; find it among its events.
  let loudest = occ.events[0] ?? null;
  for (const e of occ.events) {
    if (loudest === null || e.loudness > loudest.loudness) loudest = e;
  }
  return loudest;
}

/** A video is "silent" to the viewer when muted or at zero volume (task 21.1). */
export function isVideoSilent(muted: boolean, volume: number): boolean {
  return muted || volume <= 0;
}

/**
 * Whether the sound overlay (ghosts, edge fog, sound labels) should be shown,
 * given the show-when choice and whether the video is currently silent (task
 * 21.1). This is the pure decision the Player animates towards; it never
 * touches dialogue subtitles, which stay on regardless.
 *   - `always` → always shown;
 *   - `never`  → never shown;
 *   - `auto`   → shown only while the video is silent (muted or zero volume).
 */
export function overlayShouldShow(showWhen: ShowWhen, silent: boolean): boolean {
  if (showWhen === 'always') return true;
  if (showWhen === 'never') return false;
  return silent;
}

/**
 * Which status-chip message the player shows for the current state (task 21.2):
 *   - `always`     → "Ghosts always on";
 *   - `soundOff`   → "🔇 Sound off — ghosts on" (auto/never while silent);
 *   - `soundOn`    → "🔊 Sound on — ghosts resting" (auto/never while audible).
 * The caller looks the key up in the i18n table so the text (not only the icon)
 * carries the information in both languages.
 */
export type ChipState = 'always' | 'soundOff' | 'soundOn';

/** The chip state for a given show-when choice and silence (task 21.2). */
export function chipStateFor(showWhen: ShowWhen, silent: boolean): ChipState {
  if (showWhen === 'always') return 'always';
  return silent ? 'soundOff' : 'soundOn';
}
