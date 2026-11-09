// Tests for the demo-clip manifest (task 11.1, Req 1.3, NFR-4).
//
// The manifest is data, so these checks run without rendering anything: every
// bundled clip is redistributable and well-formed, there are at least the two
// clips Req 1.3 asks for, and `loadDemoFile` turns the app's own same-origin
// asset into a `File` (Req 1.5) with the right type — or fails loudly when the
// asset is missing, rather than handing on a broken file.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEMO_CLIPS,
  isRedistributable,
  loadDemoFile,
  loadDemoSubtitles,
  type SpdxLicence,
} from '../src/ui/demoClips.ts';
import { parseSubtitles } from '../src/subtitles/parse.ts';
import { missedBasis } from '../src/events/occurrences.ts';

describe('demo clip manifest (task 11.1)', () => {
  it('offers at least two clips (Req 1.3)', () => {
    expect(DEMO_CLIPS.length).toBeGreaterThanOrEqual(2);
  });

  it('every clip is redistributable and fully attributed (NFR-4)', () => {
    for (const clip of DEMO_CLIPS) {
      expect(isRedistributable(clip.licence), `${clip.id} licence`).toBe(true);
      expect(clip.title.length).toBeGreaterThan(0);
      expect(clip.author.length).toBeGreaterThan(0);
      expect(clip.sourceUrl).toMatch(/^https?:\/\//);
      // Served as the app's own same-origin asset under /demo/.
      expect(clip.src.startsWith('/demo/')).toBe(true);
      expect(clip.mime.length).toBeGreaterThan(0);
    }
  });

  it('clip ids are unique (used as React keys)', () => {
    const ids = DEMO_CLIPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects a non-redistributable licence', () => {
    // A proprietary licence is deliberately not part of SpdxLicence; the
    // allow-list must still answer false if one is forced in.
    expect(isRedistributable('All-Rights-Reserved' as unknown as SpdxLicence)).toBe(false);
  });

  it('gives the Sintel demo a short endAt and leaves the field recording untrimmed (task 25.6)', () => {
    const sintel = DEMO_CLIPS.find((c) => c.id === 'sintel-trailer');
    expect(sintel?.endAt).toBe(25);
    const highway = DEMO_CLIPS.find((c) => c.id === 'highway-field');
    expect(highway?.endAt).toBeUndefined();
  });
});

describe('loadDemoFile (task 11.1, Req 1.5)', () => {
  it('fetches the clip and returns a File of the declared type', async () => {
    const clip = DEMO_CLIPS[0]!;
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(clip.src);
      return new Response(bytes, { status: 200 });
    }) as unknown as typeof fetch;

    const file = await loadDemoFile(clip, fakeFetch);
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe(clip.mime);
    expect(file.name.length).toBeGreaterThan(0);
    expect(file.size).toBe(bytes.byteLength);
  });

  it('throws when the asset is missing rather than returning a broken file', async () => {
    const clip = DEMO_CLIPS[0]!;
    const fakeFetch = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    await expect(loadDemoFile(clip, fakeFetch)).rejects.toThrow(/not found/i);
  });
});

describe('Tears of Steel demo with dialogue (task 35)', () => {
  const tos = DEMO_CLIPS.find((c) => c.id === 'tears-of-steel-0807');

  it('adds the clip, redistributable and first in the picker (task 35.1)', () => {
    expect(tos, 'tears-of-steel-0807 entry').toBeDefined();
    // It shows the core idea best, so it leads the picker list.
    expect(DEMO_CLIPS[0]!.id).toBe('tears-of-steel-0807');
    expect(DEMO_CLIPS[1]!.id).toBe('sintel-trailer');
    expect(isRedistributable(tos!.licence)).toBe(true);
    expect(tos!.licence).toBe('CC-BY-3');
    expect(tos!.author).toBe('Blender Foundation');
    expect(tos!.sourceUrl).toBe('https://mango.blender.org/');
    // The 25 s excerpt is the whole file, so it declares no trim.
    expect(tos!.endAt).toBeUndefined();
  });

  it('declares a bundled subtitle track whose file exists (task 35.1)', () => {
    expect(tos!.subtitles).toBe('/demo/tos-0807.en.vtt');
    // Both the video and the subtitle asset must exist under public/.
    const root = process.cwd();
    for (const rel of [tos!.src, tos!.subtitles!]) {
      const path = join(root, 'public', rel.replace(/^\//, ''));
      // readFileSync throws if the file is missing — that is the assertion.
      const bytes = readFileSync(path, 'utf8');
      expect(bytes.length).toBeGreaterThan(0);
    }
  });

  it('carries the exact CC BY 3.0 attribution with changes stated (task 35.2)', () => {
    expect(tos!.attribution).toContain('Tears of Steel (2012)');
    expect(tos!.attribution).toContain('CC BY 3.0');
    expect(tos!.attribution).toContain('00:08:07');
    expect(tos!.attribution).toContain('subtitles re-timed and converted');
    expect(tos!.attribution).toContain('Ghost Captions overlay added');
    // No wording implying endorsement.
    expect(tos!.attribution!.toLowerCase()).not.toMatch(/endorse|sponsor|approved by/);
  });

  it('loads exactly four dialogue cues when the clip is picked (task 35.1, 35.3)', async () => {
    const vttText = readFileSync(
      join(process.cwd(), 'public', 'demo', 'tos-0807.en.vtt'),
      'utf8',
    );
    const fakeFetch = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(tos!.subtitles);
      return new Response(vttText, { status: 200 });
    }) as unknown as typeof fetch;

    const subtitleFile = await loadDemoSubtitles(tos!, fakeFetch);
    expect(subtitleFile).toBeInstanceOf(File);
    const text = readFileSync(
      join(process.cwd(), 'public', 'demo', 'tos-0807.en.vtt'),
      'utf8',
    );
    const cues = parseSubtitles(text);
    expect(cues).toHaveLength(4);
    expect(cues.map((c) => c.text)).toEqual([
      'Come on!',
      'RAAAAAAAAH!',
      'Memory overwrite, 90%.',
      'Captain! We have to abort!',
    ]);
  });

  it('a clip without subtitles yields null from loadDemoSubtitles (task 35.1)', async () => {
    const sintel = DEMO_CLIPS.find((c) => c.id === 'sintel-trailer')!;
    const never = vi.fn() as unknown as typeof fetch;
    expect(sintel.subtitles).toBeUndefined();
    await expect(loadDemoSubtitles(sintel, never)).resolves.toBeNull();
    expect(never).not.toHaveBeenCalled();
  });

  it('counts against the loaded subtitles when dialogue is present (task 35.3)', () => {
    const text = readFileSync(
      join(process.cwd(), 'public', 'demo', 'tos-0807.en.vtt'),
      'utf8',
    );
    const cues = parseSubtitles(text);
    // With the auto-loaded subtitles the end-card basis is the "with file" one.
    expect(missedBasis(cues)).toBe('withFile');
  });

  it('records the Tears of Steel row in CREDITS.md (task 35.2, 35.4)', () => {
    const credits = readFileSync(
      join(process.cwd(), 'public', 'demo', 'CREDITS.md'),
      'utf8',
    );
    expect(credits).toContain('tos-0807.webm');
    expect(credits).toContain('tos-0807.en.vtt');
    expect(credits).toContain('Tears of Steel');
    expect(credits).toContain('https://mango.blender.org/sharing/');
    expect(credits).toContain(
      'https://download.blender.org/demo/movies/ToS/subtitles/TOS-en.srt',
    );
    expect(credits).toContain('https://creativecommons.org/licenses/by/3.0/');
    // The separate original soundtrack (CC BY-ND 3.0) is explicitly not used.
    expect(credits).toContain('CC BY-ND 3.0');
    expect(credits.toLowerCase()).toContain('not');
  });
});
