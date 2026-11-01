import { describe, expect, it } from 'vitest';

import { boardProgress } from './calc';

describe('fibre scales with energy', () => {
  it('uses 14 g per 1000 kcal when energy is known, the table value when not', () => {
    const man = { sex: 'male' as const, age: 40, lifeStage: 'none' as const };
    const fib = (e?: number) => boardProgress({ fiber: 22.4 }, { ...man, energyKcal: e }, ['fiber'])[0].pct;
    expect(fib(1600)).toBeCloseTo(1, 5); // 22.4 g is the whole AI at 1600 kcal
    expect(fib(3200)).toBeCloseTo(0.5, 5);
    expect(fib(undefined)).toBeCloseTo(22.4 / 38, 5);
  });
});
