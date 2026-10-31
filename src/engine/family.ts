/**
 * Plan families: one week of eating written once (content/families/<id>.json, format in content/GUIDE.md section 9)
 * and compiled into one MealPlan per size.
 *
 *   validateFamily   the file's format, foods, recipe ids, week slots, adjust lists and band strings
 *   compileFamily    Standard is the week as written; the other sizes apply `adjust`, then personalizeDay sizes every day
 *   compactPlan      the stored form in src/data/libraryPlans.json: { recipe, slot, g: [grams per ingredient] } per meal
 *   (libraryPlans.ts holds the stored types and `expandPlans`, which turns compact plans + recipes.json back into MealPlans for the app)
 *
 * Pure TypeScript with no Node or React Native imports: scripts/plan-lab.mjs, scripts/build-plans.mjs, the tests and the app share it.
 */
import { boardProgress, getFood, ingredientsTotal, type FoodIndex } from './calc';
import { carbStyleOfPlan } from './carbStyle';
import { BOARD_KEYS } from './nutrients';
import { personalizeDay } from './personalize';
import { mealFrom, type CompactPlan, type Hero, type LibraryIngredient, type LibraryRecipe } from './libraryPlans';
import { FOOD_BANS, PLAN_STYLES, isPlanStyle } from './planStyles';
import type { Ingredient, CalorieBand, Food, LifeStage, Meal, MealPlan, MealSlot, NutrientKey, PlanSize, PlanStyle, SwapGroup } from './types';

// ── The file ───────────────────────────────────────────────────────────────

export interface FamilyIngredient {
  food: string;
  g: number;
  swap?: string;
  note?: string;
}

export interface FamilyRecipe {
  id: string;
  name: string;
  inspiredBy?: string;
  about?: string;
  ingredients: FamilyIngredient[];
  steps?: string[];
  prepMin?: number;
  cookMin?: number;
  servings?: number;
  tags?: string[];
  tip?: string;
}

export type AdjustOp = { day: number | '*' } & (
  | { add: { slot: MealSlot; recipe: string } }
  | { drop: { slot: MealSlot; index: number } | { recipe: string } }
  | { swap: { from: string; to: string } }
);

export interface FamilySize {
  kcal: number;
  /** calorie bands as "1800-2000" */
  covers: string[];
  adjust?: AdjustOp[];
}

export interface WeekMeal {
  slot: MealSlot;
  recipe: string;
  leftover?: boolean;
}

export interface WeekDay {
  day: number;
  meals: WeekMeal[];
}

export interface FamilyFile {
  id: string;
  name: string;
  style: PlanStyle;
  cuisine: string;
  regions?: string[];
  summary?: string;
  howItWorks?: string;
  signature?: string[];
  lifeStage?: LifeStage;
  sizes: Partial<Record<PlanSize, FamilySize>>;
  recipes: FamilyRecipe[];
  week: WeekDay[];
}

export const SIZES: PlanSize[] = ['light', 'standard', 'big', 'xl'];
export const SIZE_LABEL: Record<PlanSize, string> = { light: 'Light', standard: 'Standard', big: 'Big', xl: 'XL' };
export const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** The 10 calorie bands the app offers. */
export const APP_BANDS: CalorieBand[] = [
  [1200, 1400], [1400, 1600], [1600, 1800], [1800, 2000], [2000, 2200],
  [2200, 2400], [2400, 2800], [2800, 3200], [3200, 3700], [3700, 4200],
].map(([min, max]) => ({ min, max }));

export const bandString = (b: CalorieBand) => `${b.min}-${b.max}`;

/** "1800-2000" -> the app band, or undefined when it is not one of the 10. */
export function parseCovers(s: string): CalorieBand | undefined {
  const m = /^\s*(\d+)\s*[-]\s*(\d+)\s*$/.exec(s);
  return m ? APP_BANDS.find((b) => b.min === +m[1] && b.max === +m[2]) : undefined;
}

// ── Validation ─────────────────────────────────────────────────────────────

export interface FormatIssue {
  level: 'error' | 'warning';
  /** where in the file: "recipes[3].ingredients[1].food" */
  path: string;
  message: string;
  suggestion?: string;
}

export interface ValidateContext {
  /** ids of the everyday tier, exactly (legacy ids are not accepted) */
  foodIds: Set<string>;
  /** near matches for an unknown food id */
  suggest?: (foodId: string) => string[];
  swapGroups?: Set<string>;
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isSlot = (x: unknown): x is MealSlot => typeof x === 'string' && (SLOTS as string[]).includes(x);

export function validateFamily(raw: unknown, ctx: ValidateContext): { family?: FamilyFile; issues: FormatIssue[] } {
  const issues: FormatIssue[] = [];
  const err = (path: string, message: string, suggestion?: string) => issues.push({ level: 'error', path, message, suggestion });
  const warn = (path: string, message: string) => issues.push({ level: 'warning', path, message });
  if (!isObj(raw)) return { issues: [{ level: 'error', path: '', message: 'The file must be a JSON object.' }] };

  if (!isStr(raw.id) || !KEBAB.test(raw.id)) err('id', 'id must be kebab-case, like "med-coast".');
  if (!isStr(raw.name)) err('name', 'name is required.');
  if (!isPlanStyle(raw.style)) err('style', `style must be one of: ${Object.keys(PLAN_STYLES).join(', ')}.`);
  if (!isStr(raw.cuisine)) err('cuisine', 'cuisine is required.');
  for (const k of ['summary', 'howItWorks'] as const) if (raw[k] != null && typeof raw[k] !== 'string') err(k, `${k} must be text.`);
  if (raw.regions != null && !(Array.isArray(raw.regions) && raw.regions.every(isStr))) err('regions', 'regions must be a list of names.');
  if (raw.lifeStage != null && !['none', 'pregnant', 'lactating'].includes(raw.lifeStage as string)) err('lifeStage', 'lifeStage must be "none", "pregnant" or "lactating".');
  if (isPlanStyle(raw.style)) {
    const want = PLAN_STYLES[raw.style].gates.lifeStage;
    if (want && raw.lifeStage !== want) err('lifeStage', `The ${raw.style} style needs "lifeStage": "${want}".`);
  }

  // recipes
  const recipeIds = new Set<string>();
  const recipes = Array.isArray(raw.recipes) ? raw.recipes : (err('recipes', 'recipes must be a list.'), []);
  if (Array.isArray(raw.recipes) && !recipes.length) err('recipes', 'The family has no recipes.');
  recipes.forEach((r: unknown, i: number) => {
    const at = `recipes[${i}]`;
    if (!isObj(r)) return err(at, 'A recipe must be an object.');
    if (!isStr(r.id) || !KEBAB.test(r.id)) err(`${at}.id`, 'Recipe id must be kebab-case.');
    else if (recipeIds.has(r.id)) err(`${at}.id`, `Duplicate recipe id "${r.id}".`);
    else recipeIds.add(r.id);
    const label = isStr(r.id) ? `recipe "${r.id}"` : at;
    if (!isStr(r.name)) err(`${at}.name`, `${label}: name is required.`);
    for (const k of ['inspiredBy', 'about', 'tip'] as const) if (r[k] != null && typeof r[k] !== 'string') err(`${at}.${k}`, `${label}: ${k} must be text.`);
    for (const k of ['prepMin', 'cookMin'] as const) if (r[k] != null && !(isNum(r[k]) && r[k] >= 0)) err(`${at}.${k}`, `${label}: ${k} must be minutes (0 or more).`);
    if (r.servings != null && !(Number.isInteger(r.servings) && (r.servings as number) >= 1)) err(`${at}.servings`, `${label}: servings must be a whole number, 1 or more.`);
    if (r.tags != null && !(Array.isArray(r.tags) && r.tags.every(isStr))) err(`${at}.tags`, `${label}: tags must be a list of words.`);
    if (r.steps != null && !(Array.isArray(r.steps) && r.steps.every(isStr))) err(`${at}.steps`, `${label}: steps must be a list of sentences.`);
    if (!Array.isArray(r.ingredients) || !r.ingredients.length) return err(`${at}.ingredients`, `${label}: needs at least one ingredient.`);
    r.ingredients.forEach((ing: unknown, j: number) => {
      const p = `${at}.ingredients[${j}]`;
      if (!isObj(ing)) return err(p, `${label}: an ingredient must be { "food", "g" }.`);
      if (!isStr(ing.food)) err(`${p}.food`, `${label}: ingredient ${j + 1} has no food id.`);
      else if (!ctx.foodIds.has(ing.food)) {
        const near = ctx.suggest?.(ing.food) ?? [];
        err(`${p}.food`, `${label}: unknown food "${ing.food}" (use a food_id from templates/AI_Food_List.csv).`, near.length ? `Did you mean: ${near.join(', ')}?` : undefined);
      }
      if (!(isNum(ing.g) && ing.g > 0)) err(`${p}.g`, `${label}: ingredient ${j + 1} needs grams above 0.`);
      if (ing.swap != null) {
        if (!isStr(ing.swap)) err(`${p}.swap`, `${label}: swap must be a swap group key.`);
        else if (ctx.swapGroups && !ctx.swapGroups.has(ing.swap)) warn(`${p}.swap`, `${label}: no swap group "${ing.swap}" (groups: ${[...ctx.swapGroups].join(', ')}).`);
      }
      if (ing.note != null && typeof ing.note !== 'string') err(`${p}.note`, `${label}: note must be text.`);
    });
    const known = new Set(['id', 'name', 'inspiredBy', 'about', 'ingredients', 'steps', 'prepMin', 'cookMin', 'servings', 'tags', 'tip']);
    for (const k of Object.keys(r)) if (!known.has(k)) warn(`${at}.${k}`, `${label}: unknown field "${k}" is ignored.`);
  });

  // signature
  if (raw.signature != null) {
    if (!Array.isArray(raw.signature)) err('signature', 'signature must be a list of recipe ids.');
    else raw.signature.forEach((id: unknown, i: number) => !(isStr(id) && recipeIds.has(id)) && err(`signature[${i}]`, `Signature recipe "${String(id)}" does not exist.`));
  }

  // week
  const week = Array.isArray(raw.week) ? raw.week : (err('week', 'week must be a list of days.'), []);
  const dayNumbers = new Set<number>();
  week.forEach((d: unknown, i: number) => {
    const at = `week[${i}]`;
    if (!isObj(d)) return err(at, 'A day must be an object.');
    if (!(Number.isInteger(d.day) && (d.day as number) >= 1)) err(`${at}.day`, 'day must be 1, 2, 3...');
    else if (dayNumbers.has(d.day as number)) err(`${at}.day`, `Day ${d.day} appears twice.`);
    else dayNumbers.add(d.day as number);
    if (!Array.isArray(d.meals) || !d.meals.length) return err(`${at}.meals`, `Day ${String(d.day)} has no meals.`);
    d.meals.forEach((m: unknown, j: number) => {
      const p = `${at}.meals[${j}]`;
      if (!isObj(m)) return err(p, 'A meal must be { "slot", "recipe" }.');
      if (!isSlot(m.slot)) err(`${p}.slot`, `Day ${String(d.day)}: slot must be breakfast, lunch, dinner or snack.`);
      if (!isStr(m.recipe) || !recipeIds.has(m.recipe)) err(`${p}.recipe`, `Day ${String(d.day)}: recipe "${String(m.recipe)}" does not exist.`);
      if (m.leftover != null && typeof m.leftover !== 'boolean') err(`${p}.leftover`, 'leftover must be true or false.');
    });
  });
  if (Array.isArray(raw.week) && week.length !== 7) warn('week', `The week has ${week.length} days (a family is 7).`);

  // sizes
  const sizes = isObj(raw.sizes) ? raw.sizes : (err('sizes', 'sizes must be an object with at least "standard".'), {});
  if (isObj(raw.sizes) && !isObj(sizes.standard)) err('sizes.standard', 'The standard size is required.');
  for (const [name, s] of Object.entries(sizes)) {
    const at = `sizes.${name}`;
    if (!SIZES.includes(name as PlanSize)) {
      err(at, `Unknown size "${name}" (light, standard, big or xl).`);
      continue;
    }
    if (!isObj(s)) {
      err(at, 'A size must be { "kcal", "covers" }.');
      continue;
    }
    if (!(isNum(s.kcal) && s.kcal >= 1000 && s.kcal <= 5000)) err(`${at}.kcal`, 'kcal must be a number between 1000 and 5000.');
    if (!Array.isArray(s.covers) || !s.covers.length) err(`${at}.covers`, 'covers needs at least one band, like "1800-2000".');
    else
      s.covers.forEach((c: unknown, i: number) => {
        if (typeof c !== 'string' || !parseCovers(c))
          err(`${at}.covers[${i}]`, `"${String(c)}" is not one of the 10 app bands.`, `Use: ${APP_BANDS.map(bandString).join(', ')}.`);
      });
    if (s.adjust != null && !Array.isArray(s.adjust)) err(`${at}.adjust`, 'adjust must be a list.');
    (Array.isArray(s.adjust) ? s.adjust : []).forEach((op: unknown, i: number) => {
      const p = `${at}.adjust[${i}]`;
      if (!isObj(op)) return err(p, 'An adjust step must be an object.');
      if (!(op.day === '*' || (Number.isInteger(op.day) && dayNumbers.has(op.day as number)))) err(`${p}.day`, `day must be "*" or a day of the week (got ${JSON.stringify(op.day)}).`);
      const kinds = ['add', 'drop', 'swap'].filter((k) => op[k] != null);
      if (kinds.length !== 1) return err(p, 'An adjust step has exactly one of add, drop or swap.');
      const known = (id: unknown) => isStr(id) && recipeIds.has(id);
      if (op.add != null) {
        const a = op.add as Record<string, unknown>;
        if (!isObj(a) || !isSlot(a.slot) || !known(a.recipe)) err(p, 'add needs { "slot", "recipe" } with an existing recipe.');
      } else if (op.drop != null) {
        const d = op.drop as Record<string, unknown>;
        const bySlot = isObj(d) && isSlot(d.slot) && Number.isInteger(d.index) && (d.index as number) >= 0;
        const byRecipe = isObj(d) && known(d.recipe);
        if (!bySlot && !byRecipe) err(p, 'drop needs { "slot", "index" } or { "recipe" } with an existing recipe.');
      } else {
        const w = op.swap as Record<string, unknown>;
        if (!isObj(w) || !known(w.from) || !known(w.to)) err(p, 'swap needs { "from", "to" } with existing recipes.');
      }
    });
  }
  for (const k of Object.keys(raw)) {
    if (!['id', 'name', 'style', 'cuisine', 'regions', 'summary', 'howItWorks', 'signature', 'lifeStage', 'sizes', 'recipes', 'week'].includes(k)) warn(k, `Unknown field "${k}" is ignored.`);
  }

  if (issues.some((i) => i.level === 'error')) return { issues };
  return { family: raw as unknown as FamilyFile, issues };
}

/** Every em dash, en dash or double hyphen in any text of the file (the guide bans them everywhere). */
export function lintDashes(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return /[—–]|--/.test(value) ? [{ path, text: value }] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => lintDashes(v, `${path}[${i}]`));
  if (isObj(value)) return Object.entries(value).flatMap(([k, v]) => lintDashes(v, path ? `${path}.${k}` : k));
  return [];
}

// ── Compiling ──────────────────────────────────────────────────────────────

const slotRank = (s: MealSlot) => SLOTS.indexOf(s);

/** Apply a size's `adjust` list to the written week. Returns the new week and what could not be applied. */
export function applyAdjust(week: WeekDay[], adjust: AdjustOp[] = []): { week: WeekDay[]; problems: string[] } {
  const out: WeekDay[] = week.map((d) => ({ day: d.day, meals: d.meals.map((m) => ({ ...m })) }));
  const problems: string[] = [];
  adjust.forEach((op, n) => {
    const days = out.filter((d) => op.day === '*' || d.day === op.day);
    let applied = 0;
    for (const d of days) {
      if ('add' in op) {
        d.meals.push({ slot: op.add.slot, recipe: op.add.recipe });
        d.meals.sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
        applied++;
      } else if ('drop' in op) {
        const drop = op.drop;
        const at =
          'recipe' in drop
            ? d.meals.findIndex((m) => m.recipe === drop.recipe)
            : d.meals.map((m, i) => (m.slot === drop.slot ? i : -1)).filter((i) => i >= 0)[drop.index] ?? -1;
        if (at >= 0) {
          d.meals.splice(at, 1);
          applied++;
        }
      } else {
        for (const m of d.meals)
          if (m.recipe === op.swap.from) {
            m.recipe = op.swap.to;
            applied++;
          }
      }
    }
    if (!applied) problems.push(`adjust[${n}] changed nothing (${JSON.stringify(op)}).`);
  });
  return { week: out, problems };
}

export interface CompileContext {
  foods: FoodIndex;
  catalog: Food[];
  groups: SwapGroup[];
}

const recipeMap = (family: FamilyFile) => new Map(family.recipes.map((r) => [r.id, r]));

/** Build the day-by-day plan for a week, every recipe at its written grams. */
export function planFromWeek(family: FamilyFile, week: WeekDay[], size: PlanSize): MealPlan {
  const recipes = recipeMap(family);
  const covers = (family.sizes[size]?.covers ?? []).map((c) => parseCovers(c)).filter((b): b is CalorieBand => !!b);
  const style = PLAN_STYLES[family.style];
  const lifeStage = style.gates.lifeStage ?? family.lifeStage ?? 'none';
  const plan: MealPlan = {
    id: `${family.id}-${size}`,
    version: 1,
    name: `${family.name} (${SIZE_LABEL[size]})`,
    band: covers.length ? { min: Math.min(...covers.map((b) => b.min)), max: Math.max(...covers.map((b) => b.max)) } : { min: 0, max: 0 },
    cuisine: family.cuisine,
    tags: [],
    author: 'Eighty',
    days: [...week]
      .sort((a, b) => a.day - b.day)
      .map((d) => {
        const perSlot = new Map<MealSlot, number>();
        return {
          day: d.day,
          meals: d.meals.map((m) => {
            const k = perSlot.get(m.slot) ?? 0;
            perSlot.set(m.slot, k + 1);
            return mealFrom(recipes.get(m.recipe)!, m.slot, `${family.id}-${size}-d${d.day}-${m.slot}${k + 1}`, m.leftover);
          }),
        };
      }),
    familyId: family.id,
    size,
    covers,
    style: family.style,
    lifeStage,
  };
  if (family.summary) {
    plan.summary = family.summary;
    plan.description = family.summary;
  }
  if (family.howItWorks) plan.howItWorks = family.howItWorks;
  if (family.signature?.length) plan.signature = family.signature;
  if (family.regions?.length) plan.regions = family.regions;
  if (style.gates.slotNames) plan.slotNames = style.gates.slotNames;
  return plan;
}

/** The diet labels a plan earns from its foods: vegan, vegetarian, pescatarian, gluten-free, dairy-free, nut-free. */
export function dietTagsOf(plan: Pick<MealPlan, 'days'>, foods: FoodIndex): string[] {
  const tags: [string, keyof typeof FOOD_BANS][] = [
    ['vegan', 'animal'],
    ['vegetarian', 'flesh'],
    ['pescatarian', 'meat-poultry'],
    ['gluten-free', 'gluten'],
    ['dairy-free', 'dairy'],
    ['nut-free', 'nuts'],
  ];
  const ok = new Map(tags.map(([t]) => [t, true]));
  for (const d of plan.days)
    for (const m of d.meals)
      for (const i of m.ingredients) {
        const f = getFood(foods, i.foodId);
        if (!f) continue;
        for (const [tag, ban] of tags) if (ok.get(tag) && FOOD_BANS[ban](f)) ok.set(tag, false);
      }
  return tags.filter(([t]) => ok.get(t)).map(([t]) => t);
}

/** Who the lab sizes for: the adult woman (the harder case for iron and at low calories), with the family's life stage. */
export function sizingPerson(plan: Pick<MealPlan, 'lifeStage'>) {
  return { sex: 'female' as const, age: 40, lifeStage: plan.lifeStage ?? ('none' as LifeStage), diet: [] as string[] };
}

/** Size every day of a plan to `kcal` with the app's own engine. `dayKcal` is what each day actually reached. */
export function sizePlan(plan: MealPlan, kcal: number, ctx: CompileContext): { plan: MealPlan; dayKcal: number[] } {
  const person = sizingPerson(plan);
  const dayKcal: number[] = [];
  const days = plan.days.map((d) => {
    const p = personalizeDay(d, person, { foods: ctx.foods, catalog: ctx.catalog, groups: ctx.groups, targetKcal: kcal });
    dayKcal.push(p.kcal);
    return { ...d, meals: d.meals.map((m) => ({ ...m, ingredients: p.meals.get(m.id) ?? m.ingredients })) };
  });
  return { plan: { ...plan, days }, dayKcal };
}

export interface CompiledSize {
  size: PlanSize;
  kcal: number;
  covers: CalorieBand[];
  plan: MealPlan;
  problems: string[];
}

/** One size of a family as a MealPlan: Standard as written, the others adjusted and then sized to their calories. */
export function compileSize(family: FamilyFile, size: PlanSize, ctx: CompileContext): CompiledSize | undefined {
  const spec = family.sizes[size];
  if (!spec) return undefined;
  const { week, problems } = applyAdjust(family.week, spec.adjust);
  let plan = planFromWeek(family, week, size);
  if (size !== 'standard') plan = sizePlan(plan, spec.kcal, ctx).plan;
  plan.tags = dietTagsOf(plan, ctx.foods);
  plan.carbStyle = carbStyleOfPlan(plan, ctx.foods);
  return { size, kcal: spec.kcal, covers: plan.covers ?? [], plan, problems };
}

export function compileFamily(family: FamilyFile, ctx: CompileContext): CompiledSize[] {
  return SIZES.map((s) => compileSize(family, s, ctx)).filter((c): c is CompiledSize => !!c);
}

// ── The library: recipes.json and libraryPlans.json ────────────────────────

const compactObject = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && !v.length))) as T;

export function recipesOf(family: FamilyFile): LibraryRecipe[] {
  const slotCount = new Map<string, Map<MealSlot, number>>();
  for (const d of family.week)
    for (const m of d.meals) {
      const c = slotCount.get(m.recipe) ?? new Map<MealSlot, number>();
      c.set(m.slot, (c.get(m.slot) ?? 0) + 1);
      slotCount.set(m.recipe, c);
    }
  return family.recipes.map((r) => {
    const counts = [...(slotCount.get(r.id) ?? new Map<MealSlot, number>())];
    const slot = counts.sort((a, b) => b[1] - a[1] || slotRank(a[0]) - slotRank(b[0]))[0]?.[0] ?? 'dinner';
    return compactObject({
      id: r.id,
      family: family.id,
      name: r.name,
      slot,
      inspiredBy: r.inspiredBy,
      about: r.about,
      steps: r.steps,
      prepMin: r.prepMin,
      cookMin: r.cookMin,
      servings: r.servings,
      tags: r.tags,
      tip: r.tip,
      ingredients: r.ingredients.map((i): LibraryIngredient => (i.note ? [i.food, i.g, i.swap ?? '', i.note] : i.swap ? [i.food, i.g, i.swap] : [i.food, i.g])),
    });
  });
}

/** The 1 or 2 board nutrients a meal gives the most of, as a share of the adult woman's RDA. */
export function mealHeroes(meal: Meal, foods: FoodIndex, lifeStage: LifeStage = 'none'): Hero[] {
  const progress = boardProgress(ingredientsTotal(meal.ingredients, foods), { sex: 'female', age: 40, lifeStage }, BOARD_KEYS)
    .filter((p) => p.amount != null)
    .sort((a, b) => b.pct - a.pct);
  const top = progress.slice(0, 2).map((p) => ({ key: p.key, pct: Math.round(p.pct * 100) / 100 }));
  return top.length > 1 && top[1].pct < 0.25 ? top.slice(0, 1) : top;
}

export function compactPlan(plan: MealPlan, foods: FoodIndex): CompactPlan {
  return compactObject({
    id: plan.id,
    familyId: plan.familyId!,
    size: plan.size!,
    name: plan.name,
    cuisine: plan.cuisine,
    style: plan.style!,
    carbStyle: plan.carbStyle!,
    covers: (plan.covers ?? []).map((b): [number, number] => [b.min, b.max]),
    tags: plan.tags,
    summary: plan.summary,
    howItWorks: plan.howItWorks,
    signature: plan.signature,
    regions: plan.regions,
    lifeStage: plan.lifeStage && plan.lifeStage !== 'none' ? plan.lifeStage : undefined,
    slotNames: plan.slotNames,
    days: plan.days.map((d) => ({
      day: d.day,
      meals: d.meals.map((m) =>
        compactObject({
          recipe: m.recipeId!,
          slot: m.slot,
          g: m.ingredients.map((i) => i.grams),
          leftover: m.leftover,
          heroes: mealHeroes(m, foods, plan.lifeStage),
        }),
      ),
    })),
  });
}

// ── Reading a recipe ───────────────────────────────────────────────────────

const FRACTIONS: [number, string][] = [[0, ''], [0.25, '¼'], [0.5, '½'], [0.75, '¾']];

function quantity(x: number): string {
  const whole = Math.floor(x);
  const frac = x - whole;
  const best = [...FRACTIONS, [1, '']].reduce((a, b) => (Math.abs((b[0] as number) - frac) < Math.abs((a[0] as number) - frac) ? b : a));
  const w = best[0] === 1 ? whole + 1 : whole;
  const text = `${w || ''}${best[1]}`;
  return text || '¼';
}

const PLURALS = new Set(['cup', 'slice', 'clove', 'container', 'fillet', 'piece', 'stalk', 'stem', 'bunch', 'can', 'wedge', 'sprig', 'sheet', 'spear', 'ear', 'floret']);

/**
 * "about 1½ cups, chopped": a household measure for `grams` of a food that lists servings, or undefined when no serving fits
 * (between a quarter and 8 of the unit). Prefers the food's first serving.
 */
export function householdMeasure(food: Pick<Food, 'servings'>, grams: number): string | undefined {
  for (const s of food.servings ?? []) {
    const lead = /^(\d+(?:\.\d+)?|\d+\/\d+)\s+(.*)$/.exec(s.label);
    const unitCount = lead ? (lead[1].includes('/') ? +lead[1].split('/')[0] / +lead[1].split('/')[1] : +lead[1]) : 1;
    const unit = lead ? lead[2] : s.label;
    const n = Math.round(((grams / s.g) * unitCount) * 4) / 4;
    if (s.g <= 0 || n < 0.25 || n > 8) continue;
    const first = unit.split(/[ ,]/)[0];
    const text = n > 1 && PLURALS.has(first) ? unit.replace(first, `${first}s`) : unit;
    return `about ${quantity(n)} ${text}`;
  }
  return undefined;
}
