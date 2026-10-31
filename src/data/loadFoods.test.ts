import { describe, expect, it } from 'vitest';

import everyday from './foods.everyday.json';
import { decodeFood, decodeFoods, type FoodBundle, type FoodRow } from './loadFoods';

const keys = ['kcal', 'protein', 'vitC', 'b12'] as const;
const row: FoodRow = [
  'apple-raw-abc123', 'Apple, raw', 'fruit', 'apple', 'raw', 95, ['apples'], ['processed'], [['1 medium', 182]],
  [[0, '09003'], [1, '2']], ['la'], [52, 0.3, 4.6, null], 36,
];

describe('decodeFood', () => {
  it('turns a compact row into a Food, dropping null values (missing is never 0)', () => {
    const f = decodeFood(row, [...keys], ['USDA FoodData Central (SR Legacy)', 'Canadian Nutrient File, Health Canada, 2026'], 'everyday');
    expect(f).toMatchObject({ id: 'apple-raw-abc123', name: 'Apple, raw', category: 'fruit', head: 'apple', form: 'raw', rank: 95, tier: 'everyday', gi: 36 });
    expect(f.n).toEqual({ kcal: 52, protein: 0.3, vitC: 4.6 });
    expect('b12' in f.n).toBe(false);
    expect(f.src).toEqual([{ db: 'USDA FoodData Central (SR Legacy)', ref: '09003' }, { db: 'Canadian Nutrient File, Health Canada, 2026', ref: '2' }]);
    expect(f.servings).toEqual([{ label: '1 medium', g: 182 }]);
    expect(f.estimated).toEqual(['la']);
    expect(f.aliases).toEqual(['apples']);
  });

  it('accepts plain citation strings and omits empty optional fields', () => {
    const r: FoodRow = ['x', 'X', 'other', 'x', 'raw', 1, [], [], [], [['Plain DB', '1']], [], [1, null, null, null]];
    const f = decodeFood(r, [...keys], undefined, 'extended');
    expect(f.src).toEqual([{ db: 'Plain DB', ref: '1' }]);
    expect(f.tier).toBe('extended');
    expect(f.aliases).toBeUndefined();
    expect(f.tags).toBeUndefined();
    expect(f.servings).toBeUndefined();
    expect(f.estimated).toBeUndefined();
    expect(f.gi).toBeUndefined();
  });

  it('rejects an unknown bundle version', () => {
    expect(() => decodeFoods({ v: 2 } as unknown as FoodBundle, 'everyday')).toThrow(/version/);
  });
});

describe('the shipped everyday bundle', () => {
  const foods = decodeFoods(everyday as unknown as FoodBundle, 'everyday');
  it('has about 3,000 well-formed foods with unique ids', () => {
    expect(foods.length).toBeGreaterThan(2500);
    expect(new Set(foods.map((f) => f.id)).size).toBe(foods.length);
    for (const f of foods) {
      expect(f.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(f.src.length).toBeGreaterThan(0);
      expect(f.rank).toBeGreaterThanOrEqual(50);
      for (const v of Object.values(f.n)) expect(v as number).toBeGreaterThanOrEqual(0);
    }
  });
  it('writes la only as an estimate', () => {
    for (const f of foods) if (f.n.la != null) expect(f.estimated).toContain('la');
  });
});
