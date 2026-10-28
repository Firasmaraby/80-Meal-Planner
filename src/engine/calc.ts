import { BOARD_KEYS, COMPLETE_AT } from './nutrients';
import { requirement, requirementsFor, SODIUM_LIMIT_MG, type Requirement } from './dri';
import type {
  Activity,
  CalorieBand,
  Food,
  Ingredient,
  LogItem,
  Meal,
  NutrientKey,
  NutrientVector,
  PlanDay,
  Profile,
} from './types';

export type FoodIndex = Map<string, Food> | Record<string, Food>;

export function getFood(index: FoodIndex, id: string): Food | undefined {
  return index instanceof Map ? index.get(id) : index[id];
}

// ── Vectors ────────────────────────────────────────────────────────────────

/**
 * Nutrients are summed with "known" tracking: a key that is null for every
 * contributing food stays undefined in the total, so the UI can say "no data"
 * instead of a misleading 0%.
 */
export function scaled(food: Food, grams: number): NutrientVector {
  const f = grams / 100;
  const out: NutrientVector = {};
  for (const k in food.n) {
    const v = food.n[k as NutrientKey];
    if (v != null) out[k as NutrientKey] = v * f;
  }
  return out;
}

export function addInto(acc: NutrientVector, v: NutrientVector): NutrientVector {
  for (const k in v) {
    const x = v[k as NutrientKey];
    if (x == null) continue;
    acc[k as NutrientKey] = (acc[k as NutrientKey] ?? 0) + x;
  }
  return acc;
}

export function sum(vectors: NutrientVector[]): NutrientVector {
  return vectors.reduce<NutrientVector>((acc, v) => addInto(acc, v), {});
}

export function diff(a: NutrientVector, b: NutrientVector): NutrientVector {
  const out: NutrientVector = {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<NutrientKey>;
  for (const k of keys) out[k] = (a[k] ?? 0) - (b[k] ?? 0);
  return out;
}

export function ingredientsTotal(ings: Ingredient[], foods: FoodIndex): NutrientVector {
  const acc: NutrientVector = {};
  for (const ing of ings) {
    const food = getFood(foods, ing.foodId);
    if (food) addInto(acc, scaled(food, ing.grams));
  }
  return acc;
}

export const mealTotal = (meal: Meal, foods: FoodIndex) => ingredientsTotal(meal.ingredients, foods);

export function dayPlanTotal(day: PlanDay, foods: FoodIndex): NutrientVector {
  return sum(day.meals.map((m) => mealTotal(m, foods)));
}

export function logsTotal(logs: LogItem[], foods: FoodIndex): NutrientVector {
  const acc: NutrientVector = {};
  for (const l of logs) {
    const food = getFood(foods, l.foodId);
    if (food) addInto(acc, scaled(food, l.grams));
  }
  return acc;
}

// ── Energy & targets ───────────────────────────────────────────────────────

const ACTIVITY: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  athlete: 1.9,
};

/** Mifflin-St Jeor resting energy expenditure. */
export function bmr(p: Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

export function tdee(p: Profile): number {
  let e = bmr(p) * ACTIVITY[p.activity];
  if (p.sex === 'female' && p.lifeStage === 'pregnant') e += 340; // 2nd-trimester average
  if (p.sex === 'female' && p.lifeStage === 'lactating') e += 330;
  return e;
}

export function calorieTarget(p: Profile): number {
  const e = tdee(p);
  // no aggressive deficits while pregnant/lactating
  if (p.lifeStage !== 'none') return Math.round(e);
  if (p.goal === 'lose') return Math.round(Math.max(e - 500, e * 0.8));
  if (p.goal === 'gain') return Math.round(e + Math.min(400, e * 0.12));
  return Math.round(e);
}

export const BAND_STEP = 200;

export function bandFor(kcal: number): CalorieBand {
  const min = Math.max(1200, Math.floor(kcal / BAND_STEP) * BAND_STEP);
  return { min, max: min + BAND_STEP };
}

export const bandLabel = (b: CalorieBand) => `${b.min.toLocaleString()}–${b.max.toLocaleString()}`;

export interface MacroTargets {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  satFatMax: number; // grams
}

export function macroTargets(p: Profile, kcal = calorieTarget(p)): MacroTargets {
  const protein = Math.round(p.proteinPerKg * p.weightKg);
  const fat = Math.round((kcal * 0.3) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs, satFatMax: Math.round((kcal * (p.satFatPct / 100)) / 9) };
}

// ── Board progress ─────────────────────────────────────────────────────────

export interface NutrientProgress {
  key: NutrientKey;
  amount: number | undefined; // undefined = no data
  req: Requirement;
  /** fraction of the full RDA/AI (0.8 = complete) */
  pct: number;
  complete: boolean;
  overUL: boolean;
}

export function boardProgress(
  totals: NutrientVector,
  p: Pick<Profile, 'sex' | 'age' | 'lifeStage'>,
  keys: NutrientKey[] = BOARD_KEYS,
): NutrientProgress[] {
  const reqs = requirementsFor(keys, p);
  return keys
    .filter((k) => reqs[k])
    .map((k) => {
      const req = reqs[k]!;
      const amount = totals[k] ?? undefined;
      const pct = amount == null ? 0 : amount / req.rda;
      return {
        key: k,
        amount: amount ?? undefined,
        req,
        pct,
        complete: pct >= COMPLETE_AT,
        overUL: req.ul != null && amount != null && amount > req.ul,
      };
    });
}

/**
 * An "Eighty day": at least 80% of the board nutrients that have data reached 80%.
 * Nutrients with no data at all (e.g. biotin) are excluded rather than counted as misses.
 */
export function dayScore(progress: NutrientProgress[]) {
  const scored = progress.filter((x) => x.amount != null);
  const done = scored.filter((x) => x.complete).length;
  const ratio = scored.length ? done / scored.length : 0;
  return { done, of: scored.length, ratio, eightyDay: ratio >= COMPLETE_AT };
}

// ── Framework pillars ──────────────────────────────────────────────────────

export function omega3(v: NutrientVector): number | undefined {
  const parts = [v.ala, v.epa, v.dha].filter((x): x is number => x != null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : undefined;
}

/** Omega-6 : omega-3 ratio (LA ÷ ALA+EPA+DHA). */
export function omegaRatio(v: NutrientVector): number | undefined {
  const o3 = omega3(v);
  if (v.la == null || o3 == null || o3 <= 0) return undefined;
  return v.la / o3;
}

export function satFatPctOfKcal(v: NutrientVector): number | undefined {
  if (!v.kcal || v.satFat == null) return undefined;
  return ((v.satFat * 9) / v.kcal) * 100;
}

/** Glycemic load of a portion: GI × available carbohydrate (g) / 100. */
export function glycemicLoad(food: Food, grams: number): number {
  if (food.gi == null || food.n.carbs == null) return 0;
  const avail = Math.max(0, food.n.carbs - (food.n.fiber ?? 0)) * (grams / 100);
  return (food.gi * avail) / 100;
}

export function logsGlycemicLoad(logs: { foodId: string; grams: number }[], foods: FoodIndex): number {
  let gl = 0;
  for (const l of logs) {
    const f = getFood(foods, l.foodId);
    if (f) gl += glycemicLoad(f, l.grams);
  }
  return gl;
}

export type PillarStatus = 'good' | 'watch' | 'over' | 'none';

export interface Pillars {
  protein: { amount: number; target: number; status: PillarStatus };
  fiber: { amount: number; target: number; status: PillarStatus };
  satFat: { pct: number | undefined; max: number; status: PillarStatus };
  omega: { ratio: number | undefined; target: number; status: PillarStatus };
  glycemicLoad: { amount: number; max: number; status: PillarStatus };
  sodium: { amount: number; max: number; status: PillarStatus };
}

export const OMEGA_RATIO_TARGET = 4;
/** Daily glycemic load: ≤100 is generally considered low-to-moderate. */
export const DAILY_GL_MAX = 100;

export function pillars(
  totals: NutrientVector,
  gl: number,
  p: Profile,
  macros: MacroTargets = macroTargets(p),
): Pillars {
  const fiberReq = requirement('fiber', p)?.rda ?? 30;
  const sfPct = satFatPctOfKcal(totals);
  const ratio = omegaRatio(totals);
  const protein = totals.protein ?? 0;
  const fiber = totals.fiber ?? 0;
  const sodium = totals.sodium ?? 0;
  const atLeast = (x: number, t: number): PillarStatus => (x >= t * COMPLETE_AT ? 'good' : 'watch');
  const atMost = (x: number | undefined, t: number): PillarStatus =>
    x == null ? 'none' : x <= t ? 'good' : x <= t * 1.25 ? 'watch' : 'over';
  return {
    protein: { amount: protein, target: macros.protein, status: atLeast(protein, macros.protein) },
    fiber: { amount: fiber, target: fiberReq, status: atLeast(fiber, fiberReq) },
    satFat: { pct: sfPct, max: p.satFatPct, status: atMost(sfPct, p.satFatPct) },
    omega: { ratio, target: OMEGA_RATIO_TARGET, status: atMost(ratio, OMEGA_RATIO_TARGET) },
    glycemicLoad: { amount: gl, max: DAILY_GL_MAX, status: atMost(gl, DAILY_GL_MAX) },
    sodium: { amount: sodium, max: SODIUM_LIMIT_MG, status: atMost(sodium, SODIUM_LIMIT_MG) },
  };
}

// ── Swaps ──────────────────────────────────────────────────────────────────

export type SwapMode = 'calories' | 'grams';

export interface SwapOption {
  food: Food;
  grams: number;
  delta: NutrientVector; // candidate − original
  /** biggest board changes in % of RDA points, sorted by magnitude */
  highlights: { key: NutrientKey; pctPoints: number }[];
}

export const roundGrams = (g: number) => (g < 20 ? Math.max(1, Math.round(g)) : Math.round(g / 5) * 5);

export function swapGrams(original: Food, originalGrams: number, candidate: Food, mode: SwapMode): number {
  if (mode === 'grams') return originalGrams;
  const kcalOrig = (original.n.kcal ?? 0) * (originalGrams / 100);
  const per100 = candidate.n.kcal ?? 0;
  if (kcalOrig <= 0 || per100 <= 0) return originalGrams;
  // calorie-match, but never more than 3× the original volume (e.g. swapping nuts for greens)
  return roundGrams(Math.min((kcalOrig / per100) * 100, originalGrams * 3));
}

export function swapOptions(
  ing: Ingredient,
  candidates: Food[],
  foods: FoodIndex,
  p: Pick<Profile, 'sex' | 'age' | 'lifeStage'>,
  mode: SwapMode = 'calories',
): SwapOption[] {
  const original = getFood(foods, ing.foodId);
  if (!original) return [];
  const base = scaled(original, ing.grams);
  const reqs = requirementsFor(BOARD_KEYS, p);
  return candidates
    .filter((c) => c.id !== original.id)
    .map((food) => {
      const grams = swapGrams(original, ing.grams, food, mode);
      const delta = diff(scaled(food, grams), base);
      // only compare nutrients both foods actually report: missing data is unknown, not a loss
      const highlights = BOARD_KEYS.filter((k) => reqs[k] && delta[k] && food.n[k] != null && original.n[k] != null)
        .map((k) => ({ key: k, pctPoints: ((delta[k] ?? 0) / reqs[k]!.rda) * 100 }))
        .filter((h) => Math.abs(h.pctPoints) >= 5)
        .sort((a, b) => Math.abs(b.pctPoints) - Math.abs(a.pctPoints));
      return { food, grams, delta, highlights };
    });
}

// ── Gap Closer ─────────────────────────────────────────────────────────────

const MAX_PORTION: Partial<Record<Food['category'], number>> = {
  nut_seed: 40,
  oil_fat: 15,
  condiment: 20,
  fruit: 250,
  vegetable: 200,
  legume: 200,
  grain: 200,
  dairy: 250,
  fish: 170,
  meat: 150,
  poultry: 170,
  egg: 150,
  beverage: 350,
  sweet: 30,
};

export interface GapSuggestion {
  nutrient: NutrientKey;
  food: Food;
  grams: number;
  kcal: number;
  /** other unmet nutrients this portion also moves ≥10 points */
  alsoHelps: NutrientKey[];
}

/**
 * For each unfinished nutrient, find the whole food that closes the gap to 80%
 * at the lowest calorie cost within a realistic portion.
 */
export function gapCloser(
  progress: NutrientProgress[],
  foods: Food[],
  opts: { limit?: number; exclude?: (f: Food) => boolean } = {},
): GapSuggestion[] {
  const unmet = progress.filter((x) => !x.complete && x.key !== 'b7' && x.key !== 'iodine');
  const pool = foods.filter(
    (f) => !f.rare && (f.rank ?? 50) >= 40 && f.category !== 'sweet' && !f.tags?.includes('processed') && !opts.exclude?.(f),
  );
  const out: GapSuggestion[] = [];
  for (const u of unmet.sort((a, b) => a.pct - b.pct)) {
    const remaining = u.req.rda * COMPLETE_AT - (u.amount ?? 0);
    let best: GapSuggestion | undefined;
    for (const f of pool) {
      const per100 = f.n[u.key];
      if (!per100 || per100 <= 0) continue;
      const grams = roundGrams((remaining / per100) * 100 + 0.5);
      if (grams > (MAX_PORTION[f.category] ?? 150)) continue;
      const kcal = ((f.n.kcal ?? 0) * grams) / 100;
      const alsoHelps = unmet
        .filter((o) => o.key !== u.key)
        .filter((o) => ((f.n[o.key] ?? 0) * grams) / 100 / o.req.rda >= 0.1)
        .map((o) => o.key);
      // cost: calories, discounted for every other gap it helps with
      const cost = kcal / (1 + 0.35 * alsoHelps.length);
      const bestCost = best ? best.kcal / (1 + 0.35 * best.alsoHelps.length) : Infinity;
      if (cost < bestCost) best = { nutrient: u.key, food: f, grams, kcal, alsoHelps };
    }
    if (best) out.push(best);
    if (out.length >= (opts.limit ?? 3)) break;
  }
  return out;
}

// ── Food "as micros" ───────────────────────────────────────────────────────

/** Top board nutrients a portion delivers, as % of the user's RDA. */
export function foodHighlights(
  food: Food,
  grams: number,
  p: Pick<Profile, 'sex' | 'age' | 'lifeStage'>,
  limit = 4,
) {
  const v = scaled(food, grams);
  return boardProgress(v, p)
    .filter((x) => x.amount != null && x.pct >= 0.1)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
}
