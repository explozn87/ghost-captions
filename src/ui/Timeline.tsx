// Timeline — one mark per event under the video (task 9.2, Requirement 7.1).
//
// Each non-speech event is a mark positioned by its start time and shaped by
// family (the family's silhouette path, so marks differ without colour). A
// mark is a real button: clicking or pressing it seeks the video to the event
// (keyboard operable with visible focus, Req 10.1). The current event is
// marked `aria-current` so it is both visible and announced.
//
// The strip is a thin SVG so marks scale with the width; speech events are
// omitted here because they are not ghosts (Req 3.2).

import type { EventTrack, SoundEvent } from '../shared/types.ts';
import type { Strings } from '../i18n/index.ts';
import { familyPathSource } from '../overlay/draw.ts';
import { spriteLabel } from '../overlay/layout.ts';
import { tables } from '../i18n/index.ts';
import type { Lang } from '../i18n/index.ts';

export interface TimelineProps {
  track: EventTrack;
  strings: Strings;
  lang: Lang;
  /** Index of the current event in `track.events`, or -1. */
  currentIndex: number;
  onSeek: (seconds: number) => void;
}

export function Timeline({
  track,
  strings,
  lang,
  currentIndex,
  onSeek,
}: TimelineProps): JSX.Element {
  const duration = Math.max(track.duration, 0.001);
  const s = tables[lang] ?? tables.en;

  return (
    <section className="timeline" aria-label={strings.ui.timeline}>
      <ol className="timeline__marks">
        {track.events.map((event, i) => {
          if (event.isSpeech) return null;
          const leftPct = (event.start / duration) * 100;
          const label = spriteLabel(event, s, lang);
          return (
            <li
              key={event.id}
              className="timeline__item"
              style={{ left: `${leftPct}%` }}
            >
              <button
                type="button"
                className="timeline__mark"
                aria-current={i === currentIndex ? 'true' : undefined}
                aria-label={`${label} — ${event.start.toFixed(1)}s`}
                title={label}
                onClick={() => onSeek(event.start)}
              >
                <FamilyGlyph event={event} />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** A tiny SVG of the event's family silhouette, for the mark. */
function FamilyGlyph({ event }: { event: SoundEvent }): JSX.Element {
  const d = familyPathSource[event.family];
  return (
    <svg viewBox="-1 -1 2 2" className="timeline__glyph" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
