import { describe, it, expect } from 'vitest';
import {
  comparePlan,
  comparePhaseAt,
  comparePlaybackTime,
  compareOverlayVisible,
  COMPARE_WINDOW_SEC,
} from '../src/ui/compare.ts';

// Task 25.5: the end-card "Compare" plays the window around an occurrence
// twice — captions-only, then with ghosts — then returns to the end card. The
// sequence is a PURE function of elapsed time, so the whole state machine is
// tested here without a video or a clock.

describe('compare: plan window (task 25.5)', () => {
  it('spans COMPARE_WINDOW_SEC seconds, starting a little before the occurrence', () => {
    const plan = comparePlan(10);
    expect(plan.from).toBeCloseTo(9.5, 10);
    expect(plan.to).toBeCloseTo(9.5 + COMPARE_WINDOW_SEC, 10);
    expect(plan.passSec).toBe(COMPARE_WINDOW_SEC);
  });

  it('never starts before zero', () => {
    const plan = comparePlan(0.1);
    expect(plan.from).toBe(0);
  });
});

describe('compare: phase sequence (task 25.5)', () => {
  const plan = comparePlan(10);

  it('is captions-only during the first pass', () => {
    expect(comparePhaseAt(0, plan)).toBe('captionsOnly');
    expect(comparePhaseAt(plan.passSec - 0.01, plan)).toBe('captionsOnly');
  });

  it('is with-ghosts during the second pass', () => {
    expect(comparePhaseAt(plan.passSec, plan)).toBe('withGhosts');
    expect(comparePhaseAt(plan.passSec * 2 - 0.01, plan)).toBe('withGhosts');
  });

  it('is done after both passes', () => {
    expect(comparePhaseAt(plan.passSec * 2, plan)).toBe('done');
    expect(comparePhaseAt(plan.passSec * 2 + 5, plan)).toBe('done');
  });

  it('the overlay is hidden in the first pass and shown in the second', () => {
    expect(compareOverlayVisible('captionsOnly')).toBe(false);
    expect(compareOverlayVisible('withGhosts')).toBe(true);
    expect(compareOverlayVisible('done')).toBe(false);
  });
});

describe('compare: playback time wraps for the second pass (task 25.5)', () => {
  const plan = comparePlan(10); // from 9.5

  it('plays forward from the window start in the first pass', () => {
    expect(comparePlaybackTime(0, plan)).toBeCloseTo(plan.from, 10);
    expect(comparePlaybackTime(1, plan)).toBeCloseTo(plan.from + 1, 10);
  });

  it('wraps back to the window start at the start of the second pass', () => {
    expect(comparePlaybackTime(plan.passSec, plan)).toBeCloseTo(plan.from, 10);
    expect(comparePlaybackTime(plan.passSec + 1, plan)).toBeCloseTo(plan.from + 1, 10);
  });
});
