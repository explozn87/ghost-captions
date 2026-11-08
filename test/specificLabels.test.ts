import { describe, it, expect } from 'vitest';
import csvText from './fixtures/yamnet_class_map.csv?raw';
import sintelWindows from './fixtures/sintel.windows.json';
import { buildEvents } from '../src/events/buildEvents.ts';
import { ghostConfig } from '../src/config/ghost.config.ts';
import { soundLabelsKo } from '../src/i18n/soundLabels.ko.ts';
import {
  soundNoun,
  showsSpecificLabel,
  localiseSpecificLabel,
} from '../src/i18n/soundLabel.ts';
import { spriteLabel } from '../src/overlay/layout.ts';
import { toWebVtt } from '../src/export/webvtt.ts';
import { tables } from '../src/i18n/index.ts';
import type { ClassWindow, Frame, SoundEvent } from '../src/shared/types.ts';

// Task 15: the ghost label, event list, timeline tooltip and WebVTT cue show
// the specific classifier label (SoundEvent.topLabel) when its score reaches
// the new `specificLabelThreshold`, otherwise the family word; families still
// decide the silhouette; `unknown` events are never named (task 15.1). Every
// YAMNet display_name has a natural Korean name; English uses the display_name
// as is (task 15.2).

/** Parse the `display_name` column, honouring quoted fields with commas. */
function readDisplayNames(): string[] {
  const lines = csvText.trim().split(/\r?\n/).slice(1);
  return lines.map((line: string) => {
    const firstComma = line.indexOf(',');
    const secondComma = line.indexOf(',', firstComma + 1);
    let name = line.slice(secondComma + 1);
    if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1);
    return name;
  });
}

/** A full SoundEvent with sensible defaults, overridable per field. */
function makeEvent(over: Partial<SoundEvent> = {}): SoundEvent {
  return {
    id: 'e0',
    start: 0,
    end: 2,
    family: 'unknown',
    isSpeech: false,
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

/** A flat, non-silent flux/energy frame series over [0,duration) at 46 ms. */
function flatFrames(duration: number, level = 1): Frame[] {
  const out: Frame[] = [];
  const step = 0.046;
  for (let t = 0; t < duration; t += step) {
    out.push({ t: Math.round(t * 1000) / 1000, energy: level, balance: 0, flux: level, lowShare: 0.2 });
  }
  return out;
}

describe('specificLabelThreshold config (task 15.1)', () => {
  it('defaults to 0.3 and carries a non-empty why (NFR-6)', () => {
    expect(ghostConfig.specificLabelThreshold.value).toBe(0.3);
    expect(typeof ghostConfig.specificLabelThreshold.why).toBe('string');
    expect(ghostConfig.specificLabelThreshold.why.trim().length).toBeGreaterThan(0);
  });
});

describe('showsSpecificLabel / soundNoun (task 15.1)', () => {
  const en = tables.en;
  const ko = tables.ko;

  it('shows the specific label at or above the threshold', () => {
    const e = makeEvent({ family: 'wind', topLabel: 'Wind', labelScore: 0.3 });
    expect(showsSpecificLabel(e)).toBe(true);
    expect(soundNoun(e, en, 'en')).toBe('Wind');
    expect(soundNoun(e, ko, 'ko')).toBe('바람');
  });

  it('falls back to the family word below the threshold', () => {
    const e = makeEvent({ family: 'wind', topLabel: 'Wind', labelScore: 0.29 });
    expect(showsSpecificLabel(e)).toBe(false);
    expect(soundNoun(e, en, 'en')).toBe(en.family.wind);
    expect(soundNoun(e, ko, 'ko')).toBe(ko.family.wind);
  });

  it('never shows a specific label for an unknown event (task 15.1)', () => {
    // Even if a topLabel somehow lingered on an unknown event, it is not named.
    const e = makeEvent({ family: 'unknown', topLabel: 'Wind', labelScore: 0.9 });
    expect(showsSpecificLabel(e)).toBe(false);
    expect(soundNoun(e, en, 'en')).toBe(en.family.unknown);
    expect(soundNoun(e, ko, 'ko')).toBe(ko.family.unknown);
  });

  it('never shows a specific label when there is no top label', () => {
    const e = makeEvent({ family: 'impact', topLabel: null, labelScore: 0 });
    expect(showsSpecificLabel(e)).toBe(false);
    expect(soundNoun(e, en, 'en')).toBe(en.family.impact);
  });

  it('English keeps the display_name; Korean translates it', () => {
    expect(localiseSpecificLabel('Thunder', 'en')).toBe('Thunder');
    expect(localiseSpecificLabel('Thunder', 'ko')).toBe('천둥');
    expect(localiseSpecificLabel('Choir', 'ko')).toBe('합창');
  });
});

describe('specific labels flow into the overlay label and WebVTT cue (task 15.1)', () => {
  it('the sprite label uses the specific label plus direction and trend', () => {
    const e = makeEvent({
      family: 'thunder',
      topLabel: 'Thunder',
      labelScore: 0.6,
      side: 'left',
      trend: 'rising',
    });
    expect(spriteLabel(e, tables.en, 'en')).toBe('Thunder, from the left, getting louder');
    expect(spriteLabel(e, tables.ko, 'ko')).toBe('천둥, 왼쪽에서, 점점 커짐');
  });

  it('the WebVTT cue uses the specific label, and the family word below threshold', () => {
    const named = toWebVtt(
      {
        duration: 5,
        mono: false,
        labelsAvailable: true,
        events: [makeEvent({ family: 'vehicle', topLabel: 'Car', labelScore: 0.7, side: 'right', start: 0, end: 1 })],
      },
      'en',
    );
    expect(named).toContain('[Car, from the right]');

    const fallback = toWebVtt(
      {
        duration: 5,
        mono: false,
        labelsAvailable: true,
        events: [makeEvent({ family: 'vehicle', topLabel: 'Car', labelScore: 0.1, side: 'right', start: 0, end: 1 })],
      },
      'en',
    );
    expect(fallback).toContain(`[${tables.en.family.vehicle}, from the right]`);
    expect(fallback).not.toContain('[Car');
  });
});

describe('Korean sound labels cover every class-map name (task 15.2)', () => {
  const names = readDisplayNames();

  it('has a non-empty Korean entry for every one of the 521 names', () => {
    expect(names).toHaveLength(521);
    const missing = names.filter((n) => {
      const v = soundLabelsKo[n];
      return typeof v !== 'string' || v.trim().length === 0;
    });
    expect(missing).toEqual([]);
  });

  it('does not carry a key that is not a real class-map name', () => {
    const fixture = new Set(names);
    const stray = Object.keys(soundLabelsKo).filter((n) => !fixture.has(n));
    expect(stray).toEqual([]);
  });
});

describe('Sintel fixture shows Wind/바람 where the top label is Wind (task 15.2)', () => {
  const windows = sintelWindows as ClassWindow[];
  const duration = windows[windows.length - 1]!.end;
  const track = buildEvents(windows, flatFrames(duration + 1), {
    duration: duration + 1,
    mono: true,
    labelsAvailable: true,
  });

  it('a wind event in the trailer has Wind as its top label', () => {
    const windEvent = track.events.find((e) => e.topLabel === 'Wind');
    expect(windEvent).toBeDefined();
    expect(windEvent!.family).toBe('wind');
  });

  it('that event reads "Wind" in English and "바람" in Korean', () => {
    const windEvent = track.events.find((e) => e.topLabel === 'Wind')!;
    expect(soundNoun(windEvent, tables.en, 'en')).toBe('Wind');
    expect(soundNoun(windEvent, tables.ko, 'ko')).toBe('바람');
    // And the full overlay label keeps the specific word.
    expect(spriteLabel(windEvent, tables.ko, 'ko')).toContain('바람');
  });
});
