// Resolve the noun shown for a sound event (task 15.1).
//
// A ghost's silhouette is always chosen by its family, but the *word* a viewer
// reads — in the ghost label, the event list, the timeline tooltip and the
// WebVTT cue — should be the specific classifier label when we are confident
// in it, e.g. "Wind"/"바람" or "Thunder"/"천둥" rather than the broad family
// word "weather"/"날씨 소리". When we are not confident, we fall back to the
// family word; we never name an unknown event, and never name a speech event
// (speech belongs to ordinary captions, Req 3.2).
//
// This is the single source of truth for that decision so the overlay, the
// list, the timeline and the export can never disagree. English shows the
// YAMNet `display_name` as is; Korean looks the name up in `soundLabels.ko.ts`.

import type { SoundEvent } from '../shared/types.ts';
import type { Lang, Strings } from './index.ts';
import { ghostConfig, type GhostConfig } from '../config/ghost.config.ts';
import { soundLabelsKo } from './soundLabels.ko.ts';

/**
 * The localised form of a raw YAMNet `display_name`. English uses the name as
 * is; Korean uses the table, falling back to the English name if a label were
 * ever missing (the task-15.2 test guarantees it is not, but the fallback
 * keeps a future label from blanking the UI).
 */
export function localiseSpecificLabel(name: string, lang: Lang): string {
  if (lang === 'ko') return soundLabelsKo[name] ?? name;
  return name;
}

/**
 * True when an event should show its specific classifier label rather than the
 * family word: it is not speech, not unknown, carries a top label, and that
 * label's score reaches `specificLabelThreshold` (task 15.1). Families still
 * decide the ghost silhouette regardless of this choice.
 */
export function showsSpecificLabel(event: SoundEvent, cfg: GhostConfig = ghostConfig): boolean {
  return (
    !event.isSpeech &&
    event.family !== 'unknown' &&
    event.topLabel !== null &&
    event.labelScore >= cfg.specificLabelThreshold.value
  );
}

/**
 * The noun for an event: the localised specific label when confident, else the
 * family word (speech is handled by the caller, which shows its own marker).
 * The caller joins this with the direction and trend phrases.
 */
export function soundNoun(
  event: SoundEvent,
  strings: Strings,
  lang: Lang,
  cfg: GhostConfig = ghostConfig,
): string {
  if (showsSpecificLabel(event, cfg)) {
    return localiseSpecificLabel(event.topLabel as string, lang);
  }
  return strings.family[event.family];
}

/**
 * The evidence-row phrase for one counted sound occurrence (task 23.3), e.g.
 * "Gunshot, from the right". Reuses {@link soundNoun} for the noun (specific
 * label when confident, else family word) and the shared side phrase, so the
 * evidence list never disagrees with the ghost labels or the export. The time
 * prefix (m:ss) is added by the caller. An occurrence is never speech or
 * unknown here in a way that would blank the noun — its family already names
 * the sprite.
 */
export function occurrenceNoun(
  occ: {
    family: SoundEvent['family'];
    topLabel: string | null;
    labelScore: number;
    side: SoundEvent['side'];
  },
  strings: Strings,
  lang: Lang,
  cfg: GhostConfig = ghostConfig,
): string {
  // Reuse the event resolver by shaping a minimal SoundEvent-like object. Only
  // the fields soundNoun reads are needed.
  const shaped = {
    isSpeech: false,
    family: occ.family,
    topLabel: occ.topLabel,
    labelScore: occ.labelScore,
  } as SoundEvent;
  const noun = soundNoun(shaped, strings, lang, cfg);
  if (occ.side === 'left' || occ.side === 'right') {
    return `${noun}${strings.join}${strings.side[occ.side]}`;
  }
  return noun;
}
