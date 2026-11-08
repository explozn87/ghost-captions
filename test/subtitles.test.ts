import { describe, it, expect } from 'vitest';
import {
  parseSubtitles,
  parseCueTime,
  isSubtitleFileName,
  activeDialogueCue,
} from '../src/subtitles/parse.ts';

// Task 19.1: a pure parser for SRT and WebVTT dialogue files. The viewer may
// open a subtitle file alongside the video; a muted viewer needs the spoken
// words. Malformed cues are skipped, not fatal — one bad line must not blank
// the whole track. These are pure functions over strings (NFR-5), so every
// rule gets a direct test.

describe('parseCueTime', () => {
  it('reads HH:MM:SS.mmm (WebVTT dot decimal)', () => {
    expect(parseCueTime('00:00:01.500')).toBeCloseTo(1.5, 6);
    expect(parseCueTime('01:02:03.004')).toBeCloseTo(3723.004, 6);
  });

  it('reads HH:MM:SS,mmm (SRT comma decimal)', () => {
    expect(parseCueTime('00:00:01,500')).toBeCloseTo(1.5, 6);
    expect(parseCueTime('00:01:01,250')).toBeCloseTo(61.25, 6);
  });

  it('reads MM:SS.mmm with the hours field omitted (WebVTT short form)', () => {
    expect(parseCueTime('02:03.250')).toBeCloseTo(123.25, 6);
  });

  it('right-pads a short fractional part so .5 is 500 ms', () => {
    expect(parseCueTime('00:00:00.5')).toBeCloseTo(0.5, 6);
    expect(parseCueTime('00:00:00.05')).toBeCloseTo(0.05, 6);
  });

  it('returns null for a malformed timestamp', () => {
    expect(parseCueTime('not a time')).toBeNull();
    expect(parseCueTime('00:99:00.000')).toBeNull(); // minutes out of range
    expect(parseCueTime('')).toBeNull();
  });
});

describe('parseSubtitles: SRT', () => {
  const srt = [
    '1',
    '00:00:01,000 --> 00:00:03,000',
    'Hello there.',
    '',
    '2',
    '00:00:04,500 --> 00:00:06,000',
    'Two lines',
    'in one cue.',
    '',
  ].join('\n');

  it('parses index, timing and multi-line text', () => {
    const cues = parseSubtitles(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1, end: 3, text: 'Hello there.' });
    expect(cues[1]!.start).toBeCloseTo(4.5, 6);
    expect(cues[1]!.text).toBe('Two lines\nin one cue.');
  });

  it('tolerates CRLF line endings', () => {
    const crlf = srt.replace(/\n/g, '\r\n');
    const cues = parseSubtitles(crlf);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.text).toBe('Hello there.');
  });
});

describe('parseSubtitles: WebVTT', () => {
  const vtt = [
    'WEBVTT',
    '',
    'NOTE this is a comment block that must be skipped',
    '',
    '1',
    '00:00:01.000 --> 00:00:03.000 line:90%',
    'Hello there.',
    '',
    '00:00:04.000 --> 00:00:06.000',
    'No id line here.',
    '',
  ].join('\n');

  it('skips the WEBVTT header and NOTE blocks', () => {
    const cues = parseSubtitles(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1, end: 3, text: 'Hello there.' });
  });

  it('ignores cue settings after the end timestamp', () => {
    const cues = parseSubtitles(vtt);
    // The `line:90%` setting on cue 1 must not leak into the end time.
    expect(cues[0]!.end).toBe(3);
  });

  it('parses a cue with no id line', () => {
    const cues = parseSubtitles(vtt);
    expect(cues[1]!.text).toBe('No id line here.');
  });
});

describe('parseSubtitles: robustness (malformed cues are skipped, not fatal)', () => {
  it('drops a block with an unreadable timing line but keeps the rest', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:02,000',
      'Good cue.',
      '',
      '2',
      'this is not a timing line',
      'Orphan text.',
      '',
      '3',
      '00:00:05,000 --> 00:00:06,000',
      'Another good cue.',
      '',
    ].join('\n');
    const cues = parseSubtitles(srt);
    expect(cues.map((c) => c.text)).toEqual(['Good cue.', 'Another good cue.']);
  });

  it('drops a cue whose end precedes its start', () => {
    const srt = ['1', '00:00:05,000 --> 00:00:01,000', 'Reversed.', ''].join('\n');
    expect(parseSubtitles(srt)).toHaveLength(0);
  });

  it('drops a cue with no text', () => {
    const srt = ['1', '00:00:01,000 --> 00:00:02,000', '', '2', '00:00:03,000 --> 00:00:04,000', 'Real.', ''].join('\n');
    const cues = parseSubtitles(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('Real.');
  });

  it('returns an empty array for empty or junk input', () => {
    expect(parseSubtitles('')).toEqual([]);
    expect(parseSubtitles('just some prose with no cues')).toEqual([]);
  });

  it('sorts cues by start time regardless of file order', () => {
    const srt = [
      '1',
      '00:00:05,000 --> 00:00:06,000',
      'Later.',
      '',
      '2',
      '00:00:01,000 --> 00:00:02,000',
      'Earlier.',
      '',
    ].join('\n');
    const cues = parseSubtitles(srt);
    expect(cues.map((c) => c.text)).toEqual(['Earlier.', 'Later.']);
  });
});

describe('isSubtitleFileName', () => {
  it('matches .srt and .vtt case-insensitively', () => {
    expect(isSubtitleFileName('movie.srt')).toBe(true);
    expect(isSubtitleFileName('movie.VTT')).toBe(true);
    expect(isSubtitleFileName('captions.en.srt')).toBe(true);
  });

  it('rejects video and other files', () => {
    expect(isSubtitleFileName('movie.mp4')).toBe(false);
    expect(isSubtitleFileName('movie.webm')).toBe(false);
    expect(isSubtitleFileName('notes.txt')).toBe(false);
  });
});

describe('activeDialogueCue', () => {
  const cues = [
    { start: 1, end: 3, text: 'A' },
    { start: 4, end: 6, text: 'B' },
  ];

  it('returns the cue covering the time', () => {
    expect(activeDialogueCue(cues, 2)!.text).toBe('A');
    expect(activeDialogueCue(cues, 5)!.text).toBe('B');
  });

  it('returns null in a gap or at a cue end (half-open interval)', () => {
    expect(activeDialogueCue(cues, 3.5)).toBeNull();
    expect(activeDialogueCue(cues, 3)).toBeNull(); // end is exclusive
    expect(activeDialogueCue(cues, 0)).toBeNull();
  });

  it('prefers the most recent cue when two overlap', () => {
    const overlap = [
      { start: 1, end: 5, text: 'first' },
      { start: 2, end: 4, text: 'second' },
    ];
    expect(activeDialogueCue(overlap, 3)!.text).toBe('second');
  });
});
