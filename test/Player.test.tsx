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
      id: 'a', start: 1, end: 2, family: 'gunshot', isSpeech: false,
      topLabel: 'Gunshot', labelScore: 0.9, side: 'left', sideTrack: [], sideConfidence: 0.8,
      loudness: 0.9, trend: 'steady', ominous: 0.8, beatPeriod: null,
    },
    {
      id: 'speech', start: 2, end: 3, family: 'scream', isSpeech: true,
      topLabel: null, labelScore: 0, side: 'centre-unknown', sideTrack: [], sideConfidence: 0,
      loudness: 0.5, trend: 'steady', ominous: 0.3, beatPeriod: null,
    },
    {
      id: 'b', start: 4, end: 5, family: 'vehicle', isSpeech: false,
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
    // Two counted occurrences → two Compare buttons.
    const compares = screen.getAllByRole('button', { name: strings.ui.compare });
    expect(compares).toHaveLength(2);
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
    act(() => {
      screen.getAllByRole('button', { name: strings.ui.compare })[0]!.click();
    });
    expect(screen.getByText(strings.ui.compareCaptionsOnly)).toBeInTheDocument();
  });
});
