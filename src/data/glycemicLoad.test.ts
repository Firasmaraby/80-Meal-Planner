import { describe, expect, it } from 'vitest';

import { glycemicLoad, logsGlycemicLoad } from '@/engine/calc';
import type { Food } from '@/engine/types';

import everyday from './foods.everyday.json';
import { decodeFoods, type FoodBundle } from './loadFoods';

const foods = decodeFoods(everyday as unknown as FoodBundle, 'everyday');
const byName = new Map(foods.map((f) => [f.name, f]));
const need = (name: string): Food => {
  const f = byName.get(name);
  if (!f) throw new Error(`food not in the everyday bundle: ${name}`);
  return f;
};

describe('glycemic load on the shipped bundle', () => {
  it('is GI × (carbs − fibre) × grams / 10,000, using the bundle GI', () => {
    const rice = need('Rice, white, long-grain, cooked');
    expect(rice.gi).toBe(73);
    const avail = (rice.n.carbs ?? 0) - (rice.n.fiber ?? 0);
    expect(glycemicLoad(rice, 150)).toBeCloseTo((73 * avail * 1.5) / 100, 6);
    expect(logsGlycemicLoad([{ foodId: rice.id, grams: 150 }], new Map([[rice.id, rice]]))).toBeCloseTo(glycemicLoad(rice, 150), 6);
  });

  it('150 g cooked white rice is a high load (about 30; GI 73 × ~42 g available carbohydrate)', () => {
    const rice = need('Rice, white, long-grain, cooked');
    const gl = glycemicLoad(rice, 150);
    expect(gl).toBeGreaterThan(28);
    expect(gl).toBeLessThan(33);
  });

  it('150 g cooked lentils is a single-digit load', () => {
    const lentils = need('Lentils, boiled');
    expect(lentils.gi).toBe(32);
    const gl = glycemicLoad(lentils, 150);
    expect(gl).toBeGreaterThan(4);
    expect(gl).toBeLessThan(10);
  });

  it('subtracts fibre from the carbohydrate and counts every logged food', () => {
    const rice = need('Rice, white, long-grain, cooked');
    const lentils = need('Lentils, boiled');
    const index = new Map([[rice.id, rice], [lentils.id, lentils]]);
    const both = logsGlycemicLoad([{ foodId: rice.id, grams: 150 }, { foodId: lentils.id, grams: 150 }, { foodId: 'unknown', grams: 99 }], index);
    expect(both).toBeCloseTo(glycemicLoad(rice, 150) + glycemicLoad(lentils, 150), 6);
    const fibreHeavy: Food = { id: 'f', name: 'f', category: 'grain', gi: 50, n: { carbs: 20, fiber: 30 }, src: [] };
    expect(glycemicLoad(fibreHeavy, 100)).toBe(0);
  });

  it('gives a real day of starches and fruit a real load (it used to be about 0)', () => {
    const day = [['Oats, dry', 60], ['Banana, raw', 118], ['Rice, white, long-grain, cooked', 200], ['Lentils, boiled', 150]] as const;
    const gl = logsGlycemicLoad(day.map(([n, grams]) => ({ foodId: need(n).id, grams })), new Map(foods.map((f) => [f.id, f])));
    expect(gl).toBeGreaterThan(40);
    expect(gl).toBeLessThan(80);
  });

  it('marks category defaults and analogues as estimated, table values not', () => {
    expect(need('Rice, white, long-grain, cooked').giEstimated).toBeUndefined();
    const est = foods.filter((f) => f.giEstimated);
    expect(est.length).toBeGreaterThan(100);
    for (const f of est) expect(f.gi).not.toBeNull();
  });
});
