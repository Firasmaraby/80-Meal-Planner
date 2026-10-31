import { describe, expect, it } from 'vitest';

import { BUNDLED_PLANS, FOODS, FOOD_INDEX } from '@/state/catalog';

import { REFERENCE_PANEL, RULES, bestSources, fixListForAI, gradePlan } from './planReport';

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

  it('grades against another panel and with other rules, and the defaults are unchanged', () => {
    const plan = BUNDLED_PLANS[0];
    const base = gradePlan(plan, FOOD_INDEX, FOODS);
    expect(gradePlan(plan, FOOD_INDEX, FOODS, {})).toEqual(base);
    expect(gradePlan(plan, FOOD_INDEX, FOODS, { panel: REFERENCE_PANEL, rules: RULES })).toEqual(base);

    // a panel of the woman alone can only lift coverage (men need more of most things), never lower it
    const woman = gradePlan(plan, FOOD_INDEX, FOODS, { panel: [{ sex: 'female', age: 40, lifeStage: 'none' }] });
    base.days.forEach((d, i) => {
      for (const [k, pct] of Object.entries(d.coverage)) expect(woman.days[i].coverage[k as keyof typeof d.coverage]!, k).toBeGreaterThanOrEqual(pct! - 1e-9);
    });
    // pregnancy needs more iron and folate than the default panel
    const pregnant = gradePlan(plan, FOOD_INDEX, FOODS, { panel: [{ sex: 'female', age: 40, lifeStage: 'pregnant' }] });
    expect(pregnant.days[0].coverage.iron!).toBeLessThan(woman.days[0].coverage.iron!);

    // rules overrides move the protein floor, the GL ceiling and the fish rule
    const strict = gradePlan(plan, FOOD_INDEX, FOODS, { rules: { proteinMinPctKcal: 99, glycemicLoadMax: 1, fattyFishPerWeek: 99 } });
    expect(strict.issues.filter((i) => i.code === 'protein_low').length).toBe(plan.days.length);
    expect(strict.issues.some((i) => i.code === 'gl_high' && /aim ≤1\)/.test(i.message))).toBe(true);
    expect(strict.issues.some((i) => i.code === 'fish_low' && /aim ≥99/.test(i.message))).toBe(true);
    const lax = gradePlan(plan, FOOD_INDEX, FOODS, { rules: { fattyFishPerWeek: 0, proteinMinPctKcal: 0 } });
    expect(lax.issues.some((i) => i.code === 'fish_low' || i.code === 'protein_low')).toBe(false);
  });
});
