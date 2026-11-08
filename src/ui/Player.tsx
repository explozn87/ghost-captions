// Player — the video with the ghost overlay (task 9.1, Requirements 2.1, 6.1).
//
// A <video> plays the local clip; a <canvas> sits exactly over it and draws the
// ghosts for the events active at the video's current time. The overlay is
// driven by `requestAnimationFrame` ALWAYS — paused or playing (task 30.1) —
// reading `video.currentTime` on every tick, so it stays in sync through
// seeking, pausing and rate changes (Req 6.1) at the display frame rate.
// `requestVideoFrameCallback`, where the browser provides it, is kept only as
// an optional EXTRA trigger: browsers throttle it (the review browser saw it
// fire once per second on a 24 fps clip), so it must never drive the loop on
// its own, or the overlay lags a full second behind and opens a Compare on the
// wrong ghost.
//
// The drawing itself is the pure `layout()` → `draw()` pair from task 8, so the
// Player holds no positioning logic; it only wires time, size and settings to
// them and keeps the canvas's backing store matched to its CSS size for crisp
// output.

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { DialogueCue, EventTrack } from '../shared/types.ts';
import { activeEvents } from '../events/buildEvents.ts';
import { layout, edgeFogs, fogDecayDuration, isGhostVisibleAt } from '../overlay/layout.ts';
import { draw, preloadSpriteImages, measureDialogueBandFrac, spriteImageUrl, isDarkFrame } from '../overlay/draw.ts';
import { activeDialogueCue } from '../subtitles/parse.ts';
import { ghostConfig } from '../config/ghost.config.ts';
import { isAmbientFamily } from '../config/ghost.config.ts';
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
  formatClock,
} from './settings.ts';
import { missedOccurrences, missedBasis, occurrenceTimeLabel, occurrenceShownEnd } from '../events/occurrences.ts';
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
  // The occurrence start being compared (task 27.1), so the captions-only plate
  // can show a loaded subtitle cue overlapping it instead of the generic line.
  const [compareStart, setCompareStart] = useState<number | null>(null);
  // The label of the occurrence last compared (task 29.5): once a Compare run
  // finishes and the end card returns, a one-sentence close naming this row is
  // shown under the headline. Cleared by another Compare or Watch again.
  const [closingLabel, setClosingLabel] = useState<string | null>(null);
  // The label for the compare run in progress, promoted to `closingLabel` only
  // when the run finishes (so a cancelled/restarted run does not leave a stale
  // sentence).
  const compareLabelRef = useRef<string | null>(null);

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
  // Whether the video is paused, for the player's own play/pause button (task
  // 29.2: native controls are hidden, so the button reflects and toggles it).
  const [paused, setPaused] = useState(true);
  // The brief "+1 <sound>" flash and one scale pulse when the count rises
  // (task 22.5). `flash` holds the newest sound's name while visible, or null.
  const [flash, setFlash] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const prevMissedRef = useRef(0);
  // The animated overlay opacity (0..1), read and written by the draw loop so
  // it fades independently of React renders.
  const overlayAlphaRef = useRef(1);
  const lastFrameWallRef = useRef(0);
  // Dark-frame sampling (task 27.3): a tiny offscreen canvas and the last
  // sampled "is the video frame dark" result, refreshed at most every 0.5 s.
  // Labels get a size boost on a dark scene so a pale label stays readable.
  // The downsample is read on-device only; nothing leaves the browser.
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const darkFrameRef = useRef(false);
  const lastSampleWallRef = useRef(0);
  // An immediate-redraw hook (task 29.1): the draw-loop effect assigns the
  // current `renderAt` here so a `seeked` (or `play` after a seek) can force a
  // redraw for `video.currentTime` at once, rather than waiting for the next
  // animation frame — which, with `requestVideoFrameCallback`, does not fire
  // while the video is seeking and so left the overlay showing the pre-seek
  // ghosts (step 2/2 of a Compare opened on the wrong ghost).
  const renderNowRef = useRef<((time: number) => void) | null>(null);

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
    const onEnded = () => {
      setEnded(true);
      setPaused(true);
    };
    const onPlaying = () => {
      setEnded(false);
      setPaused(false);
    };
    const onPause = () => setPaused(true);
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
    video.addEventListener('pause', onPause);
    video.addEventListener('seeking', onSeeking);
    video.addEventListener('timeupdate', onTime);
    return () => {
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('play', onPlaying);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
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
      // A short point ghost lingers past its measured end up to its display end
      // (task 34.1), so the Player passes `layout` not just the active events
      // but also point events whose measured span has ended yet are still
      // within their linger window. `layout` filters by `isGhostVisibleAt` and
      // fades the tail. Ambient events are unaffected (they keep their own
      // attack/decay), so only point events are extended here; the active set
      // already covers everything still playing.
      const lingering = trackRef.current.events.filter(
        (e) =>
          e.end <= time &&
          isGhostVisibleAt(e, time) &&
          !isAmbientFamily(e.family),
      );
      const pointCandidates = lingering.length > 0 ? [...active, ...lingering] : active;
      const sprites = layout(pointCandidates, time, { width: w, height: h }, overlay);
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

      // Sample whether the current video frame is dark (task 27.3) at most
      // every 0.5 s: draw a tiny 16×9 downsample of the video to an offscreen
      // canvas, read it back and ask `isDarkFrame`. If reading the frame is not
      // possible (no canvas backend, or the video is not ready), the last
      // result stands. The downsample is read on-device only.
      if (now - lastSampleWallRef.current >= 500) {
        lastSampleWallRef.current = now;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            let sc = sampleCanvasRef.current;
            if (!sc) {
              sc = document.createElement('canvas');
              sc.width = 16;
              sc.height = 9;
              sampleCanvasRef.current = sc;
            }
            const sctx = sc.getContext('2d', { willReadFrequently: true });
            if (sctx) {
              sctx.drawImage(video, 0, 0, sc.width, sc.height);
              const data = sctx.getImageData(0, 0, sc.width, sc.height).data;
              darkFrameRef.current = isDarkFrame(data);
            }
          }
        } catch {
          // Reading the frame can throw (tainted canvas, no backend); keep the
          // last result rather than failing the overlay.
        }
      }

      draw(ctx, sprites, fogs, time, s.reducedMotion, {
        captionBandFrac,
        dialogue: dialogueText,
        overlayAlpha: nextAlpha,
        darkFrame: darkFrameRef.current,
      });

      if (time !== lastReported) {
        lastReported = time;
        onTimeRef.current?.(time);
      }
    };

    // The overlay is driven by `requestAnimationFrame` ALWAYS — paused or
    // playing (task 30.1). `requestVideoFrameCallback`, where available, fires
    // only when a new decoded video frame is presented, and browsers throttle
    // it hard (occluded windows, power saving): the review browser saw it fire
    // only once per second while the Sintel demo played at 24 fps, so the
    // overlay content changed only once per second and lagged a full second
    // behind a seek. rAF, by contrast, runs every display frame. Each tick
    // reads `video.currentTime`, so the overlay stays in sync through play,
    // pause, seek and rate change. rVFC is kept only as an OPTIONAL extra
    // trigger: when it does fire we redraw for the current time as well, which
    // costs nothing and gives an extra-crisp repaint on the exact frame, but it
    // never drives the loop on its own.
    const tick = () => {
      if (stopped) return;
      renderAt(video.currentTime);
      rafHandle = requestAnimationFrame(tick);
    };

    const onVideoFrame = () => {
      if (stopped) return;
      renderAt(video.currentTime);
      // Re-register the extra trigger; it is purely supplementary to the rAF
      // loop above, so throttling or it never firing changes nothing.
      if (rvfc.requestVideoFrameCallback) {
        rvfcHandle = rvfc.requestVideoFrameCallback(onVideoFrame);
      }
    };

    // Expose an immediate redraw so a `seeked`/`play`-after-seek (task 29.1)
    // and the Compare step (task 30.1) can repaint for the new time at once,
    // not on the next frame callback.
    renderNowRef.current = (time: number) => {
      if (stopped) return;
      renderAt(time);
    };

    tick();
    if (rvfc.requestVideoFrameCallback) {
      rvfcHandle = rvfc.requestVideoFrameCallback(onVideoFrame);
    }

    return () => {
      stopped = true;
      renderNowRef.current = null;
      if (rafHandle) cancelAnimationFrame(rafHandle);
      if (rvfcHandle && rvfc.cancelVideoFrameCallback) {
        rvfc.cancelVideoFrameCallback(rvfcHandle);
      }
    };
  }, [src]);

  // Redraw immediately on seek and on play-after-seek (task 29.1): read
  // `video.currentTime` and repaint at once so the overlay never shows the
  // pre-seek state. The draw loop already derives the active ghosts from
  // `video.currentTime` every frame; this closes the gap during a seek, when
  // `requestVideoFrameCallback` does not fire. The missed-sounds `videoTime`
  // is also refreshed so the counter and the overlay agree immediately.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const redrawNow = () => {
      const t = video.currentTime;
      if (endAt == null || t < endAt) setVideoTime(t);
      renderNowRef.current?.(t);
    };
    video.addEventListener('seeked', redrawNow);
    video.addEventListener('play', redrawNow);
    return () => {
      video.removeEventListener('seeked', redrawNow);
      video.removeEventListener('play', redrawNow);
    };
  }, [src, endAt]);

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
  // The app's own time/progress readout spans 0..effectiveEnd (task 28.4): a
  // trimmed demo reads its endAt as the duration, a user file its full length.
  const displayDuration = effectiveEnd;
  const progressPct =
    displayDuration > 0 ? Math.min(100, Math.max(0, (videoTime / displayDuration) * 100)) : 0;
  const missed = missedCount(track.events, countTime, settings, dialogueCues);
  // The newest missed sound's name, for the brief "+1 <sound>" flash.
  const newest = latestMissedEvent(track.events, countTime, settings, dialogueCues);
  const newestNoun = newest ? soundNoun(newest, strings, settings.lang) : '';
  const missedText = strings.ui.missedCount.replace('{n}', String(missed));
  const plusOneText = strings.ui.missedPlusOne.replace('{sound}', newestNoun);
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
  // The listed span ends at the last moment the occurrence is actually SHOWN
  // on the overlay (task 29.4): a trailing music fragment that starts after the
  // clip's effective end must not stretch the span past where the ghost/label
  // is still drawn, so the picture and the list agree.
  const evidence = missedOccurrences(track.events, effectiveEnd, settings, dialogueCues).map((o) => {
    const shownEnd = occurrenceShownEnd(o, effectiveEnd);
    return shownEnd < o.end ? { ...o, end: shownEnd } : o;
  });

  // The end-card headline count is derived from the SAME occurrence list the
  // card shows (task 28.2), never from the live counter at the current
  // playback position: after a Compare run seeks the head back into the clip,
  // the live `missed` count would fall, but the card still lists every
  // occurrence up to the clip's end, so the number and the rows must agree.
  const endCardText = strings.ui.missedEndCard.replace('{n}', String(evidence.length));

  // The one-sentence close after a Compare finishes (task 29.5): names the row
  // just compared, making no claim beyond its own label. Null until a Compare
  // run ends; cleared by another Compare or Watch again.
  const closingText =
    closingLabel != null ? strings.ui.compareClosing.replace('{label}', closingLabel) : null;

  // The one obvious first click (task 27.2): the loudest POINT occurrence in
  // the evidence list (ambient sounds are atmosphere, a point sound like the
  // gunshot is the clearest "the captions missed this"). Its row is
  // highlighted, tagged "Try this first", and its Compare button is the primary
  // one that receives focus when the end card opens. -1 when the list has no
  // point occurrence.
  let firstTryIndex = -1;
  let firstTryLoudness = -Infinity;
  evidence.forEach((occ, i) => {
    if (isAmbientFamily(occ.family)) return;
    if (occ.loudness > firstTryLoudness) {
      firstTryLoudness = occ.loudness;
      firstTryIndex = i;
    }
  });

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

  // The captions-only caption-band plate text during a compare (task 27.1): if
  // a loaded subtitle cue overlaps the compared occurrence, show that cue's
  // text (the captions do describe this moment); otherwise the generic line
  // spelling out that the captions say nothing about this sound.
  const compareCue =
    compareStart != null ? activeDialogueCue(dialogueCues, compareStart) : null;
  const compareCaptionsPlateText = compareCue?.text ?? strings.ui.compareCaptionsOnlyPlate;

  const watchAgain = () => {
    const video = videoRef.current;
    if (!video) return;
    setEnded(false);
    // Watch again starts a fresh viewing: drop the compare closing sentence.
    setClosingLabel(null);
    video.currentTime = 0;
    // `play()` returns a Promise in browsers but may return undefined in some
    // environments (e.g. jsdom); guard the `.catch` so autoplay rejection never
    // throws.
    const played = video.play() as Promise<void> | undefined;
    if (played && typeof played.catch === 'function') played.catch(() => {});
  };

  // Play/pause toggle for the player's own controls (task 29.2): the native
  // `<video controls>` is hidden so only the trimmed time shows, so the player
  // keeps keyboard play/pause itself — Space or K on the player, or a click on
  // the picture — plus its own progress bar below.
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      setEnded(false);
      const played = video.play() as Promise<void> | undefined;
      if (played && typeof played.catch === 'function') played.catch(() => {});
    } else {
      video.pause();
    }
  };

  // Keyboard play/pause on the player (task 29.2): Space or K toggle playback
  // without the native control bar. Keys are ignored while focus is on a
  // button/link so Space still activates it (the end-card buttons, the chip).
  const onPlayerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT') return;
    if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      togglePlay();
    }
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
  const startCompare = (start: number, label: string) => {
    const video = videoRef.current;
    if (!video) return;
    const plan = comparePlan(start);
    compareRef.current = { plan, startWall: (typeof performance !== 'undefined' ? performance.now() : Date.now()) };
    compareLabelRef.current = label;
    setEnded(false);
    setComparePhase('captionsOnly');
    setCompareStart(start);
    // A new Compare clears any previous closing sentence until this run ends.
    setClosingLabel(null);
    const step = () => {
      const run = compareRef.current;
      const v = videoRef.current;
      if (!run || !v) return;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsed = (now - run.startWall) / 1000;
      const phase = comparePhaseAt(elapsed, run.plan);
      if (phase === 'done') {
        // Finished: stop the run, pause and return to the end card, with the
        // one-sentence close naming the row that was just compared (task 29.5).
        compareRef.current = null;
        setComparePhase(null);
        setCompareStart(null);
        setClosingLabel(compareLabelRef.current);
        v.pause();
        setEnded(true);
        return;
      }
      setComparePhase(phase);
      // Keep the playback head inside the window; wrap back to the start for the
      // second pass. Seeking only when the drift is large avoids fighting normal
      // playback.
      const want = comparePlaybackTime(elapsed, run.plan);
      if (Math.abs(v.currentTime - want) > 0.4) {
        v.currentTime = want;
        // Redraw for the sought time at once (task 30.1): do not wait for
        // `seeked`, which may not fire promptly during a programmatic seek, so
        // the second pass ("With Ghost Captions") always opens on the right
        // ghost rather than the pre-seek one.
        renderNowRef.current?.(want);
      }
      const played = v.play() as Promise<void> | undefined;
      if (played && typeof played.catch === 'function') played.catch(() => {});
      compareTick.current = requestAnimationFrame(step);
    };
    // Seek to the window start and begin.
    video.currentTime = plan.from;
    // Redraw for the window start at once (task 30.1) so the captions-only
    // pass opens on the right frame, not the end-card's last state.
    renderNowRef.current?.(plan.from);
    compareTick.current = requestAnimationFrame(step);
  };
  // Stop any compare run when the player unmounts.
  useEffect(() => {
    return () => {
      if (compareTick.current) cancelAnimationFrame(compareTick.current);
      compareRef.current = null;
    };
  }, []);

  // Focus the primary "Try this first" Compare button when the end card opens
  // (task 27.2), so a keyboard user lands on the one obvious first click. Only
  // while the end card is shown and there is a highlighted point row.
  const primaryCompareRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (ended && overlayVisible && firstTryIndex >= 0) {
      // `preventScroll` so moving focus to the primary button does not scroll
      // the evidence list and cut row 1 off at the top (task 28.1). Scroll
      // padding on the list is the belt-and-braces fallback where the browser
      // ignores the option.
      primaryCompareRef.current?.focus({ preventScroll: true });
    }
  }, [ended, overlayVisible, firstTryIndex]);

  return (
    <div
      ref={playerRef}
      className={`player${isFullscreen ? ' player--fullscreen' : ''}`}
      onPointerEnter={() => setChipVisible(true)}
      onPointerLeave={() => setChipVisible(false)}
      onKeyDown={onPlayerKeyDown}
      tabIndex={0}
      role="region"
      aria-label={strings.ui.appName}
    >
      <div className="player__stage" style={{ '--ar': String(aspect) } as React.CSSProperties}>
        <video
          ref={videoRef}
          className="player__video"
          src={src}
          playsInline
          preload="auto"
          onClick={togglePlay}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth > 0 && v.videoHeight > 0) setAspect(v.videoWidth / v.videoHeight);
          }}
          onDoubleClick={canFullscreen ? toggleFullscreen : undefined}
        />
        <canvas ref={canvasRef} className="player__overlay" aria-hidden="true" />

        {/* The end card (task 22.5, 23.3) lives INSIDE the stage (task 32.1),
            not the player, so its `inset: 0` covers exactly the picture (the
            video + overlay) and leaves the progress bar below it visible and
            usable, inline and in full screen. Previously it was a child of
            `.player`, which also holds `.player__progress`, so the card ran
            35 px past the bottom edge and covered the scrubber. */}
        {overlayVisible && ended && (
          <div className="player__endcard" role="status" aria-live="polite">
            <p className="player__endcard-text">{endCardText}</p>
            {closingText && (
              <p className="player__endcard-closing">{closingText}</p>
            )}
            <p className="player__endcard-basis">{basisText}</p>
            {evidence.length > 0 && (
              <>
                <h3 className="player__endcard-heading">{strings.ui.missedListHeading}</h3>
                <ul className="player__endcard-list">
                  {evidence.map((occ, i) => {
                    const label = occurrenceNoun(occ, strings, settings.lang);
                    const isFirstTry = i === firstTryIndex;
                    return (
                      <li
                        key={`${occ.group}-${occ.start}`}
                        className={`player__endcard-item${
                          isFirstTry ? ' player__endcard-item--first' : ''
                        }`}
                      >
                        {/* The "Try this first" tag sits on its own line ABOVE
                            the row, not in the label column (task 28.1):
                            squeezed next to the Compare button it forced the
                            Korean label ("총성, 오른쪽에서") to wrap letter by letter
                            and made the row 169 px tall. */}
                        {isFirstTry && (
                          <span className="player__endcard-firsttag">
                            {strings.ui.tryThisFirst}
                          </span>
                        )}
                        <div className="player__endcard-rowline">
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
                            ref={isFirstTry ? primaryCompareRef : undefined}
                            className={`player__endcard-compare${
                              isFirstTry ? ' player__endcard-compare--primary' : ''
                            }`}
                            onClick={() => startCompare(occ.start, label)}
                          >
                            {isFirstTry
                              ? `\u25B6 ${strings.ui.compareFirst}`
                              : strings.ui.compare}
                          </button>
                        </div>
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

      {/* Compare chips (tasks 25.5, 27.1): during a Compare run, name the pass
          — first "Captions only" (overlay hidden), then "With Ghost Captions"
          (overlay shown) — each with a step marker "1/2" / "2/2" and large
          text so a judge reads it at a glance. During the captions-only pass a
          caption-band plate spells out that the captions say nothing about this
          sound; if a loaded subtitle cue overlaps the moment, that cue's text
          is shown instead. Text carries the meaning, not only the state. */}
      {comparePhase && (
        <div
          className={`player__compare-chip player__compare-chip--${
            comparePhase === 'captionsOnly' ? 'captions' : 'ghosts'
          }`}
          role="status"
          aria-live="polite"
        >
          <span className="player__compare-step">
            {strings.ui.compareStep
              .replace('{step}', comparePhase === 'captionsOnly' ? '1' : '2')
              .replace('{total}', '2')}
          </span>{' '}
          {comparePhase === 'captionsOnly'
            ? strings.ui.compareCaptionsOnly
            : strings.ui.compareWithGhosts}
        </div>
      )}
      {comparePhase === 'captionsOnly' && (
        <div className="player__compare-plate" role="status" aria-live="polite">
          {compareCaptionsPlateText}
        </div>
      )}

      {/* "Sounds the captions missed" counter (task 22.5): top-right, inside
          the player so it shows in full screen too. It follows the show-when
          overlay visibility, and becomes a centred end card when the video
          ends. Information is in text, not only motion. */}
      {overlayVisible && !ended && comparePhase !== 'captionsOnly' && (
        <div
          className={`player__missed${pulse ? ' player__missed--pulse' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className="player__missed-count">{missedText}</span>
          {flash && <span className="player__missed-plus">{plusOneText}</span>}
        </div>
      )}
      {/* The app's own controls (tasks 28.4, 29.2). The native <video>
          controls are hidden so only the trimmed time shows; the player keeps
          its own play/pause button, a keyboard-seekable slider and a time
          readout that spans 0..endAt (a trimmed demo reads 0:25, not the
          file's 0:52). For a user file with no endAt it spans the full
          duration. */}
      <div className="player__progress">
        <button
          type="button"
          className="player__playpause"
          onClick={togglePlay}
          aria-label={paused ? strings.ui.play : strings.ui.pause}
          title={paused ? strings.ui.play : strings.ui.pause}
        >
          {paused ? '▶' : '⏸'}
        </button>
        <input
          type="range"
          className="player__progress-range"
          min={0}
          max={displayDuration || 0}
          step={0.1}
          value={Math.min(videoTime, displayDuration)}
          aria-label={strings.ui.seek}
          onChange={(e) => {
            const video = videoRef.current;
            if (!video) return;
            setEnded(false);
            video.currentTime = Number(e.currentTarget.value);
          }}
          style={{ '--pct': `${progressPct}%` } as React.CSSProperties}
        />
        <span className="player__progress-time">
          {formatClock(Math.min(videoTime, displayDuration))} / {formatClock(displayDuration)}
        </span>
      </div>
    </div>
  );
}
