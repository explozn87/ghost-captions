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
import type { SpdxLicence } from '../ui/demoClips.ts';

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

  /**
   * Short display name for each redistributable demo-clip licence (NFR-4),
   * shown next to a clip in the picker and while it plays (Req 1.3).
   */
  licence: Record<SpdxLicence, string>;

  /** Every other on-screen string. */
  ui: {
    appName: string;
    /** One line under the title: why the app exists. */
    tagline: string;

    // Intake (Requirement 1).
    dropPrompt: string;
    dropHint: string;
    chooseFile: string;
    orPickDemo: string;

    // Demo picker (Requirement 1.3, NFR-4).
    demoHeading: string;
    demoBy: string;
    demoLicencePrefix: string;
    demoSource: string;
    demoLoadError: string;

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
    /** Ghost-size options: small/normal/large (24/30/36%) (task 17.1). */
    sizeSmall: string;
    sizeNormal: string;
    sizeLarge: string;
    muteFamily: string;
    language: string;
    /** Disclosure label for the per-family hide toggles inside Settings (task 20.3). */
    hideSoundTypes: string;
    /** Disclosure label that reveals the collapsed sound list on the watch screen (task 20.3). */
    showSoundList: string;

    // Dialogue subtitles (task 19).
    /** Button to add a subtitle file after the video (task 19.1). */
    addSubtitles: string;
    /** Button label once a subtitle file is loaded (task 19.1). */
    replaceSubtitles: string;
    /** Settings toggle for videos with burned-in subtitles (task 19.3). */
    burnedInSubtitles: string;

    // Show-when: ghosts on when the sound is off (task 21).
    /** Settings label for the show-when choice (task 21.1). */
    showGhostsWhen: string;
    /** Show-when option labels (task 21.1). */
    showWhenAlways: string;
    showWhenAuto: string;
    showWhenNever: string;
    /** A one-line explanation under the show-when control; `always` first (task 21.1). */
    showWhenHelp: string;
    /** Status-chip messages (task 21.2); text carries the meaning, not only the icon. */
    chipAlways: string;
    chipSoundOff: string;
    chipSoundOn: string;
    fullscreen: string;
    exitFullscreen: string;

    // "Sounds the captions missed" counter (task 22.5). `{n}` is replaced with
    // the count; `{sound}` with the newest missed sound's name.
    /** The running counter chip, e.g. "Sounds captions miss: 7". */
    missedCount: string;
    /** The brief "+1 <sound>" flash when the counter rises, e.g. "+1 Gunshot". */
    missedPlusOne: string;
    /** The end card shown when the video finishes, e.g. "Captions would have missed 7 sounds in this clip." */
    missedEndCard: string;
    /** The basis line under the end-card number when no subtitle file is loaded (task 23.2). */
    missedBasisDialogueOnly: string;
    /** The basis line under the end-card number when a subtitle file is loaded (task 23.2). */
    missedBasisWithFile: string;
    /** Heading above the end-card evidence list of counted occurrences (task 23.3). */
    missedListHeading: string;
    /** The "watch again" button on the end card. */
    watchAgain: string;
    /** The "Compare" button on each end-card evidence row (task 25.5). */
    compare: string;
    /** The chip shown during the captions-only pass of a compare (task 25.5). */
    compareCaptionsOnly: string;
    /** The chip shown during the with-ghosts pass of a compare (task 25.5). */
    compareWithGhosts: string;
    /**
     * The caption-band plate shown during the captions-only pass of a compare
     * (task 27.1), spelling out that the captions say nothing about this sound.
     * Shown only when no loaded subtitle cue already covers the moment.
     */
    compareCaptionsOnlyPlate: string;
    /** The step marker on a compare chip, e.g. "1/2" (task 27.1). `{step}`/`{total}`. */
    compareStep: string;
    /** The "Try this first" tag on the loudest end-card evidence row (task 27.2). */
    tryThisFirst: string;
    /**
     * The primary Compare button's label on the loudest evidence row (task
     * 28.1): the "Try this first" meaning lives here (e.g. "▶ Compare this
     * first") so it no longer crowds the label column next to the button.
     */
    compareFirst: string;
    /**
     * The basis line under the end-card number for a demo clip with no subtitle
     * file (task 25.7), spelling out that dialogue-only captions were assumed.
     */
    missedBasisDemoNoFile: string;

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
