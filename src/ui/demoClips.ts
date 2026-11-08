// Demo-clip manifest (task 11.1, Requirements 1.3 and NFR-4).
//
// The app ships a few short, *redistributable* clips so a judge can try it in
// seconds without finding their own video (Req 1.3). Each clip keeps its
// title, author and licence here so the picker can show them before and during
// playback (Req 1.3) and so the attribution is never separated from the file
// (NFR-4).
//
// The media files live under `public/demo/` and are served as the app's own
// same-origin assets. Fetching one is a request for the app's own code/assets,
// which Req 1.5 explicitly allows — it is not a third-party video site (Req
// 1.4) and carries no user media. The file is turned into a `File` and handed
// to the same `onFile` path a dropped file takes, so demo and user clips run
// through one identical pipeline.
//
// Licences are limited to the redistributable set the steering requires:
// public domain / CC0 / CC BY (with attribution). The `SpdxLicence` union keeps
// a non-redistributable licence from being added by mistake.

/** The redistributable licences a demo clip may carry (steering, NFR-4).
 *
 * Keys are dot-free identifiers (the human "CC BY 3.0" text lives in the i18n
 * `licence` map) so they are safe as i18n leaf keys. */
export type SpdxLicence = 'CC0' | 'CC-BY-3' | 'CC-BY-4' | 'public-domain';

/** One bundled demo clip and everything needed to credit it. */
export interface DemoClip {
  /** Stable id, used as a React key and in tests. */
  id: string;
  /** Human title shown in the picker. */
  title: string;
  /** Who made it, for attribution (NFR-4). */
  author: string;
  /** The licence it is redistributed under. */
  licence: SpdxLicence;
  /** Where the original came from, for attribution (NFR-4). */
  sourceUrl: string;
  /**
   * Path to the media under `public/`, i.e. the served URL at runtime
   * (`/demo/...`). Kept as a root-relative URL so it resolves under any base.
   */
  src: string;
  /** MIME type to stamp on the constructed `File`. */
  mime: string;
  /** One line on what this clip is meant to show (honesty, steering). */
  note: string;
}

/**
 * The bundled clips. These entries describe the files that must exist under
 * `public/demo/` (see `public/demo/CREDITS.md`). The chosen clips are the
 * redistributable candidates from design.md:
 *
 *   - the Blender Foundation *Sintel* trailer (CC BY 3.0): a real video with a
 *     mixed soundtrack, the honest "direction often unknown" case;
 *   - a public-domain stereo field recording, the clear left/right case.
 *
 * Keeping the list here (not inside the component) means a test can check every
 * clip is redistributable and well-formed without rendering anything.
 */
export const DEMO_CLIPS: readonly DemoClip[] = [
  {
    id: 'sintel-trailer',
    title: 'Sintel (trailer)',
    author: 'Blender Foundation',
    licence: 'CC-BY-3',
    sourceUrl: 'https://durian.blender.org/',
    src: '/demo/sintel-trailer.webm',
    mime: 'video/webm',
    note: 'A mixed film soundtrack — often the honest "direction unknown" case.',
  },
  {
    id: 'highway-field',
    title: 'Highway from a bridge (field recording)',
    author: 'Wikimedia Commons contributor',
    licence: 'public-domain',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Highway_from_bridge_center.ogg',
    src: '/demo/highway-field.ogg',
    mime: 'audio/ogg',
    note: 'A stereo field recording with a clearer left/right balance.',
  },
] as const;

/** Licences the app is willing to redistribute (steering, NFR-4). */
const REDISTRIBUTABLE: ReadonlySet<SpdxLicence> = new Set<SpdxLicence>([
  'CC0',
  'CC-BY-3',
  'CC-BY-4',
  'public-domain',
]);

/** Whether a licence is in the redistributable allow-list. */
export function isRedistributable(licence: SpdxLicence): boolean {
  return REDISTRIBUTABLE.has(licence);
}

/**
 * Fetch a demo clip (the app's own same-origin asset, Req 1.5) and turn it into
 * a `File` so it flows through the same `onFile` path as a dropped file. The
 * filename keeps the clip id so the decode-error message (Req 1.2) names
 * something recognisable if the asset is missing.
 *
 * The caller injects `fetchImpl` in tests; at runtime it defaults to the global
 * `fetch`.
 */
export async function loadDemoFile(
  clip: DemoClip,
  fetchImpl: typeof fetch = fetch,
): Promise<File> {
  const res = await fetchImpl(clip.src);
  if (!res.ok) {
    throw new Error(`Demo clip not found: ${clip.src} (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const ext = clip.src.slice(clip.src.lastIndexOf('/') + 1);
  return new File([blob], ext, { type: clip.mime });
}
