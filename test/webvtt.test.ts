import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { toWebVtt, formatTimestamp, phrases, type Lang } from '../src/export/webvtt.ts';
import type { EventTrack, Family, Side, Trend } from '../src/shared/types.ts';

// Task 6.2: property P5 from design.md — `toWebVtt` output always parses, cue
// times are ordered, and contains no direction phrase for `centre-unknown`
// events (Requirement 8.1, 8.2; NFR-7). Plus a few example tests pinning the
// honesty rules: speech events get no cue, and no guessed label is printed.
//
// The parser below is deliberately small and independent of the writer: it
// re-derives structure from the emitted text so the property has something to
// check against rather than trusting the writer's own view.

// --- a small, independent WebVTT parser ----------------------------------

interface ParsedCue {
  start: number;
  end: number;
  text: string;
}

interface ParsedVtt {
  cues: ParsedCue[];
}

/** Parse `HH:MM:SS.mmm` back to seconds. Throws on a malformed timestamp. */
function parseTimestamp(ts: string): number {
  const m = /^(\d{2,}):(\d{2}):(\d{2})\.(\d{3})$/.exec(ts);
  if (!m) throw new Error(`bad timestamp: ${ts}`);
  const [, hh, mm, ss, mmm] = m;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(mmm) / 1000;
}

/**
 * Parse a WebVTT string into cues. Throws if the header is missing or a cue is
 * malformed, so "it parses" is a real assertion, not a no-op.
 */
function parseVtt(input: string): ParsedVtt {
  const text = input.replace(/\r\n/g, '\n');
  const blocks = text.split('\n\n').filter((b) => b.trim().length > 0);
  if (blocks.length === 0 || !blocks[0]!.startsWith('WEBVTT')) {
    throw new Error('missing WEBVTT header');
  }
  const cues: ParsedCue[] = [];
  for (const block of blocks.slice(1)) {
    const lines = block.split('\n');
    // Optional numeric id line, then the timing line, then the cue text.
    let i = 0;
    if (/^\d+$/.test(lines[0] ?? '')) i = 1;
    const timing = lines[i];
    const arrow = /^(\S+)\s+-->\s+(\S+)$/.exec(timing ?? '');
    if (!arrow) throw new Error(`bad timing line: ${timing}`);
    const start = parseTimestamp(arrow[1]!);
    const end = parseTimestamp(arrow[2]!);
    const cueText = lines.slice(i + 1).join('\n');
    if (cueText.length === 0) throw new Error('empty cue text');
    cues.push({ start, end, text: cueText });
  }
  return { cues };
}

// --- arbitraries ----------------------------------------------------------

const families: Family[] = [
  'footsteps', 'door', 'knock', 'scream', 'laughter', 'crying',
  'tenseMusic', 'calmMusic', 'singing', 'impact', 'gunshot',
  'vehicle', 'siren', 'animal', 'wind', 'rain', 'thunder',
  'fire', 'glass', 'unknown',
];
const sides: Side[] = ['left', 'right', 'centre-unknown'];
const trends: Trend[] = ['rising', 'falling', 'steady'];
const langs: Lang[] = ['en', 'ko'];

/** A single arbitrary event with a non-negative, ordered start/end. */
const eventArb = fc.record({
  start: fc.double({ min: 0, max: 600, noNaN: true }),
  dur: fc.double({ min: 0, max: 10, noNaN: true }),
  family: fc.constantFrom(...families),
  isSpeech: fc.boolean(),
  side: fc.constantFrom(...sides),
  trend: fc.constantFrom(...trends),
});

/** An arbitrary, start-sorted event track (as the real pipeline produces). */
const trackArb = fc.array(eventArb, { maxLength: 30 }).map((raw): EventTrack => {
  const sorted = [...raw].sort((a, b) => a.start - b.start);
  return {
    duration: 600,
    mono: false,
    labelsAvailable: true,
    events: sorted.map((e, i) => ({
      id: String(i),
      start: e.start,
      end: e.start + e.dur,
      family: e.family,
      isSpeech: e.isSpeech,
      topLabel: e.family === 'unknown' ? null : e.family,
      labelScore: e.family === 'unknown' ? 0 : 0.8,
      side: e.side,
      sideTrack: [],
      sideConfidence: e.side === 'centre-unknown' ? 0 : 0.9,
      loudness: 0.5,
      trend: e.trend,
      ominous: 0.3,
      beatPeriod: null,
    })),
  };
});

// Every direction phrase in either language, so we can assert none leaks into
// a centre-unknown cue regardless of language.
const allDirectionPhrases = langs.flatMap((l) => [phrases[l].side.left, phrases[l].side.right]);

describe('toWebVtt: property P5 (task 6.2)', () => {
  it('P5: output always parses, cue times are ordered, no direction for centre-unknown', () => {
    fc.assert(
      fc.property(trackArb, fc.constantFrom(...langs), (track, lang) => {
        const vtt = toWebVtt(track, lang);

        // (a) it parses.
        const parsed = parseVtt(vtt);

        // (b) one cue per non-speech event, in the same order.
        const nonSpeech = track.events.filter((e) => !e.isSpeech);
        expect(parsed.cues).toHaveLength(nonSpeech.length);

        // (c) cue start times are non-decreasing (events were start-sorted and
        // speech-skipping must not reorder).
        for (let i = 1; i < parsed.cues.length; i++) {
          expect(parsed.cues[i]!.start).toBeGreaterThanOrEqual(parsed.cues[i - 1]!.start);
        }

        // (d) a direction phrase appears only for a known side. Walk the
        // parsed cues alongside the non-speech events that produced them.
        parsed.cues.forEach((cue, i) => {
          const source = nonSpeech[i]!;
          const hasDirection = allDirectionPhrases.some((d) => cue.text.includes(d));
          if (source.side === 'centre-unknown') {
            expect(hasDirection).toBe(false);
          } else {
            expect(hasDirection).toBe(true);
          }
        });
      }),
      { numRuns: 100 },
    );
  });
});

describe('toWebVtt: honesty and shape (Req 8.1–8.3)', () => {
  const base: EventTrack['events'][number] = {
    id: 'x',
    start: 1,
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
  };

  function trackOf(...events: Partial<EventTrack['events'][number]>[]): EventTrack {
    return {
      duration: 100,
      mono: false,
      labelsAvailable: true,
      events: events.map((e, i) => ({
        ...base,
        ...e,
        id: String(i),
      })),
    };
  }

  it('starts with the WEBVTT header', () => {
    const vtt = toWebVtt(trackOf({ family: 'impact', start: 0, end: 1 }), 'en');
    expect(vtt.startsWith('WEBVTT')).toBe(true);
  });

  it('emits no cue for a speech event (Req 8.1)', () => {
    const vtt = toWebVtt(
      trackOf(
        { family: 'scream', isSpeech: true, start: 0, end: 1, side: 'left' },
        { family: 'impact', start: 1, end: 2 },
      ),
      'en',
    );
    const parsed = parseVtt(vtt);
    expect(parsed.cues).toHaveLength(1);
    expect(parsed.cues[0]!.text).toContain('impact');
  });

  it('includes a direction phrase only for a known side (Req 8.2)', () => {
    const known = toWebVtt(trackOf({ family: 'footsteps', side: 'left', start: 0, end: 1 }), 'en');
    expect(known).toContain('from the left');

    const unknown = toWebVtt(trackOf({ family: 'footsteps', side: 'centre-unknown', start: 0, end: 1 }), 'en');
    expect(unknown).not.toContain('from the left');
    expect(unknown).not.toContain('from the right');
  });

  it('writes an unknown-family event as an unknown sound, never a guessed label (Req 8.2)', () => {
    const vtt = toWebVtt(trackOf({ family: 'unknown', topLabel: null, start: 0, end: 1 }), 'en');
    expect(vtt).toContain('[unknown sound]');
  });

  it('renders the example cue shape from the design', () => {
    const vtt = toWebVtt(
      trackOf({ family: 'footsteps', side: 'left', trend: 'rising', start: 0, end: 1 }),
      'en',
    );
    expect(vtt).toContain('[footsteps, from the left, getting louder]');
  });

  it('exports in the requested language (Req 8.3)', () => {
    const track = trackOf({ family: 'door', side: 'right', trend: 'falling', start: 0, end: 1 });
    expect(toWebVtt(track, 'en')).toContain('[door, from the right, getting quieter]');
    expect(toWebVtt(track, 'ko')).toContain('[문소리, 오른쪽에서, 점점 작아짐]');
  });
});

describe('formatTimestamp', () => {
  it('formats seconds as HH:MM:SS.mmm', () => {
    expect(formatTimestamp(0)).toBe('00:00:00.000');
    expect(formatTimestamp(1.5)).toBe('00:00:01.500');
    expect(formatTimestamp(61.25)).toBe('00:01:01.250');
    expect(formatTimestamp(3661.001)).toBe('01:01:01.001');
  });

  it('clamps negative times to zero', () => {
    expect(formatTimestamp(-5)).toBe('00:00:00.000');
  });
});
