// English string table — the default UI language (Requirement 9.1, steering).
//
// Keys are identical to `ko.ts` by sharing the `Strings` contract; the
// key-parity test enforces this at runtime as well. The family/side/trend
// phrases match what the WebVTT export emitted in task 6 so moving the table
// here does not change any cue text.

import type { Strings } from './strings.ts';

export const en: Strings = {
  languageName: 'English',

  family: {
    footsteps: 'footsteps',
    door: 'door',
    knock: 'knock',
    scream: 'scream',
    laughter: 'laughter',
    crying: 'crying',
    tenseMusic: 'tense music',
    calmMusic: 'calm music',
    singing: 'singing',
    impact: 'impact',
    gunshot: 'gunshot',
    vehicle: 'vehicle',
    siren: 'siren',
    animal: 'animal',
    wind: 'wind',
    rain: 'rain',
    thunder: 'thunder',
    fire: 'fire',
    glass: 'breaking glass',
    unknown: 'unknown sound',
  },
  side: {
    left: 'from the left',
    right: 'from the right',
  },
  trend: {
    rising: 'getting louder',
    falling: 'getting quieter',
  },
  join: ', ',

  loudness: {
    quiet: 'quiet',
    medium: 'medium',
    loud: 'loud',
  },
  ominous: {
    calm: 'calm',
    uneasy: 'uneasy',
    dread: 'dread',
  },

  licence: {
    CC0: 'CC0 1.0',
    'CC-BY-3': 'CC BY 3.0',
    'CC-BY-4': 'CC BY 4.0',
    'public-domain': 'Public domain',
  },

  ui: {
    appName: 'Ghost Captions',
    tagline: 'Shows the sounds that captions leave out — mute the video and the ghosts come out.',

    dropPrompt: 'Drop a video or audio file here',
    dropHint: 'Everything stays on your device — nothing is uploaded.',
    chooseFile: 'Choose a file',
    orPickDemo: 'or pick a demo clip',

    demoHeading: 'Demo clips',
    demoBy: 'by',
    demoLicencePrefix: 'Licence:',
    demoSource: 'Source',
    demoLoadError: 'Could not load this demo clip. Please try another.',

    analysing: 'Listening for ghosts…',
    analysingHint: 'Analysing the audio so ghosts appear exactly in time.',

    monoNotice: 'This clip is mono, so direction is unavailable; every ghost appears in the centre.',
    labelsUnavailable: 'Sound labels are unavailable, so sounds are shown as unknown ghosts.',
    decodeErrorPrefix: 'Could not open',
    decodeErrorSuggest: 'Try a common format such as MP4 (H.264 + AAC) or WebM.',

    timeline: 'Timeline',
    eventList: 'Sound events',
    exportCaptions: 'Export captions',
    settings: 'Settings',
    aboutGhosts: 'About the ghosts',
    reducedMotion: 'Reduced motion',
    ghostSize: 'Ghost size',
    sizeSmall: 'Small',
    sizeNormal: 'Normal',
    sizeLarge: 'Large',
    muteFamily: 'Mute this sound',
    language: 'Language',
    hideSoundTypes: 'Hide sound types',
    showSoundList: 'Show sound list',

    addSubtitles: 'Add dialogue subtitles',
    replaceSubtitles: 'Replace dialogue subtitles',
    burnedInSubtitles: 'Video has burned-in subtitles',

    showGhostsWhen: 'Show ghosts',
    showWhenAlways: 'Always (I cannot hear the sound)',
    showWhenAuto: 'Only when the sound is off',
    showWhenNever: 'Never',
    showWhenHelp:
      'Choose “Always” if you cannot hear the sound even when it plays. By default the ghosts appear only while the video is muted and rest when you turn the sound on.',
    chipAlways: 'Ghosts always on',
    chipSoundOff: '🔇 Sound off — ghosts on',
    chipSoundOn: '🔊 Sound on — ghosts resting',
    fullscreen: 'Full screen (with ghosts)',
    exitFullscreen: 'Exit full screen',

    missedCount: 'Sounds captions miss: {n}',
    missedPlusOne: '+1 {sound}',
    missedEndCard: 'Captions would have missed {n} sounds in this clip.',
    missedBasisDialogueOnly: 'Counted against dialogue-only captions.',
    missedBasisWithFile: 'Counted against the subtitles you loaded.',
    missedListHeading: 'Sounds counted',
    watchAgain: 'Watch again',

    colTime: 'Time',
    colSound: 'Sound',
    colDirection: 'Direction',
    colLoudness: 'Loudness',
    colOminous: 'Mood',
    speechMarker: 'speech',

    aboutMeasured:
      'Direction, loudness, tension and rhythm are measured from the audio signal on your device.',
    aboutGuessed:
      'What each sound is comes from an on-device classifier and can be wrong; an unsure sound is shown as an unknown ghost, never a guessed label.',
    aboutLimits:
      'Mixed film soundtracks often hide direction; overlapping sounds are shown as one ghost.',
    aboutNotReplacement:
      'Ghost Captions does not replace professional captioning or audio description.',
  },
};
