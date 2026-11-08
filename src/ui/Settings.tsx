// Settings — language, reduced motion, ghost size, family mutes (task 9.2).
//
// Covers Requirements 6.7 (mute families, change size), 9.1 (switch language
// at any time) and 10.4 (a reduced-motion toggle in addition to the OS
// preference). Every control is a native form control so it is keyboard
// operable with visible focus (Req 10.1) and labelled for a screen reader.
// Strings come from the i18n table (Req 9.2), including the family names on the
// mute toggles, so the panel is fully translated.

import type { Family } from '../shared/types.ts';
import type { Lang, Strings } from '../i18n/index.ts';
import { LANGS, tables } from '../i18n/index.ts';
import type { Settings as SettingsState } from './settings.ts';
import { toggleMuted } from './settings.ts';

/** The ghost families offered as mute toggles, in a stable display order. */
const FAMILIES: Family[] = [
  'footsteps',
  'door',
  'voice',
  'tenseMusic',
  'calmMusic',
  'impact',
  'vehicle',
  'animal',
  'weather',
  'alarm',
  'glass',
  'unknown',
];

export interface SettingsPanelProps {
  strings: Strings;
  settings: SettingsState;
  onChange: (next: SettingsState) => void;
}

export function SettingsPanel({
  strings,
  settings,
  onChange,
}: SettingsPanelProps): JSX.Element {
  const ui = strings.ui;

  return (
    <section className="settings" aria-label={ui.settings}>
      <h2>{ui.settings}</h2>

      <label className="settings__row">
        <span>{ui.language}</span>
        <select
          value={settings.lang}
          onChange={(e) => onChange({ ...settings, lang: e.target.value as Lang })}
        >
          {LANGS.map((lang) => (
            <option key={lang} value={lang}>
              {tables[lang].languageName}
            </option>
          ))}
        </select>
      </label>

      <label className="settings__row">
        <input
          type="checkbox"
          checked={settings.reducedMotion}
          onChange={(e) => onChange({ ...settings, reducedMotion: e.target.checked })}
        />
        <span>{ui.reducedMotion}</span>
      </label>

      <label className="settings__row">
        <span>{ui.ghostSize}</span>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={settings.sizeScale}
          onChange={(e) => onChange({ ...settings, sizeScale: Number(e.target.value) })}
        />
      </label>

      <fieldset className="settings__families">
        <legend>{ui.muteFamily}</legend>
        {FAMILIES.map((family) => (
          <label key={family} className="settings__family">
            <input
              type="checkbox"
              checked={settings.mutedFamilies.has(family)}
              onChange={() =>
                onChange({
                  ...settings,
                  mutedFamilies: toggleMuted(settings.mutedFamilies, family),
                })
              }
            />
            <span>{strings.family[family]}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
