import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Timeline } from '../src/ui/Timeline.tsx';
import { t } from '../src/i18n/index.ts';
import type { EventTrack, SoundEvent } from '../src/shared/types.ts';

// Task 28.4: a trimmed demo (a clip with `endAt`) is trimmed everywhere. The
// timeline strip spans 0..endAt and shows NO occurrence button at or after
// endAt, so the timeline agrees with the end card and the counter about the
// clip's length. A user file with no endAt keeps every mark.

afterEach(cleanup);

function ev(id: string, start: number, family: SoundEvent['family'] = 'gunshot'): SoundEvent {
  return {
    id,
    start,
    end: start + 1,
    family,
    isSpeech: false,
    overSpeech: false,
    topLabel: null,
    labelScore: 0,
    side: 'centre-unknown',
    sideTrack: [],
    sideConfidence: 0,
    loudness: 0.5,
    trend: 'steady',
    ominous: 0.3,
    beatPeriod: null,
  };
}

/** A track like the Sintel demo: events before and after a 25 s trim point. */
const track: EventTrack = {
  duration: 52,
  mono: false,
  labelsAvailable: true,
  events: [ev('a', 5), ev('b', 20), ev('c', 25.4), ev('d', 39), ev('e', 43.9)],
};

describe('Timeline endAt trimming (task 28.4)', () => {
  it('shows no occurrence button at or after endAt', () => {
    const strings = t('en');
    render(
      <Timeline track={track} strings={strings} lang="en" currentIndex={-1} endAt={25} onSeek={() => {}} />,
    );
    // Marks before 25 s remain; the three at 25.4 / 39 / 43.9 s are dropped.
    const marks = screen.getAllByRole('button');
    expect(marks).toHaveLength(2);
  });

  it('positions remaining marks against the 0..endAt span', () => {
    const strings = t('en');
    const { container } = render(
      <Timeline track={track} strings={strings} lang="en" currentIndex={-1} endAt={25} onSeek={() => {}} />,
    );
    // The 20 s mark sits at 20/25 = 80% of the span, not 20/52.
    const items = container.querySelectorAll('.timeline__item');
    const lefts = Array.from(items).map((el) => (el as HTMLElement).style.left);
    expect(lefts).toContain('80%');
  });

  it('keeps every mark when there is no endAt', () => {
    const strings = t('en');
    render(
      <Timeline track={track} strings={strings} lang="en" currentIndex={-1} onSeek={() => {}} />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });
});
