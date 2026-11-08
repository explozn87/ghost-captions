// DropZone — the intake surface (task 9.1, Requirement 1.1).
//
// Lets the viewer drop a file or choose one. The file never leaves the device:
// this component only hands the `File` to the parent, which decodes it locally
// (Req 1.5). It is fully keyboard operable with a visible focus ring (Req 10.1):
// the drop area is a real labelled button that opens the file picker.

import { useId, useRef, useState } from 'react';
import type { Strings } from '../i18n/index.ts';
import { isSubtitleFileName } from '../subtitles/parse.ts';

export interface DropZoneProps {
  strings: Strings;
  /**
   * Called with the chosen media file and an optional subtitle file dropped
   * alongside it (task 19.1); the parent decodes the media locally.
   */
  onFile: (file: File, subtitleFile?: File | null) => void;
  /** Slot for the demo picker, rendered under the drop prompt. */
  children?: React.ReactNode;
}

export function DropZone({ strings, onFile, children }: DropZoneProps): JSX.Element {
  const ui = strings.ui;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const hintId = useId();

  const pick = () => inputRef.current?.click();

  /** Split dropped/picked files into the media file and an optional subtitle. */
  const splitFiles = (files: FileList): { media: File | null; subtitle: File | null } => {
    let media: File | null = null;
    let subtitle: File | null = null;
    for (const f of Array.from(files)) {
      if (isSubtitleFileName(f.name)) {
        if (!subtitle) subtitle = f;
      } else if (!media) {
        media = f;
      }
    }
    return { media, subtitle };
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const { media, subtitle } = splitFiles(files);
    if (media) onFile(media, subtitle);
  };

  return (
    <section className="dropzone-wrap" aria-label={ui.dropPrompt}>
      <button
        type="button"
        className={dragOver ? 'dropzone dropzone--over' : 'dropzone'}
        onClick={pick}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        aria-describedby={hintId}
      >
        <span className="dropzone__prompt">{ui.dropPrompt}</span>
        <span className="dropzone__choose">{ui.chooseFile}</span>
      </button>
      <p id={hintId} className="dropzone__hint">
        {ui.dropHint}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,audio/*,.srt,.vtt"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            const { media, subtitle } = splitFiles(files);
            if (media) onFile(media, subtitle);
          }
          // Reset so choosing the same file again re-triggers change.
          e.target.value = '';
        }}
      />
      {children ? <div className="dropzone__demos">{children}</div> : null}
    </section>
  );
}
