import { describe, expect, it } from 'vitest';

import { FOODS } from '@/state/catalog';

import { GO_TO_SOURCES, goToSources } from './goToSources';
import type { NutrientKey } from './types';

describe('go-to sources', () => {
  const keys = Object.keys(GO_TO_SOURCES) as NutrientKey[];

  it('resolves at least four everyday whole foods for every board nutrient', () => {
    for (const k of keys) {
      const foods = goToSources(k, FOODS);
      expect(foods.length, k).toBe(4);
      for (const f of foods) {
        expect(f.tier, `${k}: ${f.name}`).not.toBe('extended');
        expect(['dried', 'dish'], `${k}: ${f.name}`).not.toContain(f.form);
        expect(f.n[k] ?? 0, `${k}: ${f.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps meat and fish out of plant-based suggestions', () => {
    for (const k of keys) {
      for (const f of goToSources(k, FOODS, true)) expect(['meat', 'poultry', 'fish'], `${k}: ${f.name}`).not.toContain(f.category);
    }
  });

  it('suggests foods people eat a serving of, not dense oddities', () => {
    const names = goToSources('calcium', FOODS).map((f) => f.name.toLowerCase());
    expect(names[0]).toContain('yogurt');
    expect(names.join(' ')).not.toMatch(/agar|baking powder|dried/);
  });
});
