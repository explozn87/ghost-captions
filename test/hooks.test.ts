// Task 12.1 — the three Kiro hooks must exist, be valid hook definitions, and
// cover exactly what the task requires:
//   1. run module tests on save for src/measure, src/events, src/export;
//   2. a secret scan before commit;
//   3. a review hook for familyMap.ts / ghost.config.ts (why kept on every value).
//
// The hooks themselves are JSON config, not runtime code, so this test guards
// their shape and scope rather than their behaviour: a malformed or mis-scoped
// hook would otherwise fail silently and the task's intent would be lost.
//
// We read the hook files as raw strings via Vite's `?raw` import (typed by
// test/raw.d.ts) so the test needs no Node type definitions, matching the
// browser-free test setup. Each hook is imported explicitly; if a fourth hook
// is added it should be added here too.

import { describe, it, expect } from 'vitest';
import moduleTestsOnSave from '../.kiro/hooks/module-tests-on-save.kiro.hook?raw';
import secretScanBeforeCommit from '../.kiro/hooks/secret-scan-before-commit.kiro.hook?raw';
import reviewConfigAndFamilyMap from '../.kiro/hooks/review-config-and-familymap.kiro.hook?raw';

interface Hook {
  enabled: boolean;
  name: string;
  description: string;
  version: string;
  when: { type: string; patterns?: string[] };
  then: { type: string; prompt: string };
}

const sources: { file: string; text: string }[] = [
  { file: 'module-tests-on-save.kiro.hook', text: moduleTestsOnSave },
  { file: 'secret-scan-before-commit.kiro.hook', text: secretScanBeforeCommit },
  { file: 'review-config-and-familymap.kiro.hook', text: reviewConfigAndFamilyMap },
];

const hooks: { file: string; hook: Hook }[] = sources.map(({ file, text }) => ({
  file,
  hook: JSON.parse(text) as Hook,
}));

describe('task 12 Kiro hooks', () => {
  it('has at least the three required hooks', () => {
    expect(hooks.length).toBeGreaterThanOrEqual(3);
  });

  it('every hook is a well-formed, enabled definition', () => {
    for (const { file, hook } of hooks) {
      expect(hook.enabled, `${file} enabled`).toBe(true);
      expect(hook.name, `${file} name`).toBeTruthy();
      expect(hook.description, `${file} description`).toBeTruthy();
      expect(hook.when?.type, `${file} when.type`).toBeTruthy();
      expect(hook.then?.type, `${file} then.type`).toBe('askAgent');
      expect(hook.then?.prompt, `${file} then.prompt`).toBeTruthy();
    }
  });

  it('runs module tests on save for src/measure, src/events and src/export', () => {
    const onSave = hooks.find(
      (h) =>
        h.hook.when.type === 'fileEdited' &&
        /test/i.test(h.hook.then.prompt) &&
        !/familyMap|ghost\.config/.test(h.hook.then.prompt),
    );
    expect(onSave, 'an on-save module-test hook').toBeDefined();
    const patterns = onSave!.hook.when.patterns ?? [];
    expect(patterns.some((p) => p.startsWith('src/measure/'))).toBe(true);
    expect(patterns.some((p) => p.startsWith('src/events/'))).toBe(true);
    expect(patterns.some((p) => p.startsWith('src/export/'))).toBe(true);
    // It must invoke the project's own test script, nothing else.
    expect(onSave!.hook.then.prompt).toMatch(/npm run -s test/);
  });

  it('scans for secrets before commit', () => {
    const secret = hooks.find((h) => h.hook.when.type === 'preCommit');
    expect(secret, 'a preCommit secret-scan hook').toBeDefined();
    expect(secret!.hook.then.prompt.toLowerCase()).toMatch(/secret|key|token|credential/);
    // It must not print secret values back out.
    expect(secret!.hook.then.prompt.toLowerCase()).toMatch(
      /never print|not print|without.*value|never printing/,
    );
  });

  it('reviews familyMap.ts and ghost.config.ts, keeping a why on every value', () => {
    const review = hooks.find(
      (h) =>
        h.hook.when.type === 'fileEdited' &&
        (h.hook.when.patterns ?? []).some((p) => /familyMap\.ts$/.test(p)) &&
        (h.hook.when.patterns ?? []).some((p) => /ghost\.config\.ts$/.test(p)),
    );
    expect(review, 'a config/familyMap review hook').toBeDefined();
    // The review must check that every value keeps its `why`.
    expect(review!.hook.then.prompt).toMatch(/why/);
    // And that speech stays speech (Req 3.2).
    expect(review!.hook.then.prompt.toLowerCase()).toMatch(/speech/);
  });
});
