import { describe, expect, it } from 'vitest';

import { SYNONYM_GROUPS } from './foodSynonyms';
import { TextIndex, nutrientAmount, parseNutrientQuery, type SearchDoc } from './textSearch';

const docs: SearchDoc[] = [
  {
    key: 'a',
    fields: [
      { text: 'Grilled salmon with lentils', weight: 3 },
      { text: 'Atlantic salmon, lemon, red lentils', weight: 1 },
    ],
  },
  { key: 'b', fields: [{ text: 'Chickpea curry', weight: 3 }, { text: 'chickpeas, eggplant, tomato', weight: 1 }] },
  { key: 'c', fields: [{ text: 'Veggie omelette', weight: 3 }, { text: 'eggs, spinach, salmon', weight: 1 }] },
  { key: 'd', fields: [{ text: 'Oat porridge', weight: 3 }, { text: 'oats, milk, banana', weight: 1 }] },
];

const index = new TextIndex(docs);
const keys = (m: Map<string, number> | null) => [...(m ?? [])].map(([k]) => k).sort();

describe('TextIndex', () => {
  it('returns null for an empty or whitespace query', () => {
    expect(index.search('')).toBeNull();
    expect(index.search('   ')).toBeNull();
  });

  it('returns an empty map when nothing matches', () => {
    expect(index.search('zzzzqq')?.size).toBe(0);
  });

  it('folds plurals to the singular', () => {
    expect(keys(index.search('salmons'))).toEqual(['a', 'c']);
  });

  it('matches the start of a word', () => {
    expect(keys(index.search('lent'))).toEqual(['a']);
  });

  it('forgives one typo when nothing matches cleanly', () => {
    expect(keys(index.search('salomn'))).toEqual(['a', 'c']);
  });

  it('a clean match suppresses typo-only docs', () => {
    const idx = new TextIndex([
      { key: 'x', fields: [{ text: 'salmon', weight: 1 }] },
      { key: 'y', fields: [{ text: 'salmom', weight: 1 }] },
    ]);
    expect(keys(idx.search('salmon'))).toEqual(['x']);
    expect(keys(idx.search('salmom'))).toEqual(['y']);
  });

  it('finds synonyms from the shared groups', () => {
    expect(SYNONYM_GROUPS.some((g) => g.includes('aubergine') && g.includes('eggplant'))).toBe(true);
    expect(keys(index.search('aubergine'))).toEqual(['b']);
  });

  it('requires every word to match', () => {
    expect(keys(index.search('salmon lentils'))).toEqual(['a']);
    expect(keys(index.search('salmon eggplant'))).toEqual([]);
    expect(keys(index.search('salmon spinach'))).toEqual(['c']);
  });

  it('scores a name match above an ingredient-only match', () => {
    const r = index.search('salmon')!;
    expect(r.get('a')!).toBeGreaterThan(r.get('c')!);
    const l = new TextIndex([
      { key: 'name', fields: [{ text: 'Lemon tart', weight: 3 }] },
      { key: 'ing', fields: [{ text: 'Fish', weight: 3 }, { text: 'lemon', weight: 1 }] },
    ]).search('lemon')!;
    expect(l.get('name')!).toBeGreaterThan(l.get('ing')!);
  });
});

describe('parseNutrientQuery', () => {
  it('reads "high iron"', () => {
    expect(parseNutrientQuery('high iron')).toMatchObject({ keys: ['iron'], rest: '' });
  });

  it('keeps the non-filler words as the rest', () => {
    expect(parseNutrientQuery('iron rich lentils')).toMatchObject({ keys: ['iron'], rest: 'lentils' });
  });

  it('reads vitamins, case-insensitively', () => {
    expect(parseNutrientQuery('vitamin d')?.keys).toEqual(['vitD']);
    expect(parseNutrientQuery('Vitamin B12')?.keys).toEqual(['b12']);
  });

  it('reads omega-3 as ALA + EPA + DHA', () => {
    expect(parseNutrientQuery('omega-3')).toMatchObject({ keys: ['ala', 'epa', 'dha'], label: 'Omega-3', rest: '' });
  });

  it('accepts both spellings of fibre', () => {
    expect(parseNutrientQuery('fibre')).toMatchObject({ keys: ['fiber'], label: 'Fibre' });
    expect(parseNutrientQuery('fiber')).toMatchObject({ keys: ['fiber'], label: 'Fibre' });
  });

  it('forgives a typo on a long single word', () => {
    expect(parseNutrientQuery('calcuim')?.keys).toEqual(['calcium']);
  });

  it('returns null when no nutrient is named', () => {
    expect(parseNutrientQuery('salmon')).toBeNull();
    expect(parseNutrientQuery('')).toBeNull();
  });
});

describe('nutrientAmount', () => {
  it('sums the keys that have data', () => {
    expect(nutrientAmount({ ala: 1, epa: 0.5, dha: 0.25 }, ['ala', 'epa', 'dha'])).toBeCloseTo(1.75);
    expect(nutrientAmount({ ala: 1 }, ['ala', 'epa'])).toBe(1);
    expect(nutrientAmount({ iron: 0 }, ['iron'])).toBe(0);
  });

  it('is null when none of the keys has data', () => {
    expect(nutrientAmount({ iron: 3 }, ['ala', 'epa'])).toBeNull();
    expect(nutrientAmount({}, ['iron'])).toBeNull();
  });
});
