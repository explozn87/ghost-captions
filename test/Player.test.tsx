import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Player } from '../src/ui/Player.tsx';
import { defaultSettings, type Settings, type ShowWhen } from '../src/ui/settings.ts';
import { t } from '../src/i18n/index.ts';
import type { EventTrack } from '../src/shared/types.ts';

// Task 21.4: muting/unmuting a jsdom video toggles the overlay's state in the
// default `auto` mode; `always` and `never` ignore the volume. The status chip
// (task 21.2) reflects the state in text, in English and Korean. The drawing
// itself is a no-op under jsdom (no 2D context), so these assert on the chip
// — the text equivalent — which is exactly the information the viewer reads.

const emptyTrack: EventTrack = {
  duration: 10,
  events: [],
  mono: false,
  labelsAvailable: true,
};

/** A track with two non-speech sound events and one speech event. */
const soundTrack: EventTrack = {
  duration: 20,
  mono: false,
  labelsAvailable: true,
  events: [
    {
      id: 'a', start: 1, end: 2, family: 'gunshot', isSpeech: false, overSpeech: false,
      topLabel: 'Gunshot', labelScore: 0.9, side: 'left', sideTrack: [], sideConfidence: 0.8,
      loudness: 0.9, trend: 'steady', ominous: 0.8, beatPeriod: null,
    },
    {
      id: 'speech', start: 2, end: 3, family: 'scream', isSpeech: true, overSpeech: false,
      topLabel: null, labelScore: 0, side: 'centre-unknown', sideTrack: [], sideConfidence: 0,
      loudness: 0.5, trend: 'steady', ominous: 0.3, beatPeriod: null,
    },
    {
      id: 'b', start: 4, end: 5, family: 'vehicle', isSpeech: false, overSpeech: false,
      topLabel: 'Car', labelScore: 0.7, side: 'right', sideTrack: [], sideConfidence: 0.7,
      loudness: 0.6, trend: 'steady', ominous: 0.3, beatPeriod: null,
    },
  ],
};

function settingsWith(showWhen: ShowWhen, lang: 'en' | 'ko' = 'en'): Settings {
  return { ...defaultSettings(lang, true), showWhen };
}

function getVideo(): HTMLVideoElement {
  return document.querySelector('video') as HTMLVideoElement;
}

/** Change the video's volume/mute and fire the native-style event. */
function setVolume(video: HTMLVideoElement, { muted, volume }: { muted: boolean; volume: number }) {
  act(() => {
    video.muted = muted;
    video.volume = volume;
    video.dispatchEvent(new Event('volumechange'));
  });
}

beforeEach(() => {
  if (!('createObjectURL' in URL)) {
    // @ts-expect-error test stub
    URL.createObjectURL = vi.fn(() => 'blob:mock');
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Player show-when chip (task 21.2, 21.4)', () => {
  it('starts muted and shows "sound off — ghosts on" in auto', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={emptyTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    // The demo starts muted (task 21.3).
    expect(getVideo().muted).toBe(true);
    expect(screen.getByText(strings.ui.chipSoundOff)).toBeInTheDocument();
  });

  it('switches the chip to "sound on — ghosts resting" when unmuted in auto', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={emptyTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    setVolume(getVideo(), { muted: false, volume: 1 });
    expect(screen.getByText(strings.ui.chipSoundOn)).toBeInTheDocument();
    expect(screen.queryByText(strings.ui.chipSoundOff)).toBeNull();
  });

  it('always mode ignores volume: the chip reads "always on" muted or not', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={emptyTrack} settings={settingsWith('always')} strings={strings} />,
    );
    expect(screen.getByText(strings.ui.chipAlways)).toBeInTheDocument();
    setVolume(getVideo(), { muted: false, volume: 1 });
    expect(screen.getByText(strings.ui.chipAlways)).toBeInTheDocument();
  });

  it('never mode still reports the sound state but keeps the overlay off', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={emptyTrack} settings={settingsWith('never')} strings={strings} />,
    );
    // Chip follows silence (soundOff while muted) even though the overlay is off.
    expect(screen.getByText(strings.ui.chipSoundOff)).toBeInTheDocument();
    setVolume(getVideo(), { muted: false, volume: 1 });
    expect(screen.getByText(strings.ui.chipSoundOn)).toBeInTheDocument();
  });

  it('shows the chip text in Korean', () => {
    const strings = t('ko');
    render(
      <Player src="blob:mock" track={emptyTrack} settings={settingsWith('auto', 'ko')} strings={strings} />,
    );
    expect(screen.getByText('🔇 소리 꺼짐 — 유령 등장')).toBeInTheDocument();
    setVolume(getVideo(), { muted: false, volume: 1 });
    expect(screen.getByText('🔊 소리 켜짐 — 유령 쉬는 중')).toBeInTheDocument();
  });

  it('clicking the chip opens settings at show-when', () => {
    const strings = t('en');
    const onOpenShowWhen = vi.fn();
    render(
      <Player
        src="blob:mock"
        track={emptyTrack}
        settings={settingsWith('auto')}
        strings={strings}
        onOpenShowWhen={onOpenShowWhen}
      />,
    );
    act(() => {
      screen.getByText(strings.ui.chipSoundOff).click();
    });
    expect(onOpenShowWhen).toHaveBeenCalledTimes(1);
  });
});


/** Set the video's currentTime and fire the native-style timeupdate event. */
function setTime(video: HTMLVideoElement, seconds: number) {
  act(() => {
    Object.defineProperty(video, 'currentTime', { value: seconds, writable: true, configurable: true });
    video.dispatchEvent(new Event('timeupdate'));
  });
}

/** Fire the ended event on the video. */
function fireEnded(video: HTMLVideoElement) {
  act(() => {
    Object.defineProperty(video, 'ended', { value: true, writable: true, configurable: true });
    video.dispatchEvent(new Event('ended'));
  });
}

/**
 * Click the loudest point occurrence's primary Compare button. Since task 28.1
 * the primary row reads "▶ Compare this first" (not "Compare"), so this names
 * it directly rather than taking the first "Compare" button.
 */
function clickPrimaryCompare(strings: ReturnType<typeof t>) {
  act(() => {
    screen.getByRole('button', { name: `▶ ${strings.ui.compareFirst}` }).click();
  });
}

describe('Player missed-sounds counter (task 22.5)', () => {
  it('shows the running count, rising as non-speech events start, speech excluded', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    // Before anything starts: 0.
    expect(screen.getByText('Sounds captions miss: 0')).toBeInTheDocument();
    // After the gunshot at t=1: 1.
    setTime(video, 1);
    expect(screen.getByText('Sounds captions miss: 1')).toBeInTheDocument();
    // The speech event at t=2 does not raise the count.
    setTime(video, 2.5);
    expect(screen.getByText('Sounds captions miss: 1')).toBeInTheDocument();
    // After the car at t=4: 2.
    setTime(video, 4);
    expect(screen.getByText('Sounds captions miss: 2')).toBeInTheDocument();
  });

  it('shows a brief "+1 <sound>" flash when the count rises', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    setTime(getVideo(), 1);
    // The newest sound uses its specific label "Gunshot".
    expect(screen.getByText('+1 Gunshot')).toBeInTheDocument();
  });

  it('becomes the end card with the total and a Watch again button when the video ends', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    setTime(video, 10); // both non-speech events have started
    fireEnded(video);
    expect(screen.getByText('Captions would have missed 2 sounds in this clip.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings.ui.watchAgain })).toBeInTheDocument();
    // Watch again restarts and clears the end card.
    act(() => {
      screen.getByRole('button', { name: strings.ui.watchAgain }).click();
    });
    expect(screen.queryByText('Captions would have missed 2 sounds in this clip.')).toBeNull();
  });

  it('hides the counter when the overlay is resting (auto, sound on)', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    setTime(getVideo(), 4);
    expect(screen.getByText('Sounds captions miss: 2')).toBeInTheDocument();
    // Unmute: overlay rests, the counter hides.
    setVolume(getVideo(), { muted: false, volume: 1 });
    expect(screen.queryByText('Sounds captions miss: 2')).toBeNull();
  });

  it('shows the counter text in Korean', () => {
    const strings = t('ko');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto', 'ko')} strings={strings} />,
    );
    setTime(getVideo(), 4);
    expect(screen.getByText('자막이 놓친 소리: 2')).toBeInTheDocument();
    fireEnded(getVideo());
    expect(screen.getByText('자막만 봤다면 이 영상에서 소리 2개를 놓쳤습니다.')).toBeInTheDocument();
  });
});

describe('Player end-card evidence, compare, endAt (tasks 25.1, 25.5, 25.6, 25.7)', () => {
  it('each evidence row has a Compare button alongside the seek row', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    // Two counted occurrences → two Compare buttons: the loudest point row's
    // primary "Compare this first" (task 28.1) and the other row's "Compare".
    expect(
      screen.getByRole('button', { name: `▶ ${strings.ui.compareFirst}` }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: strings.ui.compare })).toHaveLength(1);
  });

  it('a demo with no subtitle file spells out the dialogue-only basis (task 25.7)', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} isDemo />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    expect(screen.getByText(strings.ui.missedBasisDemoNoFile)).toBeInTheDocument();
  });

  it('a short demo ends at endAt and counts only occurrences before it (task 25.6)', () => {
    const strings = t('en');
    render(
      <Player
        src="blob:mock"
        track={soundTrack}
        settings={settingsWith('auto')}
        strings={strings}
        endAt={3}
        isDemo
      />,
    );
    const video = getVideo();
    // Reaching endAt (3 s) treats it as the end: only the gunshot (t=1) counts,
    // the car (t=4) is past endAt and never counted.
    setTime(video, 3);
    expect(screen.getByText('Captions would have missed 1 sounds in this clip.')).toBeInTheDocument();
  });

  it('clicking Compare shows the "Captions only" chip first (task 25.5)', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    clickPrimaryCompare(strings);
    expect(screen.getByText(strings.ui.compareCaptionsOnly)).toBeInTheDocument();
  });
});

describe('Player compare & first-click (tasks 27.1, 27.2)', () => {
  it('the loudest point occurrence row is tagged "Try this first" (task 27.2)', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    // The gunshot (loudness 0.9) is the loudest point occurrence, so its row
    // carries the tag. Only one row is tagged.
    const tags = screen.getAllByText(strings.ui.tryThisFirst);
    expect(tags).toHaveLength(1);
  });

  it('the captions-only pass shows the no-cue plate text (task 27.1)', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    clickPrimaryCompare(strings);
    // No subtitle file loaded, so the generic plate line is shown.
    expect(screen.getByText(strings.ui.compareCaptionsOnlyPlate)).toBeInTheDocument();
  });

  it('with a subtitle cue over the sound, the captions-only plate shows that cue (task 27.1)', () => {
    const strings = t('en');
    const dialogue = [{ start: 0.5, end: 2.5, text: 'Hello there' }];
    render(
      <Player
        src="blob:mock"
        track={soundTrack}
        dialogue={dialogue}
        settings={settingsWith('auto')}
        strings={strings}
      />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    // Compare the gunshot (start 1 s): a cue covers it, so its text shows.
    clickPrimaryCompare(strings);
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    expect(screen.queryByText(strings.ui.compareCaptionsOnlyPlate)).toBeNull();
  });

  it('shows the compare plate text in Korean (task 27.1)', () => {
    const strings = t('ko');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto', 'ko')} strings={strings} />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    act(() => {
      screen.getByRole('button', { name: `▶ ${strings.ui.compareFirst}` }).click();
    });
    expect(screen.getByText(strings.ui.compareCaptionsOnlyPlate)).toBeInTheDocument();
  });
});

// --- Task 28: the first click is clean and the numbers agree ---------------

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The project's stylesheet, read as text so CSS rules can be asserted. */
const appCss = readFileSync(join(process.cwd(), 'src/ui/app.css'), 'utf8');

describe('Player end-card first row (task 28.1)', () => {
  it('renders the "Try this first" tag OUTSIDE the label column', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    // The tag exists, and it is not nested inside any `.player__endcard-label`:
    // squeezed into the label column it forced the Korean label to wrap letter
    // by letter and made the row 169 px tall (task 28.1).
    const tag = screen.getByText(strings.ui.tryThisFirst);
    expect(tag).toBeInTheDocument();
    expect(tag.closest('.player__endcard-label')).toBeNull();
  });

  it('CSS gives the end-card label word-break: keep-all (task 28.1)', () => {
    // The raw stylesheet is loaded as text (Vite `?raw`); the label rule must
    // let the label wrap only at word boundaries. Match the declaration block
    // for `.player__endcard-label` and assert it carries `word-break: keep-all`.
    expect(appCss.length).toBeGreaterThan(0);
    const m = appCss.match(/\.player__endcard-label\s*\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/word-break:\s*keep-all/);
  });
});

describe("Player end-card headline count (task 28.2)", () => {
  it('derives the headline from the evidence list, not the live counter', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    // End the clip while the playhead is BEFORE the second occurrence: the live
    // counter would be 1, but the end card lists every occurrence up to the
    // clip's end, so the headline and the rows must both be 2 (task 28.2).
    setTime(video, 1.5); // only the gunshot (t=1) has started
    fireEnded(video);
    expect(screen.getByText('Captions would have missed 2 sounds in this clip.')).toBeInTheDocument();
    // The number equals the number of rendered evidence rows. Since task 29.3
    // the primary button reads "▶ Try first" (no longer containing "Compare"),
    // so count the Compare buttons by their shared class instead of by name.
    const rows = document.querySelectorAll('.player__endcard-compare');
    expect(rows).toHaveLength(2);
  });
});

describe('Player missed counter during compare (task 28.3)', () => {
  it('hides the missed-sounds counter during the captions-only pass', () => {
    const strings = t('en');
    const { container } = render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    // Start a compare: it opens in the captions-only pass.
    clickPrimaryCompare(strings);
    expect(screen.getByText(strings.ui.compareCaptionsOnly)).toBeInTheDocument();
    // The counter chip is hidden while "Captions only" is on screen (task 28.3).
    expect(container.querySelector('.player__missed')).toBeNull();
  });
});

describe('Player time display spans endAt (task 28.4)', () => {
  it('shows endAt as the duration, not the clip length', () => {
    const strings = t('en');
    render(
      <Player
        src="blob:mock"
        track={soundTrack}
        settings={settingsWith('auto')}
        strings={strings}
        endAt={3}
        isDemo
      />,
    );
    // The clip is 20 s but the demo is trimmed to 3 s: the readout reads 0:03.
    expect(screen.getByText('0:00 / 0:03')).toBeInTheDocument();
  });

  it('a user file with no endAt shows the full duration', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    // track.duration is 20 s.
    expect(screen.getByText('0:00 / 0:20')).toBeInTheDocument();
  });
});

// --- Task 29: the overlay is never stale, and the demo closes cleanly -------

/** Fire a `seeked` event after moving the playhead. */
function fireSeeked(video: HTMLVideoElement, seconds: number) {
  act(() => {
    Object.defineProperty(video, 'currentTime', { value: seconds, writable: true, configurable: true });
    video.dispatchEvent(new Event('seeked'));
  });
}

describe('Player redraws and follows time on seek (task 29.1)', () => {
  it('a seek updates the counter at once, from the sought time (not the pre-seek time)', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    // Play forward past both non-speech events.
    setTime(video, 10);
    expect(screen.getByText('Sounds captions miss: 2')).toBeInTheDocument();
    // Seek back before the car (t=4): the counter must follow the seek
    // immediately on `seeked`, not wait for the next timeupdate tick.
    fireSeeked(video, 1.5);
    expect(screen.getByText('Sounds captions miss: 1')).toBeInTheDocument();
    // Seek back before the gunshot: counter drops to 0 at once.
    fireSeeked(video, 0.5);
    expect(screen.getByText('Sounds captions miss: 0')).toBeInTheDocument();
  });
});

describe('Player hides native controls, keeps its own (task 29.2)', () => {
  it('the video has no native controls and the player shows its own play button', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    // Native controls are hidden so only the trimmed time shows (task 29.2).
    expect(getVideo().controls).toBe(false);
    // The player's own play/pause button is present and labelled (paused at
    // first, so it reads "Play").
    expect(screen.getByRole('button', { name: strings.ui.play })).toBeInTheDocument();
    // Its own seek slider is present and keyboard reachable.
    expect(screen.getByRole('slider', { name: strings.ui.seek })).toBeInTheDocument();
  });
});

describe('Player end-card primary button fits (task 29.3)', () => {
  it('the primary Compare button is short ("▶ Try first") and the label has keep-all', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    // The shortened primary label (task 29.3): "▶ Try first".
    expect(
      screen.getByRole('button', { name: `▶ ${strings.ui.compareFirst}` }),
    ).toBeInTheDocument();
    expect(strings.ui.compareFirst).toBe('Try first');
  });

  it('CSS stops the evidence list and rows scrolling sideways (task 29.3)', () => {
    const list = appCss.match(/\.player__endcard-list\s*\{([^}]*)\}/);
    expect(list).not.toBeNull();
    expect(list![1]).toMatch(/overflow-x:\s*hidden/);
    const rowline = appCss.match(/\.player__endcard-rowline\s*\{([^}]*)\}/);
    expect(rowline).not.toBeNull();
    expect(rowline![1]).toMatch(/min-width:\s*0/);
  });
});

describe('Player compare closing sentence (task 29.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // A deterministic wall clock so the compare state machine (driven by
    // performance.now) advances with the fake timers.
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    // Advance the mocked clock whenever timers run so the rAF-driven compare
    // step sees elapsed time pass.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      now += 1000; // 1 s per frame, so two 3 s passes finish quickly
      return setTimeout(() => cb(now), 0) as unknown as number;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the closing sentence naming the compared row after a compare finishes', () => {
    const strings = t('en');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    // Stub play/pause so the compare run can drive the video in jsdom.
    video.play = vi.fn(() => Promise.resolve());
    video.pause = vi.fn();
    setTime(video, 10);
    fireEnded(video);
    // Start the compare on the loudest point row (the gunshot).
    clickPrimaryCompare(strings);
    // Run the compare state machine to completion (two 3 s passes).
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // The end card returns with the one-sentence close naming the gunshot row.
    // The row's label is its occurrence noun (the specific classifier label
    // "Gunshot" when confident, plus the side phrase).
    const label = 'Gunshot, from the left';
    expect(
      screen.getByText(strings.ui.compareClosing.replace('{label}', label)),
    ).toBeInTheDocument();
  });

  it('shows the closing sentence in Korean', () => {
    const strings = t('ko');
    render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto', 'ko')} strings={strings} />,
    );
    const video = getVideo();
    video.play = vi.fn(() => Promise.resolve());
    video.pause = vi.fn();
    setTime(video, 10);
    fireEnded(video);
    clickPrimaryCompare(strings);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const label = 'Gunshot, 왼쪽에서';
    expect(
      screen.getByText(strings.ui.compareClosing.replace('{label}', label)),
    ).toBeInTheDocument();
  });
});

/** A track whose music occurrence has a trailing fragment past the demo end. */
const trailingMusicTrack: EventTrack = {
  duration: 52,
  mono: false,
  labelsAvailable: true,
  events: [
    {
      id: 'm1', start: 11, end: 23.3, family: 'calmMusic', isSpeech: false, overSpeech: false,
      topLabel: 'Music', labelScore: 0.9, side: 'centre-unknown', sideTrack: [], sideConfidence: 0,
      loudness: 0.6, trend: 'steady', ominous: 0.3, beatPeriod: null,
    },
    {
      // A trailing music fragment that STARTS after the trimmed demo end (25 s).
      id: 'm2', start: 26, end: 40, family: 'calmMusic', isSpeech: false, overSpeech: false,
      topLabel: 'Music', labelScore: 0.9, side: 'centre-unknown', sideTrack: [], sideConfidence: 0,
      loudness: 0.6, trend: 'steady', ominous: 0.3, beatPeriod: null,
    },
  ],
};

describe('Player end-card music span agrees with the picture (task 29.4)', () => {
  it('lists the music span ending where it is last shown, not stretched to endAt', () => {
    const strings = t('en');
    render(
      <Player
        src="blob:mock"
        track={trailingMusicTrack}
        settings={settingsWith('auto')}
        strings={strings}
        endAt={25}
        isDemo
      />,
    );
    const video = getVideo();
    setTime(video, 25);
    fireEnded(video);
    // The occurrence's last SHOWN moment is 23.3 (the trailing fragment starts
    // after endAt), so the row reads 0:11–0:23, not 0:11–0:25.
    expect(screen.getByText('0:11\u20130:23')).toBeInTheDocument();
    expect(screen.queryByText('0:11\u20130:25')).toBeNull();
  });
});

// --- Task 30: draw on every display frame -----------------------------------

describe('Player draws on every rAF, not the rVFC cadence (task 30.1)', () => {
  // A controllable requestAnimationFrame queue: callbacks pend until we flush
  // them, so a "display frame" is a single deterministic step. The overlay's
  // draw loop reports the time it drew via `onTimeUpdate` (called at the end of
  // `renderAt`), so that callback is our observable "the overlay redrew for
  // this time" signal — the drawing itself is a no-op under jsdom's stub
  // context, exactly as the other Player tests rely on.
  let rafQueue: FrameRequestCallback[];
  let now: number;

  beforeEach(() => {
    rafQueue = [];
    now = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length as unknown as number;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Run exactly one pending animation frame. */
  function flushFrame() {
    const cbs = rafQueue;
    rafQueue = [];
    now += 16;
    act(() => {
      for (const cb of cbs) cb(now);
    });
  }

  /** Move the playhead WITHOUT firing any event (as a raw seek/decode would). */
  function moveHead(video: HTMLVideoElement, seconds: number) {
    Object.defineProperty(video, 'currentTime', {
      value: seconds,
      writable: true,
      configurable: true,
    });
  }

  /** The last reported time (Array.prototype.at is not in the lib target). */
  function last(xs: number[]): number | undefined {
    return xs.length ? xs[xs.length - 1] : undefined;
  }

  it('redraws on each rAF even when requestVideoFrameCallback never fires', () => {
    const strings = t('en');
    const times: number[] = [];
    render(
      <Player
        src="blob:mock"
        track={soundTrack}
        settings={settingsWith('auto')}
        strings={strings}
        onTimeUpdate={(tt) => times.push(tt)}
      />,
    );
    const video = getVideo();
    // A video that OFFERS requestVideoFrameCallback but never invokes it — the
    // throttled case the review browser hit (fires ~once/second while a 24 fps
    // clip plays). If the overlay depended on it, the content would freeze.
    let rvfcCalls = 0;
    (video as unknown as { requestVideoFrameCallback: (cb: unknown) => number }).requestVideoFrameCallback =
      () => {
        rvfcCalls += 1;
        return rvfcCalls; // register, but never call the callback back
      };
    (video as unknown as { cancelVideoFrameCallback: (h: number) => void }).cancelVideoFrameCallback =
      () => undefined;

    // The draw loop is set up on mount; mounting scheduled the first rAF.
    // Advance the playhead and flush frames; each frame must report the current
    // time, so the overlay follows the video at the display frame rate and does
    // not wait on rVFC.
    moveHead(video, 1);
    flushFrame();
    expect(last(times)).toBe(1);
    moveHead(video, 2);
    flushFrame();
    expect(last(times)).toBe(2);
    moveHead(video, 3);
    flushFrame();
    expect(last(times)).toBe(3);
    // The overlay advanced on every animation frame, reading the current time
    // each tick (the leading 0 is the first mount frame, before the head
    // moved). It never relied on rVFC: that was offered but never fired, yet
    // every move was reflected.
    expect(times).toEqual([0, 1, 2, 3]);
    expect(rvfcCalls).toBeGreaterThanOrEqual(0);
  });

  it('reflects a seek on the very next frame (task 30.1)', () => {
    const strings = t('en');
    const times: number[] = [];
    render(
      <Player
        src="blob:mock"
        track={soundTrack}
        settings={settingsWith('auto')}
        strings={strings}
        onTimeUpdate={(tt) => times.push(tt)}
      />,
    );
    const video = getVideo();
    (video as unknown as { requestVideoFrameCallback: (cb: unknown) => number }).requestVideoFrameCallback =
      () => 1; // offered but never fires
    (video as unknown as { cancelVideoFrameCallback: (h: number) => void }).cancelVideoFrameCallback =
      () => undefined;

    // Play forward to 11 s (as before a Compare seek).
    moveHead(video, 11);
    flushFrame();
    expect(last(times)).toBe(11);
    // Seek back to 8.3 s while "playing" (no rVFC, no seeked event here): the
    // very next animation frame must draw the 8.3 s state, not the stale 11 s
    // one. Deriving the active ghosts from `video.currentTime` every frame is
    // what closes the gap the review browser saw.
    moveHead(video, 8.3);
    flushFrame();
    expect(last(times)).toBe(8.3);
    // And the gunshot window is reached on the next frames.
    moveHead(video, 8.9);
    flushFrame();
    expect(last(times)).toBe(8.9);
  });
});

// --- Task 31: the end card stays inside the video box on small screens ------

/** Extract the declaration block of a single CSS selector from `appCss`. */
function cssBlock(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = appCss.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`));
  expect(m, `selector ${selector} should exist in app.css`).not.toBeNull();
  return (m as RegExpMatchArray)[1] ?? '';
}

describe('Player end card fits the box on small screens (task 31.1)', () => {
  it('the end card is a bounded flex column inside the player box', () => {
    const endcard = cssBlock('.player__endcard');
    // A flex column, capped to the box with border-box sizing so the padding
    // counts inside the 100 % height — at 1366×768 and 1280×720 it no longer
    // runs past the bottom edge.
    expect(endcard).toMatch(/display:\s*flex/);
    expect(endcard).toMatch(/flex-direction:\s*column/);
    expect(endcard).toMatch(/box-sizing:\s*border-box/);
    expect(endcard).toMatch(/max-height:\s*100%/);
    // Inner padding keeps the headline's first line off the top edge: top/
    // bottom padding is at least 12 px (here 16 px).
    const pad = endcard.match(/padding:\s*([^;]+);/);
    expect(pad).not.toBeNull();
    const topPad = parseInt((pad as RegExpMatchArray)[1]!.trim().split(/\s+/)[0]!, 10);
    expect(topPad).toBeGreaterThanOrEqual(12);
  });

  it('the evidence list is the only scroll area and takes the remaining height', () => {
    const list = cssBlock('.player__endcard-list');
    // It grows/shrinks to fill the space the fixed items leave, with its own
    // scroll, so "Watch again" below it is never pushed off.
    expect(list).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(list).toMatch(/min-height:\s*0/);
    expect(list).toMatch(/overflow-y:\s*auto/);
    // No hard max-height any more: the flexbox bounds it to the box (task 31.1),
    // otherwise a short box overflows.
    expect(list).not.toMatch(/max-height/);
    // Padding at the bottom so the last row is never clipped at 1280×720.
    expect(list).toMatch(/padding:\s*0\s+0\s+\d/);
  });

  it('the headline and "Watch again" keep a fixed size (flex: none)', () => {
    expect(cssBlock('.player__endcard-text')).toMatch(/flex:\s*none/);
    expect(cssBlock('.player__endcard-again')).toMatch(/flex:\s*none/);
  });

  it('labels wrap at word boundaries and are never ellipsised', () => {
    const label = cssBlock('.player__endcard-label');
    // Wrap at word boundaries (task 28.1 kept) ...
    expect(label).toMatch(/word-break:\s*keep-all/);
    // ... and never truncate with an ellipsis or a line clamp (task 31.1): at
    // 1280×720 "총성, 오른쪽에서" was clipped to "총성, 오른쪽…".
    expect(label).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(label).not.toMatch(/-webkit-line-clamp/);
  });

  it('shrinks the headline one step before the list on a short box', () => {
    // A max-height media query drops the headline font so the count reads
    // cleanly before the list loses rows (task 31.1).
    expect(appCss).toMatch(/@media\s*\(max-height:\s*\d+px\)\s*\{[^}]*\.player__endcard-text\s*\{[^}]*font-size/);
  });

  it('renders the end card as a flex column with headline, list and "Watch again"', () => {
    const strings = t('en');
    const { container } = render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    const card = container.querySelector('.player__endcard');
    expect(card).not.toBeNull();
    // The fixed headline and "Watch again" are direct children of the card, so
    // the flex column keeps them pinned above and below the scrolling list.
    expect(card!.querySelector(':scope > .player__endcard-text')).not.toBeNull();
    expect(card!.querySelector(':scope > .player__endcard-list')).not.toBeNull();
    expect(card!.querySelector(':scope > .player__endcard-again')).not.toBeNull();
  });
});

// --- Task 32: the end card covers the picture only --------------------------

describe('Player end card covers the picture only (task 32.1)', () => {
  it('renders the end card inside .player__stage, not directly in .player', () => {
    const strings = t('en');
    const { container } = render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    const card = container.querySelector('.player__endcard');
    expect(card).not.toBeNull();
    // The card is a descendant of the stage (the element holding the video and
    // the overlay canvas), so its `inset: 0` equals the picture and the
    // progress bar below stays visible (task 32.1).
    const stage = container.querySelector('.player__stage');
    expect(stage).not.toBeNull();
    expect(stage!.contains(card)).toBe(true);
    // It is NOT a direct child of .player (where it used to sit alongside the
    // progress bar and so covered it).
    const player = container.querySelector('.player');
    expect(card!.closest('.player__stage')).toBe(stage);
    expect(player!.querySelector(':scope > .player__endcard')).toBeNull();
  });

  it('keeps the progress bar as a sibling of the stage, outside the end card', () => {
    const strings = t('en');
    const { container } = render(
      <Player src="blob:mock" track={soundTrack} settings={settingsWith('auto')} strings={strings} />,
    );
    const video = getVideo();
    setTime(video, 10);
    fireEnded(video);
    // The progress strip is not inside the stage (and so not inside the card),
    // so the end card never covers it.
    const stage = container.querySelector('.player__stage');
    const progress = container.querySelector('.player__progress');
    expect(stage).not.toBeNull();
    expect(progress).not.toBeNull();
    expect(stage!.contains(progress)).toBe(false);
  });

  it('CSS: the stage is a positioned ancestor so the card inset is the picture', () => {
    // The end card is `position: absolute; inset: 0`; it must resolve against
    // the stage, which is `position: relative`, so inset 0 equals the picture
    // box rather than the whole player (task 32.1).
    expect(cssBlock('.player__stage')).toMatch(/position:\s*relative/);
    expect(cssBlock('.player__endcard')).toMatch(/inset:\s*0/);
  });
});
