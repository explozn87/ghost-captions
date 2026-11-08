// EventList — the text equivalent of the ghosts (task 9.2, Requirement 7.2).
//
// A table of every event: time, sound (family), direction when known, loudness
// word and mood (ominousness) word. Nothing here is only motion or colour — it
// is the same information as plain text, so a viewer can review it and a screen
// reader can read it (Req 7.2, honesty principle). Each row is a button that
// seeks the video; rows are keyboard operable with visible focus (Req 10.1).
//
// The current event is highlighted (`aria-current`) and announced politely via
// an `aria-live` region that names the current sound (Req 7.3); the live region
// is polite and single so it does not flood a screen reader.
//
// Speech events are shown as a small "speech" marker row, never as a ghost
// family (Req 3.2), so the list still accounts for the whole soundtrack.

import type { EventTrack, SoundEvent } from '../shared/types.ts';
import type { Lang, Strings } from '../i18n/index.ts';
import { soundNoun } from '../i18n/soundLabel.ts';
import { loudnessBand, ominousBand, formatClock } from './settings.ts';

export interface EventListProps {
  track: EventTrack;
  strings: Strings;
  lang: Lang;
  currentIndex: number;
  onSeek: (seconds: number) => void;
}

export function EventList({
  track,
  strings,
  lang,
  currentIndex,
  onSeek,
}: EventListProps): JSX.Element {
  const ui = strings.ui;
  const current = currentIndex >= 0 ? track.events[currentIndex] : undefined;

  return (
    <section className="eventlist" aria-label={ui.eventList}>
      <p className="sr-only" aria-live="polite">
        {current ? describe(current, strings, lang) : ''}
      </p>
      <table className="eventlist__table">
        <thead>
          <tr>
            <th scope="col">{ui.colTime}</th>
            <th scope="col">{ui.colSound}</th>
            <th scope="col">{ui.colDirection}</th>
            <th scope="col">{ui.colLoudness}</th>
            <th scope="col">{ui.colOminous}</th>
          </tr>
        </thead>
        <tbody>
          {track.events.map((event, i) => (
            <tr
              key={event.id}
              className={i === currentIndex ? 'eventlist__row eventlist__row--current' : 'eventlist__row'}
              aria-current={i === currentIndex ? 'true' : undefined}
            >
              <td>
                <button
                  type="button"
                  className="eventlist__seek"
                  onClick={() => onSeek(event.start)}
                  aria-label={`${formatClock(event.start)} ${soundName(event, strings, lang)}`}
                >
                  {formatClock(event.start)}
                </button>
              </td>
              <td>{soundName(event, strings, lang)}</td>
              <td>{directionWord(event, strings)}</td>
              <td>{event.isSpeech ? '—' : strings.loudness[loudnessBand(event.loudness)]}</td>
              <td>{event.isSpeech ? '—' : strings.ominous[ominousBand(event.ominous)]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * The sound's name: the speech marker for speech, otherwise the specific
 * classifier label when confident, else the family word (`soundNoun`, task
 * 15.1).
 */
function soundName(event: SoundEvent, strings: Strings, lang: Lang): string {
  return event.isSpeech ? strings.ui.speechMarker : soundNoun(event, strings, lang);
}

/** The direction word only for a known side; otherwise a dash (Req 4.4). */
function directionWord(event: SoundEvent, strings: Strings): string {
  if (event.side === 'left' || event.side === 'right') return strings.side[event.side];
  return '—';
}

/** A full spoken-form description for the aria-live current-event announcement. */
function describe(event: SoundEvent, strings: Strings, lang: Lang): string {
  const parts: string[] = [soundName(event, strings, lang)];
  if (event.side === 'left' || event.side === 'right') parts.push(strings.side[event.side]);
  if (!event.isSpeech) {
    parts.push(strings.loudness[loudnessBand(event.loudness)]);
    parts.push(strings.ominous[ominousBand(event.ominous)]);
  }
  return parts.join(strings.join);
}
