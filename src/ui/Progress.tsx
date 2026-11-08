// Progress — the analysing indicator (task 9.1, Requirement 2.1).
//
// Shown while the audio is decoded, classified and measured, until the event
// track is ready. It is a real ARIA progressbar so a screen reader announces
// the fraction done (Req 10). The fraction comes from the measurement phase's
// `onProgress`.

import type { Strings } from '../i18n/index.ts';

export interface ProgressProps {
  strings: Strings;
  /** 0..1 fraction complete. */
  value: number;
}

export function Progress({ strings, value }: ProgressProps): JSX.Element {
  const ui = strings.ui;
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <section className="progress" aria-label={ui.analysing}>
      <p className="progress__title">{ui.analysing}</p>
      <div
        className="progress__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
      >
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress__hint">{ui.analysingHint}</p>
    </section>
  );
}
