import { describe, expect, it } from 'vitest';

import { FOODS, FOOD_INDEX } from '@/state/catalog';

import { carbStyleFits, carbStyleOfFood, carbStyleOfIngredient, carbStyleOfPlan } from './carbStyle';
import type { CarbStyle, MealPlan } from './types';

// real names from the everyday tier
const CASES: [string, CarbStyle][] = [
  // intact grains, legumes and the rest are whole
  ['Oats, dry', 'whole'],
  ['Quinoa, cooked', 'whole'],
  ['Buckwheat groats, roasted', 'whole'],
  ['Pearl barley, boiled', 'whole'],
  ['Millet, cooked', 'whole'],
  ['Amaranth, cooked', 'whole'],
  ['Teff, cooked', 'whole'],
  ['Wild rice, cooked', 'whole'],
  ['Spelt, cooked', 'whole'],
  ['Farro, pearled, dry, raw', 'whole'],
  ['Wheat bran', 'whole'],
  ['Chia seeds, dry, raw', 'whole'],
  ['Baking soda', 'whole'],
  ['Spaghetti squash, raw', 'whole'],
  ['Rice milk, unsweetened', 'whole'],
  ['Chickpea flour (besan)', 'whole'],
  ['Almond flour', 'whole'],
  ['Konjac noodles (shirataki)', 'whole'],
  ['Pasta sauce, spaghetti or marinara, ready-to-serve', 'whole'],
  // whole grains
  ['Brown rice, long-grain, cooked', 'wholegrain'],
  ['Red rice, cooked', 'wholegrain'],
  ['Black rice, cooked', 'wholegrain'],
  ['Whole wheat bread', 'wholegrain'],
  ['Rye bread', 'wholegrain'],
  ['Multigrain bread', 'wholegrain'],
  ['Whole wheat pita bread', 'wholegrain'],
  ['Whole wheat pasta, cooked', 'wholegrain'],
  ['Corn tortilla', 'wholegrain'],
  ['Bulgur, cooked', 'wholegrain'],
  ['Soba noodles, boiled', 'wholegrain'],
  ['Crispbread, rye', 'wholegrain'],
  ['Tortilla, ready-to-bake / fry, whole grain (whole wheat)', 'wholegrain'],
  ['Wheat flour, whole wheat', 'wholegrain'],
  ['Sprouted wheat bread, toasted', 'wholegrain'],
  ['Club sandwich, whole wheat bread, ham', 'wholegrain'],
  // refined staples
  ['Rice, white, long-grain, cooked', 'any'],
  ['Basmati rice, white, boiled in unsalted water', 'any'],
  ['Pasta, cooked', 'any'],
  ['Egg noodles pasta, cooked', 'any'],
  ['White bread', 'any'],
  ['Naan bread', 'any'],
  ['Flour tortilla, ready-to-bake / fry, plain', 'any'],
  ['Couscous, cooked', 'any'],
  ['Wheat flour, white, all-purpose, unenriched', 'any'],
  ['Rice noodles pasta, cooked', 'any'],
  ['Wheat cracker', 'any'],
  ['Pita bread', 'any'],
  ['Udon (wheat) noodles, boiled', 'any'],
  ['Risotto, plain, homemade', 'any'],
  ['Oatmeal cookie', 'any'],
  ['Rice and black-eye beans', 'any'],
];

const byName = (name: string) => {
  const f = FOODS.find((x) => x.name === name);
  if (!f) throw new Error(`no everyday food named "${name}"`);
  return f;
};

describe('carb style of a food', () => {
  it.each(CASES)('%s is %s', (name, expected) => {
    expect(carbStyleOfFood(byName(name))).toBe(expected);
  });

  it('non-grain foods are whole', () => {
    for (const f of FOODS.filter((x) => ['legume', 'fruit', 'meat', 'fish', 'nut_seed', 'oil_fat'].includes(x.category))) {
      expect(carbStyleOfFood(f), f.name).toBe('whole');
    }
    expect(carbStyleOfFood(byName('Potato, white, flesh and skin, baked'))).toBe('whole');
  });

  it('answers for every grain-category food, and every intact-grain tag lands at whole or wholegrain', () => {
    const grains = FOODS.filter((f) => f.category === 'grain');
    expect(grains.length).toBeGreaterThan(300);
    for (const f of grains) expect(['whole', 'wholegrain', 'any']).toContain(carbStyleOfFood(f));
    // a cake is never whole, even when the database tags it whole_grain
    expect(carbStyleOfFood(byName('Oatmeal cookie'))).toBe('any');
  });
});

describe('carb style of a plan', () => {
  const plan = (foodNames: string[]): Pick<MealPlan, 'days'> => ({
    days: [{ day: 1, meals: [{ id: 'm', slot: 'dinner', name: 'x', ingredients: foodNames.map((n) => ({ foodId: byName(n).id, grams: 100 })) }] }],
  });

  it('takes the most permissive level any ingredient needs', () => {
    expect(carbStyleOfPlan(plan(['Quinoa, cooked', 'Broccoli, raw']), FOOD_INDEX)).toBe('whole');
    expect(carbStyleOfPlan(plan(['Quinoa, cooked', 'Corn tortilla']), FOOD_INDEX)).toBe('wholegrain');
    expect(carbStyleOfPlan(plan(['Corn tortilla', 'Naan bread', 'Broccoli, raw']), FOOD_INDEX)).toBe('any');
    expect(carbStyleOfPlan({ days: [] }, FOOD_INDEX)).toBe('whole');
  });

  it('a plan fits a person who wants the same or a looser style', () => {
    expect(carbStyleFits('whole', 'whole')).toBe(true);
    expect(carbStyleFits('whole', 'any')).toBe(true);
    expect(carbStyleFits('wholegrain', 'whole')).toBe(false);
    expect(carbStyleFits('any', 'wholegrain')).toBe(false);
  });
});

describe('thickeners', () => {
  it('a spoonful of starch or flour in a sauce keeps the meal at its own level; more than 10 g counts', () => {
    const starch = FOODS.find((f) => /cornstarch|corn starch/i.test(f.name)) ?? FOODS.find((f) => /starch/i.test(f.name))!;
    expect(carbStyleOfFood(starch)).toBe('any');
    expect(carbStyleOfIngredient(starch, 8)).toBe('whole');
    expect(carbStyleOfIngredient(starch, 25)).toBe('any');
    const meal = (g: number) => ({ days: [{ day: 1, meals: [{ id: 'm', slot: 'dinner' as const, name: 'x', ingredients: [{ foodId: byName('Quinoa, cooked').id, grams: 150 }, { foodId: starch.id, grams: g }] }] }] });
    expect(carbStyleOfPlan(meal(6), FOOD_INDEX)).toBe('whole');
    expect(carbStyleOfPlan(meal(30), FOOD_INDEX)).toBe('any');
    // bread is never a thickener, however little
    expect(carbStyleOfIngredient(byName('Naan bread'), 5)).toBe('any');
    expect(carbStyleOfIngredient(FOODS.find((f) => f.name.startsWith('Flour tortilla'))!, 5)).toBe('any');
  });
});

describe('whole dried maize', () => {
  it('field corn kernels (githeri, samp) are an intact grain; cornmeal and corn flour are not', () => {
    expect(carbStyleOfFood({ name: 'Corn, yellow, field, dry', head: 'corn', category: 'grain' })).toBe('whole'); // extended tier
    expect(carbStyleOfFood({ name: 'Cornmeal, yellow, whole grain', head: 'cornmeal', category: 'grain' })).toBe('wholegrain');
  });
});

describe('flatbreads', () => {
  it('injera is a whole-grain bread (teff flour), not an intact grain', () => {
    expect(carbStyleOfFood(byName('Injera (teff flatbread)'))).toBe('wholegrain');
    expect(carbStyleOfFood({ name: 'Flatbread, white', head: 'flatbread', category: 'grain' })).toBe('any');
    expect(carbStyleOfFood(byName('Teff, cooked'))).toBe('whole');
  });
});
