import { describe, expect, it } from 'vitest';

import fixtureJson from '../../content/families/_fixture-mini.json';
import { BUNDLED_PLANS, FOOD_INDEX } from '@/state/catalog';
import { familyDeps } from '@/state/familyDeps';
import { buildLibrary, libraryKey } from '@/state/library';

import { carbStyleOfPlan } from './carbStyle';
import { SIZE_LABEL, bandKeyOf, displayTags, carbVisible, coversOf, familyBands, familyCarbStyle, familyVisible, groupFamilies, mealCarbStyle, pickSize, planCarbStyle, planFamilyName, recipeMinutes, rowMinutes, signatureNames, sizingTargetFor } from './families';
import { compactPlan, compileFamily, recipesOf, type FamilyFile } from './family';
import { expandPlans } from './libraryPlans';
import type { MealPlan } from './types';

const fixture = fixtureJson as unknown as FamilyFile;

/** What the app ships for the fixture: compiled, stored compactly, expanded again by the catalog. */
const compact = compileFamily(fixture, familyDeps).map((c) => compactPlan(c.plan, FOOD_INDEX));
const recipes = recipesOf(fixture);
const library: MealPlan[] = expandPlans(JSON.parse(JSON.stringify(compact)), JSON.parse(JSON.stringify(recipes)));

const byId = (id: string) => library.find((p) => p.id === id)!;

/** A second family made from the first, so grouping and counting have something to tell apart. */
function otherFamily(): MealPlan[] {
  return library.map((p) => ({ ...structuredClone(p), id: p.id.replace('fixture-mini', 'other'), familyId: 'other', name: p.name.replace('Mini Test Week', 'Other Week'), style: 'vegan', carbStyle: 'whole' }));
}

describe('expandPlans output', () => {
  it('has three sizes of one family, with the recipe fields on every meal', () => {
    expect(library.map((p) => p.size)).toEqual(['light', 'standard', 'big']);
    expect(new Set(library.map((p) => p.familyId))).toEqual(new Set(['fixture-mini']));
    for (const p of library) for (const d of p.days) for (const m of d.meals) expect(m.recipeId).toBeTruthy();
  });

  it('carries each meal heroes line through', () => {
    const meals = library.flatMap((p) => p.days.flatMap((d) => d.meals));
    expect(meals.every((m) => m.heroes && m.heroes.length >= 1 && m.heroes.length <= 2)).toBe(true);
  });
});

describe('groupFamilies', () => {
  it('groups the sizes of a family, smallest first, whatever order they come in', () => {
    const families = groupFamilies([byId('fixture-mini-big'), byId('fixture-mini-light'), byId('fixture-mini-standard')]);
    expect(families).toHaveLength(1);
    const [f] = families;
    expect(f.id).toBe('fixture-mini');
    expect(f.sizes.map((p) => p.size)).toEqual(['light', 'standard', 'big']);
    expect(f.name).toBe('Mini Test Week');
    expect(f.isLibrary).toBe(true);
    expect(f.style).toBe('balanced');
    expect(f.cuisine).toBe('Mediterranean');
    expect(f.regions).toEqual(['Greece', 'Turkey']);
    expect(f.signature).toEqual(['salmon-potatoes-broccoli', 'lentil-kale-soup']);
    expect(f.summary).toMatch(/two day test week/);
    expect(f.howItWorks).toMatch(/double portion/);
  });

  it('keeps families apart and in the order they first appear', () => {
    const families = groupFamilies([...library, ...otherFamily()]);
    expect(families.map((f) => f.id)).toEqual(['fixture-mini', 'other']);
    expect(families.map((f) => f.sizes.length)).toEqual([3, 3]);
    expect(families[1].name).toBe('Other Week');
  });

  it('makes a family of one from a plan with no familyId, so the old samples keep working', () => {
    const families = groupFamilies(BUNDLED_PLANS);
    expect(families).toHaveLength(BUNDLED_PLANS.length);
    families.forEach((f, i) => {
      const p = BUNDLED_PLANS[i];
      expect(f).toMatchObject({ id: p.id, name: p.name, cuisine: p.cuisine, isLibrary: false });
      expect(f.sizes).toEqual([p]);
      expect(f.regions).toEqual([]);
      expect(f.signature).toEqual([]);
    });
  });

  it('mixes samples and library plans', () => {
    const families = groupFamilies([...BUNDLED_PLANS, ...library]);
    expect(families).toHaveLength(BUNDLED_PLANS.length + 1);
    expect(families.filter((f) => f.isLibrary)).toHaveLength(1);
  });

  it('gives nothing for nothing', () => {
    expect(groupFamilies([])).toEqual([]);
  });

  it('strips the size from a library plan name and nothing else', () => {
    expect(planFamilyName(byId('fixture-mini-big'))).toBe('Mini Test Week');
    expect(planFamilyName({ name: 'Plant Power Bowls (Big)', familyId: undefined, size: undefined })).toBe('Plant Power Bowls (Big)');
    expect(SIZE_LABEL.xl).toBe('XL');
  });

  it('lists every band the sizes cover', () => {
    const [f] = groupFamilies(library);
    expect(familyBands(f).map(bandKeyOf)).toEqual(['1400-1600', '2000-2200', '2400-2800']);
    expect(coversOf(BUNDLED_PLANS[0])).toEqual([BUNDLED_PLANS[0].band]);
  });
});

describe('pickSize', () => {
  const [family] = groupFamilies(library);

  it('picks the size whose covers include the band of the target', () => {
    expect(pickSize(family, 1500)).toMatchObject({ covered: true, gap: 0 });
    expect(pickSize(family, 1500).plan.size).toBe('light');
    expect(pickSize(family, 2100).plan.size).toBe('standard');
    expect(pickSize(family, 2000).plan.size).toBe('standard'); // the band edge belongs to the band above
    expect(pickSize(family, 2599).plan.size).toBe('big');
    expect(pickSize(family, 2750)).toMatchObject({ covered: true });
    expect(pickSize(family, 2750).plan.size).toBe('big');
  });

  it('takes the nearest size and says it does not cover the person', () => {
    const between = pickSize(family, 1850); // band 1800-2000: no size covers it
    expect(between.covered).toBe(false);
    expect(between.plan.size).toBe('standard');
    expect(between.gap).toBe(200);
    const low = pickSize(family, 1250);
    expect(low).toMatchObject({ covered: false });
    expect(low.plan.size).toBe('light');
    const high = pickSize(family, 3500);
    expect(high.covered).toBe(false);
    expect(high.plan.size).toBe('big');
  });

  it('works for a plan with no sizes: it covers its own band', () => {
    const [sample] = groupFamilies([BUNDLED_PLANS[0]]);
    const mid = Math.round((BUNDLED_PLANS[0].band.min + BUNDLED_PLANS[0].band.max) / 2);
    expect(pickSize(sample, mid)).toMatchObject({ covered: true, gap: 0, plan: BUNDLED_PLANS[0] });
    const far = pickSize(sample, 3500);
    expect(far.covered).toBe(false);
    expect(far.plan).toBe(BUNDLED_PLANS[0]);
  });

  it('prefers the size centred nearest the target when two cover the band', () => {
    const wide = groupFamilies([
      { ...byId('fixture-mini-light'), covers: [{ min: 1400, max: 2200 }] },
      { ...byId('fixture-mini-standard'), covers: [{ min: 2000, max: 2200 }] },
    ])[0];
    expect(pickSize(wide, 2100).plan.size).toBe('standard');
    expect(pickSize(wide, 1500).plan.size).toBe('light');
  });
});

describe('carb style filter', () => {
  it('shows a plan at or below the person\'s choice (whole < wholegrain < any)', () => {
    const std = byId('fixture-mini-standard');
    expect(std.carbStyle).toBe('wholegrain');
    expect(carbVisible(std, 'whole', FOOD_INDEX)).toBe(false);
    expect(carbVisible(std, 'wholegrain', FOOD_INDEX)).toBe(true);
    expect(carbVisible(std, 'any', FOOD_INDEX)).toBe(true);
    const whole: MealPlan = { ...std, carbStyle: 'whole' };
    for (const wanted of ['whole', 'wholegrain', 'any'] as const) expect(carbVisible(whole, wanted, FOOD_INDEX)).toBe(true);
    const any: MealPlan = { ...std, carbStyle: 'any' };
    expect(carbVisible(any, 'whole', FOOD_INDEX)).toBe(false);
    expect(carbVisible(any, 'wholegrain', FOOD_INDEX)).toBe(false);
    expect(carbVisible(any, 'any', FOOD_INDEX)).toBe(true);
  });

  it('computes the style of a plan that has none, from its ingredients', () => {
    for (const p of library) {
      const bare: MealPlan = { ...p, carbStyle: undefined };
      expect(planCarbStyle(bare, FOOD_INDEX)).toBe(carbStyleOfPlan(p, FOOD_INDEX));
      expect(planCarbStyle(bare, FOOD_INDEX)).toBe(p.carbStyle); // the build stored the same answer
    }
    for (const p of BUNDLED_PLANS) {
      expect(p.carbStyle).toBeUndefined();
      expect(planCarbStyle(p, FOOD_INDEX)).toBe(carbStyleOfPlan(p, FOOD_INDEX));
    }
    const bare = { ...byId('fixture-mini-light'), carbStyle: undefined } as MealPlan;
    expect(carbVisible(bare, 'whole', FOOD_INDEX)).toBe(false);
    expect(carbVisible(bare, 'wholegrain', FOOD_INDEX)).toBe(true);
  });

  it('shows a family by its most permissive size', () => {
    const sizes = library.map((p) => (p.size === 'big' ? { ...p, carbStyle: 'any' as const } : p));
    const [f] = groupFamilies(sizes);
    expect(familyCarbStyle(f, FOOD_INDEX)).toBe('any');
    expect(familyVisible(f, 'wholegrain', FOOD_INDEX)).toBe(false);
    expect(familyVisible(f, 'any', FOOD_INDEX)).toBe(true);
  });

  it('hides library families the choice rules out, but never the samples or a person\'s own plans', () => {
    const families = groupFamilies([...BUNDLED_PLANS, ...library, ...otherFamily()]);
    const shownAt = (wanted: 'whole' | 'wholegrain' | 'any') => families.filter((f) => familyVisible(f, wanted, FOOD_INDEX)).map((f) => f.id);
    const samples = BUNDLED_PLANS.map((p) => p.id);
    expect(shownAt('whole')).toEqual([...samples, 'other']); // fixture-mini needs whole grains
    expect(shownAt('wholegrain')).toEqual([...samples, 'fixture-mini', 'other']);
    expect(shownAt('any')).toEqual(shownAt('wholegrain'));
  });

  it('works out the carb style of one meal from its own ingredients', () => {
    const meals = library.flatMap((p) => p.days.flatMap((d) => d.meals));
    const styles = new Set(meals.map((m) => mealCarbStyle(m, FOOD_INDEX)));
    expect(styles.has('wholegrain')).toBe(true); // the scramble on whole wheat toast
    expect(styles.has('whole')).toBe(true); // the lentil soup does not need any bread
    const toast = meals.find((m) => m.recipeId === 'veggie-egg-scramble')!;
    expect(mealCarbStyle(toast, FOOD_INDEX)).toBe('wholegrain');
    const soup = meals.find((m) => m.recipeId === 'lentil-kale-soup')!;
    expect(mealCarbStyle(soup, FOOD_INDEX)).toBe('whole');
  });
});

describe('buildLibrary with library recipes', () => {
  const total = (ps: MealPlan[]) => ps.reduce((n, p) => n + p.days.reduce((m, d) => m + d.meals.length, 0), 0);
  const recipeIds = new Set(library.flatMap((p) => p.days.flatMap((d) => d.meals.map((m) => m.recipeId))));

  it('lists a recipe once, however many sizes and days use it', () => {
    const lib = buildLibrary(library);
    expect(total(library)).toBeGreaterThan(lib.length);
    expect(lib).toHaveLength(recipeIds.size);
    expect(new Set(lib.map((m) => m.meal.recipeId)).size).toBe(lib.length);
    // sizes of one family are one plan, not three
    for (const m of lib) expect(m.planCount, m.meal.name).toBe(1);
  });

  it('uses the Standard size for the amounts, even when it comes last', () => {
    const lib = buildLibrary([byId('fixture-mini-big'), byId('fixture-mini-light'), byId('fixture-mini-standard')]);
    for (const m of lib) {
      expect(m.size).toBe('standard');
      expect(m.planId).toBe('fixture-mini-standard');
      expect(m.planName).toBe('Mini Test Week');
    }
  });

  it('counts a recipe in two families as in 2 plans', () => {
    const lib = buildLibrary([...library, ...otherFamily()]);
    expect(lib).toHaveLength(recipeIds.size);
    for (const m of lib) {
      expect(m.planCount).toBe(2);
      expect(m.alsoIn).toEqual(['Other Week']);
    }
  });

  it('shows the cooked copy of a recipe that is also eaten as leftovers', () => {
    const lib = buildLibrary(library);
    const leftovers = library[1].days.flatMap((d) => d.meals).filter((m) => m.leftover);
    expect(leftovers.length).toBeGreaterThan(0);
    for (const l of leftovers) {
      const entry = lib.find((m) => m.meal.recipeId === l.recipeId)!;
      expect(entry.meal.leftover, l.name).toBeFalsy();
    }
  });

  it('keeps the old rule for meals without a recipe id: same name and amounts are one meal', () => {
    const plain = BUNDLED_PLANS[0];
    const lib = buildLibrary([plain, { ...plain, id: 'copy', name: 'Copy plan' }]);
    expect(lib).toHaveLength(buildLibrary([plain]).length);
    expect(lib.every((m) => m.planCount === 2 && m.alsoIn.includes('Copy plan'))).toBe(true);
    expect(lib.every((m) => !m.fromLibrary)).toBe(true);
  });

  it('keys library entries by plan and meal, and marks them as library meals with a carb style', () => {
    const lib = buildLibrary(library);
    for (const m of lib) {
      expect(m.key).toBe(libraryKey(m.planId, m.meal.id));
      expect(m.fromLibrary).toBe(true);
      expect(['whole', 'wholegrain', 'any']).toContain(m.carbStyle);
      expect(m.style).toBe('balanced');
      expect(m.totals.kcal).toBeGreaterThan(0);
    }
  });
});

describe('plan card helpers', () => {
  it('finds the names of the signature dishes in the plan', () => {
    const std = byId('fixture-mini-standard');
    const nameOf = (id: string) => recipes.find((r) => r.id === id)!.name;
    expect(signatureNames(std, 3)).toEqual(['salmon-potatoes-broccoli', 'lentil-kale-soup'].map(nameOf));
    expect(signatureNames(std, 1)).toEqual([nameOf('salmon-potatoes-broccoli')]);
    expect(signatureNames(BUNDLED_PLANS[0], 3)).toEqual([]);
  });

  it('adds prep and cook time, and gives a leftover meal none', () => {
    expect(recipeMinutes({ prepMinutes: 10, cookMinutes: 30 })).toBe(40);
    expect(recipeMinutes({ prepMinutes: 15 })).toBe(15);
    expect(recipeMinutes({ cookMinutes: 20 })).toBe(20);
    expect(recipeMinutes({})).toBeUndefined();
    expect(rowMinutes({ prepMinutes: 10, cookMinutes: 30 })).toBe(40);
    expect(rowMinutes({ prepMinutes: 10, cookMinutes: 30, leftover: true })).toBeUndefined();
  });
});

describe('displayTags', () => {
  it('drops tags the style or a stronger tag already says', () => {
    expect(displayTags(['vegan', 'vegetarian', 'pescatarian', 'dairy-free'], 'vegan')).toEqual([]);
    expect(displayTags(['vegetarian', 'pescatarian', 'nut-free'])).toEqual(['vegetarian', 'nut-free']);
    expect(displayTags(['vegan', 'vegetarian', 'dairy-free', 'egg-free'], 'vegan')).toEqual([]);
    expect(displayTags(['gluten-free', 'nut-free', 'omega-balanced'], 'gluten-free')).toEqual(['nut-free', 'omega-balanced']);
    expect(displayTags(['gluten-free', 'omega-balanced'], 'keto')).toEqual(['gluten-free', 'omega-balanced']);
  });
});

describe('sizingTargetFor', () => {
  const plan = { band: { min: 1800, max: 2400 }, covers: [{ min: 1800, max: 2000 }, { min: 2000, max: 2400 }] };
  it('keeps the person\'s target inside the bands the lab checked', () => {
    expect(sizingTargetFor(plan, 2100)).toBe(2100);
    expect(sizingTargetFor(plan, 2800)).toBe(2400);
    expect(sizingTargetFor(plan, 1500)).toBe(1800);
    expect(sizingTargetFor({ band: { min: 1600, max: 1800 } }, 2000)).toBe(1800);
  });
});

