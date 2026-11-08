// DropZone — the intake surface (task 9.1, Requirement 1.1).
//
// Lets the viewer drop a file or choose one. The file never leaves the device:
// this component only hands the `File` to the parent, which decodes it locally
// (Req 1.5). It is fully keyboard operable with a visible focus ring (Req 10.1):
// the drop area is a real labelled button that opens the file picker.

import { useId, useRef, useState } from 'react';
import type { Strings } from '../i18n/index.ts';

export interface DropZoneProps {
  strings: Strings;
  /** Called with the chosen file; the parent decodes it locally. */
  onFile: (file: File) => void;
  /** Slot for the demo picker, rendered under the drop prompt. */
  children?: React.ReactNode;
}

export function DropZone({ strings, onFile, children }: DropZoneProps): JSX.Element {
  const ui = strings.ui;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const hintId = useId();

  const pick = () => inputRef.current?.click();

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
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
        accept="video/*,audio/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // Reset so choosing the same file again re-triggers change.
          e.target.value = '';
        }}
      />
      {children ? <div className="dropzone__demos">{children}</div> : null}
    </section>
  );
}
