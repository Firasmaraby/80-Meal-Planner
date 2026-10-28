/**
 * The meal library: every meal from every published plan, as a standalone item.
 * Nothing is authored separately: upload a plan and its meals appear here.
 */
import { useMemo } from 'react';

import { ingredientsTotal } from '@/engine/calc';
import type { CalorieBand, Meal, MealPlan, NutrientVector } from '@/engine/types';

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
  /** other plans that contain the same meal */
  alsoIn: string[];
}

export const libraryKey = (planId: string, mealId: string) => `${planId}~${mealId}`;

/** Same name + same ingredients and grams = same meal, even across plans. */
const signature = (m: Meal) =>
  `${m.name.trim().toLowerCase()}|${m.ingredients
    .map((i) => `${i.foodId}:${i.grams}`)
    .sort()
    .join(',')}`;

export function buildLibrary(plans: MealPlan[]): LibraryMeal[] {
  const bySig = new Map<string, LibraryMeal>();
  for (const plan of plans) {
    for (const day of [...plan.days].sort((a, b) => a.day - b.day)) {
      for (const meal of day.meals) {
        const sig = signature(meal);
        const existing = bySig.get(sig);
        if (existing) {
          if (existing.planId !== plan.id && !existing.alsoIn.includes(plan.name)) existing.alsoIn.push(plan.name);
          continue;
        }
        bySig.set(sig, {
          key: libraryKey(plan.id, meal.id),
          meal,
          planId: plan.id,
          planName: plan.name,
          cuisine: plan.cuisine,
          tags: plan.tags,
          band: plan.band,
          totals: ingredientsTotal(meal.ingredients, FOOD_INDEX),
          alsoIn: [],
        });
      }
    }
  }
  return [...bySig.values()];
}

export function useMealLibrary(): LibraryMeal[] {
  const plans = useAllPlans();
  return useMemo(() => buildLibrary(plans), [plans]);
}

export function useLibraryMeal(key?: string): LibraryMeal | undefined {
  const lib = useMealLibrary();
  return useMemo(() => lib.find((m) => m.key === key), [lib, key]);
}
