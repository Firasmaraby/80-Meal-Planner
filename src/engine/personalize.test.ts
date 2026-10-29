import { describe, expect, it } from 'vitest';

import { BUNDLED_PLANS, FOODS, FOOD_INDEX, SWAP_GROUPS } from '@/state/catalog';

import { boardProgress, dayScore, ingredientsTotal } from './calc';
import { daySizing, personalizeDay, scaleIngredients, sizingAdvice, swapDislikes } from './personalize';

const who = { sex: 'male' as const, age: 36, lifeStage: 'none' as const, diet: [] as string[] };
const opts = { foods: FOOD_INDEX, catalog: FOODS, groups: SWAP_GROUPS };
const plan = BUNDLED_PLANS.find((p) => p.id.startsWith('med')) ?? BUNDLED_PLANS[0];
const day = plan.days[0];
const dayKcal = (meals: Map<string, { foodId: string; grams: number }[]>) =>
  [...meals.values()].reduce((n, ings) => n + (ingredientsTotal(ings, FOOD_INDEX).kcal ?? 0), 0);

describe('plan sizing', () => {
  it('scales a day to the target while leaving vegetables and fruit untouched', () => {
    const p = personalizeDay(day, who, { ...opts, targetKcal: 2600 });
    expect(p.factor).toBeGreaterThan(1);
    expect(Math.abs(dayKcal(p.meals) - 2600)).toBeLessThan(2600 * 0.04);
    for (const m of day.meals) {
      const after = p.meals.get(m.id)!;
      m.ingredients.forEach((ing, i) => {
        const cat = FOOD_INDEX.get(ing.foodId)?.category;
        if (cat === 'vegetable' || cat === 'fruit') expect(after[i].grams).toBe(ing.grams);
      });
    }
  });

  it('never costs a micronutrient tile when sizing down (micros first)', () => {
    const base = personalizeDay(day, who, opts);
    const down = personalizeDay(day, who, { ...opts, targetKcal: 1600 });
    const score = (m: Map<string, { foodId: string; grams: number }[]>) =>
      dayScore(boardProgress(ingredientsTotal([...m.values()].flat(), FOOD_INDEX), who)).done;
    expect(score(down.meals)).toBe(score(base.meals));
    // trims what it can from oils and grains, and says when that isn't enough
    expect(dayKcal(down.meals)).toBeLessThan(dayKcal(base.meals));
    expect(sizingAdvice(dayKcal(down.meals), 1600)).toEqual({ ok: false, suggest: 'lower' });
  });

  it('clamps extreme sizing and is a no-op at zero', () => {
    const huge = scaleIngredients(day.meals[0].ingredients, daySizing(day.meals.map((m) => m.ingredients), 99999, FOOD_INDEX), FOOD_INDEX);
    huge.forEach((ing, i) => expect(ing.grams).toBeLessThanOrEqual(Math.ceil(day.meals[0].ingredients[i].grams * 1.8) + 5));
    expect(scaleIngredients(day.meals[0].ingredients, 0, FOOD_INDEX)).toBe(day.meals[0].ingredients);
  });
});

describe('dislikes', () => {
  it('swaps a disliked food within its swap group, never to another disliked food', () => {
    const withGroup = plan.days.flatMap((d) => d.meals).flatMap((m) => m.ingredients).find((i) => i.swapGroup);
    expect(withGroup).toBeDefined();
    const r = swapDislikes([withGroup!], [withGroup!.foodId], FOOD_INDEX, FOODS, SWAP_GROUPS, who);
    expect(r.swaps).toHaveLength(1);
    const to = r.ingredients[0].foodId;
    expect(to).not.toBe(withGroup!.foodId);
    expect(SWAP_GROUPS.find((g) => g.key === withGroup!.swapGroup)!.foodIds).toContain(to);
  });

  it('handles whole-category dislikes and respects diet', () => {
    const fishIng = plan.days.flatMap((d) => d.meals).flatMap((m) => m.ingredients).find((i) => FOOD_INDEX.get(i.foodId)?.category === 'fish');
    if (!fishIng) return;
    const r = swapDislikes([fishIng], ['cat:fish'], FOOD_INDEX, FOODS, SWAP_GROUPS, who);
    // the whole fish group is out, so it falls back to another protein, never another fish
    expect(r.unresolved).toEqual([]);
    expect(FOOD_INDEX.get(r.ingredients[0].foodId)!.category).not.toBe('fish');
    const veg = swapDislikes([fishIng], ['cat:fish'], FOOD_INDEX, FOODS, SWAP_GROUPS, who, ['vegetarian']);
    expect(['meat', 'poultry', 'fish']).not.toContain(FOOD_INDEX.get(veg.ingredients[0].foodId)!.category);
  });

  it('is a no-op without dislikes', () => {
    const ings = day.meals[0].ingredients;
    expect(swapDislikes(ings, [], FOOD_INDEX, FOODS, SWAP_GROUPS, who).ingredients).toBe(ings);
  });
});

describe('sizing advice', () => {
  it('is ok within 5% of target and points the right way beyond', () => {
    expect(sizingAdvice(1980, 1900).ok).toBe(true);
    expect(sizingAdvice(1900, 1500)).toEqual({ ok: false, suggest: 'lower' });
    expect(sizingAdvice(1900, 2400)).toEqual({ ok: false, suggest: 'higher' });
  });
});
