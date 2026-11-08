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

import type { Family, SoundEvent } from '../shared/types.ts';
import type { Lang, LoudnessBand, OminousBand } from '../i18n/index.ts';
import type { OverlaySettings } from '../overlay/layout.ts';

/** The user/OS preferences the watch screen holds. */
export interface Settings {
  lang: Lang;
  reducedMotion: boolean;
  /** Global ghost-size multiplier (Req 6.7). */
  sizeScale: number;
  /** Families the user has muted (Req 6.7). */
  mutedFamilies: ReadonlySet<Family>;
}

/** Sensible defaults; reduced motion follows the OS at first mount. */
export function defaultSettings(lang: Lang, prefersReducedMotion: boolean): Settings {
  return {
    lang,
    reducedMotion: prefersReducedMotion,
    sizeScale: 1,
    mutedFamilies: new Set<Family>(),
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
