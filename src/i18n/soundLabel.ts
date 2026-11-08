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
