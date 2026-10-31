import { describe, expect, it } from 'vitest';

import { BUNDLED_PLANS, FOODS, FOOD_INDEX, LEGACY_ID_MAP, SWAP_GROUPS, ensureExtendedLoaded, foodSearch, isExtendedLoaded, swapCandidates } from './catalog';
import { isDisliked } from '@/engine/personalize';
import legacyFoods from '../../pipeline/config/legacy/foods.json';
import legacyPlans from '../../pipeline/config/legacy/plans.json';

describe('legacy sample ids', () => {
  it('every old sample food id still resolves', () => {
    for (const old of legacyFoods as { id: string }[]) expect(FOOD_INDEX.get(old.id), old.id).toBeDefined();
  });

  it('old ids resolve to the rebuilt food and answer to has()', () => {
    expect(FOOD_INDEX.get('kiwi-green-raw')?.name).toMatch(/kiwi/i);
    expect(FOOD_INDEX.get('spinach-raw')?.head).toBe('spinach');
    expect(FOOD_INDEX.has('spinach-raw')).toBe(true);
    expect(FOOD_INDEX.has('definitely-not-a-food')).toBe(false);
    expect(FOOD_INDEX.get('spinach-raw')).toBe(FOOD_INDEX.get(LEGACY_ID_MAP['spinach-raw']));
  });

  it('iteration and size see current foods only', () => {
    expect(FOOD_INDEX.size).toBe(FOODS.length);
  });

  it('the bundled plans are rewritten to new ids and every foodId resolves to a food with kcal', () => {
    const old = new Set((legacyFoods as { id: string }[]).map((x) => x.id));
    for (const p of BUNDLED_PLANS) for (const d of p.days) for (const m of d.meals) for (const i of m.ingredients) {
      expect(old.has(i.foodId) && i.foodId in LEGACY_ID_MAP, `${p.id}: ${i.foodId} not rewritten`).toBe(false);
      const food = FOOD_INDEX.get(i.foodId);
      expect(food, i.foodId).toBeDefined();
      expect(food?.n.kcal, i.foodId).not.toBeUndefined();
    }
  });

  it('the plans keep their grams and structure', () => {
    expect(BUNDLED_PLANS.length).toBe((legacyPlans as unknown[]).length);
    const grams = (ps: typeof BUNDLED_PLANS) => ps.flatMap((p) => p.days.flatMap((d) => d.meals.flatMap((m) => m.ingredients.map((i) => i.grams))));
    expect(grams(BUNDLED_PLANS)).toEqual(grams(legacyPlans as unknown as typeof BUNDLED_PLANS));
  });

  it('swap groups use current ids and each ingredient belongs to its group', () => {
    for (const g of SWAP_GROUPS) {
      expect(new Set(g.foodIds).size).toBe(g.foodIds.length);
      for (const id of g.foodIds) expect(FOODS.some((f) => f.id === id), `${g.key}:${id}`).toBe(true);
    }
    for (const p of BUNDLED_PLANS) for (const d of p.days) for (const m of d.meals) for (const i of m.ingredients) {
      if (i.swapGroup) expect(SWAP_GROUPS.find((g) => g.key === i.swapGroup)?.foodIds).toContain(i.foodId);
    }
    expect(swapCandidates('leafy_greens').length).toBeGreaterThan(5);
  });

  it('a dislike saved under an old id still matches the rebuilt food', () => {
    expect(isDisliked(FOOD_INDEX.get('mushrooms-white-raw'), ['mushrooms-white-raw'])).toBe(true);
    expect(isDisliked(FOOD_INDEX.get('mushrooms-white-raw'), ['spinach-raw'])).toBe(false);
  });
});

describe('lazy extended tier', () => {
  it('starts with everyday foods only, then adds extended in place and rebuilds the search', async () => {
    // other test files run in their own module registry, so the extended tier has not been loaded yet here
    expect(isExtendedLoaded()).toBe(false);
    const before = FOODS.length;
    expect(FOODS.every((f) => f.tier === 'everyday')).toBe(true);
    const ref = FOODS;
    const idx = FOOD_INDEX;
    await ensureExtendedLoaded();
    expect(isExtendedLoaded()).toBe(true);
    expect(FOODS).toBe(ref);
    expect(FOOD_INDEX).toBe(idx);
    expect(FOODS.length).toBeGreaterThan(before + 10000);
    expect(FOOD_INDEX.size).toBe(FOODS.length);
    expect(FOODS.filter((f) => f.tier === 'extended').every((f) => (f.rank ?? 0) < 50)).toBe(true);
    expect(await ensureExtendedLoaded()).toBeUndefined(); // idempotent
    // an extended-only food is now searchable, and everyday still comes first
    const ext = FOODS.find((f) => f.tier === 'extended' && f.head && f.head !== 'apple')!;
    expect(foodSearch.search(ext.name, { limit: 5 }).length).toBeGreaterThan(0);
    expect(foodSearch.search('apple')[0].food.tier).toBe('everyday');
  }, 60_000);
});
