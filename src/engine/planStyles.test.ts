import { describe, expect, it } from 'vitest';

import fixtureJson from '../../content/families/_fixture-mini.json';
import { FOODS, FOOD_INDEX } from '@/state/catalog';

import { compileSize, type FamilyFile } from './family';
import { FOOD_BANS, PLAN_STYLES, gradeOptionsFor, runStyleGates, styleNutrientGates, styleStructureGates } from './planStyles';
import { familyDeps } from '@/state/familyDeps';
import type { MealPlan, PlanStyle } from './types';

const fixture = fixtureJson as unknown as FamilyFile;
const clone = (): FamilyFile => structuredClone(fixture);
const standard = (family: FamilyFile): MealPlan => compileSize(family, 'standard', familyDeps)!.plan;
const idOf = (name: string) => FOODS.find((f) => f.name === name)!.id;
const codes = (style: PlanStyle, plan: MealPlan, kcal = 2100) => runStyleGates(style, plan, FOOD_INDEX, kcal).map((g) => g.code);

/** Swap every use of one food in the family for another. */
function swapFood(family: FamilyFile, from: string, to: string) {
  for (const r of family.recipes) for (const i of r.ingredients) if (i.food === from) i.food = to;
}

describe('plan styles', () => {
  it('has the 27 styles of the guide, each with a label and a blurb', () => {
    const styles = Object.keys(PLAN_STYLES);
    expect(styles).toHaveLength(27);
    for (const s of styles) {
      expect(PLAN_STYLES[s as PlanStyle].label.length).toBeGreaterThan(2);
      expect(PLAN_STYLES[s as PlanStyle].blurb).not.toMatch(/[—–]/);
    }
  });

  it('the fixture passes the balanced and family styles', () => {
    expect(codes('balanced', standard(fixture))).toEqual([]);
    expect(codes('family', standard(fixture))).toEqual([]);
  });

  it('vegan rejects an egg, vegetarian does not', () => {
    const plan = standard(fixture);
    const vegan = styleStructureGates('vegan', plan, FOOD_INDEX);
    expect(vegan.some((g) => /Egg, whole, raw/.test(g.message) && /egg/.test(g.message))).toBe(true);
    expect(vegan.some((g) => /Salmon/.test(g.message))).toBe(true);
    expect(styleStructureGates('vegetarian', plan, FOOD_INDEX).some((g) => /Egg/.test(g.message))).toBe(false);
    expect(styleStructureGates('vegetarian', plan, FOOD_INDEX).some((g) => /Salmon|Chicken/.test(g.message))).toBe(true);
    expect(styleStructureGates('pescatarian', plan, FOOD_INDEX).map((g) => g.message).join()).toMatch(/Chicken/);
    expect(styleStructureGates('pescatarian', plan, FOOD_INDEX).map((g) => g.message).join()).not.toMatch(/Salmon/);
  });

  it('vegan and vegetarian skip the fatty fish rule; anti-inflammatory asks for 3 a week', () => {
    expect(gradeOptionsFor('vegan', 2000).rules.fattyFishPerWeek).toBe(0);
    expect(gradeOptionsFor('vegetarian', 2000).rules.fattyFishPerWeek).toBe(0);
    expect(gradeOptionsFor('balanced', 2000).rules).toEqual({});
    expect(gradeOptionsFor('anti-inflammatory', 2000).rules).toEqual({ omegaMaxRatio: 3, fattyFishPerWeek: 3 });
  });

  it('vegan also catches honey, gelatin, animal fat, dairy and egg by name, not plant milks or butter beans', () => {
    const ban = FOOD_BANS.animal;
    for (const n of ['Honey, strained or extracted', 'Gelatin, dried', 'Lard', 'Ghee made from vegetable oil', 'Mayonnaise', 'Egg noodles pasta, cooked', 'Salted butter', 'Goat cheese, soft']) expect(ban(FOODS.find((f) => f.name === n)!), n).toBeTruthy();
    for (const n of ['Soy milk, plain', 'Almond milk, unsweetened, plain, refrigerated', 'Peanut butter, smooth', 'Butter bean or yellow bean, raw', 'Oyster mushroom, raw', 'Tofu, medium firm (prepared with calcium sulphate)', 'Eggplant, raw'])
      expect(ban(FOODS.find((f) => f.name === n)!), n).toBeUndefined();
  });

  it('prenatal rejects swordfish, and grades the pregnant female reference only', () => {
    const family = clone();
    swapFood(family, idOf('Salmon, atlantic, farmed, baked or broiled'), idOf('Swordfish, baked or broiled'));
    const gates = styleStructureGates('prenatal', standard(family), FOOD_INDEX);
    expect(gates.some((g) => /Swordfish/.test(g.message) && /high-mercury fish/.test(g.message))).toBe(true);
    expect(styleStructureGates('prenatal', standard(fixture), FOOD_INDEX)).toEqual([]);
    expect(gradeOptionsFor('prenatal', 2400).panel).toEqual([{ sex: 'female', age: 40, lifeStage: 'pregnant' }]);
    expect(gradeOptionsFor('postpartum', 2400).panel).toEqual([{ sex: 'female', age: 40, lifeStage: 'lactating' }]);
  });

  it('prenatal also bans raw or smoked fish, liver, poached eggs, soft cheese and raw or soft egg methods', () => {
    const ban = FOOD_BANS.prenatal;
    for (const n of ['Smoked salmon', 'Beef liver, braised', 'Poached egg, whole', 'Brie cheese', 'Camembert cheese', 'Blue cheese', 'King mackerel, raw', 'Shark, raw'])
      expect(ban(FOODS.find((f) => f.name === n)!), n).toBeTruthy();
    for (const n of ['Egg, whole, boiled', 'Egg, whole, raw', 'Feta cheese', 'Salmon, atlantic, farmed, baked or broiled', 'Egg, whole, raw, frozen, pasteurized']) expect(ban(FOODS.find((f) => f.name === n)!), n).toBeUndefined();
    const family = clone();
    family.recipes[0].steps![2] = 'Cook the eggs soft-boiled with a runny yolk.';
    expect(styleStructureGates('prenatal', standard(family), FOOD_INDEX).some((g) => g.code === 'prenatal_method')).toBe(true);
  });

  it('female only below 1600 kcal, both references from 1600', () => {
    expect(gradeOptionsFor('balanced', 1599).panel.map((p) => p.sex)).toEqual(['female']);
    expect(gradeOptionsFor('balanced', 1600).panel.map((p) => p.sex)).toEqual(['male', 'female']);
  });

  it('quick rejects a 40 minute dinner on day 2 and accepts leftovers on days 1 to 5', () => {
    const family = clone();
    for (const r of family.recipes) {
      r.prepMin = 5;
      r.cookMin = 10;
    }
    expect(styleStructureGates('quick', standard(family), FOOD_INDEX)).toEqual([]);
    family.recipes.find((r) => r.id === 'chicken-chickpea-stew')!.cookMin = 40;
    const gates = styleStructureGates('quick', standard(family), FOOD_INDEX);
    expect(gates).toHaveLength(1);
    expect(gates[0]).toMatchObject({ code: 'quick_time', day: 2 });
    expect(gates[0].message).toMatch(/Chicken and chickpea stew/);
    // a 45 minute dinner that is the next day's leftover lunch is only counted when cooked
    family.recipes.find((r) => r.id === 'chicken-chickpea-stew')!.cookMin = 10;
    family.recipes.find((r) => r.id === 'salmon-potatoes-broccoli')!.cookMin = 45;
    const salmon = styleStructureGates('quick', standard(family), FOOD_INDEX);
    expect(salmon.map((g) => g.day)).toEqual([1]);
  });

  it('family rejects a spicy recipe', () => {
    const family = clone();
    family.recipes[0].tags = ['spicy'];
    expect(styleStructureGates('family', standard(family), FOOD_INDEX).map((g) => g.day)).toEqual([1, 2]);
  });

  it('ramadan has no lunch and names Suhoor and Iftar; intermittent fasting has no breakfast', () => {
    const plan = standard(fixture);
    expect(styleStructureGates('ramadan', plan, FOOD_INDEX).map((g) => g.day)).toEqual([1, 2]);
    expect(PLAN_STYLES.ramadan.gates.slotNames).toEqual({ breakfast: 'Suhoor', dinner: 'Iftar' });
    expect(styleStructureGates('intermittent-fasting', plan, FOOD_INDEX).map((g) => g.message).join()).toMatch(/no breakfast/);
    const family = clone();
    family.style = 'ramadan';
    expect(compileSize(family, 'standard', familyDeps)!.plan.slotNames).toEqual({ breakfast: 'Suhoor', dinner: 'Iftar' });
  });

  it('flexitarian limits red meat days and poultry or fish days', () => {
    const plan = standard(fixture);
    expect(styleStructureGates('flexitarian', plan, FOOD_INDEX)).toEqual([]);
    const family = clone();
    swapFood(family, idOf('Chickpeas, canned, drained solids'), idOf('Beef, lean and fat, cooked'));
    swapFood(family, idOf('Lentils, boiled'), idOf('Beef, lean and fat, cooked'));
    expect(styleStructureGates('flexitarian', standard(family), FOOD_INDEX).map((g) => g.code)).toEqual(['red_meat']);
  });

  it('gluten-free bans wheat, bread, pasta and soy sauce but accepts tamari, corn and rice', () => {
    const ban = FOOD_BANS.gluten;
    for (const n of ['Whole wheat bread', 'Pasta, cooked', 'Couscous, cooked', 'Bulgur, cooked', 'Rye bread', 'Pearl barley, boiled', 'Soy sauce (shoyu)', 'Farro, pearled, dry, raw'])
      expect(ban(FOODS.find((f) => f.name === n)!), n).toBeTruthy();
    for (const n of ['Soy sauce, tamari', 'Corn tortilla', 'Brown rice, cooked', 'Quinoa, cooked', 'Gluten-free bread, white', 'Oats, dry', 'Buckwheat groats, roasted'])
      expect(ban(FOODS.find((f) => f.name === n)!), n).toBeUndefined();
    expect(styleStructureGates('gluten-free', standard(fixture), FOOD_INDEX).some((g) => /Whole wheat bread/.test(g.message))).toBe(true);
  });

  it('dairy-free bans the dairy category, ghee and butter; paleo bans grains, legumes, dairy and added sugar', () => {
    const plan = standard(fixture);
    expect(styleStructureGates('dairy-free', plan, FOOD_INDEX).some((g) => /Greek yogurt/.test(g.message))).toBe(true);
    for (const n of ['Clarified butter (ghee)', 'Salted butter', 'Milk, whole, 3.25% fat']) expect(FOOD_BANS.dairy(FOODS.find((f) => f.name === n)!), n).toBeTruthy();
    const paleo = FOOD_BANS.paleo;
    for (const n of ['Brown rice, cooked', 'Quinoa, cooked', 'Lentils, boiled', 'Chickpeas, boiled', 'Greek yogurt, plain, low-fat', 'Sugar, refined', 'Whole wheat bread', 'Popcorn, air-popped']) expect(paleo(FOODS.find((f) => f.name === n)!), n).toBeTruthy();
    for (const n of ['Salmon, atlantic, farmed, baked or broiled', 'Honey, strained or extracted', 'Maple syrup, prepackaged', 'Chia seeds, dried', 'Potato, white, flesh and skin, baked', 'Olive oil', 'Almonds, dried'])
      expect(paleo(FOODS.find((f) => f.name === n)!), n).toBeUndefined();
  });

  it('budget allows premium foods on 2 days and 35 groceries', () => {
    expect(PLAN_STYLES.budget.gates.maxGroceries).toBe(35);
    const plan = standard(fixture);
    expect(styleStructureGates('budget', plan, FOOD_INDEX)).toEqual([]); // salmon on day 1, and its leftover on day 2
    const threeDays = { ...plan, days: [plan.days[0], { ...plan.days[0], day: 2 }, { ...plan.days[0], day: 3 }] };
    expect(styleStructureGates('budget', threeDays, FOOD_INDEX).map((g) => g.code)).toEqual(['premium']);
  });

  it('gut needs a fermented food on 5 days of 7 and 30 plant foods; low-gi scales its glycemic ceiling with kcal', () => {
    expect(styleStructureGates('gut', standard(fixture), FOOD_INDEX)).toEqual([]); // 2 days: 2 fermented days and 9 plants are enough
    const family = clone();
    swapFood(family, idOf('Greek yogurt, plain, low-fat'), idOf('Milk, whole, 3.25% fat'));
    expect(styleStructureGates('gut', standard(family), FOOD_INDEX).map((g) => g.code)).toEqual(['fermented']);
    family.recipes = family.recipes.filter((r) => r.id === 'hummus-carrot-snack');
    family.week = [{ day: 1, meals: [{ slot: 'snack', recipe: 'hummus-carrot-snack' }] }];
    expect(styleStructureGates('gut', standard(family), FOOD_INDEX).map((g) => g.code)).toEqual(['plant_variety', 'fermented']);
    expect(gradeOptionsFor('low-gi', 2000).rules.glycemicLoadMax).toBe(70);
    expect(gradeOptionsFor('low-gi', 3000).rules.glycemicLoadMax).toBe(105);
    expect(gradeOptionsFor('endurance', 2000).rules.glycemicLoadMax).toBe(Infinity);
  });
});

describe('nutrient gates', () => {
  const plan = standard(fixture);
  const day = (style: PlanStyle, p = plan, kcal = 2100) => styleNutrientGates(style, p, FOOD_INDEX, kcal);
  // a "day" of one snack: little protein, iron or fibre
  const snackOnly = (slot: 'snack' | 'breakfast'): MealPlan => ({ ...plan, days: [{ day: 1, meals: [{ ...plan.days[1].meals[3], slot }] }] });

  it('keto, low-carb, endurance and heart limits are checked on each day', () => {
    expect(day('keto').map((g) => g.code)).toEqual(['net_carbs', 'net_carbs']);
    expect(day('low-carb').map((g) => g.code)).toEqual(['carbs_high', 'carbs_high']);
    expect(day('endurance').map((g) => g.code)).toEqual(['carbs_low', 'carbs_low']);
    expect(day('heart')).toMatchObject([{ code: 'sodium', day: 2 }]);
    expect(day('balanced')).toEqual([]);
  });

  it('gut asks for 35 g of fibre, or 30 g under 1800 kcal', () => {
    expect(PLAN_STYLES.gut.gates).toMatchObject({ fibreMinG: 35, fibreMinGBelow1800: 30 });
    expect(day('gut')).toEqual([]);
    const small = snackOnly('snack');
    expect(day('gut', small, 2000).map((g) => g.code)).toEqual(['fibre']);
    expect(day('gut', small, 2000)[0].message).toMatch(/needs at least 35 g/);
    expect(day('gut', small, 1700)[0].message).toMatch(/needs at least 30 g/);
    expect(day('fat-loss', small)[0].message).toMatch(/at least 30 g/);
  });

  it('iron focus asks 100% of the adult woman RDA (18 mg) every day', () => {
    expect(day('iron-focus')).toEqual([]);
    const gates = day('iron-focus', snackOnly('snack'));
    expect(gates).toHaveLength(1);
    expect(gates[0].message).toMatch(/iron is \d+\.\d mg \(a Iron focus plan needs 18 mg\)/);
  });

  it('healthy aging needs 25 g of protein at breakfast, lunch and dinner', () => {
    expect(day('healthy-aging')).toEqual([]);
    const gates = day('healthy-aging', snackOnly('breakfast'));
    expect(gates).toHaveLength(1);
    expect(gates[0]).toMatchObject({ code: 'meal_protein', day: 1 });
    expect(gates[0].message).toMatch(/breakfast has \d+ g of protein \(a Healthy aging plan needs 25 g\)/);
  });
});
