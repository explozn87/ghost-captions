// ExportButton — download the enriched captions (task 9.2, Requirement 8).
//
// Builds the WebVTT with the pure `toWebVtt(track, lang)` (task 6) in the
// current UI language (Req 8.3), then triggers a download entirely on the
// client via a Blob and an object URL — no server round-trip (Req 8.4). The
// button is disabled when the track has no exportable (non-speech) cue, so a
// viewer never downloads an empty file.

import type { DialogueCue, EventTrack, Family } from '../shared/types.ts';
import type { Lang, Strings } from '../i18n/index.ts';
import { toWebVttFromOccurrences } from '../export/webvtt.ts';
import { occurrences } from '../events/occurrences.ts';

export interface ExportButtonProps {
  track: EventTrack;
  lang: Lang;
  strings: Strings;
  /** Dialogue cues to merge into the export in time order (task 19.4). */
  dialogue?: readonly DialogueCue[];
  /**
   * The families the viewer has hidden ("Hide sound types"): the export leaves
   * them out too, so the downloaded file matches the shown occurrences and the
   * end card (task 33.1).
   */
  mutedFamilies: ReadonlySet<Family>;
  /**
   * Short-demo end point (task 25.6): the export covers only occurrences before
   * it and clips spans to it, so a trimmed demo's .vtt matches the end card.
   * Omitted for user files (whole clip exported).
   */
  endAt?: number | undefined;
  /** Base name for the downloaded file (without extension). */
  fileBaseName?: string;
}

/**
 * True when the export would produce at least one cue: a shown sound occurrence
 * before the effective end, or a dialogue cue. Mirrors the occurrence source so
 * the button is disabled exactly when the file would be empty.
 */
function hasExportableCue(
  track: EventTrack,
  mutedFamilies: ReadonlySet<Family>,
  endAt: number | undefined,
  dialogue: readonly DialogueCue[],
): boolean {
  const effectiveEnd = endAt != null ? Math.min(endAt, track.duration) : track.duration;
  const hasSound = occurrences(track.events, { mutedFamilies }).some(
    (occ) => occ.start < effectiveEnd,
  );
  const hasDialogue = dialogue.some((c) => c.start < effectiveEnd);
  return hasSound || hasDialogue;
}

export function ExportButton({
  track,
  lang,
  strings,
  dialogue = [],
  mutedFamilies,
  endAt,
  fileBaseName = 'ghost-captions',
}: ExportButtonProps): JSX.Element {
  const onExport = () => {
    const vtt = toWebVttFromOccurrences(track, lang, {
      settings: { mutedFamilies },
      endAt,
      dialogue,
    });
    const blob = new Blob([vtt], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBaseName}.vtt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next tick so the download has started.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <button
      type="button"
      className="export-button"
      onClick={onExport}
      disabled={!hasExportableCue(track, mutedFamilies, endAt, dialogue)}
    >
      {strings.ui.exportCaptions}
    </button>
  );
}
