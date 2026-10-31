import { describe, expect, it } from 'vitest';

import { FoodSearch } from './search';
import type { Food } from './types';

const f = (id: string, name: string, head: string, tier: 'everyday' | 'extended', rank: number, extra: Partial<Food> = {}): Food => ({
  id, name, head, tier, rank, category: 'other', n: {}, src: [{ db: 'x', ref: id }], form: 'raw', ...extra,
});

const FOODS: Food[] = [
  f('a', 'Apple, raw', 'apple', 'everyday', 95),
  f('a2', 'Apple, dried', 'apple', 'everyday', 80, { form: 'dried' }),
  f('a3', 'Apple, Gala, raw', 'apple', 'extended', 40),
  f('b', 'Apple pie', 'apple pie', 'everyday', 70, { form: 'dish' }),
  f('c', 'Pineapple, raw', 'pineapple', 'everyday', 90),
  f('m1', 'Milk, 2% fat', 'milk', 'everyday', 90, { form: 'product' }),
  f('m2', 'Milk chocolate', 'milk chocolate', 'extended', 60, { form: 'product' }),
  f('m3', 'V8 Splash Juice Drinks, Berry Blast', 'v8 splash juice', 'extended', 0, { form: 'product', tags: ['processed'] }),
  f('m4', 'Cocoa beverage mix, milk added', 'cocoa beverage', 'extended', 30, { form: 'product', aliases: ['milk'] }),
  f('m5', 'Pizza dough', 'pizza dough', 'extended', 20, { form: 'product', aliases: ['milk'] }),
  f('j', 'Jelly, made with skim milk', 'jelly', 'everyday', 70, { form: 'product' }),
  f('s', 'Skim milk, UHT', 'milk', 'extended', 30, { form: 'product' }),
];
const search = new FoodSearch(FOODS);
const names = (q: string, limit = 6) => search.search(q, { limit }).map((h) => h.food.name);

describe('library search rules', () => {
  it('exact head beats prefix and contains: apple -> Apple, raw > Apple pie > Pineapple', () => {
    const r = names('apple');
    expect(r[0]).toBe('Apple, raw');
    expect(r.indexOf('Apple pie')).toBeLessThan(r.indexOf('Pineapple, raw'));
  });

  it('groups by head and returns the other members', () => {
    const hits = search.search('apple', { limit: 10 });
    const heads = hits.map((h) => h.food.head);
    expect(new Set(heads).size).toBe(heads.length);
    expect(hits[0].group?.map((x) => x.id)).toEqual(['a', 'a2', 'a3']);
    expect(hits[0].cls).toBe(4);
  });

  it('everyday beats extended inside a class', () => {
    const s = new FoodSearch([f('x', 'Kale chips', 'kale chips', 'extended', 90), f('y', 'Kale stems', 'kale stems', 'everyday', 10)]);
    expect(s.search('kale')[0].food.id).toBe('y');
  });

  it('keeps drinks, mixes, doughs and branded products out of the top for a plain head', () => {
    const r = names('milk', 3);
    expect(r[0]).toBe('Milk, 2% fat');
    for (const bad of ['V8 Splash Juice Drinks, Berry Blast', 'Cocoa beverage mix, milk added', 'Pizza dough']) expect(r.slice(0, 2)).not.toContain(bad);
  });

  it('asking for the composite word lifts the demotion', () => {
    expect(names('pizza dough', 2)[0]).toBe('Pizza dough');
  });

  it('a multi-word query that starts the name beats a scattered match', () => {
    expect(search.search('skim milk')[0].food.id).toBe('s');
  });

  it('foods without a head keep the old behaviour', () => {
    const s = new FoodSearch([
      { id: '1', name: 'Bananas, raw', category: 'fruit', aliases: ['banana'], n: {}, src: [{ db: 'x', ref: '1' }], rank: 90 },
      { id: '2', name: 'Banana bread', category: 'grain', n: {}, src: [{ db: 'x', ref: '2' }], rank: 40 },
    ]);
    expect(s.search('banana').map((h) => h.food.id)).toEqual(['1', '2']);
    expect(s.search('bana')[0].food.id).toBe('1');
    expect(s.search('bananna')[0].food.id).toBe('1'); // one-typo tolerance
  });

  it('shows typo look-alikes only when nothing matches without a typo', () => {
    const s = new FoodSearch([
      f('fe', 'Feta cheese', 'feta cheese', 'everyday', 90),
      f('ke', 'Salmon, chum (keta), raw', 'salmon', 'extended', 40, { aliases: ['keta'] }),
      f('ap', 'Apple, raw', 'apple', 'everyday', 95),
    ]);
    expect(s.search('feta').map((h) => h.food.id)).toEqual(['fe']);
    // a word ending counts ("apple" in "pineapple"), the middle of a word does not ("chia" in "macchiato")
    const t = new FoodSearch([f('ch', 'Chia seeds', 'chia seeds', 'everyday', 90), f('lm', 'Latte macchiato', 'latte macchiato', 'everyday', 60)]);
    expect(t.search('chia').map((h) => h.food.id)).toEqual(['ch']);
    // with no real match, the typo match is the answer; a swapped pair of letters counts as one typo
    expect(s.search('appel')[0].food.id).toBe('ap');
  });

  it('setFoods rebuilds the index', () => {
    const s = new FoodSearch([]);
    expect(s.search('apple')).toEqual([]);
    s.setFoods(FOODS);
    expect(s.search('apple')[0].food.id).toBe('a');
  });
});
