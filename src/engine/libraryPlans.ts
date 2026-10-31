/**
 * The shipped form of the plan library, and the code the app needs to read it. Kept apart from family.ts (validation, compiling)
 * so the app does not bundle the authoring tools.
 *
 *   src/data/recipes.json       LibraryRecipe[]: every recipe once, with its base ingredients (one serving, Standard size)
 *   src/data/libraryPlans.json  CompactPlan[]: one per size, each meal { recipe, slot, g: [grams per ingredient], leftover?, heroes }
 *
 * scripts/build-plans.mjs writes both; `expandPlans` turns them back into full MealPlans (src/state/catalog.ts).
 */
import type { Ingredient, LifeStage, Meal, MealPlan, MealSlot, NutrientKey, PlanSize, PlanStyle, CalorieBand } from './types';

/** What `mealFrom` reads: a recipe in the family file or an expanded library recipe. */
export interface RecipeLike {
  id: string;
  name: string;
  inspiredBy?: string;
  about?: string;
  steps?: string[];
  prepMin?: number;
  cookMin?: number;
  servings?: number;
  tags?: string[];
  tip?: string;
  ingredients: { food: string; g: number; swap?: string; note?: string }[];
}

/** One meal from a recipe: the recipe's grams are for one serving at Standard size. */
export function mealFrom(recipe: RecipeLike, slot: MealSlot, id: string, leftover?: boolean): Meal {
  const meal: Meal = {
    id,
    slot,
    name: recipe.name,
    ingredients: recipe.ingredients.map((i): Ingredient => ({ foodId: i.food, grams: i.g, ...(i.swap ? { swapGroup: i.swap } : {}), ...(i.note ? { note: i.note } : {}) })),
    recipeId: recipe.id,
  };
  if (recipe.about) meal.about = recipe.about;
  if (recipe.steps?.length) {
    meal.steps = recipe.steps;
    meal.instructions = recipe.steps.join(' ');
  }
  if (recipe.prepMin != null) meal.prepMinutes = recipe.prepMin;
  if (recipe.cookMin != null) meal.cookMinutes = recipe.cookMin;
  if (recipe.tags?.length) meal.tags = recipe.tags;
  if (recipe.tip) meal.tip = recipe.tip;
  if (recipe.inspiredBy) meal.inspiredBy = recipe.inspiredBy;
  if (recipe.servings) meal.servings = recipe.servings;
  if (leftover) meal.leftover = true;
  return meal;
}

export type LibraryIngredient = [food: string, g: number, swap?: string, note?: string];

/** A recipe as stored in src/data/recipes.json, with the base (one serving, Standard) ingredients. */
export interface LibraryRecipe {
  id: string;
  family: string;
  name: string;
  /** the slot the family uses it in most */
  slot: MealSlot;
  inspiredBy?: string;
  about?: string;
  steps?: string[];
  prepMin?: number;
  cookMin?: number;
  servings?: number;
  tags?: string[];
  tip?: string;
  ingredients: LibraryIngredient[];
}

export interface Hero {
  key: NutrientKey;
  /** fraction of the adult woman's RDA this meal gives (1.4 = 140%) */
  pct: number;
}

export interface CompactMeal {
  recipe: string;
  slot: MealSlot;
  /** grams per ingredient, in the recipe's order */
  g: number[];
  leftover?: boolean;
  heroes?: Hero[];
}

/** A plan as stored in src/data/libraryPlans.json. */
export interface CompactPlan {
  id: string;
  familyId: string;
  size: PlanSize;
  name: string;
  cuisine: string;
  style: PlanStyle;
  carbStyle: NonNullable<MealPlan['carbStyle']>;
  /** the verified bands as [min, max] */
  covers: [number, number][];
  tags?: string[];
  summary?: string;
  howItWorks?: string;
  signature?: string[];
  regions?: string[];
  lifeStage?: LifeStage;
  slotNames?: MealPlan['slotNames'];
  days: { day: number; meals: CompactMeal[] }[];
}

/** Compact plans + recipes -> full MealPlans (ingredients and every recipe field on each meal). Empty in, empty out. */
export function expandPlans(plans: CompactPlan[], recipes: LibraryRecipe[]): MealPlan[] {
  if (!plans.length) return [];
  const byId = new Map(recipes.map((r) => [r.id, r]));
  return plans.map((p) => {
    const covers = p.covers.map(([min, max]): CalorieBand => ({ min, max }));
    return {
      id: p.id,
      version: 1,
      name: p.name,
      band: covers.length ? { min: Math.min(...covers.map((b) => b.min)), max: Math.max(...covers.map((b) => b.max)) } : { min: 0, max: 0 },
      cuisine: p.cuisine,
      tags: p.tags ?? [],
      description: p.summary,
      author: 'Eighty',
      familyId: p.familyId,
      size: p.size,
      covers,
      style: p.style,
      carbStyle: p.carbStyle,
      summary: p.summary,
      howItWorks: p.howItWorks,
      signature: p.signature,
      regions: p.regions,
      lifeStage: p.lifeStage,
      slotNames: p.slotNames,
      days: p.days.map((d) => {
        const perSlot = new Map<MealSlot, number>();
        return {
          day: d.day,
          meals: d.meals.map((m): Meal => {
            const r = byId.get(m.recipe);
            if (!r) throw new Error(`Plan ${p.id} uses recipe "${m.recipe}", which is not in recipes.json.`);
            const k = (perSlot.get(m.slot) ?? 0) + 1;
            perSlot.set(m.slot, k);
            return mealFrom(
              {
                id: r.id,
                name: r.name,
                inspiredBy: r.inspiredBy,
                about: r.about,
                steps: r.steps,
                prepMin: r.prepMin,
                cookMin: r.cookMin,
                servings: r.servings,
                tags: r.tags,
                tip: r.tip,
                ingredients: r.ingredients.map(([food, , swap, note], i) => ({ food, g: m.g[i] ?? r.ingredients[i][1], swap: swap || undefined, note })),
              },
              m.slot,
              `${p.id}-d${d.day}-${m.slot}${k}`,
              m.leftover,
            );
          }),
        };
      }),
    };
  });
}
