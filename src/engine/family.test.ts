import { describe, expect, it, vi } from 'vitest';

import fixtureJson from '../../content/families/_fixture-mini.json';
import { FOODS, FOOD_INDEX } from '@/state/catalog';
import { familyDeps } from '@/state/familyDeps';

import { ingredientsTotal } from './calc';
import {
  APP_BANDS,
  applyAdjust,
  compactPlan,
  compileFamily,
  compileSize,
  dietTagsOf,
  householdMeasure,
  lintDashes,
  parseCovers,
  recipesOf,
  validateFamily,
  type FamilyFile,
} from './family';
import { buildFamily, mergeRecipes, verifiedBands } from './familyBuild';
import { LIMITS, countSentences, runLab, writingChecks } from './familyLab';
import { renderReview } from './familyReview';
import { expandPlans } from './libraryPlans';
import { BOARD_KEYS } from './nutrients';
import type { MealPlan } from './types';

vi.setConfig({ testTimeout: 30_000 }); // each lab run sizes 3 sizes at 6 calorie levels, about a second

const fixture = fixtureJson as unknown as FamilyFile;
const clone = (): FamilyFile => structuredClone(fixture);
const lab = (f: FamilyFile) => runLab(f, familyDeps);
/** The Standard size alone (2 calorie levels instead of 6): enough for tests that are not about sizing. */
const labStd = (f: FamilyFile) => {
  const g = structuredClone(f);
  delete g.sizes.light;
  delete g.sizes.big;
  return runLab(g, familyDeps);
};
const codes = (f: FamilyFile) => labStd(f).failures.map((x) => x.code);

describe('family format', () => {
  it('accepts the fixture (a two day week is only a warning)', () => {
    const { family, issues } = validateFamily(fixture, familyDeps.validate);
    expect(family?.id).toBe('fixture-mini');
    expect(issues.map((i) => `${i.level}:${i.path}`)).toEqual(['warning:week']);
  });

  it('parses exactly the 10 app bands', () => {
    expect(APP_BANDS).toHaveLength(10);
    expect(APP_BANDS.map((b) => `${b.min}-${b.max}`)).toEqual(['1200-1400', '1400-1600', '1600-1800', '1800-2000', '2000-2200', '2200-2400', '2400-2800', '2800-3200', '3200-3700', '3700-4200']);
    for (const b of APP_BANDS) expect(parseCovers(`${b.min}-${b.max}`)).toEqual(b);
    expect(parseCovers(' 1800 - 2000 ')).toEqual({ min: 1800, max: 2000 });
    for (const bad of ['1700-1900', '1800-2200', '2000', 'light', '']) expect(parseCovers(bad), bad).toBeUndefined();
  });

  it('reports unknown foods with suggestions, bad bands, duplicate and missing recipes, and a wrong life stage', () => {
    const f = clone() as unknown as Record<string, any>;
    f.recipes[0].ingredients[0].food = 'salmon-atlantic-farmed-cooked';
    f.recipes[1].id = f.recipes[0].id;
    f.sizes.standard.covers = ['1700-1900'];
    f.week[0].meals[0].recipe = 'nope';
    f.week[1].meals[1].slot = 'brunch';
    f.sizes.big.adjust[0].add.recipe = 'also-nope';
    f.style = 'prenatal';
    const { family, issues } = validateFamily(f, familyDeps.validate);
    expect(family).toBeUndefined();
    const text = issues.map((i) => `${i.path}: ${i.message} ${i.suggestion ?? ''}`).join('\n');
    expect(text).toMatch(/recipes\[0\]\.ingredients\[0\]\.food: .*unknown food "salmon-atlantic-farmed-cooked".*Did you mean: salmon/);
    expect(text).toMatch(/Duplicate recipe id/);
    expect(text).toMatch(/"1700-1900" is not one of the 10 app bands.* Use: 1200-1400/);
    expect(text).toMatch(/week\[0\]\.meals\[0\]\.recipe: .*"nope" does not exist/);
    expect(text).toMatch(/slot must be breakfast, lunch, dinner or snack/);
    expect(text).toMatch(/add needs/);
    expect(text).toMatch(/lifeStage: The prenatal style needs "lifeStage": "pregnant"/);
  });

  it('flags a missing standard size, unknown sizes, a missing id and non-JSON input', () => {
    expect(validateFamily([], familyDeps.validate).issues[0].message).toMatch(/JSON object/);
    const f = clone() as unknown as Record<string, any>;
    delete f.sizes.standard;
    f.sizes.huge = { kcal: 5000, covers: ['3700-4200'] };
    f.id = 'Not Kebab';
    const msgs = validateFamily(f, familyDeps.validate).issues.map((i) => i.message).join('\n');
    expect(msgs).toMatch(/standard size is required/);
    expect(msgs).toMatch(/Unknown size "huge"/);
    expect(msgs).toMatch(/kebab-case/);
  });

  it('lints em dashes, en dashes and double hyphens anywhere in the file', () => {
    expect(lintDashes({ a: 'fine - really', b: ['x — y', { c: 'a – b' }], d: 'go -- now' }).map((h) => h.path)).toEqual(['b[0]', 'b[1].c', 'd']);
    expect(lintDashes(fixture)).toEqual([]);
    expect(lintDashes({ n: 3, s: 'a-b' })).toEqual([]);
  });
});

describe('compiling a family', () => {
  const ctx = familyDeps;
  const standard = compileSize(fixture, 'standard', ctx)!;

  it('Standard is the week as written, with the recipe fields on every meal', () => {
    expect(standard.plan.id).toBe('fixture-mini-standard');
    expect(standard.plan.days.map((d) => d.meals.map((m) => m.slot))).toEqual([['breakfast', 'lunch', 'dinner', 'snack'], ['breakfast', 'lunch', 'dinner', 'snack']]);
    for (const d of standard.plan.days)
      for (const m of d.meals) {
        const r = fixture.recipes.find((x) => x.id === m.recipeId)!;
        expect(m.ingredients.map((i) => [i.foodId, i.grams])).toEqual(r.ingredients.map((i) => [i.food, i.g]));
        expect(m).toMatchObject({ name: r.name, about: r.about, steps: r.steps, tags: r.tags, servings: r.servings, prepMinutes: r.prepMin, cookMinutes: r.cookMin });
        expect(m.inspiredBy).toBe(r.inspiredBy);
        expect(m.tip).toBe(r.tip);
      }
    expect(standard.plan.days[1].meals[1]).toMatchObject({ recipeId: 'salmon-potatoes-broccoli', leftover: true });
    expect(standard.plan.days[0].meals[2].leftover).toBeUndefined();
    expect(standard.plan.days[0].meals[0].ingredients[4].swapGroup).toBe('low_gi_grains');
    expect(new Set(standard.plan.days.flatMap((d) => d.meals.map((m) => m.id))).size).toBe(8);
  });

  it('puts the plan-level fields on the plan', () => {
    const p = standard.plan;
    expect(p).toMatchObject({ familyId: 'fixture-mini', size: 'standard', style: 'balanced', cuisine: 'Mediterranean', regions: ['Greece', 'Turkey'], lifeStage: 'none' });
    expect(p.signature).toEqual(['salmon-potatoes-broccoli', 'lentil-kale-soup']);
    expect(p.summary).toMatch(/two day test week/);
    expect(p.howItWorks).toMatch(/double portion/);
    expect(p.covers).toEqual([{ min: 2000, max: 2200 }]);
    expect(p.band).toEqual({ min: 2000, max: 2200 });
    expect(p.carbStyle).toBe('wholegrain'); // whole wheat bread and brown rice
    expect(p.tags).toEqual([]); // chicken, fish, eggs, dairy, wheat and nuts: no diet label
  });

  it('applies adjust steps: add, drop by slot and index, drop by recipe, swap, day "*"', () => {
    const week = fixture.week;
    const added = applyAdjust(week, [{ day: 1, add: { slot: 'snack', recipe: 'hummus-carrot-snack' } }]);
    expect(added.week[0].meals.map((m) => m.recipe)).toEqual(['veggie-egg-scramble', 'lentil-kale-soup', 'salmon-potatoes-broccoli', 'yogurt-walnut-berries', 'hummus-carrot-snack']);
    expect(added.week[1].meals).toHaveLength(4);
    expect(week[0].meals).toHaveLength(4); // the input is not touched

    const dropSecondSnack = applyAdjust(added.week, [{ day: '*', drop: { slot: 'snack', index: 1 } }]);
    expect(dropSecondSnack.week[0].meals.map((m) => m.recipe)).not.toContain('hummus-carrot-snack');
    expect(dropSecondSnack.problems).toHaveLength(0); // day 2 has no second snack but day 1 did

    const dropAllSnacks = applyAdjust(week, [{ day: '*', drop: { slot: 'snack', index: 0 } }]);
    expect(dropAllSnacks.week.every((d) => d.meals.every((m) => m.slot !== 'snack'))).toBe(true);

    const byRecipe = applyAdjust(week, [{ day: 2, drop: { recipe: 'chicken-chickpea-stew' } }]);
    expect(byRecipe.week[1].meals.map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'snack']);

    const swapped = applyAdjust(week, [{ day: '*', swap: { from: 'veggie-egg-scramble', to: 'yogurt-walnut-berries' } }]);
    expect(swapped.week.map((d) => d.meals[0])).toEqual([{ slot: 'breakfast', recipe: 'yogurt-walnut-berries' }, { slot: 'breakfast', recipe: 'yogurt-walnut-berries' }]);

    const nothing = applyAdjust(week, [{ day: 1, drop: { slot: 'snack', index: 3 } }, { day: 2, swap: { from: 'lentil-kale-soup', to: 'hummus-carrot-snack' } }]);
    expect(nothing.problems).toHaveLength(2);
    expect(nothing.week).toEqual(week);
  });

  it('Light drops the written snack and sizes each day to its kcal with vegetables and fruit fixed', () => {
    const light = compileSize(fixture, 'light', ctx)!;
    expect(light.plan.id).toBe('fixture-mini-light');
    expect(light.problems).toEqual([]);
    // fixture adjust: day 2 hummus snack becomes the yogurt snack
    expect(light.plan.days[1].meals.at(-1)!.recipeId).toBe('yogurt-walnut-berries');
    for (const d of light.plan.days) {
      const kcal = d.meals.reduce((n, m) => n + (ingredientsTotal(m.ingredients, FOOD_INDEX).kcal ?? 0), 0);
      // sizing down never trims a vegetable or a tile that was complete, so a day can stop a little above the target
      expect(kcal).toBeLessThan(1500 * 1.08);
      expect(kcal).toBeGreaterThan(1500 * 0.95);
      d.meals.forEach((m) =>
        m.ingredients.forEach((i, k) => {
          const base = fixture.recipes.find((r) => r.id === m.recipeId)!.ingredients[k];
          expect(i.foodId).toBe(base.food);
          const cat = FOOD_INDEX.get(i.foodId)!.category;
          if (cat === 'vegetable' || cat === 'fruit') expect(i.grams).toBe(base.g);
        }),
      );
    }
    expect(light.plan.days[0].meals[0].ingredients.find((i) => i.foodId.startsWith('whole-wheat-bread'))!.grams).toBeLessThan(60);
  });

  it('Big adds the snack to day 1 only and sizes up', () => {
    const big = compileSize(fixture, 'big', ctx)!;
    expect(big.plan.days[0].meals).toHaveLength(5);
    expect(big.plan.days[1].meals).toHaveLength(4);
    const kcal = big.plan.days.map((d) => d.meals.reduce((n, m) => n + (ingredientsTotal(m.ingredients, FOOD_INDEX).kcal ?? 0), 0));
    for (const k of kcal) expect(Math.abs(k - 2600) / 2600).toBeLessThan(0.05);
    expect(compileSize(fixture, 'xl', ctx)).toBeUndefined();
    expect(compileFamily(fixture, ctx).map((c) => c.size)).toEqual(['light', 'standard', 'big']);
  });

  it('diet tags come from the foods', () => {
    const plan = (...names: string[]) => ({ days: [{ day: 1, meals: [{ id: 'm', slot: 'dinner' as const, name: 'x', ingredients: names.map((n) => ({ foodId: FOODS.find((f) => f.name === n)!.id, grams: 100 })) }] }] });
    const all = ['vegan', 'vegetarian', 'pescatarian', 'gluten-free', 'dairy-free', 'nut-free'];
    expect(dietTagsOf(plan('Lentils, boiled', 'Kale, raw', 'Olive oil'), FOOD_INDEX)).toEqual(all);
    expect(dietTagsOf(plan('Lentils, boiled', 'Greek yogurt, plain, low-fat'), FOOD_INDEX)).toEqual(['vegetarian', 'pescatarian', 'gluten-free', 'nut-free']);
    expect(dietTagsOf(plan('Salmon, atlantic, farmed, baked or broiled', 'Broccoli, boiled'), FOOD_INDEX)).toEqual(['pescatarian', 'gluten-free', 'dairy-free', 'nut-free']);
    expect(dietTagsOf(plan('Chicken breast, skinless, roasted'), FOOD_INDEX)).toEqual(['gluten-free', 'dairy-free', 'nut-free']);
    expect(dietTagsOf(plan('Whole wheat bread', 'Almonds, dried', 'Egg, whole, boiled'), FOOD_INDEX)).toEqual(['vegetarian', 'pescatarian', 'dairy-free']);
  });
});

describe('plan lab', () => {
  it('passes the fixture, edge by edge', () => {
    const r = lab(fixture);
    expect(r.failures).toEqual([]);
    expect(r.exitCode).toBe(0);
    expect(r.sizes.map((s) => s.size)).toEqual(['light', 'standard', 'big']);
    expect(r.sizes.map((s) => s.edges.map((e) => e.kcal))).toEqual([[1400, 1600], [2000, 2200], [2400, 2800]]);
    expect(r.sizes[0].edges.map((e) => e.panel)).toEqual(['female', 'male + female']);
    expect(r.sizes[1].edges[0].labels).toEqual(['2000-2200 min']);
    for (const e of r.sizes.flatMap((s) => s.edges)) {
      expect(e.days).toHaveLength(2);
      for (const d of e.days) {
        expect(d.proteinPct).toBeGreaterThanOrEqual(20);
        expect(d.satPct).toBeLessThan(10);
        expect(d.omega).toBeLessThanOrEqual(4);
        expect(d.gl).toBeLessThanOrEqual(100);
        expect(d.under80.every((u) => u.hard)).toBe(true);
      }
    }
  });

  it('exits 1 for a malformed file and grades nothing', () => {
    const f = clone();
    f.recipes[0].ingredients[0].food = 'not-a-food';
    const r = lab(f);
    expect(r.exitCode).toBe(1);
    expect(r.sizes).toEqual([]);
    expect(r.formatIssues[0].message).toMatch(/unknown food "not-a-food"/);
  });

  it('exits 2 for the em dash lint, wherever the dash is', () => {
    for (const edit of [
      (f: FamilyFile) => (f.recipes[0].tip = 'Swap the spinach — any green works.'),
      (f: FamilyFile) => (f.summary = `${f.summary} Two days – no more.`),
      (f: FamilyFile) => (f.recipes[2].steps![0] = 'Heat the oven -- hot.'),
      (f: FamilyFile) => (f.recipes[1].name = 'Lentil — kale soup'),
    ]) {
      const f = clone();
      edit(f);
      const r = labStd(f);
      expect(r.exitCode).toBe(2);
      expect(r.failures.filter((x) => x.code === 'dash')).toHaveLength(1);
      expect(r.failures.every((x) => x.code === 'dash' || x.kind === 'gate' || x.kind === 'cooking')).toBe(true);
    }
  });

  it('checks oil, salt and dried spices per serving, grouped by recipe and day', () => {
    const f = clone();
    const stew = f.recipes.find((r) => r.id === 'chicken-chickpea-stew')!;
    stew.ingredients.find((i) => i.food.startsWith('olive-oil'))!.g = 24; // sizing up to Big makes it more
    stew.ingredients.find((i) => i.food.startsWith('paprika'))!.g = 9;
    f.recipes[0].ingredients.find((i) => i.food.startsWith('table-salt'))!.g = 3;
    const found = lab(f).failures.filter((x) => x.kind === 'cooking' && x.size === 'big' && x.kcal === 2800);
    expect(found.map((x) => `${x.code}:${x.recipe}`).sort()).toEqual(['oil:chicken-chickpea-stew', 'salt:veggie-egg-scramble', 'spice:chicken-chickpea-stew']);
    expect(found.find((x) => x.code === 'salt')!.days).toEqual([1, 2]);
    expect(found.find((x) => x.code === 'oil')!.message).toMatch(/^Day 2: Chicken and chickpea stew with spinach: \d\d g of oil per serving \(max 27 g, 2 tbsp\)/);
    expect(found.find((x) => x.code === 'salt')!.message).toMatch(/^Days 1, 2: Spinach and mushroom egg scramble on toast: \d\.\d g of salt per serving \(max 2\.5 g\)/);
    expect(LIMITS).toMatchObject({ oilG: 27, saltG: 2.5, spiceG: 8, proteinSourceG: 15 });
  });

  it('wants a real protein source of 15 g at lunch and dinner', () => {
    const f = clone();
    const soup = f.recipes.find((r) => r.id === 'lentil-kale-soup')!;
    soup.ingredients.find((i) => i.food.startsWith('lentils'))!.g = 60;
    soup.ingredients.find((i) => i.food.startsWith('greek-yogurt'))!.g = 20;
    const r = labStd(f);
    expect(r.failures.filter((x) => x.code === 'protein_source').every((x) => x.recipe === 'lentil-kale-soup')).toBe(true);
    expect(r.failures.some((x) => x.code === 'protein_source')).toBe(true);
  });

  it('holds recipes to 4 to 14 ingredients and 3 to 9 steps, with snacks exempt', () => {
    const f = clone();
    f.recipes[0].ingredients = f.recipes[0].ingredients.slice(0, 3); // a breakfast with 3
    f.recipes[1].steps = f.recipes[1].steps!.slice(0, 2); // a lunch with 2 steps
    f.recipes[2].steps = [...f.recipes[2].steps!, ...f.recipes[2].steps!]; // 10 steps
    f.recipes[3].steps = ['Eat.']; // a snack with a single step is fine
    const found = labStd(f).failures.filter((x) => x.kind === 'cooking' && !x.size).map((x) => `${x.code}:${x.recipe}`);
    expect(found).toEqual(['ingredients:veggie-egg-scramble', 'steps:lentil-kale-soup', 'steps:salmon-potatoes-broccoli']);
    const g = clone();
    g.recipes[2].ingredients.push(...Array.from({ length: 4 }, () => ({ food: g.recipes[2].ingredients[0].food, g: 5 })));
    expect(lab(g).failures.some((x) => x.code === 'ingredients' && x.recipe === 'salmon-potatoes-broccoli')).toBe(true);
  });

  it('checks the writing: about with 2 sentences, steps, summary and howItWorks', () => {
    const f = clone();
    f.recipes[0].about = 'Just one sentence here.';
    delete f.recipes[1].about;
    f.recipes[2].steps = [];
    delete f.summary;
    delete f.howItWorks;
    expect(codes(f).sort()).toEqual(['about', 'about', 'howItWorks', 'steps', 'summary']);
    expect(countSentences('One. Two! Three?')).toBe(3);
    expect(countSentences('Uses 1.5 cups of lentils')).toBe(1);
    // a one-ingredient snack may have a one-line about and no steps
    const g = clone();
    Object.assign(g.recipes[3], { about: 'A bowl of yogurt.', steps: [], ingredients: [g.recipes[3].ingredients[0]] });
    expect(writingChecks(g, g)).toEqual([]);
    Object.assign(g.recipes[0], { about: 'A bowl of yogurt.', steps: [] });
    expect(writingChecks(g, g).map((x) => x.code)).toEqual(['steps', 'about']); // a breakfast is held to the full rules
  });

  it('allows no recipe more than twice a week except breakfasts and leftovers', () => {
    const f = clone();
    f.week.push({ day: 3, meals: [{ slot: 'dinner', recipe: 'chicken-chickpea-stew' }] }, { day: 4, meals: [{ slot: 'dinner', recipe: 'chicken-chickpea-stew' }, { slot: 'breakfast', recipe: 'veggie-egg-scramble' }] });
    const r = labStd(f);
    expect(r.failures.filter((x) => x.code === 'repeats').map((x) => x.recipe)).toEqual(['chicken-chickpea-stew']);
    expect(r.failures.some((x) => x.code === 'repeats' && x.recipe === 'veggie-egg-scramble')).toBe(false);
  });

  it('counts distinct groceries and applies the budget style limit of 35', () => {
    const f = clone();
    f.style = 'budget';
    expect(codes(f)).toEqual([]); // 35 groceries in Standard
    f.recipes[3].ingredients.push({ food: FOODS.find((x) => x.name === 'Banana, raw')!.id, g: 100 });
    const r = labStd(f);
    expect(r.failures.filter((x) => x.code === 'groceries')).toMatchObject([{ size: 'standard', message: '36 distinct groceries in the week (max 35).' }]);
    const g = clone(); // the default limit is 45
    for (const name of ['Banana, raw', 'Apple, raw, with skin', 'Kiwi fruit, raw', 'Raspberry, raw', 'Strawberry, raw', 'Cabbage, raw', 'Celery, raw', 'Cucumber, raw', 'Eggplant, raw', 'Zucchini, raw', 'Leek, raw'])
      g.recipes[3].ingredients.push({ food: FOODS.find((x) => x.name === name)!.id, g: 5 });
    expect(codes(g)).toContain('groceries');
  });

  it('reports adjust steps that change nothing', () => {
    const f = clone();
    f.sizes.light!.adjust = [{ day: 1, drop: { slot: 'snack', index: 4 } }];
    expect(lab(f).failures.map((x) => x.code)).toContain('adjust');
  });
});

describe('build: from file to shipped data', () => {
  it('round trips: compile, compact, expand gives the same ingredients, grams and recipe fields', () => {
    const compiled = compileFamily(fixture, familyDeps);
    const recipes = recipesOf(fixture);
    const compact = compiled.map((c) => compactPlan(c.plan, FOOD_INDEX));
    const expanded = expandPlans(JSON.parse(JSON.stringify(compact)), JSON.parse(JSON.stringify(recipes)));
    expect(expanded).toHaveLength(3);
    expanded.forEach((plan: MealPlan, i) => {
      const original = compiled[i].plan;
      expect(plan.id).toBe(original.id);
      expect(plan.days.map((d) => d.meals.map((m) => m.ingredients.map((x) => [x.foodId, x.grams, x.swapGroup])))).toEqual(
        original.days.map((d) => d.meals.map((m) => m.ingredients.map((x) => [x.foodId, x.grams, x.swapGroup]))),
      );
      plan.days.forEach((d, di) =>
        d.meals.forEach((m, mi) => {
          const o = original.days[di].meals[mi];
          for (const k of ['name', 'slot', 'recipeId', 'about', 'steps', 'cookMinutes', 'prepMinutes', 'tags', 'tip', 'inspiredBy', 'servings', 'leftover'] as const) expect(m[k], k).toEqual(o[k]);
        }),
      );
      expect(plan).toMatchObject({ familyId: 'fixture-mini', size: original.size, style: 'balanced', carbStyle: original.carbStyle, tags: original.tags, covers: original.covers, summary: original.summary, howItWorks: original.howItWorks, signature: original.signature, regions: original.regions });
    });
    // empty in, empty out
    expect(expandPlans([], recipes)).toEqual([]);
    expect(() => expandPlans(compact, [])).toThrow(/not in recipes\.json/);
  });

  it('stores meals compactly, with a heroes line from the board nutrients', () => {
    const [plan] = compileFamily(fixture, familyDeps).map((c) => compactPlan(c.plan, FOOD_INDEX));
    const meal = plan.days[1].meals[1];
    expect(Object.keys(meal).sort()).toEqual(['g', 'heroes', 'leftover', 'recipe', 'slot']);
    expect(meal.g).toHaveLength(fixture.recipes.find((r) => r.id === meal.recipe)!.ingredients.length);
    expect(plan.covers).toEqual([[1400, 1600]]);
    for (const m of plan.days.flatMap((d) => d.meals)) {
      expect(m.heroes!.length).toBeGreaterThanOrEqual(1);
      expect(m.heroes!.length).toBeLessThanOrEqual(2);
      for (const h of m.heroes!) expect(BOARD_KEYS).toContain(h.key);
      expect(m.heroes![0].pct).toBeGreaterThanOrEqual(m.heroes![m.heroes!.length - 1].pct);
    }
    const lentil = plan.days[0].meals[1].heroes!.map((h) => h.key);
    expect(lentil).toContain('vitK'); // kale
    expect(JSON.stringify(plan).length).toBeLessThan(4000);
  });

  it('writes a passing family, refuses a failing one, and with allowFail keeps only the verified bands', () => {
    const ok = buildFamily(fixture, familyDeps);
    expect(ok).toMatchObject({ written: true, id: 'fixture-mini', notes: [] });
    expect(ok.plans.map((p) => p.size)).toEqual(['light', 'standard', 'big']);
    expect(ok.recipes).toHaveLength(6);
    expect(ok.recipes.find((r) => r.id === 'veggie-egg-scramble')).toMatchObject({ slot: 'breakfast', family: 'fixture-mini' });
    expect(ok.recipes.find((r) => r.id === 'hummus-carrot-snack')!.slot).toBe('snack');

    const bad = clone();
    bad.recipes[0].tip = 'a — b';
    const refused = buildFamily(bad, familyDeps);
    expect(refused).toMatchObject({ written: false, plans: [], recipes: [] });
    expect(refused.notes[0]).toMatch(/Refused: 1 failure/);

    const broken = clone();
    broken.recipes[0].ingredients[0].food = 'nope';
    expect(buildFamily(broken, familyDeps, { allowFail: true })).toMatchObject({ written: false });

    // a Light plan claiming a band far above its size cannot pass there; the band that does pass stays in covers
    const partial = clone();
    partial.sizes.light!.covers = ['1400-1600', '1600-1800', '3200-3700'];
    const built = buildFamily(partial, familyDeps, { allowFail: true });
    expect(built.written).toBe(true);
    const claimed = [{ min: 1400, max: 1600 }, { min: 1600, max: 1800 }, { min: 3200, max: 3700 }];
    const kept = verifiedBands(built.lab, 'light', claimed);
    expect(kept).toContainEqual({ min: 1400, max: 1600 });
    expect(kept).not.toContainEqual({ min: 3200, max: 3700 });
    expect(built.plans.find((p) => p.size === 'light')!.covers).toEqual(kept.map((b) => [b.min, b.max]));
    expect(built.notes.join()).toMatch(/light: bands not verified, left out of covers: 3200-3700/);
  });

  it('merges recipes shared between families and refuses two different recipes with one id', () => {
    const a = recipesOf(fixture);
    const sameAgain = recipesOf({ ...fixture, id: 'other-family' });
    expect(mergeRecipes([a, sameAgain])).toHaveLength(6);
    const changed = recipesOf({ ...fixture, id: 'third' }).map((r) => (r.id === 'hummus-carrot-snack' ? { ...r, name: 'Different hummus' } : r));
    expect(() => mergeRecipes([a, changed])).toThrow(/hummus-carrot-snack.*different content/);
  });
});

describe('plan review', () => {
  it('renders the header, the week grid, each recipe once and the numbers', () => {
    const md = renderReview(fixture, 'standard', familyDeps);
    expect(md).toMatch(/^# Mini Test Week/);
    expect(md).toContain('**How it works.**');
    expect(md).toContain('**Signature dishes:** Roasted salmon with lemon potatoes and broccoli; Lemony lentil and kale soup');
    expect(md).toContain('| Day | Breakfast | Lunch | Dinner | Snack |');
    expect(md).toContain('Roasted salmon with lemon potatoes and broccoli (leftover)');
    expect(md.match(/^### /gm)).toHaveLength(6);
    expect(md).toMatch(/- 130 g Salmon, atlantic, farmed, baked or broiled \(about /);
    expect(md).toContain('1. Warm the olive oil');
    expect(md).toContain('prep 10 min · cook 35 min · makes 2 · mild, makes-leftovers');
    expect(md).toContain('Tip: Trout works the same way.');
    expect(md).toMatch(/\| 1 \| \d{4} \| \d+ \| [\d.]+ \| [\d.]+:1 \| \d+ \| \d+ \| .+ \|/);
    expect(md).not.toMatch(/[{}"]/); // no raw JSON
    expect(() => renderReview(fixture, 'xl', familyDeps)).toThrow(/no "xl" size/);
  });

  it('turns a measure into a household unit when the food lists servings', () => {
    const egg = FOODS.find((f) => f.name === 'Egg, whole, raw')!;
    expect(householdMeasure(egg, 100)).toMatch(/^about 2 large/);
    expect(householdMeasure({ servings: [] }, 100)).toBeUndefined();
    expect(householdMeasure({ servings: [{ label: '1 cup', g: 100 }] }, 150)).toBe('about 1½ cups');
    expect(householdMeasure({ servings: [{ label: '1 tbsp', g: 15 }] }, 30)).toBe('about 2 tbsp');
    expect(householdMeasure({ servings: [{ label: '1 cup', g: 240 }] }, 5)).toBeUndefined();
  });
});
