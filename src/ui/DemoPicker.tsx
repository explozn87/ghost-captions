// DemoPicker — choose a bundled demo clip (task 11.1, Requirement 1.3).
//
// Shows at least two redistributable clips, each with its title, author and
// licence *before* playback (Req 1.3; the same attribution is shown again
// during playback by the watch screen). Picking a clip fetches the app's own
// same-origin asset (allowed by Req 1.5), turns it into a `File`, and hands it
// to the same `onFile` path a dropped file takes — one pipeline for demo and
// user clips.
//
// Each clip is a real button so the picker is keyboard operable with visible
// focus (Req 10.1); the licence and author are plain text next to the title so
// the credit never depends on a tooltip. The "Source" link points at the
// original so attribution is complete (NFR-4). Every string comes from the
// i18n table (Req 9.2).

import { useState } from 'react';
import type { Strings } from '../i18n/index.ts';
import { DEMO_CLIPS, loadDemoFile, type DemoClip } from './demoClips.ts';

export interface DemoPickerProps {
  strings: Strings;
  /**
   * Hands the chosen clip's `File` and its attribution to the parent, which
   * decodes the file locally and keeps the credit visible during playback
   * (Req 1.3).
   */
  onFile: (file: File, clip: DemoClip) => void;
  /** The clips to offer; defaults to the bundled manifest. */
  clips?: readonly DemoClip[];
  /** Injectable fetch for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export function DemoPicker({
  strings,
  onFile,
  clips = DEMO_CLIPS,
  fetchImpl,
}: DemoPickerProps): JSX.Element {
  const ui = strings.ui;
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pick = async (clip: DemoClip) => {
    setError(null);
    setBusyId(clip.id);
    try {
      const file = await loadDemoFile(clip, fetchImpl ?? fetch);
      onFile(file, clip);
    } catch {
      setError(ui.demoLoadError);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="demos" aria-label={ui.demoHeading}>
      <h2 className="demos__heading">{ui.demoHeading}</h2>
      <ul className="demos__list">
        {clips.map((clip) => (
          <li key={clip.id} className="demos__item">
            <button
              type="button"
              className="demos__pick"
              disabled={busyId !== null}
              onClick={() => {
                void pick(clip);
              }}
            >
              <span className="demos__title">{clip.title}</span>
              <span className="demos__author">
                {ui.demoBy} {clip.author}
              </span>
              <span className="demos__licence">
                {ui.demoLicencePrefix} {strings.licence[clip.licence]}
              </span>
            </button>
            <a
              className="demos__source"
              href={clip.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {ui.demoSource}
            </a>
          </li>
        ))}
      </ul>
      {error && (
        <p className="demos__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
