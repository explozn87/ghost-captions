// Player — the video with the ghost overlay (task 9.1, Requirements 2.1, 6.1).
//
// A <video> plays the local clip; a <canvas> sits exactly over it and draws the
// ghosts for the events active at the video's current time. The overlay is
// driven by `requestVideoFrameCallback` where the browser provides it (the
// most accurate "a new video frame is on screen" signal), falling back to
// `requestAnimationFrame`. Because we read `video.currentTime` every tick, the
// overlay stays in sync through seeking, pausing and rate changes (Req 6.1):
// paused still ticks via rAF so a seek while paused repaints, and the time read
// reflects whatever rate the video is playing at.
//
// The drawing itself is the pure `layout()` → `draw()` pair from task 8, so the
// Player holds no positioning logic; it only wires time, size and settings to
// them and keeps the canvas's backing store matched to its CSS size for crisp
// output.

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { DialogueCue, EventTrack } from '../shared/types.ts';
import { activeEvents } from '../events/buildEvents.ts';
import { layout, edgeFogs, fogDecayDuration } from '../overlay/layout.ts';
import { draw, preloadSpriteImages, measureDialogueBandFrac, spriteImageUrl } from '../overlay/draw.ts';
import { activeDialogueCue } from '../subtitles/parse.ts';
import { ghostConfig } from '../config/ghost.config.ts';
import type { Strings } from '../i18n/index.ts';
import { soundNoun } from '../i18n/soundLabel.ts';
import type { Settings } from './settings.ts';
import {
  toOverlaySettings,
  BURNED_IN_CAPTION_BAND,
  isVideoSilent,
  overlayShouldShow,
  chipStateFor,
  missedCount,
  latestMissedEvent,
} from './settings.ts';
import { missedOccurrences, missedBasis, occurrenceTimeLabel } from '../events/occurrences.ts';
import { occurrenceNoun } from '../i18n/soundLabel.ts';
import {
  comparePlan,
  comparePhaseAt,
  comparePlaybackTime,
  compareOverlayVisible,
  type ComparePhase,
} from './compare.ts';

export interface PlayerProps {
  /** Object URL for the local media; created and revoked by the parent. */
  src: string;
  track: EventTrack;
  /** Dialogue subtitle cues to show in the caption band (task 19.2). */
  dialogue?: readonly DialogueCue[];
  /**
   * Optional end point (seconds) for a short demo (task 25.6): playback treats
   * reaching this as the end (pauses, shows the end card) and the counter and
   * end card count only occurrences before it. Omitted for user files.
   */
  endAt?: number | undefined;
  /**
   * Whether this clip is a bundled demo with no subtitle file (task 25.7): the
   * end-card basis line then spells out that dialogue-only captions were
   * assumed. Ignored when a subtitle file is loaded.
   */
  isDemo?: boolean | undefined;
  settings: Settings;
  /** UI strings for the status chip (task 21.2). */
  strings: Strings;
  /** Open the Settings panel at the show-when control when the chip is clicked (task 21.2). */
  onOpenShowWhen?: () => void;
  /** Reports the current playback time so sibling panels can highlight. */
  onTimeUpdate?: (t: number) => void;
  /**
   * Called once with a `seek(seconds)` function so the timeline and event list
   * can move the playhead (Req 7.1, 7.2); passing null on unmount clears it.
   */
  registerSeek?: (seek: ((seconds: number) => void) | null) => void;
}

/**
 * `requestVideoFrameCallback` is not in every DOM lib version; describe just
 * the two methods we optionally use, without extending HTMLVideoElement (which
 * would conflict where the lib already declares them).
 */
interface RvfcCapable {
  requestVideoFrameCallback?: (cb: (now: number, meta: unknown) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

export function Player({
  src,
  track,
  dialogue,
  endAt,
  isDemo,
  settings,
  strings,
  onOpenShowWhen,
  onTimeUpdate,
  registerSeek,
}: PlayerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Fullscreen must take the whole player (video + ghost canvas), not the bare
  // <video>: a browser's own video fullscreen shows only the video, so every
  // ghost vanished (feedback 2026-11-08).
  const playerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspect, setAspect] = useState(16 / 9);
  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  const toggleFullscreen = () => {
    const player = playerRef.current;
    if (!player) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void player.requestFullscreen().catch(() => {});
  };
  useEffect(() => {
    const onChange = () => {
      const el = document.fullscreenElement;
      // Some browsers still offer their own video fullscreen (control bar or
      // double-click). Redirect it to the whole player so the ghosts come too.
      if (el && el === videoRef.current && playerRef.current) {
        void document
          .exitFullscreen()
          .then(() => playerRef.current?.requestFullscreen())
          .catch(() => {});
        return;
      }
      setIsFullscreen(!!el && el === playerRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  // Keep the latest settings in a ref so the draw loop reads current values
  // without being torn down and rebuilt on every settings change.
  const settingsRef = useRef<Settings>(settings);
  settingsRef.current = settings;
  const trackRef = useRef<EventTrack>(track);
  trackRef.current = track;
  const dialogueRef = useRef<readonly DialogueCue[]>(dialogue ?? []);
  dialogueRef.current = dialogue ?? [];
  const onTimeRef = useRef<PlayerProps['onTimeUpdate']>(onTimeUpdate);
  onTimeRef.current = onTimeUpdate;

  // Compare run state (task 25.5): when the viewer clicks Compare on an
  // evidence row, we play the window around that occurrence twice — once with
  // the overlay hidden ("Captions only"), once with it shown ("With Ghost
  // Captions") — then return to the end card. The pure state machine lives in
  // `compare.ts`; here we only hold the active run and surface the current
  // chip. The draw loop reads `compareRef` to override the overlay target.
  const [comparePhase, setComparePhase] = useState<ComparePhase | null>(null);
  const compareRef = useRef<{ plan: ReturnType<typeof comparePlan>; startWall: number } | null>(null);

  // Show-when state (task 21.1/21.2): whether the video is currently silent to
  // the viewer (muted or zero volume), driven by the `volumechange` event (no
  // polling), and the chip the player shows. `chipVisible` fades the chip in
  // for 2 s after a change and while the pointer is over the player (task 21.2).
  const [silent, setSilent] = useState(true);
  const [chipVisible, setChipVisible] = useState(true);
  const silentRef = useRef(true);
  silentRef.current = silent;

  // "Sounds the captions missed" counter (task 22.5): the current playback time
  // (so the count can rise as events start) and whether the video has ended (to
  // swap the chip for the centred end card). `videoTime` is updated from the
  // draw loop below; it is cheap because the counter only changes when an event
  // starts.
  const [videoTime, setVideoTime] = useState(0);
  const [ended, setEnded] = useState(false);
  // The brief "+1 <sound>" flash and one scale pulse when the count rises
  // (task 22.5). `flash` holds the newest sound's name while visible, or null.
  const [flash, setFlash] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const prevMissedRef = useRef(0);
  // The animated overlay opacity (0..1), read and written by the draw loop so
  // it fades independently of React renders.
  const overlayAlphaRef = useRef(1);
  const lastFrameWallRef = useRef(0);

  // Expose a seek function to the parent for the timeline/event list.
  useEffect(() => {
    if (!registerSeek) return;
    registerSeek((seconds: number) => {
      const video = videoRef.current;
      if (video) video.currentTime = Math.max(0, seconds);
    });
    return () => registerSeek(null);
  }, [registerSeek, src]);

  // Start muted so the ghosts are visible at once (browsers require muted
  // autoplay anyway) and a judge sees them rest when they unmute (task 21.3),
  // then listen to `volumechange` — no polling — to track whether the video is
  // silent to the viewer (task 21.1).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    const update = () => {
      const next = isVideoSilent(video.muted, video.volume);
      setSilent(next);
      // Surface the chip for 2 s on every change (task 21.2).
      setChipVisible(true);
    };
    update();
    video.addEventListener('volumechange', update);
    return () => video.removeEventListener('volumechange', update);
  }, [src]);

  // Track whether the video has ended, to show the end card (task 22.5). Any
  // play/seek back into the clip clears it so "Watch again" and the scrubber
  // both bring the ghosts back. The missed-sounds counter follows the video's
  // own `timeupdate` (not the overlay draw loop) so it keeps counting even
  // where there is no canvas to draw on (e.g. tests).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnded = () => setEnded(true);
    const onPlaying = () => setEnded(false);
    const onSeeking = () => {
      if (!video.ended) setEnded(false);
    };
    const onTime = () => {
      // A short demo ends at `endAt` (task 25.6): treat reaching it as the end
      // of the clip — pause, clamp the time, and show the end card. Seeking
      // back before endAt (onSeeking/onPlaying) clears `ended` as usual.
      if (endAt != null && video.currentTime >= endAt) {
        if (!video.paused) video.pause();
        setVideoTime(endAt);
        setEnded(true);
        return;
      }
      setVideoTime(video.currentTime);
    };
    video.addEventListener('ended', onEnded);
    video.addEventListener('play', onPlaying);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('timeupdate', onTime);
    return () => {
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('play', onPlaying);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('seeking', onSeeking);
      video.removeEventListener('timeupdate', onTime);
    };
  }, [src, endAt]);

  // Hide the status chip 2 s after it was last shown, unless the pointer is
  // over the player (handled by the hover handlers below) (task 21.2).
  useEffect(() => {
    if (!chipVisible) return;
    const id = setTimeout(() => setChipVisible(false), 2000);
    return () => clearTimeout(id);
  }, [chipVisible, silent]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const rvfc = video as HTMLVideoElement & RvfcCapable;
    // `getContext` can throw in environments without a canvas backend (jsdom);
    // the overlay is purely visual, so if there is no 2D context we simply do
    // not draw — every piece of information also lives in the event list.
    let raw: ReturnType<HTMLCanvasElement['getContext']> = null;
    try {
      raw = canvas.getContext('2d');
    } catch {
      raw = null;
    }
    if (!raw) return;
    // `draw` is typed against the minimal structural `Ctx2D`; a real 2D context
    // satisfies every member it uses (the lib's wider `fillStyle` union is the
    // only mismatch), so narrow it here.
    const ctx = raw as unknown as Parameters<typeof draw>[0];

    // Preload the ghost sprite images once; draw falls back to silhouettes
    // until each is ready (task 16.5).
    preloadSpriteImages();

    let stopped = false;
    let rafHandle = 0;
    let rvfcHandle = 0;
    let lastReported = -1;

    const renderAt = (time: number) => {
      // Match the canvas backing store to its displayed size.
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      const s = settingsRef.current;

      // The active dialogue cue, if any (task 19.2). Its rendered height is
      // measured so the caption band grows to fit it; when the viewer declares
      // burned-in subtitles the band is at least 22% (task 19.3). The larger of
      // the two wins so ghosts always clear whatever is at the bottom.
      const cue = activeDialogueCue(dialogueRef.current, time);
      const dialogueText = cue?.text ?? null;
      const measuredBand = measureDialogueBandFrac(ctx, dialogueText);
      const burnedInBand = s.burnedInSubtitles ? BURNED_IN_CAPTION_BAND : 0;
      const captionBandFrac = Math.max(measuredBand, burnedInBand);

      const overlay = { ...toOverlaySettings(s), captionBandFrac };
      const active = activeEvents(trackRef.current, time);
      const sprites = layout(active, time, { width: w, height: h }, overlay);
      // Edge fog (task 16.3) needs ambient events that are active OR ended
      // within the decay window, so their slow withdrawal still shows.
      const decay = fogDecayDuration();
      const fogCandidates = trackRef.current.events.filter(
        (e) => e.start <= time && e.end + decay > time,
      );
      const fogs = edgeFogs(fogCandidates, time, overlay);

      // Fade the whole sound overlay toward its show-when target (task 21.1),
      // stepping by the wall-clock elapsed since the last frame so the 0.6 s
      // fade is the same at any frame rate. Dialogue is drawn at full opacity
      // inside draw regardless.
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const dt = lastFrameWallRef.current ? (now - lastFrameWallRef.current) / 1000 : 0;
      lastFrameWallRef.current = now;
      // During a compare run the overlay follows the compare phase, not the
      // show-when/mute state (task 25.5): hidden in the captions-only pass,
      // shown in the with-ghosts pass. Otherwise it follows show-when (task 21).
      const run = compareRef.current;
      let target: number;
      if (run) {
        const elapsed = (now - run.startWall) / 1000;
        const phase = comparePhaseAt(elapsed, run.plan);
        target = compareOverlayVisible(phase) ? 1 : 0;
      } else {
        target = overlayShouldShow(s.showWhen, silentRef.current) ? 1 : 0;
      }
      const fadeSeconds = ghostConfig.overlayFadeSeconds.value;
      const step = fadeSeconds > 0 ? dt / fadeSeconds : 1;
      const current = overlayAlphaRef.current;
      let nextAlpha = current;
      if (current < target) nextAlpha = Math.min(target, current + step);
      else if (current > target) nextAlpha = Math.max(target, current - step);
      overlayAlphaRef.current = nextAlpha;

      draw(ctx, sprites, fogs, time, s.reducedMotion, {
        captionBandFrac,
        dialogue: dialogueText,
        overlayAlpha: nextAlpha,
      });

      if (time !== lastReported) {
        lastReported = time;
        onTimeRef.current?.(time);
      }
    };

    const tick = () => {
      if (stopped) return;
      renderAt(video.currentTime);
      // A paused video presents no new frames, so requestVideoFrameCallback
      // would never fire and a mute/unmute fade (task 21.1) would freeze.
      // Fall back to rAF while paused; playback switches back on the next tick.
      if (rvfc.requestVideoFrameCallback && !video.paused) {
        rvfcHandle = rvfc.requestVideoFrameCallback(() => tick());
      } else {
        rafHandle = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      stopped = true;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      if (rvfcHandle && rvfc.cancelVideoFrameCallback) {
        rvfc.cancelVideoFrameCallback(rvfcHandle);
      }
    };
  }, [src]);

  const chipState = chipStateFor(settings.showWhen, silent);
  const chipText =
    chipState === 'always'
      ? strings.ui.chipAlways
      : chipState === 'soundOff'
        ? strings.ui.chipSoundOff
        : strings.ui.chipSoundOn;

  // "Sounds the captions missed" counter (task 22.5). The count follows the
  // same hidden-family and speech rules as the overlay, and both the running
  // chip and the end card read it. The counter and card follow the show-when
  // overlay visibility (task 21): when the sound overlay is resting they hide.
  const overlayVisible = overlayShouldShow(settings.showWhen, silent);
  const dialogueCues = dialogue ?? [];
  // The effective end of the clip (task 25.6): a short demo ends at `endAt`,
  // otherwise the clip's full duration. Counting and the evidence list use it
  // so a trimmed demo never counts sounds past its end.
  const effectiveEnd = endAt != null ? Math.min(endAt, track.duration) : track.duration;
  const countTime = Math.min(videoTime, effectiveEnd);
  const missed = missedCount(track.events, countTime, settings, dialogueCues);
  // The newest missed sound's name, for the brief "+1 <sound>" flash.
  const newest = latestMissedEvent(track.events, countTime, settings, dialogueCues);
  const newestNoun = newest ? soundNoun(newest, strings, settings.lang) : '';
  const missedText = strings.ui.missedCount.replace('{n}', String(missed));
  const plusOneText = strings.ui.missedPlusOne.replace('{sound}', newestNoun);
  const endCardText = strings.ui.missedEndCard.replace('{n}', String(missed));
  // The basis line under the end-card number (tasks 23.2, 25.7): with a loaded
  // file, say so; with no file, a demo spells out that dialogue-only captions
  // were assumed (task 25.7), any other clip keeps the short dialogue-only line.
  const basisText =
    missedBasis(dialogueCues) === 'withFile'
      ? strings.ui.missedBasisWithFile
      : isDemo
        ? strings.ui.missedBasisDemoNoFile
        : strings.ui.missedBasisDialogueOnly;
  // The evidence list on the end card (task 23.3): every counted occurrence up
  // to the clip's effective end (task 25.6), one row each with its time span,
  // family sprite and label.
  const evidence = missedOccurrences(track.events, effectiveEnd, settings, dialogueCues);

  // When the count rises, show "+1 <sound>" briefly and give the chip one
  // gentle scale pulse (none under reduced motion) (task 22.5). A reset to a
  // lower count (seeking back, watch again) just updates the baseline without a
  // flash.
  useEffect(() => {
    const prev = prevMissedRef.current;
    prevMissedRef.current = missed;
    if (missed <= prev) return;
    setFlash(newestNoun);
    if (!settings.reducedMotion) {
      setPulse(true);
    }
    const flashId = setTimeout(() => setFlash(null), 1500);
    const pulseId = setTimeout(() => setPulse(false), 400);
    return () => {
      clearTimeout(flashId);
      clearTimeout(pulseId);
    };
  }, [missed, newestNoun, settings.reducedMotion]);

  const watchAgain = () => {
    const video = videoRef.current;
    if (!video) return;
    setEnded(false);
    video.currentTime = 0;
    // `play()` returns a Promise in browsers but may return undefined in some
    // environments (e.g. jsdom); guard the `.catch` so autoplay rejection never
    // throws.
    const played = video.play() as Promise<void> | undefined;
    if (played && typeof played.catch === 'function') played.catch(() => {});
  };

  // Seek to 0.5 s before an occurrence and play (task 23.3): clicking or
  // pressing Enter on an evidence row brings the viewer to that sound.
  const seekToOccurrence = (start: number) => {
    const video = videoRef.current;
    if (!video) return;
    setEnded(false);
    video.currentTime = Math.max(0, start - 0.5);
    const played = video.play() as Promise<void> | undefined;
    if (played && typeof played.catch === 'function') played.catch(() => {});
  };

  // Start a Compare run for an occurrence (task 25.5): play the window around
  // it twice (captions-only, then with ghosts) then return to the end card. The
  // pure state machine in `compare.ts` decides the phase and the playback time;
  // this effect just drives the video and the chip from a wall clock, then
  // restores the end card. Starting a run leaves the end card (so the video is
  // visible) and ends it by re-showing the card.
  const compareTick = useRef<number>(0);
  const startCompare = (start: number) => {
    const video = videoRef.current;
    if (!video) return;
    const plan = comparePlan(start);
    compareRef.current = { plan, startWall: (typeof performance !== 'undefined' ? performance.now() : Date.now()) };
    setEnded(false);
    setComparePhase('captionsOnly');
    const step = () => {
      const run = compareRef.current;
      const v = videoRef.current;
      if (!run || !v) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsed = (now - run.startWall) / 1000;
      const phase = comparePhaseAt(elapsed, run.plan);
      if (phase === 'done') {
        // Finished: stop the run, pause and return to the end card.
        compareRef.current = null;
        setComparePhase(null);
        v.pause();
        setEnded(true);
        return;
      }
      setComparePhase(phase);
      // Keep the playback head inside the window; wrap back to the start for the
      // second pass. Seeking only when the drift is large avoids fighting normal
      // playback.
      const want = comparePlaybackTime(elapsed, run.plan);
      if (Math.abs(v.currentTime - want) > 0.4) v.currentTime = want;
      const played = v.play() as Promise<void> | undefined;
      if (played && typeof played.catch === 'function') played.catch(() => {});
      compareTick.current = requestAnimationFrame(step);
    };
    // Seek to the window start and begin.
    video.currentTime = plan.from;
    compareTick.current = requestAnimationFrame(step);
  };
  // Stop any compare run when the player unmounts.
  useEffect(() => {
    return () => {
      if (compareTick.current) cancelAnimationFrame(compareTick.current);
      compareRef.current = null;
    };
  }, []);

  return (
    <div
      ref={playerRef}
      className={`player${isFullscreen ? ' player--fullscreen' : ''}`}
      onPointerEnter={() => setChipVisible(true)}
      onPointerLeave={() => setChipVisible(false)}
    >
      <div className="player__stage" style={{ '--ar': String(aspect) } as React.CSSProperties}>
        <video
          ref={videoRef}
          className="player__video"
          src={src}
          controls
          playsInline
          preload="auto"
          {...{ controlsList: 'nofullscreen' }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth > 0 && v.videoHeight > 0) setAspect(v.videoWidth / v.videoHeight);
          }}
          onDoubleClick={canFullscreen ? toggleFullscreen : undefined}
        />
        <canvas ref={canvasRef} className="player__overlay" aria-hidden="true" />
      </div>
      {canFullscreen && (
        <button
          type="button"
          className="player__fullscreen"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? strings.ui.exitFullscreen : strings.ui.fullscreen}
          title={isFullscreen ? strings.ui.exitFullscreen : strings.ui.fullscreen}
        >
          {isFullscreen ? '✕' : '⛶'}
        </button>
      )}
      <button
        type="button"
        className={`player__chip${chipVisible ? '' : ' player__chip--hidden'}`}
        onClick={() => onOpenShowWhen?.()}
        aria-hidden={chipVisible ? undefined : true}
      >
        {chipText}
      </button>

      {/* Compare chip (task 25.5): during a Compare run, name the pass — first
          "Captions only" (overlay hidden), then "With Ghost Captions" (overlay
          shown). Text carries the meaning, not only the state. */}
      {comparePhase && (
        <div className="player__compare-chip" role="status" aria-live="polite">
          {comparePhase === 'captionsOnly'
            ? strings.ui.compareCaptionsOnly
            : strings.ui.compareWithGhosts}
        </div>
      )}

      {/* "Sounds the captions missed" counter (task 22.5): top-right, inside
          the player so it shows in full screen too. It follows the show-when
          overlay visibility, and becomes a centred end card when the video
          ends. Information is in text, not only motion. */}
      {overlayVisible && !ended && (
        <div
          className={`player__missed${pulse ? ' player__missed--pulse' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className="player__missed-count">{missedText}</span>
          {flash && <span className="player__missed-plus">{plusOneText}</span>}
        </div>
      )}
      {overlayVisible && ended && (
        <div className="player__endcard" role="status" aria-live="polite">
          <p className="player__endcard-text">{endCardText}</p>
          <p className="player__endcard-basis">{basisText}</p>
          {evidence.length > 0 && (
            <>
              <h3 className="player__endcard-heading">{strings.ui.missedListHeading}</h3>
              <ul className="player__endcard-list">
                {evidence.map((occ) => {
                  const label = occurrenceNoun(occ, strings, settings.lang);
                  return (
                    <li key={`${occ.group}-${occ.start}`} className="player__endcard-item">
                      <button
                        type="button"
                        className="player__endcard-row"
                        onClick={() => seekToOccurrence(occ.start)}
                      >
                        <span className="player__endcard-time">{occurrenceTimeLabel(occ)}</span>
                        <img
                          className="player__endcard-sprite"
                          src={spriteImageUrl(occ.family)}
                          alt=""
                          aria-hidden="true"
                          width={20}
                          height={20}
                        />
                        <span className="player__endcard-label">{label}</span>
                      </button>
                      <button
                        type="button"
                        className="player__endcard-compare"
                        onClick={() => startCompare(occ.start)}
                      >
                        {strings.ui.compare}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <button type="button" className="player__endcard-again" onClick={watchAgain}>
            {strings.ui.watchAgain}
          </button>
        </div>
      )}
    </div>
  );
}
