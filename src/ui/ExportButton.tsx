// ExportButton — download the enriched captions (task 9.2, Requirement 8).
//
// Builds the WebVTT with the pure `toWebVtt(track, lang)` (task 6) in the
// current UI language (Req 8.3), then triggers a download entirely on the
// client via a Blob and an object URL — no server round-trip (Req 8.4). The
// button is disabled when the track has no exportable (non-speech) cue, so a
// viewer never downloads an empty file.

import type { DialogueCue, EventTrack } from '../shared/types.ts';
import type { Lang, Strings } from '../i18n/index.ts';
import { toWebVtt } from '../export/webvtt.ts';

export interface ExportButtonProps {
  track: EventTrack;
  lang: Lang;
  strings: Strings;
  /** Dialogue cues to merge into the export in time order (task 19.4). */
  dialogue?: readonly DialogueCue[];
  /** Base name for the downloaded file (without extension). */
  fileBaseName?: string;
}

/** True when the track has at least one non-speech cue to export. */
function hasExportableCue(track: EventTrack): boolean {
  return track.events.some((e) => !e.isSpeech);
}

export function ExportButton({
  track,
  lang,
  strings,
  dialogue = [],
  fileBaseName = 'ghost-captions',
}: ExportButtonProps): JSX.Element {
  const onExport = () => {
    const vtt = toWebVtt(track, lang, dialogue);
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
      disabled={!hasExportableCue(track) && dialogue.length === 0}
    >
      {strings.ui.exportCaptions}
    </button>
  );
}
