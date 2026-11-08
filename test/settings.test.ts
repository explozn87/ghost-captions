import { describe, it, expect } from 'vitest';
import {
  SIZE_CHOICES,
  SIZE_SCALES,
  sizeChoiceFor,
  defaultSettings,
} from '../src/ui/settings.ts';
import { ghostConfig } from '../src/config/ghost.config.ts';

// Task 17.1: the size control offers three choices — 24% / 30% / 36% of the
// viewport's shorter side (small / normal / large). The base ghost diameter is
// 30% (`ghostDiameterFrac`), so the choices are sizeScale multipliers
// 0.8 / 1.0 / 1.2. These helpers back the Settings select and are pure, so
// they get a direct unit test.

describe('settings: three ghost-size choices (task 17.1)', () => {
  it('offers exactly small / normal / large', () => {
    expect(SIZE_CHOICES).toEqual(['small', 'normal', 'large']);
  });

  it('maps the choices to 24% / 30% / 36% of the shorter side', () => {
    const diam = ghostConfig.ghostDiameterFrac.value; // 0.30
    expect(SIZE_SCALES.small * diam).toBeCloseTo(0.24, 10);
    expect(SIZE_SCALES.normal * diam).toBeCloseTo(0.3, 10);
    expect(SIZE_SCALES.large * diam).toBeCloseTo(0.36, 10);
  });

  it('normal is the default sizeScale', () => {
    const s = defaultSettings('en', false);
    expect(s.sizeScale).toBe(SIZE_SCALES.normal);
    expect(sizeChoiceFor(s.sizeScale)).toBe('normal');
  });

  it('sizeChoiceFor snaps a stored scale to the nearest choice', () => {
    expect(sizeChoiceFor(0.8)).toBe('small');
    expect(sizeChoiceFor(1.0)).toBe('normal');
    expect(sizeChoiceFor(1.2)).toBe('large');
    // An off value snaps to the nearest.
    expect(sizeChoiceFor(0.85)).toBe('small');
    expect(sizeChoiceFor(1.15)).toBe('large');
  });
});
