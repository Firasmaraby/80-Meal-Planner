/**
 * Plan families: the app shows one card per family, and the family's sizes (Light, Standard, Big, XL) are one tap away.
 * A plan without a `familyId` (the bundled samples, anything a person uploaded) is a family of one.
 *
 * Pure functions: the hooks that feed them live in src/state/families.ts.
 */
import { bandFor } from './calc';
import type { FoodIndex } from './calc';
import { carbStyleFits, carbStyleOfMeal, carbStyleOfPlan } from './carbStyle';
import type { CalorieBand, CarbStyle, LifeStage, Meal, MealPlan, PlanSize, PlanStyle } from './types';

export const SIZE_ORDER: PlanSize[] = ['light', 'standard', 'big', 'xl'];
export const SIZE_LABEL: Record<PlanSize, string> = { light: 'Light', standard: 'Standard', big: 'Big', xl: 'XL' };

const sizeRank = (p: Pick<MealPlan, 'size'>) => (p.size ? SIZE_ORDER.indexOf(p.size) : SIZE_ORDER.length);
const SIZE_SUFFIX = /\s*\((Light|Standard|Big|XL)\)\s*$/;

/** A library plan is named "Family name (Size)"; the family is just "Family name". Other plans keep their name. */
export const planFamilyName = (plan: Pick<MealPlan, 'name' | 'familyId' | 'size'>) =>
  plan.familyId && plan.size ? plan.name.replace(SIZE_SUFFIX, '') : plan.name;

export interface PlanFamily {
  /** `familyId`, or the plan's own id for a plan that is not part of a family */
  id: string;
  name: string;
  cuisine: string;
  style?: PlanStyle;
  regions: string[];
  summary?: string;
  howItWorks?: string;
  /** recipe ids of the dishes that define the family */
  signature: string[];
  tags: string[];
  lifeStage?: LifeStage;
  slotNames?: MealPlan['slotNames'];
  /** true when the family is part of the built-in plan library (it has a familyId) */
  isLibrary: boolean;
  /** every size, smallest first; a family of one holds just the plan */
  sizes: MealPlan[];
}

/** Light to XL; plans without a size come last, in the order they came in. */
const bySize = (a: MealPlan, b: MealPlan) => sizeRank(a) - sizeRank(b);

/** Group plans into families, in the order the families first appear. */
export function groupFamilies(plans: MealPlan[]): PlanFamily[] {
  const groups = new Map<string, MealPlan[]>();
  for (const p of plans) {
    const key = p.familyId ?? p.id;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.entries()].map(([id, members]): PlanFamily => {
    const sizes = [...members].sort(bySize);
    // the family reads as its Standard size, or the first one it has
    const lead = sizes.find((p) => p.size === 'standard') ?? sizes[0];
    return {
      id,
      name: planFamilyName(lead),
      cuisine: lead.cuisine,
      style: lead.style,
      regions: lead.regions ?? [],
      summary: lead.summary ?? lead.description,
      howItWorks: lead.howItWorks,
      signature: lead.signature ?? [],
      tags: lead.tags,
      lifeStage: lead.lifeStage,
      slotNames: lead.slotNames,
      isLibrary: !!lead.familyId,
      sizes,
    };
  });
}

/** The calorie bands a plan was verified for. A plan without `covers` covers its own band. */
export const coversOf = (plan: Pick<MealPlan, 'covers' | 'band'>): CalorieBand[] => (plan.covers?.length ? plan.covers : [plan.band]);

export const bandKeyOf = (b: CalorieBand) => `${b.min}-${b.max}`;

/**
 * The calorie level to size a plan to: the person's target, kept inside the bands the plan lab checked. A plan is only
 * proven at its covered edges (a pregnancy plan's iron cap, a muscle plan's upper limits), so the app never stretches
 * it past them; the sizing note then tells the person a higher- or lower-calorie plan fits them better.
 */
export function sizingTargetFor(plan: Pick<MealPlan, 'covers' | 'band'>, target: number): number {
  const bands = coversOf(plan);
  const lo = Math.min(...bands.map((b) => b.min));
  const hi = Math.max(...bands.map((b) => b.max));
  return Math.min(hi, Math.max(lo, target));
}

/** Every band any size of the family covers, lowest first. */
export function familyBands(family: PlanFamily): CalorieBand[] {
  const byKey = new Map<string, CalorieBand>();
  for (const p of family.sizes) for (const b of coversOf(p)) byKey.set(bandKeyOf(b), b);
  return [...byKey.values()].sort((a, b) => a.min - b.min);
}

const contains = (outer: CalorieBand, inner: CalorieBand) => outer.min <= inner.min && inner.max <= outer.max;

/** How far a plan's nearest verified band is from `band`: 0 when it covers it. */
function bandGap(plan: MealPlan, band: CalorieBand): number {
  let best = Infinity;
  for (const c of coversOf(plan)) {
    if (contains(c, band)) return 0;
    best = Math.min(best, Math.abs(c.min - band.min), Math.abs(c.max - band.max));
  }
  return best;
}

export interface SizePick {
  plan: MealPlan;
  /** false when no size covers the person's band: this is only the closest one */
  covered: boolean;
  /** how many kcal away the nearest covered band is; 0 when covered */
  gap: number;
}

/**
 * The size that fits a calorie target: the one whose `covers` includes the target's band.
 * With none, the nearest size, flagged `covered: false` so the screen can say "closest size".
 */
export function pickSize(family: PlanFamily, calorieTarget: number): SizePick {
  const band = bandFor(calorieTarget);
  let best: SizePick | undefined;
  let bestMid = Infinity;
  for (const plan of family.sizes) {
    const gap = bandGap(plan, band);
    const cs = coversOf(plan);
    const mid = (Math.min(...cs.map((c) => c.min)) + Math.max(...cs.map((c) => c.max))) / 2;
    const off = Math.abs(mid - calorieTarget);
    // nearer band first; among sizes with the same gap, the one centred nearest the target
    if (!best || gap < best.gap || (gap === best.gap && off < bestMid)) {
      best = { plan, covered: gap === 0, gap };
      bestMid = off;
    }
  }
  return best ?? { plan: family.sizes[0], covered: false, gap: Infinity };
}

// ── Carb style ──────────────────────────────────────────────────────────────

const planCarbCache = new WeakMap<MealPlan, CarbStyle>();

/** The plan's own carb style, or the one computed from its ingredients when it has none. */
export function planCarbStyle(plan: MealPlan, foods: FoodIndex): CarbStyle {
  if (plan.carbStyle) return plan.carbStyle;
  let s = planCarbCache.get(plan);
  if (!s) {
    s = carbStyleOfPlan(plan, foods);
    planCarbCache.set(plan, s);
  }
  return s;
}

/** A plan is visible when its carb style is at or below the person's choice (whole < wholegrain < any). */
export const carbVisible = (plan: MealPlan, wanted: CarbStyle, foods: FoodIndex) => carbStyleFits(planCarbStyle(plan, foods), wanted);

/** The strictest-to-loosest setting the whole family needs: its most permissive size. */
export function familyCarbStyle(family: PlanFamily, foods: FoodIndex): CarbStyle {
  const order: CarbStyle[] = ['whole', 'wholegrain', 'any'];
  return family.sizes.reduce<CarbStyle>((worst, p) => {
    const s = planCarbStyle(p, foods);
    return order.indexOf(s) > order.indexOf(worst) ? s : worst;
  }, 'whole');
}

/**
 * Whether a family is shown for a carb choice. Only library families obey it: the bundled samples and plans a person
 * uploaded are theirs to see, whatever bread or rice they hold.
 */
export const familyVisible = (family: PlanFamily, wanted: CarbStyle, foods: FoodIndex) =>
  !family.isLibrary || carbStyleFits(familyCarbStyle(family, foods), wanted);

const mealCarbCache = new WeakMap<Meal, CarbStyle>();

/** The carb style of one meal, from its ingredients. */
export function mealCarbStyle(meal: Meal, foods: FoodIndex): CarbStyle {
  let s = mealCarbCache.get(meal);
  if (!s) {
    s = carbStyleOfMeal(meal, foods);
    mealCarbCache.set(meal, s);
  }
  return s;
}

// ── Display helpers ─────────────────────────────────────────────────────────

/** The names of the family's signature dishes, found in the plan's own meals. */
export function signatureNames(plan: Pick<MealPlan, 'days' | 'signature'>, n = 3): string[] {
  const wanted = (plan.signature ?? []).slice(0, n);
  if (!wanted.length) return [];
  const names = new Map<string, string>();
  for (const d of plan.days)
    for (const m of d.meals) if (m.recipeId && wanted.includes(m.recipeId) && !names.has(m.recipeId)) names.set(m.recipeId, m.name);
  return wanted.map((id) => names.get(id)).filter((x): x is string => !!x);
}

/** Prep plus cook time for a recipe, if either is known. */
export function recipeMinutes(meal: Pick<Meal, 'prepMinutes' | 'cookMinutes'>): number | undefined {
  const total = (meal.prepMinutes ?? 0) + (meal.cookMinutes ?? 0);
  return total > 0 ? total : undefined;
}

/** The time to show on a plan row: a leftover meal is not cooked again, so it has none. */
export const rowMinutes = (meal: Pick<Meal, 'prepMinutes' | 'cookMinutes' | 'leftover'>) => (meal.leftover ? undefined : recipeMinutes(meal));

/** Tags worth showing next to a plan's style: drop the ones the style or a stronger tag already says (vegan says vegetarian). */
const IMPLIED_BY: Record<string, string[]> = {
  vegan: ['vegetarian', 'pescatarian', 'dairy-free', 'egg-free'],
  vegetarian: ['pescatarian'],
};
export function displayTags(tags: readonly string[], style?: string): string[] {
  const implied = new Set(tags.flatMap((t) => IMPLIED_BY[t] ?? []));
  return tags.filter((t) => t !== style && !implied.has(t));
}
