import { describe, expect, it } from 'vitest';
import { isHighMercuryFish, isLiver, isPlantDairy, isProteinSource } from './foodRoles';
import { FOOD_BANS } from './planStyles';
import type { Food } from './types';

const food = (name: string, category: Food['category']) => ({ id: name, name, category, n: {}, servings: [] }) as unknown as Food;

describe('isPlantDairy', () => {
  it('treats plant yogurts and beverages filed under dairy as plant foods', () => {
    for (const n of [
      'Soy yogurt, plain',
      'Soya yogurt, non-dairy alternative to yogurt, fruit, fortified',
      'Almond-based yogurt, flavored',
      'Coconut-based yogurt, flavored',
      'Oat beverage, added Ca',
      'Almond beverage, no added sugar, added Ca',
      'Ice cream bars, choc ice, non-dairy, with chocolate flavored coating',
    ])
      expect(isPlantDairy(food(n, 'dairy')), n).toBe(true);
  });

  it('keeps real dairy as dairy, goat and coconut blends included', () => {
    for (const n of [
      'Goat yogurt, plain',
      'Goat milk',
      'Greek yogurt, 2% fat, coconut blend',
      'Cheese, cheddar',
      'Milk, 2%',
      'Coffee whitener (non dairy), powdered',
      'Dessert topping (non dairy), powdered, prepared with whole milk',
      'Cream, vegetable fat (non-dairy)',
    ])
      expect(isPlantDairy(food(n, 'dairy')), n).toBe(false);
  });

  it('lets soy yogurt into vegan and dairy-free plans, but not cow or goat yogurt', () => {
    expect(FOOD_BANS.animal(food('Soy yogurt, plain', 'dairy'))).toBeUndefined();
    expect(FOOD_BANS.dairy(food('Oat beverage, added Ca', 'dairy'))).toBeUndefined();
    expect(FOOD_BANS.animal(food('Goat yogurt, plain', 'dairy'))).toBe('dairy');
    expect(FOOD_BANS.dairy(food('Yogurt, Greek, plain', 'dairy'))).toBe('dairy');
  });
});

describe('isProteinSource', () => {
  it('counts seitan and vital wheat gluten as protein', () => {
    expect(isProteinSource(food('Seitan', 'other'))).toBe(true);
    expect(isProteinSource(food('Wheat, vital wheat gluten', 'grain'))).toBe(true);
    expect(isProteinSource(food('Fu (wheat gluten cake), raw', 'grain'))).toBe(true);
    expect(isProteinSource(food('Textured vegetable protein, soy granule', 'other'))).toBe(true);
    expect(isProteinSource(food('Soya, textured, dried', 'other'))).toBe(true);
    expect(isProteinSource(food('Soy protein, textured, rehydrated', 'other'))).toBe(true);
    expect(isProteinSource(food('Lecithin, soy granules', 'other'))).toBe(false);
    expect(isProteinSource(food('Chewy granola bar, fruit flavor, soy protein added', 'grain'))).toBe(false);
  });

  it('keeps the protein categories and leaves other foods out', () => {
    expect(isProteinSource(food('Tofu, firm', 'legume'))).toBe(true);
    expect(isProteinSource(food('Chicken breast', 'poultry'))).toBe(true);
    expect(isProteinSource(food('Bread, whole wheat', 'grain'))).toBe(false);
    expect(isProteinSource(food('Rice flour bread, wheat gluten free', 'grain'))).toBe(false);
    expect(isProteinSource(food('Plant-based burger from wheat seitan', 'prepared'))).toBe(false);
  });
});

describe('egg ban', () => {
  it('catches eggs and mayonnaise but not eggplant or egg-free foods', () => {
    expect(FOOD_BANS.egg(food('Egg, whole, boiled', 'egg'))).toBe('egg');
    expect(FOOD_BANS.egg(food('Mayonnaise, regular', 'other'))).toBe('egg');
    expect(FOOD_BANS.egg(food('Eggplant, raw', 'vegetable'))).toBeUndefined();
    expect(FOOD_BANS.egg(food('Paneer cheese', 'dairy'))).toBeUndefined();
    expect(FOOD_BANS.egg(food('Noodles, egg-free', 'grain'))).toBeUndefined();
  });
});

describe('do-no-harm foods', () => {
  it('knows high-mercury fish from the low-mercury ones', () => {
    for (const n of ['Swordfish, raw', 'Shark, raw', 'Tuna, fresh, bluefin, raw', 'Fish, mackerel, king, raw', 'Orange roughy, raw'])
      expect(isHighMercuryFish(food(n, 'fish')), n).toBe(true);
    for (const n of ['Light tuna, canned in water, drained solids', 'Tuna in oil, drained', 'Skipjack tuna, katsuobushi (dried bonito)', 'Salmon, Atlantic, raw', 'Mackerel, Atlantic, raw'])
      expect(isHighMercuryFish(food(n, 'fish')), n).toBe(false);
  });

  it('knows liver, but not cod liver oil', () => {
    expect(isLiver(food('Chicken liver, raw', 'poultry'))).toBe(true);
    expect(isLiver(food('Beef liver, braised', 'meat'))).toBe(true);
    expect(isLiver(food('Cod liver oil', 'oil_fat'))).toBe(false);
  });
});
