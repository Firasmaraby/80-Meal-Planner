import { describe, expect, it } from 'vitest';

import { FOODS } from '@/state/catalog';

import { displayIngredientName } from './ingredientName';

const n = (name: string) => displayIngredientName({ name });

describe('displayIngredientName', () => {
  it('drops trailing raw and whole', () => {
    expect(n('Egg, whole, raw')).toBe('Egg');
    expect(n('Spinach, raw')).toBe('Spinach');
    expect(n('Kiwifruit, green, raw')).toBe('Kiwifruit, green');
    expect(n('Salmon, Atlantic, farmed, raw')).toBe('Salmon, Atlantic, farmed');
    expect(n('Soybean, seed, whole')).toBe('Soybean, seed');
    expect(n('Tomato, fresh')).toBe('Tomato');
  });

  it('keeps words that change the amount or the dish', () => {
    expect(n('Quinoa, uncooked')).toBe('Quinoa, uncooked');
    expect(n('Lentils, boiled')).toBe('Lentils, boiled');
    expect(n('Chickpeas, canned, drained')).toBe('Chickpeas, canned, drained');
    expect(n('Beef rump steak, raw, lean')).toBe('Beef rump steak, raw, lean');
  });

  it('keeps whole on milk and yogurt, where it is the kind', () => {
    expect(n('Milk, whole')).toBe('Milk, whole');
    expect(n('Sheep milk, whole')).toBe('Sheep milk, whole');
    expect(n('Yogurt, plain, whole')).toBe('Yogurt, plain, whole');
  });

  it('never returns an empty name and leaves one-word names alone', () => {
    expect(n('Raw')).toBe('Raw');
    expect(n('Garlic')).toBe('Garlic');
    expect(displayIngredientName(undefined, 'some-food-id')).toBe('some-food-id');
    expect(n('Whole, raw')).toBe('Whole');
  });

  it('leaves a name no shorter than its first word for every real food', () => {
    for (const f of FOODS) {
      const out = displayIngredientName(f);
      expect(out.length, f.id).toBeGreaterThan(0);
      expect(f.name.startsWith(out), `${f.name} -> ${out}`).toBe(true);
    }
  });
});
