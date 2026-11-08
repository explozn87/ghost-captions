import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  occurrences,
  groupKey,
  cueDescribesSound,
  occurrenceIsMissed,
  missedOccurrences,
  missedBasis,
  isShownEvent,
  occurrenceTimeLabel,
  occurrenceShownEnd,
} from '../src/events/occurrences.ts';
import type { DialogueCue, Family, SoundEvent } from '../src/shared/types.ts';

// Task 23.1/23.2: group shown events into sound OCCURRENCES and count them
// honestly against the loaded subtitles. These are pure functions, so every
// rule is covered directly and by property.

function ev(over: Partial<SoundEvent> = {}): SoundEvent {
  return {
    id: 'e',
    start: 0,
    end: 1,
    family: 'gunshot',
    isSpeech: false,
    topLabel: null,
    labelScore: 0,
    side: 'centre-unknown',
    sideTrack: [],
    sideConfidence: 0,
    loudness: 0.5,
    trend: 'steady',
    ominous: 0.5,
    beatPeriod: null,
    ...over,
  };
}

const noMute = { mutedFamilies: new Set<Family>() };

describe('occurrences: group key (task 23.1, 25.1)', () => {
  it('folds the two instrumental music families into one "music" group', () => {
    expect(groupKey('tenseMusic')).toBe('music');
    expect(groupKey('calmMusic')).toBe('music');
  });

  it('choir/singing is its own group again (task 25.1), not folded into music', () => {
    expect(groupKey('singing')).toBe('singing');
  });

  it('every non-music family is its own group', () => {
    expect(groupKey('gunshot')).toBe('gunshot');
    expect(groupKey('wind')).toBe('wind');
    expect(groupKey('footsteps')).toBe('footsteps');
  });
});

describe('occurrences: grouping (task 23.1)', () => {
  it('folds touching instrumental-music events into one occurrence', () => {
    const events = [
      ev({ id: 'a', family: 'calmMusic', start: 10, end: 11 }),
      ev({ id: 'b', family: 'tenseMusic', start: 11, end: 12 }),
      ev({ id: 'c', family: 'tenseMusic', start: 12.5, end: 14 }),
    ];
    const occ = occurrences(events, noMute);
    expect(occ).toHaveLength(1);
    expect(occ[0]!.group).toBe('music');
    expect(occ[0]!.start).toBe(10);
    expect(occ[0]!.end).toBe(14);
  });

  it('a singing/choir event stays its own occurrence beside music (task 25.1)', () => {
    const events = [
      ev({ id: 'a', family: 'calmMusic', start: 10, end: 12 }),
      ev({ id: 'c', family: 'singing', start: 10.5, end: 13 }),
    ];
    const occ = occurrences(events, noMute);
    expect(occ).toHaveLength(2);
    expect(new Set(occ.map((o) => o.group))).toEqual(new Set(['music', 'singing']));
  });

  it('keeps two same-family events far apart as separate occurrences', () => {
    const events = [
      ev({ id: 'a', family: 'gunshot', start: 0, end: 1 }),
      ev({ id: 'b', family: 'gunshot', start: 10, end: 11 }),
    ];
    expect(occurrences(events, noMute)).toHaveLength(2);
  });

  it('a trend change inside an occurrence updates its label but does not split it', () => {
    // One sound the pipeline split on a loudness-trend change into touching
    // pieces; the louder piece names the occurrence.
    const events = [
      ev({ id: 'a', family: 'calmMusic', start: 10, end: 12, loudness: 0.4, trend: 'rising', topLabel: 'Music', labelScore: 0.6 }),
      ev({ id: 'b', family: 'calmMusic', start: 12, end: 14, loudness: 0.8, trend: 'falling', topLabel: 'Orchestra', labelScore: 0.9 }),
    ];
    const occ = occurrences(events, noMute);
    expect(occ).toHaveLength(1);
    // The louder piece names it (one label per occurrence).
    expect(occ[0]!.topLabel).toBe('Orchestra');
    expect(occ[0]!.trend).toBe('falling');
  });

  it('speech and muted families are not shown', () => {
    expect(isShownEvent(ev({ isSpeech: true }), new Set())).toBe(false);
    expect(isShownEvent(ev({ family: 'wind' }), new Set<Family>(['wind']))).toBe(false);
    expect(isShownEvent(ev(), new Set())).toBe(true);
  });
});

describe('occurrences: properties (task 23.1)', () => {
  it('splitting one event into touching pieces never changes the count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }), // number of pieces
        fc.double({ min: 0, max: 50, noNaN: true }), // base start
        (pieces, start) => {
          const span = 6; // total length
          const whole = [ev({ id: 'w', family: 'gunshot', start, end: start + span })];
          const split: SoundEvent[] = [];
          const step = span / pieces;
          for (let i = 0; i < pieces; i++) {
            split.push(
              ev({ id: `p${i}`, family: 'gunshot', start: start + i * step, end: start + (i + 1) * step }),
            );
          }
          const nWhole = occurrences(whole, noMute).length;
          const nSplit = occurrences(split, noMute).length;
          return nWhole === 1 && nSplit === 1;
        },
      ),
    );
  });

  it('a trend change never increments the count', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<SoundEvent['trend']>('rising', 'falling', 'steady'), { minLength: 1, maxLength: 6 }),
        (trends) => {
          // One occurrence split into touching pieces, each with any trend.
          const events = trends.map((trend, i) =>
            ev({ id: `t${i}`, family: 'calmMusic', start: i, end: i + 1, trend }),
          );
          return occurrences(events, noMute).length === 1;
        },
      ),
    );
  });
});

describe('occurrences: honest definition of missed (task 23.2)', () => {
  it('a bracketed or music cue describes a sound; a plain spoken cue does not', () => {
    expect(cueDescribesSound({ start: 0, end: 1, text: '[door creaks]' })).toBe(true);
    expect(cueDescribesSound({ start: 0, end: 1, text: '(gunshot)' })).toBe(true);
    expect(cueDescribesSound({ start: 0, end: 1, text: '♪ la la la ♪' })).toBe(true);
    expect(cueDescribesSound({ start: 0, end: 1, text: 'Who is there?' })).toBe(false);
  });

  it('without a subtitle file every occurrence is counted', () => {
    const occ = occurrences([ev({ family: 'gunshot', start: 1, end: 2 })], noMute)[0]!;
    expect(occurrenceIsMissed(occ, [])).toBe(true);
  });

  it('an occurrence is NOT counted when an overlapping cue already describes a sound', () => {
    const occ = occurrences([ev({ family: 'gunshot', start: 5, end: 6 })], noMute)[0]!;
    const describing: DialogueCue[] = [{ start: 5.2, end: 5.8, text: '[gunshot]' }];
    expect(occurrenceIsMissed(occ, describing)).toBe(false);
  });

  it('an overlapping plain spoken cue does not suppress the count', () => {
    const occ = occurrences([ev({ family: 'gunshot', start: 5, end: 6 })], noMute)[0]!;
    const spoken: DialogueCue[] = [{ start: 5.2, end: 5.8, text: 'Run!' }];
    expect(occurrenceIsMissed(occ, spoken)).toBe(true);
  });

  it('a describing cue that does not overlap the occurrence still counts it', () => {
    const occ = occurrences([ev({ family: 'gunshot', start: 5, end: 6 })], noMute)[0]!;
    const elsewhere: DialogueCue[] = [{ start: 20, end: 21, text: '[thunder]' }];
    expect(occurrenceIsMissed(occ, elsewhere)).toBe(true);
  });

  it('missedBasis reports the basis for the end card', () => {
    expect(missedBasis([])).toBe('dialogueOnly');
    expect(missedBasis([{ start: 0, end: 1, text: 'hi' }])).toBe('withFile');
  });
});

describe('occurrences: missedOccurrences up to time t (task 23.1/23.2)', () => {
  const events = [
    ev({ id: 'g', family: 'gunshot', start: 2, end: 3 }),
    ev({ id: 'w', family: 'wind', start: 4, end: 9 }),
    ev({ id: 'm1', family: 'calmMusic', start: 10, end: 12 }),
    ev({ id: 'm2', family: 'tenseMusic', start: 12, end: 14 }),
    ev({ id: 's', isSpeech: true, family: 'unknown', start: 1, end: 2 }),
  ];

  it('counts only occurrences whose start is at or before t', () => {
    expect(missedOccurrences(events, 1, noMute).length).toBe(0);
    expect(missedOccurrences(events, 2.5, noMute).length).toBe(1);
    expect(missedOccurrences(events, 11, noMute).length).toBe(3); // gunshot, wind, music
  });

  it('music counts once, not three times (the Sintel defect)', () => {
    const musicOnly = events.filter((e) => ['calmMusic', 'tenseMusic', 'singing'].includes(e.family));
    expect(occurrences(musicOnly, noMute)).toHaveLength(1);
  });

  it('a loaded describing subtitle removes the matching occurrence', () => {
    const dialogue: DialogueCue[] = [{ start: 2, end: 3, text: '[gunshot]' }];
    expect(missedOccurrences(events, 14, noMute, dialogue).some((o) => o.group === 'gunshot')).toBe(false);
    // The wind and music are still counted.
    expect(missedOccurrences(events, 14, noMute, dialogue).length).toBe(2);
  });
});


describe('occurrenceTimeLabel: spans in the evidence (task 25.1)', () => {
  it('shows a span when the occurrence lasts 3 s or more', () => {
    expect(occurrenceTimeLabel({ start: 10, end: 52 })).toBe('0:10\u20130:52');
  });

  it('shows only the start when the occurrence is shorter than 3 s', () => {
    expect(occurrenceTimeLabel({ start: 9, end: 10 })).toBe('0:09');
  });

  it('rounds to the nearest second, not floored (a 9.6 s start reads 0:10)', () => {
    expect(occurrenceTimeLabel({ start: 9.6, end: 10.1 })).toBe('0:10');
  });

  it('rounds both ends of a span to the nearest second', () => {
    // 10.4 → 0:10, 52.6 → 0:53, span >= 3 s so a range is shown.
    expect(occurrenceTimeLabel({ start: 10.4, end: 52.6 })).toBe('0:10\u20130:53');
  });
});

describe('occurrenceShownEnd: picture and list agree (task 29.4)', () => {
  it('ends at the last member event that is actually shown, capped at the clip end', () => {
    // A music occurrence whose last visible fragment ends at 23.3, with a
    // trailing fragment that STARTS past the clip's effective end (25). The
    // overlay stops drawing at 23.3, so the listed span must end there, not be
    // stretched to 25 by the trailing fragment.
    const occ = occurrences(
      [
        ev({ id: 'm1', family: 'calmMusic', start: 11, end: 20 }),
        ev({ id: 'm2', family: 'calmMusic', start: 20, end: 23.3 }),
        ev({ id: 'm3', family: 'calmMusic', start: 26, end: 40 }),
      ],
      noMute,
    )[0]!;
    // The occurrence itself spans to 40 (all three fold within the gap), but
    // only members starting at or before 25 are shown.
    expect(occurrenceShownEnd(occ, 25)).toBeCloseTo(23.3, 5);
  });

  it('caps the shown end at the effective end when a member runs past it', () => {
    const occ = occurrences(
      [ev({ id: 'm', family: 'calmMusic', start: 11, end: 40 })],
      noMute,
    )[0]!;
    // The single member starts before 25 but ends at 40: the shown end is
    // clamped to the clip's effective end.
    expect(occurrenceShownEnd(occ, 25)).toBe(25);
  });

  it('returns the real end for an occurrence wholly inside the clip', () => {
    const occ = occurrences(
      [ev({ id: 'g', family: 'gunshot', start: 2, end: 3 })],
      noMute,
    )[0]!;
    expect(occurrenceShownEnd(occ, 25)).toBe(3);
  });
});
