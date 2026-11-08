// Build sound events from classifier windows and measurement frames (task 5).
//
// This is the heart of the pipeline and is a pure function over plain objects
// and the config (NFR-5). It turns the per-window classifier output and the
// per-frame DSP measurements into the `SoundEvent[]` the overlay and export
// consume. The steps follow design.md "src/events/" exactly:
//
//   1. family per window (best score >= labelThreshold, else unknown);
//   2. merge consecutive same-family windows (gap <= mergeGap);
//   3. drop short events unless an onset inside them is top-percentile;
//   4. side (energy-weighted balance over onset frames, else all frames);
//   5. loudness = percentile rank of the event's mean energy within the clip;
//   6. trend from a linear fit of dB over the event;
//   7. ominous = clamp(w1*prior + w2*onsetSharpness + w3*lowShare);
//   8. beat = autocorrelation of flux in the event;
//   9. cap simultaneous events at maxOnScreen, keeping the loudest.
//
// Nothing here touches the DOM, audio or time; given the same inputs it always
// returns the same events, so every rule above is covered by property and
// example tests (task 5.4).

import type {
  ClassWindow,
  EventTrack,
  Frame,
  Family,
  Side,
  SoundEvent,
  Trend,
} from '../shared/types.ts';
import { ghostConfig, type GhostConfig } from '../config/ghost.config.ts';
import { familyFor, isSpeechCategory } from './familyMap.ts';
import { percentile } from '../measure/frames.ts';

/** How a single window was classified before merging. */
interface WindowLabel {
  start: number;
  end: number;
  family: Family;
  isSpeech: boolean;
  /** Top category name once the threshold is cleared, else null. */
  topLabel: string | null;
  labelScore: number;
}

/** The sampling period (seconds) of the per-event side track (design.md). */
const SIDE_TRACK_STEP = 0.5;
/** Beat search range in seconds (design.md: 0.3–1.5 s). */
const BEAT_MIN_PERIOD = 0.3;
const BEAT_MAX_PERIOD = 1.5;

/**
 * Step 1 — assign each window a family. The best-scoring category that maps to
 * a real family and clears `labelThreshold` wins; speech categories are noted
 * on `isSpeech` but never become a family (Req 3.2); otherwise the window is
 * `unknown` with no label (Req 3.5).
 */
function labelWindow(window: ClassWindow, cfg: GhostConfig): WindowLabel {
  const threshold = cfg.labelThreshold.value;
  let best: { name: string; score: number; family: Family } | null = null;
  let sawSpeech = false;

  for (const c of window.categories) {
    if (isSpeechCategory(c.name)) {
      if (c.score >= threshold) sawSpeech = true;
      continue;
    }
    if (c.score < threshold) continue;
    const family = familyFor(c.name);
    if (family === 'unknown') continue;
    if (best === null || c.score > best.score) {
      best = { name: c.name, score: c.score, family };
    }
  }

  // A window that cleared the threshold only for speech is a speech window; it
  // carries no ghost family (family stays unknown but isSpeech is true).
  if (best === null) {
    return {
      start: window.start,
      end: window.end,
      family: 'unknown',
      isSpeech: sawSpeech,
      topLabel: null,
      labelScore: 0,
    };
  }

  return {
    start: window.start,
    end: window.end,
    family: best.family,
    isSpeech: sawSpeech,
    topLabel: best.name,
    labelScore: best.score,
  };
}

/** A run of merged windows of one family, before per-event measurement. */
interface MergedRun {
  start: number;
  end: number;
  family: Family;
  isSpeech: boolean;
  topLabel: string | null;
  labelScore: number;
}

/**
 * Step 2 — merge consecutive windows that share a family when the gap between
 * them is within `mergeGap` (Req 3.3). Speech windows are merged on their own
 * so a speech marker is one span, not many. Unknown windows also merge, so a
 * stretch of unclassifiable sound is one unknown ghost rather than a flicker.
 * The run's `topLabel` is the single highest-scoring category across ALL the
 * windows merged into it, not the first or last window's label (task 16.2), so
 * a sustained sound is named by its clearest moment.
 */
function mergeRuns(labels: WindowLabel[], cfg: GhostConfig): MergedRun[] {
  const gap = cfg.mergeGap.value;
  const runs: MergedRun[] = [];

  for (const w of labels) {
    const last = runs[runs.length - 1];
    const sameKind = last && last.family === w.family && last.isSpeech === w.isSpeech;
    const closeEnough = last && w.start - last.end <= gap;
    if (last && sameKind && closeEnough) {
      last.end = Math.max(last.end, w.end);
      if (w.labelScore > last.labelScore) {
        last.topLabel = w.topLabel;
        last.labelScore = w.labelScore;
      }
      continue;
    }
    runs.push({
      start: w.start,
      end: w.end,
      family: w.family,
      isSpeech: w.isSpeech,
      topLabel: w.topLabel,
      labelScore: w.labelScore,
    });
  }

  return runs;
}

/** Frames whose centre time falls within [start, end). */
function framesInSpan(frames: Frame[], start: number, end: number): Frame[] {
  return frames.filter((f) => f.t >= start && f.t < end);
}

/**
 * Step 4 — side from the energy-weighted left/right balance over the frames in
 * the event, preferring onset frames (flux >= clip p90) when any are present
 * (Req 4.1). A side is `left`/`right` only when the mean |balance| meets
 * `sideThreshold` and at least `sideAgreement` of the weighted frames share the
 * sign (Req 4.2); otherwise `centre-unknown` (Req 4.4). Returns the chosen side
 * and a 0..1 confidence (the signed-agreement fraction scaled by |balance|).
 */
function computeSide(
  eventFrames: Frame[],
  fluxP90: number,
  cfg: GhostConfig,
  mono: boolean,
): { side: Side; confidence: number } {
  if (mono || eventFrames.length === 0) return { side: 'centre-unknown', confidence: 0 };

  const onsetFrames = eventFrames.filter((f) => f.flux >= fluxP90 && f.energy > 0);
  const pool = onsetFrames.length > 0 ? onsetFrames : eventFrames.filter((f) => f.energy > 0);
  if (pool.length === 0) return { side: 'centre-unknown', confidence: 0 };

  let weightedBalance = 0;
  let totalEnergy = 0;
  for (const f of pool) {
    weightedBalance += f.balance * f.energy;
    totalEnergy += f.energy;
  }
  if (totalEnergy <= 0) return { side: 'centre-unknown', confidence: 0 };
  const meanBalance = weightedBalance / totalEnergy;
  const sign = Math.sign(meanBalance);

  // Energy-weighted fraction of frames that agree with the overall sign.
  let agreeingEnergy = 0;
  for (const f of pool) {
    if (Math.sign(f.balance) === sign && sign !== 0) agreeingEnergy += f.energy;
  }
  const agreement = agreeingEnergy / totalEnergy;

  if (Math.abs(meanBalance) >= cfg.sideThreshold.value && agreement >= cfg.sideAgreement.value) {
    const confidence = Math.min(1, Math.abs(meanBalance)) * agreement;
    return { side: sign > 0 ? 'right' : 'left', confidence };
  }
  return { side: 'centre-unknown', confidence: 0 };
}

/**
 * The side track: the side measured over successive ~0.5 s slices of the event,
 * so a travelling sound's ghost can move (Req 4.5). Each slice is judged with
 * the same rule as the whole-event side.
 */
function computeSideTrack(
  frames: Frame[],
  start: number,
  end: number,
  fluxP90: number,
  cfg: GhostConfig,
  mono: boolean,
): { t: number; side: Side }[] {
  const track: { t: number; side: Side }[] = [];
  for (let t = start; t < end; t += SIDE_TRACK_STEP) {
    const sliceEnd = Math.min(end, t + SIDE_TRACK_STEP);
    const slice = framesInSpan(frames, t, sliceEnd);
    const { side } = computeSide(slice, fluxP90, cfg, mono);
    track.push({ t, side });
  }
  return track;
}

/**
 * Step 6 — trend from a least-squares fit of frame energy in dB against time.
 * Marked rising/falling only when the fitted change across the event exceeds
 * `trendDb` (Req 5.4); otherwise steady.
 */
function computeTrend(eventFrames: Frame[], cfg: GhostConfig): Trend {
  const pts = eventFrames.filter((f) => f.energy > 0);
  if (pts.length < 2) return 'steady';

  // dB per frame, time relative to the first point.
  const t0 = pts[0]!.t;
  const xs = pts.map((f) => f.t - t0);
  const ys = pts.map((f) => 10 * Math.log10(f.energy));
  const n = pts.length;
  const sumX = xs.reduce((s, x) => s + x, 0);
  const sumY = ys.reduce((s, y) => s + y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    num += dx * (ys[i]! - meanY);
    den += dx * dx;
  }
  if (den <= 0) return 'steady';
  const slope = num / den; // dB per second
  const span = xs[xs.length - 1]! - xs[0]!;
  const totalChange = slope * span;
  if (totalChange >= cfg.trendDb.value) return 'rising';
  if (totalChange <= -cfg.trendDb.value) return 'falling';
  return 'steady';
}

/**
 * Onset sharpness in 0..1 for ominousness: the event's peak flux as a fraction
 * of the clip's peak flux. A sudden attack approaches 1; a smooth swell stays
 * low. Returns 0 when the clip has no flux.
 */
function onsetSharpness(eventFrames: Frame[], clipPeakFlux: number): number {
  if (clipPeakFlux <= 0 || eventFrames.length === 0) return 0;
  let peak = 0;
  for (const f of eventFrames) if (f.flux > peak) peak = f.flux;
  return Math.min(1, peak / clipPeakFlux);
}

/** Mean low-frequency energy share over the event's non-silent frames (0..1). */
function meanLowShare(eventFrames: Frame[]): number {
  const pts = eventFrames.filter((f) => f.energy > 0);
  if (pts.length === 0) return 0;
  return pts.reduce((s, f) => s + f.lowShare, 0) / pts.length;
}

/**
 * Step 7 — ominousness in 0..1 from the per-family prior, onset sharpness and
 * low-frequency share, weighted by config and clamped (Req 5.2). The weights
 * sum to 1 in the default config, so a family with prior 1 and a sharp, deep
 * onset approaches 1.
 */
function computeOminous(
  family: Family,
  eventFrames: Frame[],
  clipPeakFlux: number,
  cfg: GhostConfig,
): number {
  const prior = cfg.priors[family].value;
  const sharp = onsetSharpness(eventFrames, clipPeakFlux);
  const low = meanLowShare(eventFrames);
  const raw =
    cfg.weights.w1.value * prior + cfg.weights.w2.value * sharp + cfg.weights.w3.value * low;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Step 8 — a beat period (seconds) for an event whose flux is periodic, by
 * autocorrelation of the event's flux series (Req 5.3). The flux is sampled on
 * the frame grid; lags are searched in 0.3–1.5 s. A period is returned only
 * when the normalised autocorrelation at the best lag reaches `beatMinCorr`;
 * otherwise null (no tremble).
 */
function computeBeatPeriod(eventFrames: Frame[], cfg: GhostConfig): number | null {
  if (eventFrames.length < 4) return null;
  const flux = eventFrames.map((f) => f.flux);
  const dt = eventFrames.length > 1 ? eventFrames[1]!.t - eventFrames[0]!.t : 0;
  if (dt <= 0) return null;

  // Mean-centre so a DC offset does not dominate the autocorrelation.
  const mean = flux.reduce((s, v) => s + v, 0) / flux.length;
  const centred = flux.map((v) => v - mean);
  const energy0 = centred.reduce((s, v) => s + v * v, 0);
  if (energy0 <= 0) return null;

  const minLag = Math.max(1, Math.round(BEAT_MIN_PERIOD / dt));
  const maxLag = Math.min(centred.length - 1, Math.round(BEAT_MAX_PERIOD / dt));
  if (maxLag < minLag) return null;

  let bestLag = -1;
  let bestCorr = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = lag; i < centred.length; i++) acc += centred[i]! * centred[i - lag]!;
    const corr = acc / energy0; // normalised to the zero-lag energy
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestLag > 0 && bestCorr >= cfg.beatMinCorr.value) return bestLag * dt;
  return null;
}

/**
 * Step 3 — drop events shorter than `minDuration` unless they contain an onset
 * above the clip's `onsetKeepPercentile` flux, so a sudden short slam survives
 * (Req 3.4). Returns true to keep.
 */
function keepByDuration(
  start: number,
  end: number,
  eventFrames: Frame[],
  onsetKeepFlux: number,
  cfg: GhostConfig,
): boolean {
  if (end - start >= cfg.minDuration.value) return true;
  // "Above" the percentile is strict: on a perfectly flat signal every frame
  // equals the percentile, which is not an onset, so a flat short event is
  // correctly dropped. A real slam's peak sits strictly above the clip p95.
  return eventFrames.some((f) => f.flux > onsetKeepFlux);
}

/**
 * Step 9 — cap the number of events active at the same time to `maxOnScreen`,
 * keeping the loudest (Req 3.6). We sweep event starts/ends; at any moment more
 * than the cap would be active, the quietest overlapping events are removed.
 * Operates on a copy and returns the survivors in start order.
 */
function capSimultaneous(events: SoundEvent[], cfg: GhostConfig): SoundEvent[] {
  const cap = cfg.maxOnScreen.value;
  if (events.length <= cap) return events;

  const removed = new Set<string>();
  // Check at each event start: who is active, and is it over the cap?
  for (const probe of events) {
    const t = probe.start;
    const active = events.filter((e) => !removed.has(e.id) && e.start <= t && e.end > t);
    if (active.length <= cap) continue;
    // Keep the loudest `cap`; mark the rest removed.
    active.sort((a, b) => b.loudness - a.loudness);
    for (let i = cap; i < active.length; i++) removed.add(active[i]!.id);
  }

  return events.filter((e) => !removed.has(e.id));
}

/**
 * Build the full {@link EventTrack} for a clip (task 5). Pure: depends only on
 * its inputs. `labelsAvailable` is false when the classifier failed, in which
 * case every window is already `unknown`; we still produce events from the
 * measurements alone (Req 2.5). `duration` is the clip length in seconds.
 */
export function buildEvents(
  windows: ClassWindow[],
  frames: Frame[],
  options: {
    duration: number;
    mono: boolean;
    labelsAvailable: boolean;
    config?: GhostConfig;
  },
): EventTrack {
  const cfg = options.config ?? ghostConfig;

  // Clip-wide references used by the per-event measurements.
  const fluxValues = frames.map((f) => f.flux);
  const fluxP90 = percentile(fluxValues, 0.9);
  const onsetKeepFlux = percentile(fluxValues, cfg.onsetKeepPercentile.value);
  const clipPeakFlux = fluxValues.reduce((m, v) => Math.max(m, v), 0);
  const energiesSorted = frames.map((f) => f.energy).sort((a, b) => a - b);

  // Steps 1–2.
  const labels = windows.map((w) => labelWindow(w, cfg));
  const runs = mergeRuns(labels, cfg);

  const events: SoundEvent[] = [];
  let seq = 0;
  for (const run of runs) {
    const eventFrames = framesInSpan(frames, run.start, run.end);

    // Step 3 — short-event drop with onset keep. Speech markers follow the same
    // rule so a one-window stray speech blip does not clutter the track.
    if (!keepByDuration(run.start, run.end, eventFrames, onsetKeepFlux, cfg)) continue;

    // Step 4 — side and side track.
    const { side, confidence } = computeSide(eventFrames, fluxP90, cfg, options.mono);
    const sideTrack = computeSideTrack(frames, run.start, run.end, fluxP90, cfg, options.mono);

    // Step 5 — loudness percentile of the event's mean energy within the clip.
    const meanEnergy =
      eventFrames.length > 0
        ? eventFrames.reduce((s, f) => s + f.energy, 0) / eventFrames.length
        : 0;
    const loudness = percentileRank(energiesSorted, meanEnergy);

    // Steps 6–8.
    const trend = computeTrend(eventFrames, cfg);
    const ominous = computeOminous(run.family, eventFrames, clipPeakFlux, cfg);
    const beatPeriod = computeBeatPeriod(eventFrames, cfg);

    events.push({
      id: `e${seq++}`,
      start: run.start,
      end: run.end,
      family: run.family,
      isSpeech: run.isSpeech,
      topLabel: run.topLabel,
      labelScore: run.labelScore,
      side,
      sideTrack,
      sideConfidence: confidence,
      loudness,
      trend,
      ominous,
      beatPeriod,
    });
  }

  // Step 9 — cap simultaneous, keep loudest.
  const capped = capSimultaneous(events, cfg);

  return {
    duration: options.duration,
    events: capped,
    mono: options.mono,
    labelsAvailable: options.labelsAvailable,
  };
}

/**
 * Percentile rank (0..1) of `value` within an ascending-sorted array: the
 * fraction of entries at or below `value`. Used for loudness (Req 5.1). Pure;
 * does not mutate. An empty array ranks everything at 0.
 */
function percentileRank(sortedAsc: number[], value: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  // Binary search for the number of entries <= value.
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid]! <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo / n;
}

/**
 * The events active at time `t` (start <= t < end), by binary search on the
 * start times then a scan (events overlap, so a pure lower-bound is not
 * enough). Pure; `track.events` must be sorted by start, which `buildEvents`
 * guarantees. Used by the overlay each frame (Req 6.1).
 */
export function activeEvents(track: EventTrack, t: number): SoundEvent[] {
  const events = track.events;
  // Lower bound: first index whose start could still be <= t is everything up
  // to the last start <= t. Binary search that boundary.
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]!.start <= t) lo = mid + 1;
    else hi = mid;
  }
  // events[0..lo) all have start <= t; filter those still running.
  const out: SoundEvent[] = [];
  for (let i = 0; i < lo; i++) {
    const e = events[i]!;
    if (e.end > t) out.push(e);
  }
  return out;
}
