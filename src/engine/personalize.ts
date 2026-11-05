/**
 * Personalising a plan without breaking it.
 *
 * 1. Dislikes: an ingredient the person won't eat is swapped for the food in its swap
 *    group (or, failing that, its category) whose micronutrient profile is closest,
 *    calorie-matched. Micros are what the plan was built for, so that's what we match.
 * 2. Sizing: each day is scaled to the person's calorie target. Vegetables and fruit stay
 *    fixed (starchy ones like potatoes size like grains); oils and grains flex most, legumes, nuts and fish least (see FLEX).
 */
import { BOARD_KEYS } from './nutrients';
import { requirementsFor } from './dri';
import { isPlantDairy, isProteinSource } from './foodRoles';
import { boardProgress, getFood, ingredientsTotal, roundGrams, scaled, swapGrams, type FoodIndex } from './calc';
import { COMPLETE_AT } from './nutrients';
import type { Food, Ingredient, MealSlot, NutrientKey, NutrientVector, PlanDay, Profile, SwapGroup } from './types';

/** "salmon-atlantic-farmed-cooked" or a whole category: "cat:fish" */
export type Dislike = string;

export const isDisliked = (food: Food | undefined, dislikes: Dislike[]) =>
  !!food &&
  (dislikes.includes(food.id) ||
    dislikes.includes(`cat:${food.category}`) ||
    // dislikes saved under an id from before the food library was rebuilt
    !!food.legacyIds?.some((id) => dislikes.includes(id)));

/**
 * How much each kind of food flexes when a day is sized up or down.
 * Vegetables and fruit never move (they carry the micros for few calories); oils and grains
 * move most (dense calories, fewer micros); legumes, nuts and fish move least.
 */
const FLEX: Partial<Record<Food['category'], number>> = {
  vegetable: 0,
  fruit: 0,
  oil_fat: 1.6,
  sweet: 1.6,
  grain: 1.3,
  condiment: 1,
  dairy: 0.9,
  meat: 0.9,
  poultry: 0.9,
  egg: 0.8,
  fish: 0.7,
  nut_seed: 0.6,
  legume: 0.6,
};
/** Potatoes, sweet potatoes, cassava and friends are filed as vegetables but eaten as the starch: they size like grains. */
const STARCHY_RX = /\b(?:potato(?:es)?|sweet potato|yam|cassava|yuca|plantain|taro|breadfruit|sweet corn|corn)\b/i;
const isStarchyVeg = (f: Food) => f.category === 'vegetable' && STARCHY_RX.test(f.head ?? f.name) && !/\b(?:leaves|leaf|greens|chips|starch|flour)\b/i.test(f.name);
// Sizing DOWN doesn't use these weights; see sizeDayDown (micros first).
const flexOf = (f: Food | undefined, _t: number) => (f ? (isStarchyVeg(f) ? FLEX.grain! : (FLEX[f.category] ?? 1)) : 1);

const MIN_MULT = 0.5;
const MAX_MULT = 1.8;

type Who = Pick<Profile, 'sex' | 'age' | 'lifeStage'>;

/** Distance between two portions in "% of daily need" space across the board. */
function microDistance(a: Food, aGrams: number, b: Food, bGrams: number, who: Who): number {
  const reqs = requirementsFor(BOARD_KEYS, who);
  const va = scaled(a, aGrams);
  const vb = scaled(b, bGrams);
  let d = 0;
  for (const k of BOARD_KEYS) {
    const r = reqs[k];
    if (!r) continue;
    // unknown on either side: skip rather than penalise
    if (va[k] == null || vb[k] == null) continue;
    d += Math.abs(((va[k] ?? 0) - (vb[k] ?? 0)) / r.rda);
  }
  // keep protein in the same ballpark too (a meal's protein shouldn't vanish)
  d += Math.abs(((va.protein ?? 0) - (vb.protein ?? 0)) / 50);
  // the framework's other pillars: don't trade into more saturated fat, and favour
  // fish, poultry and legumes over red meat when choosing a stand-in
  d += Math.max(0, ((vb.satFat ?? 0) - (va.satFat ?? 0)) / 3);
  if (b.category === 'meat' && a.category !== 'meat') d += 1;
  return d;
}

export interface SwapResult {
  ingredients: Ingredient[];
  swaps: { from: string; to: string; grams: number }[];
  /** disliked ingredients with no acceptable replacement (kept as-is) */
  unresolved: string[];
}

export function swapDislikes(
  ingredients: Ingredient[],
  dislikes: Dislike[],
  foods: FoodIndex,
  catalog: Food[],
  groups: SwapGroup[],
  who: Who,
  diet: string[] = [],
): SwapResult {
  if (!dislikes.length) return { ingredients, swaps: [], unresolved: [] };
  const groupOf = new Map(groups.map((g) => [g.key, g]));
  const swaps: SwapResult['swaps'] = [];
  const unresolved: string[] = [];
  const out = ingredients.map((ing) => {
    const orig = getFood(foods, ing.foodId);
    if (!orig || !isDisliked(orig, dislikes)) return ing;
    const fromGroup = ing.swapGroup ? (groupOf.get(ing.swapGroup)?.foodIds ?? []).map((id) => getFood(foods, id)) : [];
    const usable = (list: (Food | undefined)[]) =>
      list.filter((f): f is Food => !!f && f.id !== orig.id && !isDisliked(f, dislikes) && dietAllows(f, diet));
    // widen step by step: its swap group → its category → foods that play the same role
    const common = (f: Food) => !f.rare && (f.rank ?? 50) >= 50;
    let pool = usable(fromGroup);
    if (!pool.length) pool = usable(catalog.filter((f) => f.category === orig.category && common(f)));
    if (!pool.length && PROTEIN_ROLE.has(orig.category)) pool = usable(catalog.filter((f) => PROTEIN_ROLE.has(f.category) && common(f) && (f.n.protein ?? 0) >= 8));
    let best: { food: Food; grams: number; d: number } | undefined;
    for (const cand of pool) {
      const grams = swapGrams(orig, ing.grams, cand, 'calories');
      const d = microDistance(orig, ing.grams, cand, grams, who);
      if (!best || d < best.d) best = { food: cand, grams, d };
    }
    if (!best) {
      unresolved.push(orig.id);
      return ing;
    }
    swaps.push({ from: orig.id, to: best.food.id, grams: best.grams });
    return { ...ing, foodId: best.food.id, grams: best.grams };
  });
  return { ingredients: out, swaps, unresolved };
}

/** Foods that can stand in for one another as a meal's main protein. */
const PROTEIN_ROLE = new Set<Food['category']>(['fish', 'meat', 'poultry', 'egg', 'legume']);

function dietAllows(f: Food, diet: string[]): boolean {
  if (diet.includes('vegan') && ['meat', 'poultry', 'fish', 'dairy', 'egg'].includes(f.category) && !isPlantDairy(f)) return false;
  if (diet.includes('vegetarian') && ['meat', 'poultry', 'fish'].includes(f.category)) return false;
  if (diet.includes('pescatarian') && ['meat', 'poultry'].includes(f.category)) return false;
  if (diet.includes('dairy-free') && f.category === 'dairy' && !isPlantDairy(f)) return false;
  return true;
}

/**
 * The sizing parameter t that brings a day to `targetKcal`: each ingredient's grams become
 * grams × (1 + flex × t). Solved directly (it's linear), then clamped per ingredient.
 */
export function daySizing(meals: Ingredient[][], targetKcal: number, foods: FoodIndex): number {
  let total = 0;
  let flexKcal = 0;
  for (const ing of meals.flat()) {
    const f = getFood(foods, ing.foodId);
    const kcal = ((f?.n.kcal ?? 0) * ing.grams) / 100;
    total += kcal;
    flexKcal += kcal * flexOf(f, targetKcal - total);
  }
  if (flexKcal <= 0) return 0;
  // first pass ignores the per-ingredient clamp; refine so clamped items don't leave a gap
  let t = (targetKcal - total) / flexKcal;
  for (let i = 0; i < 4; i++) {
    let after = 0;
    let free = 0;
    for (const ing of meals.flat()) {
      const f = getFood(foods, ing.foodId);
      const kcal = ((f?.n.kcal ?? 0) * ing.grams) / 100;
      const m = multiplier(f, t);
      after += kcal * m;
      if (m > MIN_MULT && m < MAX_MULT) free += kcal * flexOf(f, t);
    }
    if (free <= 0 || Math.abs(after - targetKcal) < 5) break;
    t += (targetKcal - after) / free;
  }
  return t;
}

function multiplier(f: Food | undefined, t: number) {
  return Math.min(MAX_MULT, Math.max(MIN_MULT, 1 + flexOf(f, t) * t));
}

/** Overall calorie factor a sizing produces (for display: "sized to 112%"). */
export function dayScaleFactor(meals: Ingredient[][], targetKcal: number, foods: FoodIndex): number {
  const t = daySizing(meals, targetKcal, foods);
  let before = 0;
  let after = 0;
  for (const ing of meals.flat()) {
    const f = getFood(foods, ing.foodId);
    const kcal = ((f?.n.kcal ?? 0) * ing.grams) / 100;
    before += kcal;
    after += kcal * multiplier(f, t);
  }
  return before ? after / before : 1;
}

/**
 * Scale one meal by the day's sizing factor. Seasonings (the condiment shelf: salt, spices, pastes, sauces) follow the dish,
 * not the factor: they grow by the meal's own mass ratio, so a Big curry tastes like the Standard one. With vegetables held
 * fixed, scaling spice by the full factor would make the bigger plate more heavily spiced than the recipe as written.
 */
export function scaleIngredients(ings: Ingredient[], t: number, foods: FoodIndex): Ingredient[] {
  if (Math.abs(t) < 0.005) return ings;
  let massBefore = 0;
  let massAfter = 0;
  const out = ings.map((ing) => {
    const f = getFood(foods, ing.foodId);
    if (f?.category === 'condiment') return ing;
    const m = multiplier(f, t);
    massBefore += ing.grams;
    massAfter += ing.grams * m;
    return m === 1 ? ing : { ...ing, grams: roundGrams(ing.grams * m) };
  });
  const dish = massBefore > 0 ? Math.min(MAX_MULT, Math.max(MIN_MULT, massAfter / massBefore)) : multiplier(undefined, t);
  return out.map((ing) => {
    if (getFood(foods, ing.foodId)?.category !== 'condiment' || Math.abs(dish - 1) < 0.005) return ing;
    return { ...ing, grams: roundGrams(ing.grams * dish) };
  });
}

/** Foods you can only use whole: a recipe can say 2 eggs, not 1.4. Grams per unit. */
const WHOLE_UNIT = (f: Food | undefined): number | undefined =>
  f?.category === 'egg' && /^(?:duck |quail )?egg, whole\b/i.test(f.name) ? (/quail/i.test(f.name) ? 10 : /duck/i.test(f.name) ? 70 : 50) : undefined;

/**
 * Round sized whole-unit foods (eggs) to whole units. Sizing down rounds up, so rounding never costs a tile the
 * sizing protected; sizing up rounds to the nearest. Amounts the plan didn't change are left as written.
 */
export function wholeUnits(ings: Ingredient[], original: Ingredient[], foods: FoodIndex, mode: 'up' | 'nearest'): Ingredient[] {
  return ings.map((ing, i) => {
    const unit = WHOLE_UNIT(getFood(foods, ing.foodId));
    if (!unit || ing.grams === original[i]?.grams) return ing;
    const n = Math.max(1, mode === 'up' ? Math.ceil(ing.grams / unit - 0.05) : Math.round(ing.grams / unit));
    return n * unit === ing.grams ? ing : { ...ing, grams: n * unit };
  });
}

/** How far from the target a sized day may land before another band is the better fit. */
export const SIZING_TOLERANCE = 0.05;

/** After sizing: did we reach the target, and if not, which way should the person look? */
export function sizingAdvice(achievedKcal: number, targetKcal: number): { ok: boolean; suggest?: 'lower' | 'higher' } {
  const off = (achievedKcal - targetKcal) / targetKcal;
  if (Math.abs(off) <= SIZING_TOLERANCE) return { ok: true };
  return { ok: false, suggest: off > 0 ? 'lower' : 'higher' };
}

/**
 * Size a day DOWN without losing a single completed tile.
 * Greedy, in small steps: each round trims 10% off whichever ingredient saves the most
 * calories per unit of micronutrient given up, but only if every tile that was at ≥80%
 * stays at ≥80%. Vegetables and fruit are never trimmed. Stops at the target or when no
 * safe cut is left (the caller then suggests a lower-band plan).
 */
export function sizeDayDown(meals: Ingredient[][], targetKcal: number, foods: FoodIndex, who: Who | Who[]): Ingredient[][] {
  return sizeDaysDown(meals, [meals.map((_, i) => i)], targetKcal, foods, who);
}

/**
 * sizeDayDown over several days that share dishes: `dishes` are ingredient lists, `days` say which dishes each day eats
 * (a dish cooked once and eaten again as a leftover sits in two days). Every cut must keep each completed tile on every day
 * that eats the dish, and a shared dish is only trimmed while all its days are still over the target; once one of them is
 * there, the other days trim their own meals. `active` marks the days that are sized at all (all of them by default).
 * With one day this is exactly sizeDayDown.
 */
export function sizeDaysDown(dishes: Ingredient[][], days: number[][], targetKcal: number, foods: FoodIndex, who: Who | Who[], active?: boolean[]): Ingredient[][] {
  // several people: a cut must keep every tile that was complete for any of them (the plan lab grades a panel)
  const people = Array.isArray(who) ? who : [who];
  const out = dishes.map((m) => m.map((i) => ({ ...i })));
  const orig = dishes.map((m) => m.map((i) => i.grams));
  const dishDays = dishes.map((_, k) => days.flatMap((ds, d) => (ds.includes(k) ? [d] : [])));
  const isActive = (d: number) => active?.[d] ?? true;
  const totalOf = (d: number) => ingredientsTotal(days[d].flatMap((k) => out[k]), foods);
  // progress per person, keyed "<person>:<nutrient>"
  const progressOf = (t: NutrientVector) =>
    people.flatMap((w, pi) => boardProgress(t, { ...w, energyKcal: targetKcal }).map((p) => ({ ...p, key: `${pi}:${p.key}` })));
  const protectedKeys = days.map((_, d) => new Set(progressOf(totalOf(d)).filter((p) => p.complete).map((p) => p.key)));
  // a meal that started with a real protein portion keeps one: never trim its protein foods under MEAL_PROTEIN_FLOOR
  const proteinOf = (ings: Ingredient[]) =>
    ings.reduce((n, i) => {
      const f = getFood(foods, i.foodId);
      return f && isProteinSource(f) ? n + ((f.n.protein ?? 0) * i.grams) / 100 : n;
    }, 0);
  const proteinFloor = out.map((m) => Math.min(MEAL_PROTEIN_FLOOR, proteinOf(m)));
  // a dish shared with a day already at its target may still be trimmed while that day stays within this much of it
  const SHARED_SLACK = 0.03;
  for (let round = 0; round < 200 * days.length; round++) {
    const totals = days.map((_, d) => totalOf(d));
    const kcal = totals.map((t) => t.kcal ?? 0);
    const isOver = days.map((_, d) => isActive(d) && kcal[d] > targetKcal);
    if (!isOver.some(Boolean)) break;
    const before = totals.map((t) => new Map(progressOf(t).map((p) => [p.key, p.pct])));
    let best: { mi: number; ii: number; grams: number; score: number } | undefined;
    out.forEach((meal, mi) => {
      const ds = dishDays[mi];
      if (!ds.length || !ds.some((d) => isOver[d]) || !ds.every(isActive)) return;
      meal.forEach((ing, ii) => {
        const f = getFood(foods, ing.foodId);
        if (!f || (FIXED_CATEGORIES.has(f.category) && !isStarchyVeg(f)) || !f.n.kcal) return;
        if (ing.grams <= orig[mi][ii] * MIN_MULT + 0.5) return;
        const grams = Math.max(orig[mi][ii] * MIN_MULT, ing.grams * 0.9);
        if (isProteinSource(f) && proteinOf(meal) - ((f.n.protein ?? 0) * (ing.grams - grams)) / 100 < proteinFloor[mi] - 1e-6) return;
        const cut = (f.n.kcal * (ing.grams - grams)) / 100;
        // a day already at its target only lets a shared dish shrink a little further
        if (ds.some((d) => !isOver[d] && kcal[d] - cut < targetKcal * (1 - SHARED_SLACK))) return;
        let loss = 0;
        for (const d of ds) {
          // the day's totals without the part of this ingredient the cut removes
          const after: NutrientVector = { ...totals[d] };
          const share = (ing.grams - grams) / 100;
          for (const k in f.n) {
            const v = f.n[k as NutrientKey];
            if (v != null) after[k as NutrientKey] = (after[k as NutrientKey] ?? 0) - v * share;
          }
          const prog = progressOf(after);
          // any protected tile falling under 80% rules this cut out
          if (prog.some((p) => protectedKeys[d].has(p.key) && p.pct < COMPLETE_AT)) return;
          loss += prog.reduce((n, p) => n + Math.max(0, (before[d].get(p.key) ?? 0) - p.pct), 0);
        }
        const score = (cut * ds.filter((d) => isOver[d]).length) / (loss + 0.01);
        if (!best || score > best.score) best = { mi, ii, grams, score };
      });
    });
    if (!best) break;
    out[best.mi][best.ii].grams = best.grams;
  }
  // round UP to friendly amounts so rounding can't nudge a protected tile under 80%
  const up = (g: number) => (g < 2 ? Math.ceil(g * 10 - 1e-9) / 10 : g < 20 ? Math.ceil(g) : Math.ceil(g / 5) * 5);
  return out.map((m) => m.map((i) => ({ ...i, grams: up(i.grams) })));
}

const FIXED_CATEGORIES = new Set<Food['category']>(['vegetable', 'fruit']);
/** grams of protein from protein foods that a lunch or dinner keeps when a day is sized down */
const MEAL_PROTEIN_FLOOR = 15;

export interface PersonalizeOptions {
  foods: FoodIndex;
  catalog: Food[];
  groups: SwapGroup[];
  /** the day's calorie target; omit to skip sizing */
  targetKcal?: number;
  /** other people whose complete tiles sizing down must also keep (the plan lab's reference panel) */
  alsoProtect?: Who[];
}

export interface PersonalizedDay {
  /** meal id → personalised ingredients */
  meals: Map<string, Ingredient[]>;
  /** achieved calories ÷ unsized calories */
  factor: number;
  /** the sized day's calories */
  kcal: number;
  swaps: SwapResult['swaps'];
  unresolved: string[];
}

/** Apply dislikes, then size the whole day to the target. */
export function personalizeDay(
  day: PlanDay,
  profile: Pick<Profile, 'sex' | 'age' | 'lifeStage' | 'diet'> & { dislikes?: Dislike[] },
  opts: PersonalizeOptions,
): PersonalizedDay {
  const swaps: SwapResult['swaps'] = [];
  const unresolved: string[] = [];
  const swapped = day.meals.map((m) => {
    const r = swapDislikes(m.ingredients, profile.dislikes ?? [], opts.foods, opts.catalog, opts.groups, profile, profile.diet);
    swaps.push(...r.swaps);
    unresolved.push(...r.unresolved);
    return r.ingredients;
  });
  const before = swapped.flat().reduce((n, i) => n + ((getFood(opts.foods, i.foodId)?.n.kcal ?? 0) * i.grams) / 100, 0);
  let sized = swapped;
  if (opts.targetKcal && opts.targetKcal < before - 10) {
    sized = sizeDayDown(swapped, opts.targetKcal, opts.foods, [profile, ...(opts.alsoProtect ?? [])]).map((ings, i) => wholeUnits(ings, swapped[i], opts.foods, 'up'));
  } else if (opts.targetKcal && opts.targetKcal > before + 10) {
    const t = daySizing(swapped, opts.targetKcal, opts.foods);
    sized = swapped.map((ings) => wholeUnits(scaleIngredients(ings, t, opts.foods), ings, opts.foods, 'nearest'));
  }
  const after = sized.flat().reduce((n, i) => n + ((getFood(opts.foods, i.foodId)?.n.kcal ?? 0) * i.grams) / 100, 0);
  const meals = new Map(day.meals.map((m, i) => [m.id, sized[i]]));
  return { meals, factor: before ? after / before : 1, kcal: after, swaps, unresolved: [...new Set(unresolved)] };
}

// ── Leftovers across the week ───────────────────────────────────────────────

const SLOT_RANK: Record<MealSlot, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };

/**
 * For every leftover meal, the meal that cooked it: the latest cooked (not leftover) meal of the same recipe before it in
 * the week (by day, then breakfast, lunch, snack, dinner). With none before it, the last cooked one in the week: a dish
 * cooked on day 7 feeds day 1 of the next week. Keyed by the leftover's meal id.
 */
export function leftoverSources(days: PlanDay[]): Map<string, { day: number; mealId: string }> {
  const order = days
    .flatMap((d) => d.meals.map((m, i) => ({ d: d.day, m, k: d.day * 10 + SLOT_RANK[m.slot] + i / 100 })))
    .sort((a, b) => a.k - b.k);
  const out = new Map<string, { day: number; mealId: string }>();
  for (const x of order) {
    if (!x.m.leftover || !x.m.recipeId) continue;
    const cooked = order.filter((y) => !y.m.leftover && y.m.recipeId === x.m.recipeId);
    const src = [...cooked].reverse().find((y) => y.k < x.k) ?? cooked[cooked.length - 1];
    if (src) out.set(x.m.id, { day: src.d, mealId: src.m.id });
  }
  return out;
}

/**
 * Personalise a whole week so a leftover is exactly the portion cooked for it. Days with no leftover link are personalised
 * on their own, as personalizeDay does. Days linked by a dish eaten twice are sized together: the dish is one set of
 * ingredients shared by its days (sizeDaysDown when sizing down; when sizing up it grows by the mean of its days' factors
 * and each day's other meals make up the rest). Returns day number -> personalised day.
 */
export function personalizeWeek(
  days: PlanDay[],
  profile: Parameters<typeof personalizeDay>[1],
  opts: PersonalizeOptions,
): Map<number, PersonalizedDay> {
  const sources = leftoverSources(days);
  const linkedDays = new Set<number>();
  for (const [mealId, src] of sources) {
    linkedDays.add(src.day);
    linkedDays.add(days.find((d) => d.meals.some((m) => m.id === mealId))!.day);
  }
  const out = new Map<number, PersonalizedDay>();
  for (const d of days) if (!linkedDays.has(d.day) || !opts.targetKcal) out.set(d.day, personalizeDay(d, profile, opts));
  if (!opts.targetKcal || !linkedDays.size) return out;
  const target = opts.targetKcal;
  const linked = days.filter((d) => linkedDays.has(d.day));

  // one dish per cooked meal (dislikes swapped once), leftovers point at their cooking meal's dish
  const dishes: Ingredient[][] = [];
  const dishOf = new Map<string, number>();
  const swapsOf = new Map<number, { swaps: SwapResult['swaps']; unresolved: string[] }>();
  for (const d of linked) {
    const acc = { swaps: [] as SwapResult['swaps'], unresolved: [] as string[] };
    swapsOf.set(d.day, acc);
    for (const m of d.meals) {
      if (sources.has(m.id) && linked.some((x) => x.day === sources.get(m.id)!.day)) continue;
      const r = swapDislikes(m.ingredients, profile.dislikes ?? [], opts.foods, opts.catalog, opts.groups, profile, profile.diet);
      acc.swaps.push(...r.swaps);
      acc.unresolved.push(...r.unresolved);
      dishOf.set(m.id, dishes.push(r.ingredients) - 1);
    }
  }
  for (const d of linked) for (const m of d.meals) if (!dishOf.has(m.id)) dishOf.set(m.id, dishOf.get(sources.get(m.id)!.mealId)!);
  const dayDishes = linked.map((d) => d.meals.map((m) => dishOf.get(m.id)!));
  const kcalOf = (ings: Ingredient[]) => ings.reduce((n, i) => n + ((getFood(opts.foods, i.foodId)?.n.kcal ?? 0) * i.grams) / 100, 0);
  const dayKcal = (ds: Ingredient[][], d: number) => dayDishes[d].reduce((n, k) => n + kcalOf(ds[k]), 0);
  const before = linked.map((_, d) => dayKcal(dishes, d));

  // sizing down: the linked days together
  const down = before.map((k) => target < k - 10);
  let sized = dishes;
  if (down.some(Boolean)) {
    // trim each group of days joined by shared dishes on its own: fewer candidates per step, same result
    const parent = linked.map((_, d) => d);
    const root = (d: number): number => (parent[d] === d ? d : (parent[d] = root(parent[d])));
    dishes.forEach((_, k) => {
      const ds = dayDishes.flatMap((ks, d) => (ks.includes(k) ? [d] : []));
      for (const d of ds.slice(1)) parent[root(d)] = root(ds[0]);
    });
    const next = [...dishes];
    for (const r of new Set(linked.map((_, d) => root(d)))) {
      const members = linked.map((_, d) => d).filter((d) => root(d) === r);
      const ks = [...new Set(members.flatMap((d) => dayDishes[d]))];
      const local = sizeDaysDown(
        ks.map((k) => dishes[k]),
        members.map((d) => dayDishes[d].map((k) => ks.indexOf(k))),
        target,
        opts.foods,
        [profile, ...(opts.alsoProtect ?? [])],
        members.map((d) => down[d]),
      );
      ks.forEach((k, j) => (next[k] = wholeUnits(local[j], dishes[k], opts.foods, 'up')));
    }
    sized = next;
  }
  // sizing up: a shared dish grows by the mean factor of its days, then each day's own dishes make up the rest
  const up = before.map((k) => target > k + 10);
  if (up.some(Boolean)) {
    const tOf = linked.map((_, d) => (up[d] ? daySizing(dayDishes[d].map((k) => dishes[k]), target, opts.foods) : 0));
    const daysOf = dishes.map((_, k) => dayDishes.flatMap((ks, d) => (ks.includes(k) ? [d] : [])));
    const next = [...sized];
    const fixed = new Set<number>();
    daysOf.forEach((ds, k) => {
      if (ds.length < 2 || !ds.every((d) => up[d])) return;
      const t = ds.reduce((n, d) => n + tOf[d], 0) / ds.length;
      next[k] = wholeUnits(scaleIngredients(dishes[k], t, opts.foods), dishes[k], opts.foods, 'nearest');
      fixed.add(k);
    });
    linked.forEach((_, d) => {
      if (!up[d]) return;
      const own = dayDishes[d].filter((k) => daysOf[k].length < 2);
      const rest = target - dayDishes[d].filter((k) => !own.includes(k)).reduce((n, k) => n + kcalOf(next[k]), 0);
      const t = own.length ? daySizing(own.map((k) => dishes[k]), rest, opts.foods) : 0;
      for (const k of own) next[k] = wholeUnits(scaleIngredients(dishes[k], t, opts.foods), dishes[k], opts.foods, 'nearest');
    });
    sized = next;
  }

  linked.forEach((d, i) => {
    const after = dayKcal(sized, i);
    const acc = swapsOf.get(d.day)!;
    out.set(d.day, {
      meals: new Map(d.meals.map((m) => [m.id, sized[dishOf.get(m.id)!]])),
      factor: before[i] ? after / before[i] : 1,
      kcal: after,
      swaps: acc.swaps,
      unresolved: [...new Set(acc.unresolved)],
    });
  });
  return out;
}
