import { describe, expect, it } from 'vitest';

import {
  bandFor,
  bmr,
  boardProgress,
  calorieTarget,
  dayScore,
  gapCloser,
  glycemicLoad,
  logsTotal,
  macroTargets,
  omegaRatio,
  pillars,
  satFatPctOfKcal,
  scaled,
  swapGrams,
  swapOptions,
  sum,
} from './calc';
import { requirement } from './dri';
import { FoodSearch } from './search';
import type { Food, Profile } from './types';

const food = (id: string, name: string, n: Food['n'], extra: Partial<Food> = {}): Food => ({
  id,
  name,
  category: 'other',
  n,
  src: [{ db: 'test', ref: id }],
  rank: 70,
  ...extra,
});

const kiwi = food('kiwi', 'Kiwi, green, raw', { kcal: 61, carbs: 14.7, fiber: 3, vitC: 92.7, vitK: 40.3, potassium: 312 }, { category: 'fruit', gi: 50, aliases: ['kiwifruit'], rank: 80 });
const spinach = food('spinach', 'Spinach, raw', { kcal: 23, protein: 2.9, vitK: 482.9, vitC: 28.1, calcium: 99, iron: 2.71, folate: 194, magnesium: 79 }, { category: 'vegetable', rank: 85 });
const kale = food('kale', 'Kale, raw', { kcal: 35, protein: 2.9, vitK: 389.6, vitC: 93.4, iron: 1.6, calcium: 254 }, { category: 'vegetable', rank: 75 });
const pumpkinSeeds = food('pepitas', 'Pumpkin seeds, dried', { kcal: 559, protein: 30, magnesium: 592, zinc: 7.8, iron: 8.8 }, { category: 'nut_seed', rank: 70 });
const almonds = food('almonds', 'Almonds', { kcal: 579, magnesium: 270, vitE: 25.6 }, { category: 'nut_seed', rank: 80 });
const banana = food('banana', 'Banana, raw', { kcal: 89, carbs: 22.8, fiber: 2.6, potassium: 358 }, { category: 'fruit', gi: 51, rank: 95 });
const bananaBread = food('banana-bread', 'Bread, banana', { kcal: 326 }, { category: 'prepared', rank: 40 });
const salmon = food('salmon', 'Salmon, Atlantic, cooked', { kcal: 206, protein: 22, fat: 12.4, satFat: 2.5, la: 0.6, ala: 0.1, epa: 0.69, dha: 1.46, vitD: 13.1 }, { category: 'fish', tags: ['fatty_fish'], rank: 85 });
const chickpeas = food('chickpeas', 'Chickpeas, boiled', { kcal: 164, carbs: 27.4, fiber: 7.6, iron: 2.89 }, { category: 'legume', gi: 28, aliases: ['garbanzo beans'], rank: 80 });

const man: Profile = {
  sex: 'male', age: 36, heightCm: 190, weightKg: 87, activity: 'very', goal: 'maintain', lifeStage: 'none',
  proteinPerKg: 1.6, satFatPct: 10, focus: ['vitC', 'iron', 'vitK'], lockedIn: [], diet: [],
};
const woman: Profile = { ...man, sex: 'female', age: 28, heightCm: 165, weightKg: 60, activity: 'moderate' };

describe('DRI', () => {
  it('looks up RDA by sex, age and life stage', () => {
    expect(requirement('iron', man)!.rda).toBe(8);
    expect(requirement('iron', woman)!.rda).toBe(18);
    expect(requirement('iron', { ...woman, age: 55 })!.rda).toBe(8);
    expect(requirement('iron', { ...woman, lifeStage: 'pregnant' })!.rda).toBe(27);
    expect(requirement('magnesium', { ...man, age: 25 })!.rda).toBe(400);
    expect(requirement('magnesium', man)!.rda).toBe(420);
    expect(requirement('vitD', { ...man, age: 75 })!.rda).toBe(20);
    expect(requirement('calcium', { ...man, age: 16 })!.rda).toBe(1300);
    expect(requirement('vitK', man)).toMatchObject({ rda: 120, kind: 'ai' });
  });

  it('ignores pregnancy for male profiles and clamps age to 14+', () => {
    expect(requirement('iron', { ...man, lifeStage: 'pregnant' })!.rda).toBe(8);
    expect(requirement('iron', { ...man, age: 10 })!.rda).toBe(11);
  });
});

describe('vectors', () => {
  it('scales per-100g values and keeps unknowns unknown', () => {
    const v = scaled(kiwi, 150);
    expect(v.vitC).toBeCloseTo(139.05);
    expect(v.iron).toBeUndefined();
    const t = sum([scaled(kiwi, 100), scaled(spinach, 100)]);
    expect(t.vitK).toBeCloseTo(523.2);
    expect(t.iron).toBeCloseTo(2.71);
  });

  it('totals logs', () => {
    const t = logsTotal(
      [
        { id: '1', date: '2026-10-28', at: '', foodId: 'kiwi', grams: 100 },
        { id: '2', date: '2026-10-28', at: '', foodId: 'missing', grams: 100 },
      ],
      { kiwi },
    );
    expect(t.vitC).toBeCloseTo(92.7);
  });
});

describe('energy', () => {
  it('computes Mifflin-St Jeor and a calorie band', () => {
    expect(bmr(man)).toBeCloseTo(10 * 87 + 6.25 * 190 - 5 * 36 + 5);
    const lose = calorieTarget({ ...man, goal: 'lose' });
    const keep = calorieTarget(man);
    expect(keep - lose).toBeLessThanOrEqual(keep * 0.2 + 1);
    expect(bandFor(1890)).toEqual({ min: 1800, max: 2000 });
    expect(bandFor(900).min).toBe(1200);
  });

  it('sets protein from g/kg and sat-fat ceiling from %kcal', () => {
    const m = macroTargets(man, 2500);
    expect(m.protein).toBe(139);
    expect(m.satFatMax).toBe(28);
    expect(m.protein * 4 + m.fat * 9 + m.carbs * 4).toBeGreaterThan(2490);
  });
});

describe('board', () => {
  it('marks a nutrient complete at 80% of RDA, not 100%', () => {
    const p = boardProgress({ vitC: 72, iron: 6.3 }, man, ['vitC', 'iron', 'vitK']);
    const by = Object.fromEntries(p.map((x) => [x.key, x]));
    expect(by.vitC.complete).toBe(true); // 72/90 = 0.8
    expect(by.iron.complete).toBe(false); // 6.3/8 = 0.79
    expect(by.vitK.amount).toBeUndefined();
  });

  it('day score ignores nutrients with no data', () => {
    const p = boardProgress({ vitC: 90, iron: 8, vitK: 10 }, man, ['vitC', 'iron', 'vitK', 'b7']);
    expect(dayScore(p)).toMatchObject({ done: 2, of: 3 });
  });

  it('flags upper-limit excess', () => {
    const p = boardProgress({ vitA: 3500 }, man, ['vitA']);
    expect(p[0].overUL).toBe(true);
  });
});

describe('pillars', () => {
  it('computes omega ratio, sat fat %, and glycemic load', () => {
    expect(omegaRatio(scaled(salmon, 100))).toBeCloseTo(0.6 / 2.25);
    expect(satFatPctOfKcal({ kcal: 2000, satFat: 20 })).toBeCloseTo(9);
    expect(glycemicLoad(banana, 120)).toBeCloseTo((51 * (22.8 - 2.6) * 1.2) / 100);
    expect(glycemicLoad(spinach, 100)).toBe(0);
    const pl = pillars({ kcal: 2000, satFat: 30, protein: 140, fiber: 40, la: 12, ala: 2 }, 80, man);
    expect(pl.satFat.status).toBe('over'); // 13.5% vs 10%
    expect(pl.omega.status).toBe('over'); // 6:1 vs 4:1
    expect(pl.glycemicLoad.status).toBe('good');
    expect(pl.protein.status).toBe('good');
  });
});

describe('swaps', () => {
  it('calorie-matches grams, capped at 3× volume', () => {
    expect(swapGrams(spinach, 100, kale, 'calories')).toBe(65);
    expect(swapGrams(spinach, 100, kale, 'grams')).toBe(100);
    expect(swapGrams(almonds, 30, spinach, 'calories')).toBe(90);
  });

  it('reports nutrient deltas as RDA points', () => {
    const [opt] = swapOptions({ foodId: 'spinach', grams: 100 }, [kale], { spinach, kale }, man, 'grams');
    expect(opt.food.id).toBe('kale');
    const vitC = opt.highlights.find((h) => h.key === 'vitC')!;
    expect(vitC.pctPoints).toBeCloseTo(((93.4 - 28.1) / 90) * 100);
    expect(opt.highlights.find((h) => h.key === 'calcium')!.pctPoints).toBeGreaterThan(10);
  });
});

describe('swap with missing data', () => {
  it('does not report unknown nutrients as losses', () => {
    const turkey = food('turkey', 'Turkey breast', { kcal: 135, protein: 30 });
    const chicken = food('chicken', 'Chicken breast', { kcal: 165, protein: 31, b3: 13.7, selenium: 27.6 });
    const [opt] = swapOptions({ foodId: 'chicken', grams: 150 }, [turkey], { chicken, turkey }, man);
    expect(opt.highlights.find((h) => h.key === 'b3')).toBeUndefined();
  });
});

describe('gap closer', () => {
  it('suggests the lowest-calorie realistic portion that closes a gap', () => {
    const progress = boardProgress({ magnesium: 200, vitC: 10 }, man, ['magnesium', 'vitC']);
    const s = gapCloser(progress, [pumpkinSeeds, almonds, kiwi, spinach], { limit: 5 });
    const vitC = s.find((x) => x.nutrient === 'vitC')!;
    expect(vitC.food.id).toBe('kiwi');
    expect(vitC.grams).toBeGreaterThanOrEqual(65);
    const mg = s.find((x) => x.nutrient === 'magnesium')!;
    // 136 mg remaining: spinach (~175 g, ~40 kcal) beats pumpkin seeds (~25 g, ~130 kcal)
    expect(mg.food.id).toBe('spinach');
    expect(mg.grams).toBeLessThanOrEqual(200);
    // without greens, seeds win; almonds would need more than the 40 g nut cap
    const noGreens = gapCloser(progress, [pumpkinSeeds, almonds], { limit: 5 });
    expect(noGreens.find((x) => x.nutrient === 'magnesium')!.food.id).toBe('pepitas');
  });
});

describe('search', () => {
  const s = new FoodSearch([kiwi, spinach, kale, banana, bananaBread, salmon, chickpeas, almonds, pumpkinSeeds]);
  const top = (q: string) => s.search(q)[0]?.food.id;
  it('finds everyday foods by name, alias, plural and typo', () => {
    expect(top('banana')).toBe('banana');
    expect(top('kiwifruit')).toBe('kiwi');
    expect(top('bananas')).toBe('banana');
    expect(top('spinch')).toBe('spinach');
    expect(top('garbanzo')).toBe('chickpeas');
    expect(top('chick')).toBe('chickpeas');
    expect(top('salmon cooked')).toBe('salmon');
    expect(s.search('zzzz')).toHaveLength(0);
  });
  it('hides rare foods unless asked', () => {
    const r = new FoodSearch([{ ...kale, rare: true }]);
    expect(r.search('kale')).toHaveLength(0);
    expect(r.search('kale', { includeRare: true })).toHaveLength(1);
  });
});
