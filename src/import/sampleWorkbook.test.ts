import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BUNDLED_PLANS, FOOD_INDEX, foodResolver } from '@/state/catalog';

import { parsePlanWorkbook } from './planWorkbook';
import { checkPlanBand } from './validatePlan';

/** Round-trip: the filled sample template imports back into exactly the bundled plans. */
describe('Sample_Plans_Filled.xlsx', () => {
  const buf = readFileSync(join(__dirname, '../../templates/Sample_Plans_Filled.xlsx'));
  const { plans, issues } = parsePlanWorkbook(new Uint8Array(buf), foodResolver);

  it('imports with no errors', () => {
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(plans.map((p) => p.id).sort()).toEqual(BUNDLED_PLANS.map((p) => p.id).sort());
  });

  it('keeps every ingredient and swap group', () => {
    for (const plan of plans) {
      const orig = BUNDLED_PLANS.find((p) => p.id === plan.id)!;
      const flat = (p: typeof plan) => p.days.flatMap((d) => d.meals.flatMap((m) => m.ingredients.map((i) => `${m.id}:${i.foodId}:${i.grams}:${i.swapGroup ?? ''}`))).sort();
      expect(flat(plan)).toEqual(flat(orig));
    }
  });

  it('every day lands inside its calorie band', () => {
    for (const plan of plans) {
      expect(checkPlanBand(plan, (id, g) => ((FOOD_INDEX.get(id)?.n.kcal ?? 0) * g) / 100)).toEqual([]);
    }
  });
});
