// Tests for the demo-clip manifest (task 11.1, Req 1.3, NFR-4).
//
// The manifest is data, so these checks run without rendering anything: every
// bundled clip is redistributable and well-formed, there are at least the two
// clips Req 1.3 asks for, and `loadDemoFile` turns the app's own same-origin
// asset into a `File` (Req 1.5) with the right type — or fails loudly when the
// asset is missing, rather than handing on a broken file.

import { describe, it, expect, vi } from 'vitest';
import {
  DEMO_CLIPS,
  isRedistributable,
  loadDemoFile,
  type SpdxLicence,
} from '../src/ui/demoClips.ts';

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
