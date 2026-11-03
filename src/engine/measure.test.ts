import { describe, expect, it } from 'vitest';
import { measureText, plural, singular } from './measure';

const walnut = { servings: [{ label: '1 oz (14 halves)', g: 28 }, { label: '1/4 cup, chopped', g: 29 }] };
const radish = { servings: [{ label: '1 medium', g: 4.5 }, { label: '1 cup slices', g: 116 }] };
const fig = { servings: [{ label: '1 fig', g: 19 }] };
const lentils = { servings: [{ label: '1 cup', g: 192 }] };

describe('measureText', () => {
  it('reads a size in brackets as one piece, not a count', () => {
    const tortilla = { servings: [{ label: '1 tortilla (6 inch)', g: 26 }] };
    expect(measureText(tortilla, 26)).toBe('1 tortilla (6 inch)');
    expect(measureText(tortilla, 55)).toBe('2 tortillas (6 inch)');
    expect(measureText(tortilla, 13)).toBe('½ tortilla (6 inch)');
  });

  it('counts the pieces in a parenthesised serving', () => {
    expect(measureText(walnut, 20)).toBe('10 halves');
    expect(measureText(walnut, 2)).toBe('1 half');
  });
  it('rounds counted things to whole numbers from 2, quarters below', () => {
    const avocado = { servings: [{ label: '1/2 avocado', g: 100 }] };
    expect(measureText(avocado, 150)).toBe('¾ avocado');
    expect(measureText(avocado, 100)).toBe('½ avocado');
    expect(measureText(avocado, 50)).toBe('¼ avocado');
    expect(measureText(radish, 30)).toBe('7 medium');
    expect(measureText(fig, 30)).toBe('1½ figs');
    expect(measureText(fig, 40)).toBe('2 figs');
    expect(measureText(fig, 19)).toBe('1 fig');
  });
  it('uses kitchen fractions for volumes, thirds included', () => {
    expect(measureText(lentils, 70)).toBe('⅓ cup');
    expect(measureText(lentils, 130)).toBe('⅔ cup');
    expect(measureText(lentils, 290)).toBe('1½ cups');
  });
  it('falls through to the next serving when one is out of range, and gives up when none fits', () => {
    expect(measureText(radish, 300)).toBe('2½ cups slices') // 300 / 116 = 2.59: halves from 2 cups;
    expect(measureText(lentils, 5)).toBeUndefined();
    expect(measureText({ servings: [] }, 100)).toBeUndefined();
    expect(measureText(undefined, 100)).toBeUndefined();
  });
  it('keeps big amounts readable: whole cups from 4, halves from 2, no 70 tbsp, no 69 radishes', () => {
    const oil = { servings: [{ label: '1 tbsp', g: 13.5 }] };
    expect(measureText(oil, 945, 99)).toBeUndefined();
    expect(measureText(radish, 310, 99)).toBe('2½ cups slices');
    expect(measureText(lentils, 1000, 99)).toBe('5 cups');
    expect(measureText({ servings: [{ label: '1 clove', g: 3 }] }, 84, 99)).toBe('28 cloves');
  });
  it('makes nouns agree but leaves sizes and abbreviations alone', () => {
    expect(['bunch', 'cherry', 'leaf', 'slice', 'cups'].map(plural)).toEqual(['bunches', 'cherries', 'leaves', 'slices', 'cups']);
    expect(['halves', 'cherries', 'bunches', 'figs', 'glass'].map(singular)).toEqual(['half', 'cherry', 'bunch', 'fig', 'glass']);
    expect(measureText({ servings: [{ label: '1 large, whole', g: 50 }] }, 100)).toBe('2 large, whole');
    expect(measureText({ servings: [{ label: '1 tbsp', g: 15 }] }, 30)).toBe('2 tbsp');
  });
});
