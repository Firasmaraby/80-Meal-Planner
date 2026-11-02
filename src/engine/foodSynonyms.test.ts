import { describe, expect, it, vi } from 'vitest';

import { LAB_FOODS, LAB_INDEX, labSearch } from '@/state/labCatalog';

import { SYNONYM_GROUPS, expandQuery, findFoods } from './foodSynonyms';
import { FoodSearch, tokens } from './search';
import type { Food } from './types';

vi.setConfig({ testTimeout: 30_000 });

const key = (s: string) => tokens(s).join(' ');

describe('synonym table', () => {
  it('has the common pairs a recipe writer types, both ways', () => {
    const pairs: [string, string][] = [
      ['hing', 'asafoetida'], ['dahi', 'yogurt'], ['atta', 'whole wheat flour'], ['chana', 'chickpeas'], ['rajma', 'kidney beans'],
      ['masoor', 'red lentils'], ['toor', 'pigeon peas'], ['moong', 'mung'], ['urad', 'black gram'], ['methi', 'fenugreek'],
      ['besan', 'chickpea flour'], ['scallion', 'green onion'], ['cilantro', 'coriander leaves'], ['eggplant', 'aubergine'],
      ['garbanzo', 'chickpeas'], ['okra', 'ladies fingers'], ['zucchini', 'courgette'], ['shrimp', 'prawn'], ['cornstarch', 'cornflour'],
    ];
    for (const [a, b] of pairs) {
      expect(expandQuery(a), `${a} -> ${b}`).toContain(key(b));
      expect(expandQuery(b), `${b} -> ${a}`).toContain(key(a));
    }
  });

  it('is a table of about 40 or more groups with no term in two places of one group', () => {
    expect(SYNONYM_GROUPS.length).toBeGreaterThanOrEqual(40);
    for (const g of SYNONYM_GROUPS) {
      expect(g.length).toBeGreaterThanOrEqual(2);
      expect(new Set(g.map(key)).size, g.join('/')).toBe(g.length);
    }
  });
});

describe('expandQuery', () => {
  it('puts the query first, swaps one known term, and keeps the rest of the words', () => {
    expect(expandQuery('hing')).toEqual(['hing', 'asafoetida', 'asafetida']);
    expect(expandQuery('Dahi, low fat')).toContain('yogurt low fat');
    expect(expandQuery('Chickpeas')[0]).toBe('chickpea');
  });

  it('uses the longest term of a group, not the shorter one inside it', () => {
    expect(expandQuery('urad dal')).toEqual(expect.arrayContaining(['urad dal', 'urad', 'black gram']));
    expect(expandQuery('urad dal')).not.toContain('urad dal dal');
    expect(expandQuery('urad dal')).not.toContain('black gram dal');
  });

  it('returns only the query when nothing is known, nothing for empty input, and never more than 8 strings', () => {
    expect(expandQuery('salmon')).toEqual(['salmon']);
    expect(expandQuery('  ')).toEqual([]);
    expect(expandQuery('chickpea chana garbanzo kidney rajma').length).toBeLessThanOrEqual(8);
  });
});

describe('findFoods on a small catalog', () => {
  const f = (id: string, name: string, head: string, tier: 'everyday' | 'extended', rank: number): Food => ({
    id, name, head, form: 'product', category: 'condiment', rank, tier, n: { kcal: 300, protein: 5 }, src: [{ db: 'x', ref: id }],
  });
  const search = new FoodSearch([
    f('asa-1', 'Asafoetida', 'asafoetida', 'extended', 30),
    f('yog-1', 'Yogurt, plain', 'yogurt', 'everyday', 90),
    f('scr-1', 'Pork scratching', 'pork scratching', 'extended', 20),
  ]);

  it('finds a food by its other name, says which variant found it, and drops weak partial-word matches', () => {
    const { hits } = findFoods(search, 'hing');
    expect(hits.map((h) => h.food.id)).toEqual(['asa-1']);
    expect(hits[0].via).toBe('asafoetida');
    expect(findFoods(search, 'dahi').hits[0].food.id).toBe('yog-1');
    expect(findFoods(search, 'yogurt').hits[0].via).toBeUndefined();
  });

  it('returns nothing for an unknown word', () => {
    expect(findFoods(search, 'zzzz').hits).toEqual([]);
  });
});

describe('findFoods on the whole library (everyday + extended)', () => {
  const top = (q: string) => findFoods(labSearch, q).hits[0]?.food;
  const curated = (f: Food | undefined) => !!f?.src[0].db.startsWith('Eighty composite of ');

  it('knows both tiers, with every food reachable through the index', () => {
    expect(LAB_FOODS.some((f) => f.tier === 'everyday')).toBe(true);
    expect(LAB_FOODS.some((f) => f.tier === 'extended')).toBe(true);
    expect(new Set(LAB_FOODS.map((f) => f.id)).size).toBe(LAB_FOODS.length);
    expect(LAB_INDEX.get(LAB_FOODS[LAB_FOODS.length - 1].id)).toBeDefined();
  });

  it('hing finds asafoetida, dahi finds yogurt, urad dal finds black gram', () => {
    expect(top('hing')?.name).toMatch(/^Asafoetida/);
    expect(top('dahi')?.name).toMatch(/yogurt/i);
    expect(top('urad dal')?.name).toMatch(/black gram|urad/i);
  });

  it('finds the foods writers missed in the everyday list (cardamom, cinnamon, cloves, bay leaf, curry leaves, garam masala, teff, melon seeds)', () => {
    for (const [q, re] of [['cardamom', /cardamom/i], ['cinnamon', /cinnamon/i], ['cloves', /clove/i], ['bay leaf', /bay leaf/i], ['curry leaves', /curry leaves/i],
      ['garam masala', /garam masala/i], ['teff', /teff/i], ['melon seeds', /melon seeds/i]] as const) {
      expect(top(q)?.name, q).toMatch(re);
    }
  });

  it('finds extended-tier foods (perilla seeds, kombu, fonio)', () => {
    const names = (q: string) => findFoods(labSearch, q, { limit: 50 }).hits.flatMap((h) => h.group).filter((f) => f.tier === 'extended').map((f) => f.name);
    expect(names('perilla seeds').join('|')).toMatch(/perilla/i);
    expect(names('kombu').join('|')).toMatch(/kombu/i);
    expect(names('fonio').join('|')).toMatch(/fonio/i);
  });

  it('finds every curated staple by its everyday name', () => {
    for (const q of ['sumac', "za'atar", 'baharat', 'seven spice', 'chaat masala', 'kala namak', 'amchur', 'ajwain', 'kasuri methi', 'kashmiri chilli powder', 'gochujang',
      'gochugaru', 'doenjang', 'berbere', 'ras el hanout', 'pomegranate molasses', 'tamarind paste', 'labneh']) {
      const f = top(q);
      expect(curated(f), `${q} -> ${f?.name}`).toBe(true);
      expect(f?.tier).toBe('everyday');
      expect(f?.estimated?.length, q).toBeGreaterThan(0);
    }
  });
});
