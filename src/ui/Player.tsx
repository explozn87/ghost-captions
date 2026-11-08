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
import { draw, preloadSpriteImages, measureDialogueBandFrac } from '../overlay/draw.ts';
import { activeDialogueCue } from '../subtitles/parse.ts';
import { ghostConfig } from '../config/ghost.config.ts';
import type { Strings } from '../i18n/index.ts';
import type { Settings } from './settings.ts';
import {
  toOverlaySettings,
  BURNED_IN_CAPTION_BAND,
  isVideoSilent,
  overlayShouldShow,
  chipStateFor,
} from './settings.ts';

export interface PlayerProps {
  /** Object URL for the local media; created and revoked by the parent. */
  src: string;
  track: EventTrack;
  /** Dialogue subtitle cues to show in the caption band (task 19.2). */
  dialogue?: readonly DialogueCue[];
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

  // Show-when state (task 21.1/21.2): whether the video is currently silent to
  // the viewer (muted or zero volume), driven by the `volumechange` event (no
  // polling), and the chip the player shows. `chipVisible` fades the chip in
  // for 2 s after a change and while the pointer is over the player (task 21.2).
  const [silent, setSilent] = useState(true);
  const [chipVisible, setChipVisible] = useState(true);
  const silentRef = useRef(true);
  silentRef.current = silent;
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
      const target = overlayShouldShow(s.showWhen, silentRef.current) ? 1 : 0;
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
    </div>
  );
}
