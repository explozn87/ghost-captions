import { describe, it, expect } from 'vitest';
import { ghostConfig, type Tuned } from '../src/config/ghost.config.ts';
import type { Family } from '../src/shared/types.ts';

// Task 2.2: every threshold, prior and weight lives in one module and carries a
// `why` (NFR-6). These tests pin that contract so the task-12 review hook has a
// machine-checked floor: no value may lose its reason, and the documented
// ranges hold.

const ALL_FAMILIES: Family[] = [
  'footsteps', 'door', 'voice', 'tenseMusic', 'calmMusic', 'impact',
  'vehicle', 'animal', 'weather', 'alarm', 'glass', 'unknown',
];

function expectHasWhy(t: Tuned): void {
  expect(typeof t.value).toBe('number');
  expect(typeof t.why).toBe('string');
  expect(t.why.trim().length).toBeGreaterThan(0);
}

describe('ghost.config (task 2.2)', () => {
  it('carries a non-empty why on every scalar threshold', () => {
    expectHasWhy(ghostConfig.labelThreshold);
    expectHasWhy(ghostConfig.mergeGap);
    expectHasWhy(ghostConfig.minDuration);
    expectHasWhy(ghostConfig.onsetKeepPercentile);
    expectHasWhy(ghostConfig.sideThreshold);
    expectHasWhy(ghostConfig.sideAgreement);
    expectHasWhy(ghostConfig.maxOnScreen);
    expectHasWhy(ghostConfig.beatMinCorr);
    expectHasWhy(ghostConfig.trendDb);
  });

  it('carries a prior with a why for every family', () => {
    const keys = Object.keys(ghostConfig.priors).sort();
    expect(keys).toEqual([...ALL_FAMILIES].sort());
    for (const fam of ALL_FAMILIES) {
      const p = ghostConfig.priors[fam];
      expectHasWhy(p);
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(1);
    }
  });

  it('carries the three ominousness weights, each with a why, summing to 1', () => {
    const { w1, w2, w3 } = ghostConfig.weights;
    for (const w of [w1, w2, w3]) expectHasWhy(w);
    expect(w1.value + w2.value + w3.value).toBeCloseTo(1, 10);
  });

  it('holds the documented values from design.md', () => {
    expect(ghostConfig.labelThreshold.value).toBe(0.3);
    expect(ghostConfig.mergeGap.value).toBe(0.5);
    expect(ghostConfig.minDuration.value).toBe(0.8);
    expect(ghostConfig.onsetKeepPercentile.value).toBe(0.95);
    expect(ghostConfig.sideThreshold.value).toBe(0.25);
    expect(ghostConfig.sideAgreement.value).toBe(0.7);
    expect(ghostConfig.maxOnScreen.value).toBe(4);
    expect(ghostConfig.beatMinCorr.value).toBe(0.5);
    expect(ghostConfig.trendDb.value).toBe(4);
  });

  it('keeps threshold ranges sane', () => {
    for (const p of [
      ghostConfig.labelThreshold, ghostConfig.onsetKeepPercentile,
      ghostConfig.sideThreshold, ghostConfig.sideAgreement, ghostConfig.beatMinCorr,
    ]) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(1);
    }
    expect(ghostConfig.maxOnScreen.value).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(ghostConfig.maxOnScreen.value)).toBe(true);
    expect(ghostConfig.mergeGap.value).toBeGreaterThan(0);
    expect(ghostConfig.minDuration.value).toBeGreaterThan(0);
    expect(ghostConfig.trendDb.value).toBeGreaterThan(0);
  });

  it('ranks tense music above calm music in the ominousness prior (Req 5.2)', () => {
    expect(ghostConfig.priors.tenseMusic.value).toBeGreaterThan(
      ghostConfig.priors.calmMusic.value,
    );
  });
});
