import { describe, expect, it, vi } from 'vitest';

// plansRepo imports the real client module, which pulls in AsyncStorage / react-native.
vi.mock('./supabase', () => ({ supabase: null, requireSupabase: () => null }));

import type { MealPlan } from '../engine/types';
import { assemblePlans, planToRows, validatePlan } from './plansRepo';

const plan: MealPlan = {
  id: 'med-1800',
  version: 1,
  name: 'Mediterranean 1800',
  band: { min: 1700, max: 1900 },
  cuisine: 'Mediterranean',
  tags: ['pescatarian'],
  description: 'Lots of greens',
  days: [
    {
      day: 1,
      meals: [
        {
          id: 'd1-b',
          slot: 'breakfast',
          name: 'Oats',
          prepMinutes: 5,
          ingredients: [
            { foodId: 'oats', grams: 60 },
            { foodId: 'spinach', grams: 30, swapGroup: 'leafy_greens', note: 'chopped' },
          ],
        },
        { id: 'd1-l', slot: 'lunch', name: 'Salad', instructions: 'Toss.', ingredients: [{ foodId: 'kale', grams: 80 }] },
      ],
    },
    { day: 2, meals: [{ id: 'd2-d', slot: 'dinner', name: 'Salmon', ingredients: [{ foodId: 'salmon', grams: 150 }] }] },
  ],
};

describe('plansRepo mapping', () => {
  it('round-trips a plan through rows (new version number applied)', () => {
    const rows = planToRows(plan, 4);
    expect(rows.plan).toMatchObject({ id: 'med-1800', version: 4, band_min: 1700, band_max: 1900, status: 'draft' });
    const back = assemblePlans([rows.plan], rows.meals, rows.ingredients);
    expect(back).toEqual([{ ...plan, version: 4 }]);
  });

  it('assembles correctly regardless of row order and keeps versions apart', () => {
    const v1 = planToRows(plan, 1);
    const v2 = planToRows({ ...plan, name: 'v2' }, 2);
    const shuffle = <T,>(a: T[]) => a.slice().reverse();
    const out = assemblePlans(
      [v1.plan, v2.plan],
      shuffle([...v1.meals, ...v2.meals]),
      shuffle([...v1.ingredients, ...v2.ingredients]),
    );
    expect(out.map((p) => [p.version, p.name])).toEqual([[1, 'Mediterranean 1800'], [2, 'v2']]);
    expect(out[0].days).toEqual(plan.days);
    expect(out[1].days).toEqual(plan.days);
  });

  it('orders meals by position within a day and ingredients by position', () => {
    const rows = planToRows(plan, 1);
    const out = assemblePlans([rows.plan], rows.meals.slice().reverse(), rows.ingredients.slice().reverse());
    expect(out[0].days[0].meals.map((m) => m.id)).toEqual(['d1-b', 'd1-l']);
    expect(out[0].days[0].meals[0].ingredients.map((i) => i.foodId)).toEqual(['oats', 'spinach']);
  });

  it('maps nulls to absent optional fields', () => {
    const rows = planToRows({ ...plan, description: undefined, author: undefined }, 1);
    expect(rows.plan.description).toBeNull();
    const [out] = assemblePlans([rows.plan], rows.meals, rows.ingredients);
    expect('description' in out).toBe(false);
    expect('author' in out).toBe(false);
    expect('prepMinutes' in out.days[0].meals[1]).toBe(false);
  });
});

describe('validatePlan', () => {
  it('accepts a good plan', () => {
    expect(validatePlan(plan)).toEqual([]);
  });

  it('reports every problem, mirroring the DB constraints', () => {
    const bad: MealPlan = {
      ...plan,
      band: { min: 2000, max: 1500 },
      days: [
        {
          day: 1,
          meals: [
            { id: 'x', slot: 'brunch' as never, name: 'A', ingredients: [{ foodId: 'a', grams: 0 }] },
            { id: 'x', slot: 'lunch', name: 'B', ingredients: [] },
          ],
        },
        { day: 1, meals: [] },
      ],
    };
    const errors = validatePlan(bad).join('\n');
    expect(errors).toMatch(/calorie band/);
    expect(errors).toMatch(/invalid slot/);
    expect(errors).toMatch(/grams > 0/);
    expect(errors).toMatch(/not unique/);
    expect(errors).toMatch(/no ingredients/);
    expect(errors).toMatch(/appears twice/);
    expect(errors).toMatch(/has no meals/);
  });
});
