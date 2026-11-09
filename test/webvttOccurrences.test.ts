import { describe, it, expect } from 'vitest';
import { toWebVttFromOccurrences } from '../src/export/webvtt.ts';
import {
  missedOccurrences,
  occurrenceShownEnd,
} from '../src/events/occurrences.ts';
import { occurrenceNoun } from '../src/i18n/soundLabel.ts';
import { t } from '../src/i18n/index.ts';
import type { DialogueCue, Family, SoundEvent } from '../src/shared/types.ts';

// Task 33.2: the exported captions say exactly what the end card said. The
// export now builds from the shown OCCURRENCES (task 33.1), the same source the
// end card's evidence list uses, so on a trimmed demo (endAt 25) the file has
// one cue per end-card row, no cue at or after the trim point, the music span
// ends where it is last shown, and each cue's text equals the row's label in
// both languages.
//
// The independent parser below re-derives structure from the emitted text so
// "it parses" and "its cues equal the rows" are real assertions, not a no-op.

interface ParsedCue { start: number; end: number; text: string }

function parseTimestamp(ts: string): number {
  const m = /^(\d{2,}):(\d{2}):(\d{2})\.(\d{3})$/.exec(ts);
  if (!m) throw new Error(`bad timestamp: ${ts}`);
  const [, hh, mm, ss, mmm] = m;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(mmm) / 1000;
}

function parseVtt(input: string): ParsedCue[] {
  const text = input.replace(/\r\n/g, '\n');
  const blocks = text.split('\n\n').filter((b) => b.trim().length > 0);
  if (blocks.length === 0 || !blocks[0]!.startsWith('WEBVTT')) {
    throw new Error('missing WEBVTT header');
  }
  const cues: ParsedCue[] = [];
  for (const block of blocks.slice(1)) {
    const lines = block.split('\n');
    let i = 0;
    if (/^\d+$/.test(lines[0] ?? '')) i = 1;
    const arrow = /^(\S+)\s+-->\s+(\S+)$/.exec(lines[i] ?? '');
    if (!arrow) throw new Error(`bad timing line: ${lines[i]}`);
    const cueText = lines.slice(i + 1).join('\n');
    if (cueText.trim().length === 0) throw new Error('empty cue text');
    cues.push({ start: parseTimestamp(arrow[1]!), end: parseTimestamp(arrow[2]!), text: cueText.trim() });
  }
  return cues;
}

function ev(over: Partial<SoundEvent> = {}): SoundEvent {
  return {
    id: 'e',
    start: 0,
    end: 1,
    family: 'gunshot',
    isSpeech: false,
    overSpeech: false,
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

const ENDAT = 25;
const noMute = { mutedFamilies: new Set<Family>() };

/**
 * A track shaped like the Sintel demo: a gunshot, a choir and a long music span
 * before the trim point; a music fragment and an extra sound AFTER it; and a
 * speech event (never exported). The music span runs past `endAt`, so its shown
 * end is clamped to 25 s.
 */
function sintelLikeTrack(): { events: SoundEvent[]; duration: number } {
  const events: SoundEvent[] = [
    // Speech — never a cue.
    ev({ id: 'sp', family: 'scream', isSpeech: true, start: 2, end: 5, side: 'left' }),
    // Gunshot from the right at ~9 s.
    ev({ id: 'g', family: 'gunshot', start: 9, end: 9.5, side: 'right', loudness: 0.95 }),
    // A long instrumental-music occurrence (two touching pieces, one trend
    // change) from 11 s, running well past the 25 s trim point.
    ev({ id: 'm1', family: 'tenseMusic', start: 11, end: 20, side: 'centre-unknown', loudness: 0.6 }),
    ev({ id: 'm2', family: 'tenseMusic', start: 20, end: 30, side: 'centre-unknown', loudness: 0.55, trend: 'rising' }),
    // A choir at ~21 s (its own occurrence group, task 25.1).
    ev({ id: 'c', family: 'singing', start: 21, end: 23, side: 'left', loudness: 0.5 }),
    // An extra sound entirely AFTER the trim point — must not be exported.
    ev({ id: 'after', family: 'impact', start: 40, end: 41, side: 'centre-unknown', loudness: 0.7 }),
  ];
  return { events, duration: 52 };
}

describe('toWebVttFromOccurrences (task 33.1/33.2)', () => {
  const { events, duration } = sintelLikeTrack();
  const track = {
    duration,
    mono: false,
    labelsAvailable: true,
    events,
  };
  const effectiveEnd = Math.min(ENDAT, duration);
  // The end card's rows, with the same shown-end clamp the Player applies.
  const rows = missedOccurrences(events, effectiveEnd, noMute, []).map((o) => {
    const shownEnd = occurrenceShownEnd(o, effectiveEnd);
    return shownEnd < o.end ? { ...o, end: shownEnd } : o;
  });

  it('starts with the WEBVTT header and parses', () => {
    const vtt = toWebVttFromOccurrences(track, 'en', { settings: noMute, endAt: ENDAT });
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(() => parseVtt(vtt)).not.toThrow();
  });

  it('has one sound cue per end-card row', () => {
    const vtt = toWebVttFromOccurrences(track, 'en', { settings: noMute, endAt: ENDAT });
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(rows.length);
    // Sanity: the fixture produced the three expected occurrences (gunshot,
    // music, choir) — not the speech event, not the post-trim impact.
    expect(rows).toHaveLength(3);
  });

  it('no cue starts at or after the trim point', () => {
    const vtt = toWebVttFromOccurrences(track, 'en', { settings: noMute, endAt: ENDAT });
    for (const cue of parseVtt(vtt)) {
      expect(cue.start).toBeLessThan(ENDAT);
    }
  });

  it('the music cue ends at the trim point (its span is clamped to endAt)', () => {
    const vtt = toWebVttFromOccurrences(track, 'en', { settings: noMute, endAt: ENDAT });
    const cues = parseVtt(vtt);
    // The music occurrence runs 11..30 but is only shown through 25 s.
    const musicRow = rows.find((r) => r.group === 'music')!;
    expect(musicRow.end).toBe(ENDAT);
    const musicCue = cues.find((c) => Math.abs(c.start - musicRow.start) < 1e-6)!;
    expect(musicCue.end).toBe(ENDAT);
  });

  for (const lang of ['en', 'ko'] as const) {
    it(`each cue's text equals the end-card row label (${lang})`, () => {
      const s = t(lang);
      const vtt = toWebVttFromOccurrences(track, lang, { settings: noMute, endAt: ENDAT });
      const cues = parseVtt(vtt).sort((a, b) => a.start - b.start);
      const expected = [...rows]
        .sort((a, b) => a.start - b.start)
        .map((occ) => `[${occurrenceNoun(occ, s, lang)}]`);
      expect(cues.map((c) => c.text)).toEqual(expected);
    });
  }

  it('merges dialogue cues, clipped to the trim point', () => {
    const s = t('en');
    const dialogue: DialogueCue[] = [
      { start: 6, end: 8, text: 'Who is there?' },
      { start: 24, end: 27, text: 'overruns the end' },
      { start: 30, end: 31, text: 'after the end — dropped' },
    ];
    const vtt = toWebVttFromOccurrences(track, 'en', {
      settings: noMute,
      endAt: ENDAT,
      dialogue,
    });
    const cues = parseVtt(vtt);
    // The dialogue starting after the trim point is gone; the overrunning one
    // is clamped to 25 s.
    expect(cues.some((c) => c.text === 'after the end — dropped')).toBe(false);
    const overrun = cues.find((c) => c.text === 'overruns the end')!;
    expect(overrun.end).toBe(ENDAT);
    // Sound and dialogue cues interleave in time order: gunshot (9), music (11),
    // choir (21) with dialogue at 6 and 24.
    expect(cues.map((c) => c.text.trim())).toEqual([
      'Who is there?',
      `[${s.family.gunshot}, ${s.side.right}]`,
      `[${s.family.tenseMusic}]`,
      `[${s.family.singing}, ${s.side.left}]`,
      'overruns the end',
    ]);
  });

  it('without endAt the export covers the whole file, still from occurrences', () => {
    const vtt = toWebVttFromOccurrences(track, 'en', { settings: noMute });
    const cues = parseVtt(vtt);
    // Now the post-trim impact at 40 s is a shown occurrence too, so there is
    // one more cue than the trimmed export, and the music runs to 30 s.
    const full = missedOccurrences(events, duration, noMute, []);
    expect(cues).toHaveLength(full.length);
    expect(cues.some((c) => c.start >= ENDAT)).toBe(true);
  });

  it('leaves out a hidden family (matches the shown occurrences)', () => {
    const muted = { mutedFamilies: new Set<Family>(['tenseMusic', 'calmMusic']) };
    const vtt = toWebVttFromOccurrences(track, 'en', { settings: muted, endAt: ENDAT });
    const cues = parseVtt(vtt);
    const shownRows = missedOccurrences(events, effectiveEnd, muted, []);
    expect(cues).toHaveLength(shownRows.length);
    // No music cue remains.
    expect(cues.some((c) => c.text.includes(t('en').family.tenseMusic))).toBe(false);
  });
});
