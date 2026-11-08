// The shape of one language's string table (task 7.1).
//
// Every user-facing string in the app lives in a translation table, none
// hard-coded in components (Requirement 9.2). English is the default shown to
// judges; Korean is a full second language (Requirement 9.1, steering).
//
// The `Strings` interface is the single contract both `en.ts` and `ko.ts`
// implement. Because both files are typed as `Strings`, TypeScript already
// refuses a missing or extra key at compile time; the runtime key-parity test
// (task 7) is a second, machine-checked floor that also catches empty values.
//
// Three groups of strings, matching the three places text appears:
//   - `family` / `side` / `trend`: the ghost-label and export phrases, shared
//     with the WebVTT export (Requirement 8) and the overlay labels
//     (Requirement 6.4). These keys line up with the data types in
//     `shared/types.ts` so a label is looked up directly by family/side/trend.
//   - `loudness` / `ominous`: the words the event list uses for the measured
//     loudness and ominousness bands (Requirement 7.2).
//   - `ui`: every other on-screen string (buttons, panels, notices).

import type { Family, Side, Trend } from '../shared/types.ts';

/** Loudness band words for the event list (Requirement 7.2). */
export type LoudnessBand = 'quiet' | 'medium' | 'loud';
/** Ominousness band words for the event list (Requirement 7.2). */
export type OminousBand = 'calm' | 'uneasy' | 'dread';

export interface Strings {
  /** The language's own name, shown in the language switcher. */
  languageName: string;

  /** Ghost family names, read inside a cue and drawn as the ghost label. */
  family: Record<Family, string>;
  /** Direction phrase for a known side; `centre-unknown` is never printed. */
  side: Record<Exclude<Side, 'centre-unknown'>, string>;
  /** Loudness trend phrase; `steady` is omitted from labels and cues. */
  trend: Record<Exclude<Trend, 'steady'>, string>;
  /** Joins the parts of one label/cue, e.g. "footsteps, from the left". */
  join: string;

  /** Loudness band words for the event list (Requirement 7.2). */
  loudness: Record<LoudnessBand, string>;
  /** Ominousness band words for the event list (Requirement 7.2). */
  ominous: Record<OminousBand, string>;

  /** Every other on-screen string. */
  ui: {
    appName: string;

    // Intake (Requirement 1).
    dropPrompt: string;
    dropHint: string;
    chooseFile: string;
    orPickDemo: string;

    // Analysing (Requirement 2).
    analysing: string;
    analysingHint: string;

    // Notices (Requirements 2.2, 2.5).
    monoNotice: string;
    labelsUnavailable: string;
    decodeErrorPrefix: string;
    decodeErrorSuggest: string;

    // Watch screen controls (Requirements 6.7, 7, 8, 10).
    timeline: string;
    eventList: string;
    exportCaptions: string;
    settings: string;
    aboutGhosts: string;
    reducedMotion: string;
    ghostSize: string;
    muteFamily: string;
    language: string;

    // Event list columns/labels (Requirement 7.2).
    colTime: string;
    colSound: string;
    colDirection: string;
    colLoudness: string;
    colOminous: string;
    speechMarker: string;

    // About-the-ghosts honesty panel (Requirement 11).
    aboutMeasured: string;
    aboutGuessed: string;
    aboutLimits: string;
    aboutNotReplacement: string;
  };
}
