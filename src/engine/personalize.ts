/**
 * Personalising a plan without breaking it.
 *
 * 1. Dislikes: an ingredient the person won't eat is swapped for the food in its swap
 *    group (or, failing that, its category) whose micronutrient profile is closest,
 *    calorie-matched. Micros are what the plan was built for, so that's what we match.
 * 2. Sizing: each day is scaled to the person's calorie target. Vegetables and fruit stay
 *    fixed; oils and grains flex most, legumes, nuts and fish least (see FLEX).
 */
import { BOARD_KEYS } from './nutrients';
import { requirementsFor } from './dri';
import { boardProgress, getFood, ingredientsTotal, roundGrams, scaled, swapGrams, type FoodIndex } from './calc';
import { COMPLETE_AT } from './nutrients';
import type { Food, Ingredient, PlanDay, Profile, SwapGroup } from './types';

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
// Sizing DOWN doesn't use these weights; see sizeDayDown (micros first).
const flexOf = (f: Food | undefined, _t: number) => (f ? (FLEX[f.category] ?? 1) : 1);

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
  if (diet.includes('vegan') && ['meat', 'poultry', 'fish', 'dairy', 'egg'].includes(f.category)) return false;
  if (diet.includes('vegetarian') && ['meat', 'poultry', 'fish'].includes(f.category)) return false;
  if (diet.includes('pescatarian') && ['meat', 'poultry'].includes(f.category)) return false;
  if (diet.includes('dairy-free') && f.category === 'dairy') return false;
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

export function scaleIngredients(ings: Ingredient[], t: number, foods: FoodIndex): Ingredient[] {
  if (Math.abs(t) < 0.005) return ings;
  return ings.map((ing) => {
    const f = getFood(foods, ing.foodId);
    const m = multiplier(f, t);
    return m === 1 ? ing : { ...ing, grams: roundGrams(ing.grams * m) };
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
export function sizeDayDown(meals: Ingredient[][], targetKcal: number, foods: FoodIndex, who: Who): Ingredient[][] {
  const out = meals.map((m) => m.map((i) => ({ ...i })));
  const orig = meals.map((m) => m.map((i) => i.grams));
  const kcalOf = () => out.flat().reduce((n, i) => n + ((getFood(foods, i.foodId)?.n.kcal ?? 0) * i.grams) / 100, 0);
  const progress = () => boardProgress(ingredientsTotal(out.flat(), foods), who);
  const protectedKeys = new Set(progress().filter((p) => p.complete).map((p) => p.key));
  let kcal = kcalOf();
  for (let round = 0; round < 200 && kcal > targetKcal; round++) {
    const before = new Map(progress().map((p) => [p.key, p.pct]));
    let best: { mi: number; ii: number; grams: number; score: number } | undefined;
    out.forEach((meal, mi) =>
      meal.forEach((ing, ii) => {
        const f = getFood(foods, ing.foodId);
        if (!f || FIXED_CATEGORIES.has(f.category) || !f.n.kcal) return;
        if (ing.grams <= orig[mi][ii] * MIN_MULT + 0.5) return;
        const grams = Math.max(orig[mi][ii] * MIN_MULT, ing.grams * 0.9);
        const saved = (f.n.kcal * (ing.grams - grams)) / 100;
        const was = ing.grams;
        ing.grams = grams;
        const after = progress();
        ing.grams = was;
        // any protected tile falling under 80% rules this cut out
        if (after.some((p) => protectedKeys.has(p.key) && p.pct < COMPLETE_AT)) return;
        const loss = after.reduce((n, p) => n + Math.max(0, (before.get(p.key) ?? 0) - p.pct), 0);
        const score = saved / (loss + 0.01);
        if (!best || score > best.score) best = { mi, ii, grams, score };
      }),
    );
    if (!best) break;
    out[best.mi][best.ii].grams = best.grams;
    kcal = kcalOf();
  }
  // round UP to friendly amounts so rounding can't nudge a protected tile under 80%
  const up = (g: number) => (g < 20 ? Math.ceil(g) : Math.ceil(g / 5) * 5);
  return out.map((m) => m.map((i) => ({ ...i, grams: up(i.grams) })));
}

const FIXED_CATEGORIES = new Set<Food['category']>(['vegetable', 'fruit']);

export interface PersonalizeOptions {
  foods: FoodIndex;
  catalog: Food[];
  groups: SwapGroup[];
  /** the day's calorie target; omit to skip sizing */
  targetKcal?: number;
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
  if (opts.targetKcal && opts.targetKcal < before - 10) sized = sizeDayDown(swapped, opts.targetKcal, opts.foods, profile);
  else if (opts.targetKcal && opts.targetKcal > before + 10) {
    const t = daySizing(swapped, opts.targetKcal, opts.foods);
    sized = swapped.map((ings) => scaleIngredients(ings, t, opts.foods));
  }
  const after = sized.flat().reduce((n, i) => n + ((getFood(opts.foods, i.foodId)?.n.kcal ?? 0) * i.grams) / 100, 0);
  const meals = new Map(day.meals.map((m, i) => [m.id, sized[i]]));
  return { meals, factor: before ? after / before : 1, kcal: after, swaps, unresolved: [...new Set(unresolved)] };
}
