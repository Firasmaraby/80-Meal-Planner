import { describe, expect, it } from 'vitest';

import type { MealPlan } from '@/engine/types';

import { planDayFor } from './day';
import { addDays, daysBetween } from './store';

const plan = {
  id: 'p',
  version: 1,
  name: 'P',
  band: { min: 1800, max: 2000 },
  cuisine: 'x',
  tags: [],
  days: [3, 1, 2].map((day) => ({ day, meals: [] })),
} as MealPlan;

describe('plan day cycling', () => {
  it('cycles plan days from the start date', () => {
    expect(planDayFor(plan, '2026-10-28', '2026-10-28')?.day).toBe(1);
    expect(planDayFor(plan, '2026-10-28', '2026-10-30')?.day).toBe(3);
    expect(planDayFor(plan, '2026-10-28', '2026-10-31')?.day).toBe(1);
    expect(planDayFor(plan, '2026-10-28', '2026-10-27')).toBeUndefined();
  });

  it('does date math across month and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });
});
