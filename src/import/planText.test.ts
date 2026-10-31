import { describe, expect, it } from 'vitest';

import { fixListForAI, gradePlan } from '@/engine/planReport';
import { BUNDLED_PLANS, FOODS, FOOD_INDEX, food, foodResolver } from '@/state/catalog';

import { parsePlanText, plansToText } from './planText';

const names = { foodName: (id: string) => food(id)?.name };
const errorsOf = <T extends { level: string }>(r: { issues: T[] }) => r.issues.filter((i) => i.level === 'error');
/**
 * The importer lists a day's meals in slot order (breakfast, lunch, snack, dinner) whatever the order
 * in the sheet, while the bundled JSON puts snacks last. Compare meals by id within each day.
 */
const canon = (plans: typeof BUNDLED_PLANS) =>
  plans.map((p) => ({ ...p, days: p.days.map((d) => ({ ...d, meals: d.meals.slice().sort((a, b) => a.id.localeCompare(b.id)) })) }));
const flat = (plans: typeof BUNDLED_PLANS) =>
  canon(plans).map((p) => ({
    id: p.id,
    days: p.days.map((d) => ({
      day: d.day,
      meals: d.meals.map((m) => ({ id: m.id, slot: m.slot, ing: m.ingredients.map((i) => [i.foodId, i.grams, i.swapGroup ?? '']) })),
    })),
  }));

// a tiny valid plan using real food ids, used as the base for hand-edited texts
const [apple, oats] = ['apple-raw', 'oats-rolled-dry'].map((id) => FOOD_INDEX.get(id)!);
const MINI = `=== PLANS ===
plan_id,plan_name,calorie_min,calorie_max,cuisine,tags,description,author,version
mini,"Mini, the plan",1200,2400,Global,vegetarian|quick,"Says ""hi"", twice",Coach,2

=== MEALS ===
plan_id,day,slot,meal_id,meal_name,prep_minutes,instructions,photo_url
mini,1,breakfast,mini-d1-b,Oats and apple,5,"Cook the oats, then
add the apple.",
mini,1,lunch,mini-d1-l,Apple lunch,,,

=== INGREDIENTS ===
meal_id,food_id,food_name,grams,swap_group,note
mini-d1-b,${oats.id},${oats.name.replace(/,/g, '')},60,,
mini-d1-b,${apple.id},${apple.name.replace(/,/g, '')},150,,"sliced, thin"
mini-d1-l,${apple.id},,200,,
`;

describe('plansToText round trip', () => {
  it('imports the bundled sample plans back identically', () => {
    const text = plansToText(BUNDLED_PLANS, names);
    expect(text).toMatch(/^=== PLANS ===\nplan_id,plan_name,/);
    const { plans, issues } = parsePlanText(text, foodResolver);
    expect(errorsOf({ issues })).toEqual([]);
    expect(plans.map((p) => p.id)).toEqual(BUNDLED_PLANS.map((p) => p.id));
    expect(flat(plans)).toEqual(flat(BUNDLED_PLANS));
    expect(canon(plans)).toEqual(canon(BUNDLED_PLANS));
  });

  it('works without food names (food_id only) and for a single plan', () => {
    const { plans, issues } = parsePlanText(plansToText(BUNDLED_PLANS.slice(0, 1)), foodResolver);
    expect(errorsOf({ issues })).toEqual([]);
    expect(canon(plans)).toEqual(canon(BUNDLED_PLANS.slice(0, 1)));
  });
});

describe('parsePlanText tolerance', () => {
  it('reads quoted commas, quotes and a newline inside a field', () => {
    const { plans, issues } = parsePlanText(MINI, foodResolver);
    expect(errorsOf({ issues })).toEqual([]);
    const p = plans[0];
    expect(p.name).toBe('Mini, the plan');
    expect(p.description).toBe('Says "hi", twice');
    expect(p.tags).toEqual(['vegetarian', 'quick']);
    expect(p.version).toBe(2);
    expect(p.days[0].meals[0].instructions).toBe('Cook the oats, then\nadd the apple.');
    expect(p.days[0].meals[0].ingredients[1].note).toBe('sliced, thin');
  });

  it('accepts ```csv fences, markdown before and after, blank lines and trailing spaces', () => {
    const [pl, me, ing] = MINI.split(/\n\n(?==== )/);
    const text = [
      '# Here is your plan',
      '',
      'Sure! The three blocks are below.',
      '',
      '=== PLANS ===',
      '```csv',
      pl.split('\n').slice(1).map((l) => `${l}   `).join('\n'),
      '```',
      '',
      '',
      '**MEALS:**',
      '```csv',
      me.split('\n').slice(1).join('\n'),
      '```',
      '',
      '```csv INGREDIENTS',
      '',
      ing.split('\n').slice(1).join('\n'),
      '```',
      '',
      'Let me know if you want any changes.',
    ].join('\n');
    const { plans, issues } = parsePlanText(text, foodResolver);
    expect(errorsOf({ issues })).toEqual([]);
    expect(plans).toEqual(parsePlanText(MINI, foodResolver).plans);
  });

  it('accepts markers case-insensitively, unfenced trailing prose, and Windows line endings', () => {
    const text = MINI.replace('=== PLANS ===', '=== Plans ===').replace('=== MEALS ===', '--- meals ---').replace(/\n/g, '\r\n') + '\r\nHope this helps, enjoy!\r\n';
    const { plans, issues } = parsePlanText(text, foodResolver);
    expect(errorsOf({ issues })).toEqual([]);
    expect(plans).toHaveLength(1);
    expect(issues.some((i) => i.level === 'warning' && /Ignored text/.test(i.message))).toBe(true);
  });

  it('accepts semicolons as the delimiter', () => {
    const text = `PLANS:
plan_id;plan_name;calorie_min;calorie_max;cuisine;tags;description;author;version
semi;"Semi; plan";1200;2400;Global;"a;b";;;1

MEALS:
plan_id;day;slot;meal_id;meal_name;prep_minutes;instructions;photo_url
semi;1;breakfast;semi-1;Oats;5;"Cook, stir";

INGREDIENTS:
meal_id;food_id;food_name;grams;swap_group;note
semi-1;${oats.id};;37,5;;
`;
    const { plans, issues } = parsePlanText(text, foodResolver);
    expect(errorsOf({ issues })).toEqual([]);
    expect(plans[0].name).toBe('Semi; plan');
    expect(plans[0].tags).toEqual(['a', 'b']);
    expect(plans[0].days[0].meals[0].instructions).toBe('Cook, stir');
    expect(plans[0].days[0].meals[0].ingredients[0].grams).toBe(37.5);
  });

  it('finds blocks by their header rows when there are no markers', () => {
    const text = MINI.replace(/=== \w+ ===\n/g, '');
    const { plans, issues } = parsePlanText(text, foodResolver);
    expect(errorsOf({ issues })).toEqual([]);
    expect(plans).toHaveLength(1);
  });

  it('tolerates messy header names', () => {
    const text = MINI.replace('plan_id,plan_name,calorie_min', ' Plan ID , Plan-Name ,Calorie Min');
    expect(errorsOf(parsePlanText(text, foodResolver))).toEqual([]);
  });
});

describe('parsePlanText errors', () => {
  it('names a missing block', () => {
    const text = MINI.slice(0, MINI.indexOf('=== INGREDIENTS ==='));
    const { plans, issues } = parsePlanText(text, foodResolver);
    expect(plans).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: 'error', sheet: 'Ingredients' });
    expect(issues[0].message).toBe('No INGREDIENTS block found.');
    expect(issues[0].suggestion).toContain('=== INGREDIENTS ===');
  });

  it('reports empty text and text without any block', () => {
    expect(parsePlanText('  \n ', foodResolver).issues[0].message).toMatch(/empty/);
    const r = parsePlanText('Sorry, I cannot do that.', foodResolver);
    expect(r.issues.map((i) => i.message)).toEqual(['No PLANS block found.', 'No MEALS block found.', 'No INGREDIENTS block found.']);
  });

  it('flags an unknown food with suggestions, at the CSV line within its block', () => {
    const text = MINI.replace(`mini-d1-l,${apple.id},,200,,`, 'mini-d1-l,not-a-real-id,yoghurt nonfat,200,,');
    const { plans, issues } = parsePlanText(text, foodResolver);
    expect(plans).toEqual([]); // the plan is held back
    const e = errorsOf({ issues });
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ sheet: 'Ingredients', row: 4 }); // header, 2 breakfast rows, then this one
    expect(e[0].message).toContain('yoghurt nonfat');
    expect(e[0].suggestion).toMatch(/yogurt-.*nonfat/);
  });

  it('flags bad grams on the right line, counting a multi-line field in an earlier block', () => {
    const text = MINI.replace(`mini-d1-b,${oats.id},${oats.name.replace(/,/g, '')},60,,`, `mini-d1-b,${oats.id},,sixty,,`).replace(
      `mini-d1-l,${apple.id},,200,,`,
      `mini-d1-l,${apple.id},,-5,,`,
    );
    const e = errorsOf(parsePlanText(text, foodResolver));
    expect(e.map((i) => [i.sheet, i.row, i.message])).toEqual([
      ['Ingredients', 2, 'grams "sixty" is not a number.'],
      ['Ingredients', 4, 'grams must be greater than 0 (got -5).'],
    ]);
  });

  it('counts the lines of a multi-line quoted field so Meals rows match the text', () => {
    // header = line 1, breakfast row = lines 2-3 (newline inside the instructions), lunch row = line 4
    const text = MINI.replace('mini,1,lunch,mini-d1-l,Apple lunch,,,', 'mini,1,brunch,mini-d1-l,Apple lunch,,,');
    const e = errorsOf(parsePlanText(text, foodResolver));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ sheet: 'Meals', row: 4 });
    expect(e[0].message).toContain('slot "brunch"');
  });

  it('flags an unquoted comma that shifts the columns', () => {
    const text = MINI.replace('mini,1,lunch,mini-d1-l,Apple lunch,,,', 'mini,1,lunch,mini-d1-l,Apple, with extra,5,Cook it,http://x.test/a.jpg');
    const e = errorsOf(parsePlanText(text, foodResolver));
    expect(e.some((i) => i.sheet === 'Meals' && /fields but the header has/.test(i.message) && /double quotes/.test(i.suggestion ?? ''))).toBe(true);
  });

  it('reports an unclosed quote instead of swallowing the rest of the block', () => {
    const text = MINI.replace('mini-d1-l,Apple lunch', 'mini-d1-l,"Apple lunch');
    const e = errorsOf(parsePlanText(text, foodResolver));
    expect(e.some((i) => i.sheet === 'Meals' && /never closed/.test(i.message))).toBe(true);
  });
});

describe('fix-list for a broken AI answer', () => {
  it('contains both the structural error and the calorie fix', () => {
    const [a, b] = structuredClone(BUNDLED_PLANS.slice(0, 2));
    a.days[0].meals = a.days[0].meals.slice(0, 1); // plan A: a day with a single meal
    const unknown = b.days[1].meals[0].ingredients[0];
    unknown.foodId = 'made-up-food'; // plan B: a food that doesn't exist
    const text = plansToText([a, b], { foodName: (id) => (id === 'made-up-food' ? 'yoghurt nonfat' : food(id)?.name) });

    const { plans, issues } = parsePlanText(text, foodResolver);
    expect(plans.map((p) => p.id)).toEqual([a.id]);
    const reports = plans.map((p) => gradePlan(p, FOOD_INDEX, FOODS));
    const fix = fixListForAI({ reports, importIssues: issues });

    expect(fix).toContain('FORMAT / FOOD ERRORS');
    expect(fix).toMatch(/- Ingredients row \d+: food_name "yoghurt nonfat" has no confident match\./);
    expect(fix).toContain('Use: yogurt-');
    expect(fix).toMatch(new RegExp(`PLAN ${a.id} .*fix\\(es\\) needed`));
    expect(fix).toMatch(/Day 1: \d+ kcal is below the \d+–\d+ band\. Fix: Add about \d+ kcal on day 1/);
    expect(fix.trim().endsWith('same format as before.')).toBe(true);
  });
});
