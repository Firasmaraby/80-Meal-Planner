import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import type { MealPlan } from '../engine/types';
import { parsePlanWorkbook, type FoodResolver, type ImportIssue } from './planWorkbook';
import { checkPlanBand } from './validatePlan';

// ── fakes & builders ───────────────────────────────────────────────────────

const FOODS = [
  { id: 'oats', name: 'Oats, rolled, dry' },
  { id: 'blueberry', name: 'Blueberries' },
  { id: 'olive_oil', name: 'Olive oil' },
  { id: 'salmon', name: 'Salmon, Atlantic, baked' },
  { id: 'spinach', name: 'Spinach, raw' },
  { id: 'chicken_breast', name: 'Chicken breast' },
  { id: 'chicken_thigh', name: 'Chicken thigh' },
  { id: 'almonds', name: 'Almonds' },
];

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

const fakeFoods: FoodResolver = {
  byId: (id) => FOODS.find((f) => f.id === id),
  search: (name, limit = 5) => {
    const q = tokens(name);
    return FOODS.map((f) => {
      const t = tokens(f.name);
      const inter = [...q].filter((x) => t.has(x)).length;
      const union = new Set([...q, ...t]).size;
      return { ...f, score: union === 0 ? 0 : inter / union };
    })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },
};

type Row = (string | number)[];
const PLAN_H: Row = ['plan_id', 'plan_name', 'calorie_min', 'calorie_max', 'cuisine', 'tags', 'description', 'author', 'version'];
const MEAL_H: Row = ['plan_id', 'day', 'slot', 'meal_id', 'meal_name', 'prep_minutes', 'instructions', 'photo_url'];
const ING_H: Row = ['meal_id', 'food_id', 'food_name', 'grams', 'swap_group', 'note'];

function book(sheets: Record<string, Row[]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

/** a valid baseline; tests override individual sheets */
function baseSheets(over: Partial<Record<'Plans' | 'Meals' | 'Ingredients', Row[]>> = {}) {
  return {
    Plans: [PLAN_H, ['p1', 'Med 1800', 1700, 1900, 'Mediterranean', 'Pescatarian, high-protein', 'desc', 'Coach', 2]],
    Meals: [MEAL_H, ['p1', 1, 'breakfast', 'm1', 'Oats', 10, 'Cook', '']],
    Ingredients: [ING_H, ['m1', 'oats', '', 50, '', '']],
    ...over,
  };
}

const run = (sheets: Record<string, Row[]>, opts?: { autoAcceptScore?: number }) =>
  parsePlanWorkbook(book(sheets), fakeFoods, opts);
const errors = (issues: ImportIssue[]) => issues.filter((i) => i.level === 'error');
const warnings = (issues: ImportIssue[]) => issues.filter((i) => i.level === 'warning');

// ── tests ──────────────────────────────────────────────────────────────────

describe('parsePlanWorkbook: happy path', () => {
  const sheets = {
    Plans: [
      PLAN_H,
      ['p1', 'Med 1800', 1700, 1900, 'Mediterranean', 'Pescatarian, high-protein', 'A plan', 'Coach', 3],
      ['p2', 'Asian 2200', 2100, 2300, 'Asian fusion', '', '', '', ''],
    ],
    Meals: [
      MEAL_H,
      // deliberately out of order: dinner before breakfast, day 2 before day 1, two snacks
      ['p1', 2, 'dinner', 'm5', 'Salmon dinner', 30, 'Bake', 'https://x.test/a.jpg'],
      ['p1', 1, 'dinner', 'm4', 'Chicken dinner', '', '', ''],
      ['p1', 1, 'snack', 'm3b', 'Second snack', '', '', ''],
      ['p1', 1, 'snack', 'm3a', 'First snack', '', '', ''],
      ['p1', 1, 'lunch', 'm2', 'Spinach lunch', '', '', ''],
      ['p1', 1, 'breakfast', 'm1', 'Oats', 10, 'Cook oats', ''],
      ['p2', 1, 'breakfast', 'm6', 'Berry oats', '', '', ''],
    ],
    Ingredients: [
      ING_H,
      ['m1', 'oats', '', 50, 'grains', 'dry'],
      ['m1', 'blueberry', '', 80.5, '', ''],
      ['m2', 'spinach', '', 100, 'leafy_greens', ''],
      ['m2', 'olive_oil', '', 10, '', ''],
      ['m3a', 'almonds', '', 25, '', ''],
      ['m3b', 'blueberry', '', 100, '', ''],
      ['m4', 'chicken_breast', '', 150, '', ''],
      ['m5', 'salmon', '', 140, '', ''],
      ['m6', 'oats', '', 40, '', ''],
    ],
  };

  it('builds two plans with sorted days and slot order', () => {
    const { plans, issues } = run(sheets);
    expect(issues).toEqual([]);
    expect(plans.map((p) => p.id)).toEqual(['p1', 'p2']);

    const p1 = plans[0];
    expect(p1).toMatchObject({
      id: 'p1',
      name: 'Med 1800',
      version: 3,
      band: { min: 1700, max: 1900 },
      cuisine: 'Mediterranean',
      tags: ['pescatarian', 'high-protein'],
      description: 'A plan',
      author: 'Coach',
    });
    expect(p1.days.map((d) => d.day)).toEqual([1, 2]);
    expect(p1.days[0].meals.map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'snack', 'snack', 'dinner']);
    // snacks keep sheet order
    expect(p1.days[0].meals.filter((m) => m.slot === 'snack').map((m) => m.id)).toEqual(['m3b', 'm3a']);
    expect(p1.days[1].meals.map((m) => m.id)).toEqual(['m5']);
  });

  it('maps meal and ingredient fields', () => {
    const [p1, p2] = run(sheets).plans;
    const m1 = p1.days[0].meals[0];
    expect(m1).toMatchObject({ id: 'm1', name: 'Oats', prepMinutes: 10, instructions: 'Cook oats' });
    expect(m1.ingredients).toEqual([
      { foodId: 'oats', grams: 50, swapGroup: 'grains', note: 'dry' },
      { foodId: 'blueberry', grams: 80.5 },
    ]);
    expect(p1.days[1].meals[0].photoUrl).toBe('https://x.test/a.jpg');
    // empty optional fields are omitted; version defaults to 1
    expect(p2.version).toBe(1);
    expect(p2.tags).toEqual([]);
    expect('description' in p2).toBe(false);
  });
});

describe('parsePlanWorkbook: EXAMPLE rows', () => {
  it('skips rows whose id starts with EXAMPLE on every sheet', () => {
    const s = baseSheets();
    s.Plans.splice(1, 0, ['EXAMPLE-plan', 'Example', 1700, 1900, 'Mediterranean', '', '', '', '']);
    s.Meals.splice(1, 0, ['EXAMPLE-plan', 1, 'breakfast', 'EXAMPLE-meal', 'Example meal', '', '', '']);
    s.Ingredients.splice(1, 0, ['EXAMPLE-meal', '', 'Rolled oats', 50, '', '']);
    const { plans, issues } = run(s);
    expect(issues).toEqual([]);
    expect(plans.map((p) => p.id)).toEqual(['p1']);
  });

  it('skips blank rows without complaint and reports 1-based Excel rows', () => {
    const s = baseSheets({
      Ingredients: [ING_H, [], ['m1', 'oats', '', 50, '', ''], ['', '', '', '', '', ''], ['m1', 'oats', '', -5, '', '']],
    });
    const { issues } = run(s);
    expect(errors(issues)).toHaveLength(1);
    expect(errors(issues)[0]).toMatchObject({ sheet: 'Ingredients', row: 5 });
  });
});

describe('parsePlanWorkbook: food matching', () => {
  const withIng = (...rows: Row[]) => baseSheets({ Ingredients: [ING_H, ...rows] });

  it('food_id wins over food_name when valid', () => {
    const { plans, issues } = run(withIng(['m1', 'oats', 'Salmon', 50, '', '']));
    expect(issues).toEqual([]);
    expect(plans[0].days[0].meals[0].ingredients[0].foodId).toBe('oats');
  });

  it('auto-accepts a confident name match but warns what it matched', () => {
    const { plans, issues } = run(withIng(['m1', '', 'olive oil', 10, '', '']));
    expect(plans[0].days[0].meals[0].ingredients[0].foodId).toBe('olive_oil');
    expect(errors(issues)).toEqual([]);
    expect(warnings(issues)).toHaveLength(1);
    expect(warnings(issues)[0]).toMatchObject({ sheet: 'Ingredients', row: 2, suggestion: 'olive_oil' });
    expect(warnings(issues)[0].message).toContain('Olive oil');
  });

  it('errors with up to 3 suggestions when the match is weak', () => {
    const { plans, issues } = run(withIng(['m1', '', 'chicken', 100, '', '']));
    expect(plans).toEqual([]); // the plan is withheld because it has an error
    const errs = errors(issues);
    expect(errs).toHaveLength(1);
    expect(errs[0].row).toBe(2);
    expect(errs[0].suggestion).toContain('chicken_breast');
    expect(errs[0].suggestion).toContain('chicken_thigh');
    expect(errs[0].suggestion!.split(';').length).toBeLessThanOrEqual(3);
  });

  it('honours a custom autoAcceptScore', () => {
    const strict = run(withIng(['m1', '', 'rolled oats', 50, '', '']), { autoAcceptScore: 0.95 });
    expect(errors(strict.issues)).toHaveLength(1);
    const lenient = run(withIng(['m1', '', 'rolled oats', 50, '', '']), { autoAcceptScore: 0.5 });
    expect(errors(lenient.issues)).toHaveLength(0);
    expect(lenient.plans[0].days[0].meals[0].ingredients[0].foodId).toBe('oats');
  });

  it('errors when nothing matches at all', () => {
    const { issues } = run(withIng(['m1', '', 'dragon fruit', 50, '', '']));
    expect(errors(issues)).toHaveLength(1);
    expect(errors(issues)[0].suggestion).toBeUndefined();
  });

  it('unknown food_id with no name is an error; with a name it falls back to matching', () => {
    const a = run(withIng(['m1', 'nope', '', 50, '', '']));
    expect(errors(a.issues)[0].message).toContain('nope');
    const b = run(withIng(['m1', 'nope', 'Olive oil', 50, '', '']));
    expect(errors(b.issues)).toHaveLength(0);
    expect(warnings(b.issues).length).toBeGreaterThanOrEqual(1);
    expect(b.plans[0].days[0].meals[0].ingredients[0].foodId).toBe('olive_oil');
  });

  it('errors when neither food_id nor food_name is given', () => {
    const { issues } = run(withIng(['m1', '', '', 50, '', '']));
    expect(errors(issues)).toHaveLength(1);
    expect(errors(issues)[0].message).toMatch(/food_id or food_name/);
  });
});

describe('parsePlanWorkbook: errors', () => {
  it('unknown plan_id in Meals', () => {
    const s = baseSheets();
    s.Meals.push(['ghost', 1, 'lunch', 'm9', 'Lost meal', '', '', '']);
    s.Ingredients.push(['m9', 'oats', '', 10, '', '']);
    const { plans, issues } = run(s);
    const errs = errors(issues);
    expect(errs).toHaveLength(1); // the ingredient row does not cascade
    expect(errs[0]).toMatchObject({ sheet: 'Meals', row: 3 });
    expect(errs[0].message).toContain('ghost');
    expect(plans.map((p) => p.id)).toEqual(['p1']); // unrelated plan still imports
  });

  it('unknown meal_id in Ingredients', () => {
    const s = baseSheets();
    s.Ingredients.push(['m404', 'oats', '', 10, '', '']);
    const { issues } = run(s);
    expect(errors(issues)).toHaveLength(1);
    expect(errors(issues)[0]).toMatchObject({ sheet: 'Ingredients', row: 3 });
  });

  it('duplicate plan_id and duplicate meal_id', () => {
    const s = baseSheets();
    s.Plans.push(['p1', 'Again', 1700, 1900, 'Italian', '', '', '', '']);
    s.Meals.push(['p1', 2, 'lunch', 'm1', 'Same id', '', '', '']);
    const { issues } = run(s);
    const msgs = errors(issues).map((e) => `${e.sheet}:${e.row}:${e.message}`);
    expect(msgs.some((m) => m.startsWith('Plans:3:') && m.includes('Duplicate plan_id'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('Meals:3:') && m.includes('Duplicate meal_id'))).toBe(true);
  });

  it('missing required fields', () => {
    const s = baseSheets({
      Plans: [PLAN_H, ['p1', '', 1700, 1900, '', '', '', '', ''], ['', 'No id', 1700, 1900, 'Italian', '', '', '', '']],
      Meals: [MEAL_H, ['p1', 1, '', 'm1', 'Oats', '', '', '']],
    });
    const { issues } = run(s);
    const text = errors(issues).map((e) => `${e.sheet}:${e.row}:${e.message}`).join('\n');
    expect(text).toContain('Plans:2:Missing required field "plan_name"');
    expect(text).toContain('Plans:2:Missing required field "cuisine"');
    expect(text).toContain('Plans:3:Missing required field "plan_id"');
    expect(text).toContain('Meals:2:Missing required field "slot"');
  });

  it('missing calorie bounds and grams', () => {
    const s = baseSheets({
      Plans: [PLAN_H, ['p1', 'X', '', 1900, 'Italian', '', '', '', '']],
      Ingredients: [ING_H, ['m1', 'oats', '', '', '', '']],
    });
    const text = errors(run(s).issues).map((e) => e.message).join('\n');
    expect(text).toContain('Missing required field "calorie_min"');
    expect(text).toContain('Missing required field "grams"');
  });

  it.each([[0], [-10], ['abc']])('grams %s is rejected', (g) => {
    const { issues, plans } = run(baseSheets({ Ingredients: [ING_H, ['m1', 'oats', '', g, '', '']] }));
    expect(errors(issues).some((e) => e.sheet === 'Ingredients' && e.row === 2)).toBe(true);
    expect(plans).toEqual([]);
  });

  it('calorie_min >= calorie_max (equal and reversed)', () => {
    for (const [lo, hi] of [[1900, 1900], [2000, 1800]]) {
      const s = baseSheets({ Plans: [PLAN_H, ['p1', 'X', lo, hi, 'Italian', '', '', '', '']] });
      const errs = errors(run(s).issues);
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatchObject({ sheet: 'Plans', row: 2 });
      expect(errs[0].message).toContain('calorie_min');
    }
  });

  it('non-numeric calories', () => {
    const s = baseSheets({ Plans: [PLAN_H, ['p1', 'X', 'lots', 1900, 'Italian', '', '', '', '']] });
    expect(errors(run(s).issues)[0].message).toContain('not a number');
  });

  it('a meal with no ingredients', () => {
    const s = baseSheets();
    s.Meals.push(['p1', 1, 'lunch', 'm2', 'Empty lunch', '', '', '']);
    const { issues, plans } = run(s);
    expect(errors(issues)).toHaveLength(1);
    expect(errors(issues)[0]).toMatchObject({ sheet: 'Meals', row: 3 });
    expect(errors(issues)[0].message).toContain('no ingredients');
    expect(plans).toEqual([]);
  });

  it('a plan with no meals', () => {
    const s = baseSheets();
    s.Plans.push(['p2', 'Empty', 1700, 1900, 'Italian', '', '', '', '']);
    const { issues, plans } = run(s);
    expect(errors(issues)).toHaveLength(1);
    expect(errors(issues)[0]).toMatchObject({ sheet: 'Plans', row: 3 });
    expect(errors(issues)[0].message).toContain('no meals');
    expect(plans.map((p) => p.id)).toEqual(['p1']);
  });

  it('invalid day and slot', () => {
    const s = baseSheets({
      Meals: [MEAL_H, ['p1', 15, 'breakfast', 'm1', 'A', '', '', ''], ['p1', 1.5, 'lunch', 'm2', 'B', '', '', ''], ['p1', 1, 'brunch', 'm3', 'C', '', '', '']],
    });
    const errs = errors(run(s).issues);
    expect(errs.map((e) => e.row)).toEqual([2, 3, 4]);
    expect(errs[2].message).toContain('slot');
  });

  it('missing sheet or column', () => {
    const noMeals = run({ Plans: baseSheets().Plans, Ingredients: baseSheets().Ingredients });
    expect(errors(noMeals.issues)[0]).toMatchObject({ sheet: 'Meals', row: 1 });
    const s = baseSheets({ Ingredients: [['meal_id', 'food_id', 'food_name'], ['m1', 'oats', '']] });
    expect(errors(run(s).issues).some((e) => e.message.includes('"grams"'))).toBe(true);
  });

  it('garbage input is reported, not thrown', () => {
    const r = parsePlanWorkbook(new Uint8Array([1, 2, 3, 4]), fakeFoods);
    expect(r.plans).toEqual([]);
    expect(errors(r.issues).length).toBeGreaterThan(0);
  });
});

describe('parsePlanWorkbook: headers', () => {
  it('is case-insensitive, trimmed and tolerant of spaces and column order', () => {
    const s = {
      ' PLANS ': [
        [' Plan_ID ', 'PLAN NAME', 'Calorie_Min', 'CALORIE_MAX', ' Cuisine'],
        ['p1', 'Med', 1700, 1900, 'Italian'],
      ],
      meals: [
        ['Slot', 'Plan ID', 'Day', 'Meal_ID', 'Meal_Name'],
        ['Breakfast', 'p1', '1', 'm1', 'Oats'],
      ],
      INGREDIENTS: [
        ['GRAMS', 'Meal_ID', 'Food_ID'],
        ['50', 'm1', 'oats'],
      ],
    };
    const { plans, issues } = run(s);
    expect(issues).toEqual([]);
    expect(plans[0].days[0].meals[0]).toMatchObject({ slot: 'breakfast', ingredients: [{ foodId: 'oats', grams: 50 }] });
  });

  it('accepts ids written as numbers', () => {
    const s = baseSheets({
      Plans: [PLAN_H, [100, 'Numeric', 1700, 1900, 'Italian', '', '', '', '']],
      Meals: [MEAL_H, [100, 1, 'breakfast', 7, 'Oats', '', '', '']],
      Ingredients: [ING_H, [7, 'oats', '', 50, '', '']],
    });
    const { plans, issues } = run(s);
    expect(issues).toEqual([]);
    expect(plans[0].id).toBe('100');
  });
});

describe('checkPlanBand', () => {
  const plan: MealPlan = {
    id: 'p',
    version: 1,
    name: 'P',
    band: { min: 1700, max: 1900 },
    cuisine: 'Italian',
    tags: [],
    days: [
      { day: 1, meals: [{ id: 'a', slot: 'breakfast', name: 'A', ingredients: [{ foodId: 'x', grams: 500 }, { foodId: 'y', grams: 100 }] }] },
      { day: 2, meals: [{ id: 'b', slot: 'lunch', name: 'B', ingredients: [{ foodId: 'x', grams: 300 }] }] },
      { day: 3, meals: [{ id: 'c', slot: 'lunch', name: 'C', ingredients: [{ foodId: 'x', grams: 800 }] }] },
    ],
  };
  const kcal = (id: string, g: number) => (id === 'x' ? 3 * g : 2 * g);

  it('warns only for days outside the band, with the computed kcal', () => {
    const issues = checkPlanBand(plan, kcal); // day1 = 1700 (edge, ok), day2 = 900 (low), day3 = 2400 (high)
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.level === 'warning')).toBe(true);
    expect(issues[0].message).toContain('day 2');
    expect(issues[0].message).toContain('900 kcal');
    expect(issues[1].message).toContain('day 3');
    expect(issues[1].message).toContain('2400 kcal');
  });

  it('returns nothing when every day is in band', () => {
    const ok: MealPlan = {
      ...plan,
      days: [1800, 1700, 1900].map((g, i) => ({
        day: i + 1,
        meals: [{ id: `m${i}`, slot: 'lunch' as const, name: 'M', ingredients: [{ foodId: 'x', grams: g }] }],
      })),
    };
    expect(checkPlanBand(ok, (_id, g) => g)).toEqual([]);
  });
});
