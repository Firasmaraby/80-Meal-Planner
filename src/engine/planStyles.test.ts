import { describe, expect, it } from 'vitest';

import fixtureJson from '../../content/families/_fixture-mini.json';
import { FOODS, FOOD_INDEX } from '@/state/catalog';

import { compileSize, type FamilyFile } from './family';
import { caffeineMgPer100g } from './foodRoles';
import { FOOD_BANS, PLAN_STYLES, gradeOptionsFor, isSpiceShelf, runStyleGates, styleNutrientGates, styleStructureGates } from './planStyles';
import { familyDeps } from '@/state/familyDeps';
import type { Food, MealPlan, PlanStyle } from './types';

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
  it('has the 31 styles of the guide, each with a label and a blurb', () => {
    const styles = Object.keys(PLAN_STYLES);
    expect(styles).toHaveLength(31);
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
    expect(gradeOptionsFor('anti-inflammatory', 2000).rules).toEqual({ omegaMaxRatio: 3, omegaDayMaxRatio: 5, fattyFishPerWeek: 3 });
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
    for (const n of ['Soy sauce, tamari', 'Corn tortilla', 'Brown rice, cooked', 'Quinoa, cooked', 'Gluten-free bread, white', 'Buckwheat groats, roasted'])
      expect(ban(FOODS.find((f) => f.name === n)!), n).toBeUndefined();
    expect(styleStructureGates('gluten-free', standard(fixture), FOOD_INDEX).some((g) => /Whole wheat bread/.test(g.message))).toBe(true);
  });

  it('gluten-free flags Asian pastes and sauces that usually carry wheat', () => {
    const food = (name: string) => ({ id: name, name, category: 'condiment', n: {}, servings: [] }) as unknown as Food;
    for (const n of ['Doubanjiang (chili bean paste)', 'Gochujang', 'Hoisin sauce', 'Oyster sauce', 'Doenjang (Korean soybean paste)'])
      expect(FOOD_BANS.gluten(food(n)), n).toMatch(/usually has wheat/);
    expect(FOOD_BANS.gluten(food('Gochujang, gluten-free'))).toBeUndefined();
    expect(FOOD_BANS.gluten(food('Miso'))).toBeUndefined();
    expect(FOOD_BANS.gluten(food('Oats, rolled'))).toMatch(/oats/);
    expect(FOOD_BANS.gluten(food('Oats, certified gluten-free, rolled'))).toBeUndefined();
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
    expect(gradeOptionsFor('low-gi', 3000).rules.glycemicLoadMax).toBe(70); // per 2000 kcal: gradePlan scales it per day
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

describe('spice shelf', () => {
  it('counts dried spices, blends, salt and pepper apart from the weekly groceries', () => {
    const by = (re: RegExp) => FOODS.find((f) => re.test(f.name))!;
    for (const re of [/^Cardamom, ground/, /^Table salt/, /^Black pepper/, /^Paprika/, /^Cumin seed/, /^Za'atar/, /^Garam masala/]) expect(isSpiceShelf(by(re)), String(re)).toBe(true);
    for (const re of [/^Gochujang/, /^Soy sauce \(shoyu\)/, /^Rice vinegar/, /^Olives/, /^Coffee, ground/, /^Curry leaves/]) expect(isSpiceShelf(by(re)), String(re)).toBe(false);
  });
});

describe('batch C safety: pregnancy, breastfeeding, PCOS and menopause', () => {
  const f = (name: string, category: Food['category'] = 'other') => ({ id: name, name, category, n: {}, servings: [] }) as unknown as Food;

  it('pregnancy bans deli and cured meats, raw sprouts, herbal teas to avoid and alcohol', () => {
    const ban = FOOD_BANS.prenatal;
    expect(ban(f('Salami', 'meat'))).toMatch(/listeria/);
    expect(ban(f('Bologna, beef', 'meat'))).toMatch(/listeria/);
    expect(ban(f('Alfalfa sprouts, raw', 'vegetable'))).toBe('raw sprouts');
    expect(ban(f('Chamomile tea, brewed', 'beverage'))).toMatch(/herbal tea/);
    expect(ban(f('Wine, cooking', 'beverage'))).toBe('alcohol');
    expect(ban(f('Red wine vinegar', 'condiment'))).toBeUndefined();
    expect(ban(f('Papaya, green, raw', 'fruit'))).toBe('unripe papaya');
    expect(ban(f('Papaya, raw', 'fruit'))).toBeUndefined();
    expect(ban(f('Paprika, smoked', 'condiment'))).toBeUndefined();
    expect(ban(f('Salmon, smoked', 'fish'))).toBe('raw or smoked fish');
    expect(ban(f('Chicken breast, skinless, roasted', 'poultry'))).toBeUndefined();
  });

  it('the alcohol ban spares vinegars, ginger ale and alcohol-free drinks, but not mirin', () => {
    const ban = FOOD_BANS.alcohol;
    for (const n of ['Mirin', 'Sake', 'Beer, regular', 'Shaoxing wine', 'Sherry'] ) expect(ban(f(n)), n).toBe('alcohol');
    for (const n of ['Sherry vinegar', 'Rice wine vinegar', 'Ginger ale', 'Beer, non-alcoholic', 'Ginger root, raw']) expect(ban(f(n)), n).toBeUndefined();
  });

  it('postpartum bans alcohol and high-mercury fish but not salmon', () => {
    expect(PLAN_STYLES.postpartum.gates.bans).toEqual(['alcohol', 'mercury']);
    expect(FOOD_BANS.mercury(f('Swordfish, raw', 'fish'))).toBeTruthy();
    expect(FOOD_BANS.mercury(f('Salmon, Atlantic, raw', 'fish'))).toBeUndefined();
  });

  it('estimates caffeine and caps it at 300 mg a day in pregnancy', () => {
    expect(caffeineMgPer100g(f('Coffee, brewed, prepared with tap water'))).toBe(40);
    expect(caffeineMgPer100g(f('Coffee cake'))).toBe(0);
    expect(caffeineMgPer100g(f('Tea, green, brewed'))).toBe(12);
    expect(caffeineMgPer100g(f('Chamomile tea, brewed'))).toBe(0);
    const plan = standard(fixture);
    plan.days[0].meals[0].ingredients.push({ foodId: idOf('Coffee, brewed, prepared with tap water'), grams: 1000 }); // about 400 mg
    expect(codes('prenatal', plan)).toContain('caffeine');
    expect(codes('balanced', plan)).not.toContain('caffeine');
  });

  it('pregnancy keeps food iron at or under 29 mg a day, leaving room for a prenatal vitamin', () => {
    expect(PLAN_STYLES.prenatal.gates.ironMaxMg).toBe(29);
    const plan = standard(fixture);
    const fortified = FOODS.find((x) => /fortified/i.test(x.name) && (x.n.iron ?? 0) > 20)!;
    plan.days[0].meals[0].ingredients.push({ foodId: fortified.id, grams: 150 });
    expect(codes('prenatal', plan)).toContain('iron_high');
    expect(PLAN_STYLES.prenatal.note).toMatch(/don't add a separate iron pill/);
  });

  it('pregnancy and breastfeeding plans never claim a band below 1,800 kcal', () => {
    expect(PLAN_STYLES.prenatal.gates.minKcal).toBe(1800);
    expect(PLAN_STYLES.postpartum.gates.minKcal).toBe(1800);
  });

  it('PCOS and menopause grade an adult woman of the right age only', () => {
    expect(gradeOptionsFor('pcos', 2000).panel).toEqual([{ sex: 'female', age: 30, lifeStage: 'none' }]);
    expect(gradeOptionsFor('menopause', 2000).panel).toEqual([{ sex: 'female', age: 55, lifeStage: 'none' }]);
    expect(gradeOptionsFor('pcos', 2000).rules).toMatchObject({ proteinMinPctKcal: 25, glycemicLoadMax: 70 });
  });

  it('every life-stage and heart style carries a plain note for the plan screen, with no em or en dashes', () => {
    for (const s of ['prenatal', 'postpartum', 'pcos', 'menopause', 'heart'] as PlanStyle[]) {
      expect(PLAN_STYLES[s].note, s).toBeTruthy();
      expect(PLAN_STYLES[s].note, s).not.toMatch(/[\u2013\u2014]/);
    }
    expect(PLAN_STYLES.pcos.note).toMatch(/No single diet is proven best/);
  });
});

describe('batch D styles', () => {
  const f = (name: string, category: Food['category'] = 'other') => ({ id: name, name, category, n: {}, servings: [] }) as unknown as Food;
  it('allergen-free bans peanuts, tree nuts, eggs, dairy, shellfish and sesame, and says to read labels', () => {
    expect(PLAN_STYLES['allergen-free'].gates.bans).toEqual(['nuts', 'egg', 'dairy', 'shellfish', 'sesame']);
    expect(FOOD_BANS.sesame(f('Tahini'))).toBe('sesame');
    expect(FOOD_BANS.shellfish(f('Shrimp, raw', 'fish'))).toBe('shellfish');
    expect(FOOD_BANS.shellfish(f('Salmon, raw', 'fish'))).toBeUndefined();
    expect(PLAN_STYLES['allergen-free'].note).toMatch(/label/);
  });
  it('plant-based muscle is the muscle protein floor plus the vegan ban', () => {
    expect(PLAN_STYLES['muscle-plant'].gates.bans).toEqual(['animal']);
    expect(gradeOptionsFor('muscle-plant', 2400).rules).toMatchObject({ proteinMinPctKcal: 30, fattyFishPerWeek: 0 });
  });
  it('pork means pork, not beef or turkey sausage', () => {
    expect(FOOD_BANS.pork(f('Bacon, cooked', 'meat'))).toBe('pork');
    expect(FOOD_BANS.pork(f('Salami, cooked, beef', 'meat'))).toBeUndefined();
    expect(FOOD_BANS.pork(f('Turkey bacon', 'poultry'))).toBeUndefined();
  });
  it('Ramadan plans carry a care-team note', () => expect(PLAN_STYLES.ramadan.note).toMatch(/care team/));
});

