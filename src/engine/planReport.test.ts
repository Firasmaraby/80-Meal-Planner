import { describe, expect, it } from 'vitest';

import { BUNDLED_PLANS, FOODS, FOOD_INDEX } from '@/state/catalog';

import { bestSources, fixListForAI, gradePlan } from './planReport';

describe('plan grading', () => {
  it('grades the sample plans day by day with no calorie errors', () => {
    for (const plan of BUNDLED_PLANS) {
      const r = gradePlan(plan, FOOD_INDEX, FOODS);
      expect(r.days).toHaveLength(plan.days.length);
      expect(r.issues.filter((i) => i.code === 'kcal_low' || i.code === 'kcal_high')).toEqual([]);
    }
  });

  it('flags a broken day with concrete fixes', () => {
    const plan = structuredClone(BUNDLED_PLANS[0]);
    plan.days[0].meals = plan.days[0].meals.slice(0, 1); // one meal only
    const r = gradePlan(plan, FOOD_INDEX, FOODS);
    expect(r.pass).toBe(false);
    expect(r.issues.some((i) => i.code === 'kcal_low' && i.day === plan.days[0].day)).toBe(true);
    const text = fixListForAI({ reports: [r], importIssues: [{ level: 'error', sheet: 'Ingredients', row: 7, message: 'Unknown food "sourdough".', suggestion: 'rye-bread' }] });
    expect(text).toContain('FORMAT / FOOD ERRORS');
    expect(text).toContain('Ingredients row 7');
    expect(text).toMatch(/below the \d+–\d+ band/);
  });

  it('suggests real food ids as nutrient sources', () => {
    const ids = bestSources('vitC', FOODS);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(FOOD_INDEX.has(id)).toBe(true);
    expect(bestSources('b12', FOODS, true).every((id) => !['meat', 'poultry', 'fish'].includes(FOOD_INDEX.get(id)!.category))).toBe(true);
  });
});
