import { describe, expect, it } from 'vitest';

import { BUNDLED_PLANS } from './catalog';
import { buildLibrary, libraryKey } from './library';

describe('meal library', () => {
  const lib = buildLibrary(BUNDLED_PLANS);

  it('extracts every meal from every plan', () => {
    const total = BUNDLED_PLANS.reduce((n, p) => n + p.days.reduce((m, d) => m + d.meals.length, 0), 0);
    expect(lib.length).toBeGreaterThan(0);
    expect(lib.length).toBeLessThanOrEqual(total);
    for (const m of lib) expect(m.totals.kcal).toBeGreaterThan(0);
  });

  it('dedupes identical meals across plans and remembers where else they appear', () => {
    const plan = BUNDLED_PLANS[0];
    const copy = { ...plan, id: 'copy', name: 'Copy plan' };
    const merged = buildLibrary([plan, copy]);
    expect(merged.length).toBe(buildLibrary([plan]).length);
    expect(merged.every((m) => m.alsoIn.includes('Copy plan'))).toBe(true);
  });

  it('uses stable keys', () => {
    const first = BUNDLED_PLANS[0].days[0].meals[0];
    expect(lib.some((m) => m.key === libraryKey(BUNDLED_PLANS[0].id, first.id))).toBe(true);
  });
});
