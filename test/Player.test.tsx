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
