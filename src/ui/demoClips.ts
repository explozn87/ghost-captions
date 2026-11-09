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
  /**
   * Optional end point (seconds) for the demo (task 25.6): playback treats
   * reaching `endAt` as the end of the clip — it pauses, shows the end card and
   * counts only occurrences before it. Used to trim a demo to its meaningful
   * part (Sintel's second half is title, music and credits). User files have
   * no `endAt`.
   */
  endAt?: number;
  /**
   * Optional subtitle track served under `public/` (task 35.1): when the clip
   * is picked the player loads this `.vtt`/`.srt` automatically as the dialogue
   * track, exactly as a user-loaded subtitle file would be (task 19). It is the
   * clip's own same-origin asset, so fetching it is allowed by Req 1.5 and is
   * not a third-party request (Req 1.4). User files have no bundled subtitles.
   */
  subtitles?: string;
  /**
   * Optional full attribution line shown above the player while the clip plays
   * (task 35.2). For a CC BY work this is where the licence's attribution and
   * "state the changes" terms are satisfied verbatim (CC BY 3.0 §4(b)). It is
   * the clip's own legal text, not a translatable UI string, so it lives on the
   * clip. When absent the player shows the shorter title/author/licence line.
   */
  attribution?: string;
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
    id: 'tears-of-steel-0807',
    title: 'Tears of Steel (00:08:07–00:08:32 excerpt, with official subtitles)',
    author: 'Blender Foundation',
    licence: 'CC-BY-3',
    sourceUrl: 'https://mango.blender.org/',
    src: '/demo/tos-0807.webm',
    mime: 'video/webm',
    note: 'Dialogue the captions read, plus the sounds between the lines the ghosts read.',
    // This clip shows the core idea best — official dialogue subtitles alongside
    // the ghosts — so it goes first in the picker (task 35.1). The 25 s excerpt
    // is the whole file, so it carries no endAt.
    subtitles: '/demo/tos-0807.en.vtt',
    // CC BY 3.0 §4(b): attribution plus a statement of the changes made
    // (task 35.2). No wording that implies Blender endorses the app.
    attribution:
      'Tears of Steel (2012) — (CC) Blender Foundation | mango.blender.org — CC BY 3.0. Excerpt 00:08:07\u201300:08:32; subtitles re-timed and converted; Ghost Captions overlay added.',
  },
  {
    id: 'sintel-trailer',
    title: 'Sintel (trailer, first 25 s only)',
    author: 'Blender Foundation',
    licence: 'CC-BY-3',
    sourceUrl: 'https://durian.blender.org/',
    src: '/demo/sintel-trailer.webm',
    mime: 'video/webm',
    note: 'A mixed film soundtrack — often the honest "direction unknown" case.',
    // endAt (task 25.6): the trailer's second half is title cards, closing
    // music and credits with little to show; trimming to 25 s keeps a judge's
    // minute on the part full of sounds the captions miss. The clip's
    // attribution stays in the picker and the source line above the player.
    endAt: 25,
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

/**
 * Fetch a demo clip's bundled subtitle track (task 35.1), if it declares one,
 * and turn it into a `File` so it flows through the same dialogue path as a
 * user-loaded `.srt`/`.vtt` (task 19). Returns null when the clip has no
 * `subtitles` field.
 *
 * Like `loadDemoFile`, this reads only the app's own same-origin asset under
 * `/demo/` (Req 1.5). A failed fetch throws so the caller can decide whether to
 * carry on without dialogue rather than silently playing a video with no words.
 */
export async function loadDemoSubtitles(
  clip: DemoClip,
  fetchImpl: typeof fetch = fetch,
): Promise<File | null> {
  if (!clip.subtitles) return null;
  const res = await fetchImpl(clip.subtitles);
  if (!res.ok) {
    throw new Error(
      `Demo subtitles not found: ${clip.subtitles} (HTTP ${res.status})`,
    );
  }
  const blob = await res.blob();
  const name = clip.subtitles.slice(clip.subtitles.lastIndexOf('/') + 1);
  return new File([blob], name, { type: 'text/vtt' });
}
