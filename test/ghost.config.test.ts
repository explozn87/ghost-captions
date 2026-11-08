import { describe, it, expect } from 'vitest';
import { ghostConfig, isAmbientFamily, type Tuned } from '../src/config/ghost.config.ts';
import type { Family } from '../src/shared/types.ts';

// Task 2.2: every threshold, prior and weight lives in one module and carries a
// `why` (NFR-6). These tests pin that contract so the task-12 review hook has a
// machine-checked floor: no value may lose its reason, and the documented
// ranges hold.

const ALL_FAMILIES: Family[] = [
  'footsteps', 'door', 'knock', 'scream', 'laughter', 'crying',
  'tenseMusic', 'calmMusic', 'singing', 'impact', 'gunshot',
  'vehicle', 'siren', 'animal', 'wind', 'rain', 'thunder',
  'fire', 'glass', 'unknown',
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

  it('declares exactly the five ambient families with a why (task 16.3)', () => {
    expect([...ghostConfig.ambientFamilies.value].sort()).toEqual(
      ['calmMusic', 'rain', 'tenseMusic', 'thunder', 'wind'].sort(),
    );
    expect(ghostConfig.ambientFamilies.why.trim().length).toBeGreaterThan(0);
    // isAmbientFamily reads that single list.
    for (const f of ['wind', 'rain', 'thunder', 'tenseMusic', 'calmMusic'] as Family[]) {
      expect(isAmbientFamily(f)).toBe(true);
    }
    for (const f of ['footsteps', 'gunshot', 'siren', 'glass', 'unknown'] as Family[]) {
      expect(isAmbientFamily(f)).toBe(false);
    }
  });

  it('caps edge-fog opacity at or below 0.45 and carries a why on each fog value (task 16.3)', () => {
    expectHasWhy(ghostConfig.edgeFogAttack);
    expectHasWhy(ghostConfig.edgeFogRelease);
    expectHasWhy(ghostConfig.edgeFogMaxOpacity);
    expect(ghostConfig.edgeFogMaxOpacity.value).toBeLessThanOrEqual(0.45);
    expect(ghostConfig.edgeFogMaxOpacity.value).toBeGreaterThan(0);
    expect(ghostConfig.edgeFogAttack.value).toBeGreaterThan(0);
    expect(ghostConfig.edgeFogRelease.value).toBeGreaterThan(0);
    // Attack is faster than release: fog swells in, lingers out (task 16.3).
    expect(ghostConfig.edgeFogAttack.value).toBeGreaterThan(ghostConfig.edgeFogRelease.value);
  });

  it('ranks gunshot at least as ominous as impact (gunfire never softened, task 16.1)', () => {
    expect(ghostConfig.priors.gunshot.value).toBeGreaterThanOrEqual(ghostConfig.priors.impact.value);
  });

  it('carries the bigger-ghost size values with a why in the documented ranges (task 17.1)', () => {
    expectHasWhy(ghostConfig.ghostDiameterFrac);
    expectHasWhy(ghostConfig.loudScaleMin);
    expectHasWhy(ghostConfig.loudScaleMax);
    expect(ghostConfig.ghostDiameterFrac.value).toBe(0.3);
    // The narrow loud band keeps small ghosts recognisable (0.85..1.15).
    expect(ghostConfig.loudScaleMin.value).toBe(0.85);
    expect(ghostConfig.loudScaleMax.value).toBe(1.15);
    expect(ghostConfig.loudScaleMin.value).toBeLessThan(ghostConfig.loudScaleMax.value);
  });

  it('gives every family a motion kind with a why (task 17.3)', () => {
    const kinds = ghostConfig.motionByFamily.value;
    expect(Object.keys(kinds).sort()).toEqual([...ALL_FAMILIES].sort());
    for (const fam of ALL_FAMILIES) {
      expect(['cross', 'edgeReact', 'hover']).toContain(kinds[fam]);
    }
    expect(ghostConfig.motionByFamily.why.trim().length).toBeGreaterThan(0);
    // The families named in the task map to the kinds the task names.
    expect(kinds.vehicle).toBe('cross');
    expect(kinds.footsteps).toBe('cross');
    for (const f of ['gunshot', 'impact', 'knock', 'door', 'glass', 'scream'] as Family[]) {
      expect(kinds[f]).toBe('edgeReact');
    }
    for (const f of ['singing', 'laughter', 'crying', 'siren', 'animal', 'fire', 'unknown'] as Family[]) {
      expect(kinds[f]).toBe('hover');
    }
  });
});
