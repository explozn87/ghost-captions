// App — the intake → analysing → watch shell, wired end to end (task 9.1).
//
// This is the real screen, not a placeholder: a viewer opens a file, sees the
// analysis progress, then watches the clip with ghosts drawn over it, a
// timeline, an event list, settings, the honesty panel and a caption export.
//
// Two collaborators are injected so the whole pipeline stays testable without
// a browser codec or a downloaded model (NFR-5), while the defaults are the
// real ones used in the browser (task 10.3):
//   - `decode(file)` turns a File into StereoPcm. The default is the real
//     `decodeFile` (Web Audio, native rate, mono notice, DecodeError). Tests
//     inject a decoder that returns synthetic PCM.
//   - `classifier` labels the audio. The default is the real MediaPipe +
//     YAMNet classifier; a failed model load falls back to labels-unavailable
//     inside `analyse`. Tests inject the deterministic fake.
//
// Language and reduced motion are read from the OS/browser at first mount and
// then owned by Settings (Req 9.1, 10.4). The object URL for the <video> is
// created from the same File the user opened and revoked when it changes, so
// the media never leaves the device (Req 1.1, 1.5).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventTrack, StereoPcm } from '../shared/types.ts';
import type { Classifier } from '../classify/classifier.ts';
import { makeMediapipeClassifier } from '../classify/mediapipeClassifier.ts';
import { decodeFile } from '../audio/decode.ts';
import { analyse } from '../events/analyse.ts';
import { asLang, DEFAULT_LANG, t } from '../i18n/index.ts';
import type { Lang } from '../i18n/index.ts';
import { defaultSettings, currentEventIndex, type Settings } from './settings.ts';
import { DropZone } from './DropZone.tsx';
import { Progress } from './Progress.tsx';
import { Player } from './Player.tsx';
import { Timeline } from './Timeline.tsx';
import { EventList } from './EventList.tsx';
import { SettingsPanel } from './Settings.tsx';
import { AboutGhosts } from './AboutGhosts.tsx';
import { ExportButton } from './ExportButton.tsx';

/** How the user's file is turned into decoded stereo audio. */
export type DecodeFn = (file: File) => Promise<StereoPcm>;

export interface AppProps {
  /** Decoder; defaults to the real Web Audio `decodeFile` (task 10.1). */
  decode?: DecodeFn;
  /** Classifier; defaults to the real MediaPipe + YAMNet classifier (task 10.3). */
  classifier?: Classifier;
  /** Initial language; defaults to the browser language, else English. */
  initialLang?: Lang;
}

/** The three screens of the app. */
type Phase =
  | { kind: 'intake' }
  | { kind: 'analysing'; progress: number }
  | { kind: 'watch'; track: EventTrack; src: string }
  | { kind: 'error'; message: string };

/** Default decoder: the real Web Audio `decodeFile` (task 10.1). */
const defaultDecode: DecodeFn = (file) => decodeFile(file);

/** Read the OS reduced-motion preference, defensively for non-browser tests. */
function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function App({ decode, classifier, initialLang }: AppProps = {}): JSX.Element {
  const decodeFn = decode ?? defaultDecode;
  const classifierImpl = useMemo(
    () => classifier ?? makeMediapipeClassifier(),
    [classifier],
  );

  const startLang: Lang =
    initialLang ??
    (typeof navigator !== 'undefined' ? asLang(navigator.language?.slice(0, 2)) : DEFAULT_LANG);

  const [phase, setPhase] = useState<Phase>({ kind: 'intake' });
  const [settings, setSettings] = useState<Settings>(() =>
    defaultSettings(startLang, prefersReducedMotion()),
  );
  const [time, setTime] = useState(0);

  const strings = t(settings.lang);
  const seekRef = useRef<((seconds: number) => void) | null>(null);

  // Revoke the object URL when the watch session ends or changes.
  const srcRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (srcRef.current) URL.revokeObjectURL(srcRef.current);
    };
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      setPhase({ kind: 'analysing', progress: 0 });
      setTime(0);
      try {
        const pcm = await decodeFn(file);
        const track = await analyse(pcm, classifierImpl, {
          onProgress: (p) => setPhase({ kind: 'analysing', progress: p }),
        });
        if (srcRef.current) URL.revokeObjectURL(srcRef.current);
        const src = URL.createObjectURL(file);
        srcRef.current = src;
        setPhase({ kind: 'watch', track, src });
      } catch (err) {
        const name = file.name;
        const message = `${strings.ui.decodeErrorPrefix} "${name}". ${strings.ui.decodeErrorSuggest}`;
        setPhase({ kind: 'error', message });
        void err;
      }
    },
    [decodeFn, classifierImpl, strings.ui.decodeErrorPrefix, strings.ui.decodeErrorSuggest],
  );

  const seek = useCallback((seconds: number) => {
    seekRef.current?.(seconds);
  }, []);

  return (
    <main className="app">
      <header className="app__header">
        <h1>{strings.ui.appName}</h1>
      </header>

      {phase.kind === 'intake' && (
        <DropZone strings={strings} onFile={onFile} />
      )}

      {phase.kind === 'analysing' && (
        <Progress strings={strings} value={phase.progress} />
      )}

      {phase.kind === 'error' && (
        <section className="app__error" role="alert">
          <p>{phase.message}</p>
          <button type="button" onClick={() => setPhase({ kind: 'intake' })}>
            {strings.ui.chooseFile}
          </button>
        </section>
      )}

      {phase.kind === 'watch' && (
        <WatchScreen
          track={phase.track}
          src={phase.src}
          settings={settings}
          onSettings={setSettings}
          time={time}
          onTime={setTime}
          seek={seek}
          registerSeek={(fn) => {
            seekRef.current = fn;
          }}
        />
      )}
    </main>
  );
}

interface WatchScreenProps {
  track: EventTrack;
  src: string;
  settings: Settings;
  onSettings: (s: Settings) => void;
  time: number;
  onTime: (t: number) => void;
  seek: (seconds: number) => void;
  registerSeek: (fn: ((seconds: number) => void) | null) => void;
}

function WatchScreen({
  track,
  src,
  settings,
  onSettings,
  time,
  onTime,
  seek,
  registerSeek,
}: WatchScreenProps): JSX.Element {
  const strings = t(settings.lang);
  const currentIndex = currentEventIndex(track.events, time);

  return (
    <div className="watch">
      {track.mono && (
        <p className="notice notice--mono" role="note">
          {strings.ui.monoNotice}
        </p>
      )}
      {!track.labelsAvailable && (
        <p className="notice notice--labels" role="note">
          {strings.ui.labelsUnavailable}
        </p>
      )}

      <Player
        src={src}
        track={track}
        settings={settings}
        onTimeUpdate={onTime}
        registerSeek={registerSeek}
      />

      <Timeline
        track={track}
        strings={strings}
        lang={settings.lang}
        currentIndex={currentIndex}
        onSeek={seek}
      />

      <div className="watch__controls">
        <ExportButton track={track} lang={settings.lang} strings={strings} />
        <AboutGhosts strings={strings} />
      </div>

      <EventList
        track={track}
        strings={strings}
        currentIndex={currentIndex}
        onSeek={seek}
      />

      <SettingsPanel strings={strings} settings={settings} onChange={onSettings} />
    </div>
  );
}
