/**
 * The meal library: every meal from every published plan, as a standalone item.
 * Nothing is authored separately: upload a plan and its meals appear here.
 *
 * A library recipe (it has a `recipeId`) appears once, however many plans and sizes it is cooked in. Meals from older
 * plans have no recipe id and are matched by name and ingredients.
 */
import { useMemo } from 'react';

import { ingredientsTotal } from '@/engine/calc';
import { SIZE_ORDER, mealCarbStyle, planFamilyName } from '@/engine/families';
import { splitSteps } from '@/lib/kitchen';
import type { CalorieBand, CarbStyle, Meal, MealPlan, NutrientVector, PlanSize, PlanStyle } from '@/engine/types';

import { FOOD_INDEX } from './catalog';
import { useAllPlans } from './day';

export interface LibraryMeal {
  key: string; // `${planId}~${mealId}`
  meal: Meal;
  planId: string;
  planName: string;
  cuisine: string;
  tags: string[];
  band: CalorieBand;
  totals: NutrientVector;
  /** names of the other plans that contain the same meal */
  alsoIn: string[];
  /** how many plans the meal is in, counting a plan family once however many sizes it has */
  planCount: number;
  /** slots this plan renames (Ramadan: Suhoor and Iftar) */
  slotNames?: MealPlan['slotNames'];
  /** the style of the plan it came from */
  style?: PlanStyle;
  /** the size of the plan this copy of the meal comes from (its amounts are for that size) */
  size?: PlanSize;
  /** the carb setting the meal needs, from its own ingredients */
  carbStyle: CarbStyle;
  /** true for meals from the built-in plan library, the only ones the carb choice hides */
  fromLibrary: boolean;
}

export const libraryKey = (planId: string, mealId: string) => `${planId}~${mealId}`;

/** Same name + same ingredients and grams = same meal, even across plans. */
const signature = (m: Meal) =>
  `${m.name.trim().toLowerCase()}|${m.ingredients
    .map((i) => `${i.foodId}:${i.grams}`)
    .sort()
    .join(',')}`;

/** A recipe is one entry however many plans and sizes use it. */
const groupKey = (m: Meal) => (m.recipeId ? `recipe:${m.recipeId}` : signature(m));

const familyKey = (p: MealPlan) => p.familyId ?? p.id;

/** One library entry for a meal as it appears in a plan. `alsoIn` and `planCount` start at the plan alone. */
export function libraryMealFrom(plan: MealPlan, meal: Meal): LibraryMeal {
  return {
    key: libraryKey(plan.id, meal.id),
    meal,
    planId: plan.id,
    planName: planFamilyName(plan),
    cuisine: plan.cuisine,
    tags: plan.tags,
    band: plan.band,
    totals: ingredientsTotal(meal.ingredients, FOOD_INDEX),
    alsoIn: [],
    planCount: 1,
    slotNames: plan.slotNames,
    style: plan.style,
    size: plan.size,
    carbStyle: mealCarbStyle(meal, FOOD_INDEX),
    fromLibrary: !!plan.familyId,
  };
}

const sizeRank = (p: MealPlan) => (p.size ? SIZE_ORDER.indexOf(p.size) : -1);

export function buildLibrary(plans: MealPlan[]): LibraryMeal[] {
  const byGroup = new Map<string, LibraryMeal>();
  const families = new Map<string, Set<string>>();
  // Standard size first, so a recipe's amounts are the ones the author wrote; samples keep their order
  const tier = (p: MealPlan) => (p.familyId && p.size !== 'standard' ? 1 + sizeRank(p) : 0);
  const ordered = plans
    .map((p, i) => ({ p, i, t: tier(p) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.p);
  for (const plan of ordered) {
    for (const day of [...plan.days].sort((a, b) => a.day - b.day)) {
      for (const meal of day.meals) {
        const gk = groupKey(meal);
        const existing = byGroup.get(gk);
        if (existing) {
          const fams = families.get(gk)!;
          const fk = familyKey(plan);
          if (!fams.has(fk)) {
            fams.add(fk);
            existing.planCount = fams.size;
            if (existing.planId !== plan.id && !existing.alsoIn.includes(planFamilyName(plan))) existing.alsoIn.push(planFamilyName(plan));
          }
          // the leftover copy of a recipe only reheats it: show the cooked one
          if (existing.meal.leftover && !meal.leftover && existing.planId === plan.id) {
            const lm = libraryMealFrom(plan, meal);
            byGroup.set(gk, { ...lm, alsoIn: existing.alsoIn, planCount: existing.planCount });
          }
          continue;
        }
        byGroup.set(gk, libraryMealFrom(plan, meal));
        families.set(gk, new Set([familyKey(plan)]));
      }
    }
  }
  return [...byGroup.values()];
}

export function useMealLibrary(): LibraryMeal[] {
  const plans = useAllPlans();
  return useMemo(() => buildLibrary(plans), [plans]);
}

export function useLibraryMeal(key?: string): LibraryMeal | undefined {
  const lib = useMealLibrary();
  return useMemo(() => lib.find((m) => m.key === key), [lib, key]);
}

/**
 * The steps to cook a meal from: its own, or the library copy's when it was added from the library (the day keeps only
 * the ingredients), or the sentences of the old plain-text instructions.
 */
export function useRecipeSteps(meal: Meal | undefined, libraryKeyOfMeal?: string): string[] {
  const lib = useLibraryMeal(libraryKeyOfMeal);
  return useMemo(() => {
    if (meal?.steps?.length) return meal.steps;
    if (lib?.meal.steps?.length) return lib.meal.steps;
    return splitSteps(meal?.instructions);
  }, [meal, lib]);
}
