import { describe, it, expect } from 'vitest';
import {
  SIZE_CHOICES,
  SIZE_SCALES,
  sizeChoiceFor,
  defaultSettings,
  missedCount,
  latestMissedEvent,
} from '../src/ui/settings.ts';
import { ghostConfig } from '../src/config/ghost.config.ts';
import type { Family, SoundEvent } from '../src/shared/types.ts';

// Task 17.1: the size control offers three choices — 24% / 30% / 36% of the
// viewport's shorter side (small / normal / large). The base ghost diameter is
// 30% (`ghostDiameterFrac`), so the choices are sizeScale multipliers
// 0.8 / 1.0 / 1.2. These helpers back the Settings select and are pure, so
// they get a direct unit test.

describe('settings: three ghost-size choices (task 17.1)', () => {
  it('offers exactly small / normal / large', () => {
    expect(SIZE_CHOICES).toEqual(['small', 'normal', 'large']);
  });

  it('maps the choices to 24% / 30% / 36% of the shorter side', () => {
    const diam = ghostConfig.ghostDiameterFrac.value; // 0.30
    expect(SIZE_SCALES.small * diam).toBeCloseTo(0.24, 10);
    expect(SIZE_SCALES.normal * diam).toBeCloseTo(0.3, 10);
    expect(SIZE_SCALES.large * diam).toBeCloseTo(0.36, 10);
  });

  it('normal is the default sizeScale', () => {
    const s = defaultSettings('en', false);
    expect(s.sizeScale).toBe(SIZE_SCALES.normal);
    expect(sizeChoiceFor(s.sizeScale)).toBe('normal');
  });

  it('sizeChoiceFor snaps a stored scale to the nearest choice', () => {
    expect(sizeChoiceFor(0.8)).toBe('small');
    expect(sizeChoiceFor(1.0)).toBe('normal');
    expect(sizeChoiceFor(1.2)).toBe('large');
    // An off value snaps to the nearest.
    expect(sizeChoiceFor(0.85)).toBe('small');
    expect(sizeChoiceFor(1.15)).toBe('large');
  });
});


// Task 22.5: `missedCount(events, t, settings)` counts the shown non-speech
// events up to the current time — the number of sounds ordinary captions would
// have missed. Pure, so it gets a direct unit test; the chip and end card both
// read it.

function ev(over: Partial<SoundEvent> = {}): SoundEvent {
  return {
    id: 'e0',
    start: 0,
    end: 1,
    family: 'footsteps',
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
    ...over,
  };
}

const noMute = { mutedFamilies: new Set<Family>() };

describe('missedCount (task 22.5)', () => {
  const events: SoundEvent[] = [
    ev({ id: 'a', family: 'footsteps', start: 1 }),
    ev({ id: 'b', family: 'gunshot', start: 3 }),
    ev({ id: 'c', family: 'wind', start: 5 }),
    ev({ id: 'speech', family: 'scream', start: 2, isSpeech: true }),
  ];

  it('counts non-speech events whose start is at or before the time', () => {
    expect(missedCount(events, 0, noMute)).toBe(0);
    expect(missedCount(events, 1, noMute)).toBe(1); // footsteps started
    expect(missedCount(events, 3, noMute)).toBe(2); // + gunshot
    expect(missedCount(events, 10, noMute)).toBe(3); // + wind (speech excluded)
  });

  it('excludes speech events entirely', () => {
    // At t=2 only footsteps (t1) counts; the speech event at t2 does not.
    expect(missedCount(events, 2, noMute)).toBe(1);
  });

  it('excludes families the viewer has hidden', () => {
    const muted = { mutedFamilies: new Set<Family>(['gunshot']) };
    expect(missedCount(events, 10, muted)).toBe(2); // footsteps + wind, gunshot hidden
  });
});

describe('latestMissedEvent (task 22.5)', () => {
  const events: SoundEvent[] = [
    ev({ id: 'a', family: 'footsteps', start: 1 }),
    ev({ id: 'b', family: 'gunshot', start: 3 }),
  ];

  it('returns the most recent shown non-speech event at or before the time', () => {
    expect(latestMissedEvent(events, 0, noMute)).toBeNull();
    expect(latestMissedEvent(events, 1, noMute)!.id).toBe('a');
    expect(latestMissedEvent(events, 4, noMute)!.id).toBe('b');
  });

  it('skips hidden families when choosing the newest', () => {
    const muted = { mutedFamilies: new Set<Family>(['gunshot']) };
    expect(latestMissedEvent(events, 4, muted)!.id).toBe('a');
  });
});

// Task 23.1/23.2: the counter now counts OCCURRENCES and honours a loaded
// subtitle file through missedCount's extra dialogue argument.

describe('missedCount counts occurrences, not raw events (task 23.1)', () => {
  it('folds same-family touching events into one count', () => {
    // Instrumental music split into three touching pieces (the Sintel defect)
    // counts once. Choir/singing is its own group now (task 25.1), so it is
    // kept out of this fold.
    const music: SoundEvent[] = [
      ev({ id: 'm1', family: 'calmMusic', start: 10, end: 12 }),
      ev({ id: 'm2', family: 'tenseMusic', start: 12, end: 13 }),
      ev({ id: 'm3', family: 'tenseMusic', start: 13, end: 14 }),
    ];
    expect(missedCount(music, 14, noMute)).toBe(1);
  });

  it('a trend change inside an occurrence does not add to the count', () => {
    const pieces: SoundEvent[] = [
      ev({ id: 'a', family: 'calmMusic', start: 0, end: 2, trend: 'rising' }),
      ev({ id: 'b', family: 'calmMusic', start: 2, end: 4, trend: 'falling' }),
    ];
    expect(missedCount(pieces, 4, noMute)).toBe(1);
  });
});

describe('missedCount honours a loaded subtitle file (task 23.2)', () => {
  const events: SoundEvent[] = [
    ev({ id: 'g', family: 'gunshot', start: 2, end: 3 }),
    ev({ id: 'w', family: 'wind', start: 5, end: 7 }),
  ];

  it('does not count an occurrence a describing cue already covers', () => {
    const dialogue = [{ start: 2, end: 3, text: '[gunshot]' }];
    expect(missedCount(events, 10, noMute, dialogue)).toBe(1); // only wind
  });

  it('counts both when the cue is ordinary spoken dialogue', () => {
    const dialogue = [{ start: 2, end: 3, text: 'Fire!' }];
    expect(missedCount(events, 10, noMute, dialogue)).toBe(2);
  });
});
