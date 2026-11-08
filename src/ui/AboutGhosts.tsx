// AboutGhosts — the honesty panel (task 9.2, Requirement 11).
//
// Explains what is measured, what the classifier guesses, and the known limits
// (mixed soundtracks hide direction; overlapping sounds become one ghost;
// labels can be wrong), and states that this does not replace professional
// captioning or audio description (Req 11.1, 11.2). All text is translated
// (Req 9.2). It is a plain <details> so it is keyboard operable and collapsed
// by default without cluttering the watch screen.

import type { Strings } from '../i18n/index.ts';

export interface AboutGhostsProps {
  strings: Strings;
}

export function AboutGhosts({ strings }: AboutGhostsProps): JSX.Element {
  const ui = strings.ui;
  return (
    <details className="about">
      <summary>{ui.aboutGhosts}</summary>
      <p>{ui.aboutMeasured}</p>
      <p>{ui.aboutGuessed}</p>
      <p>{ui.aboutLimits}</p>
      <p>{ui.aboutNotReplacement}</p>
    </details>
  );
}
