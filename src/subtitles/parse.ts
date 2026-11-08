// Subtitle parsing (task 19.1): a pure parser for SRT and WebVTT dialogue
// files the viewer opens alongside the video.
//
// A muted viewer also needs the dialogue, so Ghost Captions accepts an
// optional `.srt` or `.vtt` subtitle file. This module turns that file's text
// into `DialogueCue[]` — plain `{ start, end, text }` objects — with no DOM,
// no Blob and no clock, so every rule is covered by tests (NFR-5).
//
// Robustness rule (task 19.1): a malformed cue is skipped, not fatal. One bad
// timestamp line in a long file must not blank the whole track, so the parser
// collects the cues it can read and silently drops the ones it cannot.
//
// Both formats share the same timing shape once normalised:
//   SRT:    HH:MM:SS,mmm --> HH:MM:SS,mmm   (comma decimal, 1-based index line)
//   WebVTT: HH:MM:SS.mmm --> HH:MM:SS.mmm   (dot decimal; HH optional; optional
//                                            cue id line; "WEBVTT" header; NOTE
//                                            and STYLE blocks; cue settings
//                                            after the end timestamp)
// We accept either decimal separator and an optional hours field in both, so a
// slightly non-standard file still parses as much as possible.

import type { DialogueCue } from '../shared/types.ts';

/**
 * Parse a timestamp like `HH:MM:SS.mmm`, `MM:SS.mmm`, or with a `,` decimal
 * (SRT), into seconds. Returns null when it cannot be read, so the caller can
 * skip the whole cue rather than inventing a time.
 */
export function parseCueTime(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  // [HH:]MM:SS.mmm  — hours optional, milliseconds optional.
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/.exec(s);
  if (!m) return null;
  const hh = m[1] ? Number(m[1]) : 0;
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  // Right-pad the fractional part so ".5" means 500 ms, not 5 ms.
  const frac = m[4] ? Number((m[4] + '000').slice(0, 3)) : 0;
  if (mm > 59 || ss > 59) return null;
  return hh * 3600 + mm * 60 + ss + frac / 1000;
}

/** The arrow line of a cue, split into its two timestamps (ignoring settings). */
function parseTimingLine(line: string): { start: number; end: number } | null {
  const arrow = /-->/;
  if (!arrow.test(line)) return null;
  const [left, rightWithSettings] = line.split(/-->/, 2);
  if (left === undefined || rightWithSettings === undefined) return null;
  // The end timestamp is the first whitespace-delimited token after the arrow;
  // anything after it (WebVTT cue settings like `line:90%`) is ignored.
  const rightToken = rightWithSettings.trim().split(/\s+/, 1)[0] ?? '';
  const start = parseCueTime(left);
  const end = parseCueTime(rightToken);
  if (start === null || end === null) return null;
  if (end < start) return null;
  return { start, end };
}

/**
 * Split a subtitle file into blocks separated by one or more blank lines, with
 * line endings normalised. A leading BOM and a `WEBVTT` header line (plus its
 * optional description) are handled by the block loop below.
 */
function toBlocks(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  return text
    .split(/\n[ \t]*\n/)
    .map((block) => block.split('\n'))
    .filter((lines) => lines.some((l) => l.trim().length > 0));
}

/**
 * Parse SRT or WebVTT text into dialogue cues (task 19.1). The format is
 * detected from a `WEBVTT` header; either way the per-block logic is the same:
 * find the timing line, take the lines after it as the cue text. Blocks without
 * a valid timing line are skipped (a malformed cue is non-fatal), as are
 * WebVTT `NOTE` and `STYLE` blocks and the header block itself.
 *
 * Returned cues are sorted by start time so downstream lookup and the merged
 * export stay ordered regardless of file order.
 */
export function parseSubtitles(input: string): DialogueCue[] {
  const cues: DialogueCue[] = [];
  const blocks = toBlocks(input);

  for (const lines of blocks) {
    const firstTrimmed = (lines[0] ?? '').trim();
    // Skip the WEBVTT header block and WebVTT metadata blocks entirely.
    if (/^WEBVTT\b/.test(firstTrimmed)) continue;
    if (/^NOTE\b/.test(firstTrimmed) || /^STYLE\b/.test(firstTrimmed)) continue;

    // Find the timing line within the block; a numeric id or a cue id may
    // precede it (SRT index, or a WebVTT cue identifier).
    let timingIndex = -1;
    let timing: { start: number; end: number } | null = null;
    for (let i = 0; i < lines.length; i++) {
      const parsed = parseTimingLine(lines[i]!);
      if (parsed) {
        timing = parsed;
        timingIndex = i;
        break;
      }
    }
    if (!timing || timingIndex < 0) continue; // malformed cue — skip, not fatal

    const textLines = lines.slice(timingIndex + 1).map((l) => l.trimEnd());
    // Drop trailing blank lines but keep internal ones for multi-line cues.
    while (textLines.length > 0 && textLines[textLines.length - 1]!.trim() === '') {
      textLines.pop();
    }
    const text = textLines.join('\n').trim();
    if (text.length === 0) continue; // a cue with no words is not useful

    cues.push({ start: timing.start, end: timing.end, text });
  }

  cues.sort((a, b) => a.start - b.start || a.end - b.end);
  return cues;
}

/**
 * Whether a filename looks like a subtitle file we can parse (task 19.1). Used
 * by the intake to tell a dropped subtitle from a video.
 */
export function isSubtitleFileName(name: string): boolean {
  return /\.(srt|vtt)$/i.test(name);
}

/**
 * Read a subtitle Blob's text, resilient to environments that implement the
 * File API without `Blob.text()` (task 19.1).
 *
 * Real browsers all provide `Blob.text()`, but jsdom's Blob implements only
 * `size`/`slice`, so calling `.text()` under test throws "not a function" and
 * silently blanks the dialogue track. We prefer `Blob.text()` when present and
 * fall back to a `FileReader`, which both browsers and jsdom implement. The
 * download/upload stays entirely on-device either way (Req 1.5).
 */
export function readTextFile(blob: Blob): Promise<string> {
  if (typeof (blob as { text?: unknown }).text === 'function') {
    return blob.text();
  }
  return new Promise<string>((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('No way to read the subtitle file in this environment.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the subtitle file.'));
    reader.readAsText(blob);
  });
}

/**
 * The dialogue cue active at time `t`, or null when none is. The last cue whose
 * `[start, end)` covers `t` wins, matching how the event list picks the current
 * sound event (so overlapping cues resolve to the most recent one).
 */
export function activeDialogueCue(cues: readonly DialogueCue[], t: number): DialogueCue | null {
  let found: DialogueCue | null = null;
  for (const cue of cues) {
    if (cue.start <= t && cue.end > t) found = cue;
  }
  return found;
}
