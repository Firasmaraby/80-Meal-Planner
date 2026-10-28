import type { MealPlan } from '../engine/types';
import type { ImportIssue } from './planWorkbook';

/**
 * Warns for every day whose total calories fall outside the plan's calorie band.
 * Decoupled from the engine: the caller supplies the kcal calculation, e.g.
 *   checkPlanBand(plan, (foodId, grams) => kcalFor(getFood(foodId), grams))
 * Rows are not known here (plans no longer carry sheet positions), so `row` is 0.
 */
export function checkPlanBand(plan: MealPlan, kcalForIngredient: (foodId: string, grams: number) => number): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const { min, max } = plan.band;
  for (const day of plan.days) {
    let total = 0;
    for (const meal of day.meals) {
      for (const ing of meal.ingredients) {
        const k = kcalForIngredient(ing.foodId, ing.grams);
        if (Number.isFinite(k)) total += k;
      }
    }
    const kcal = Math.round(total);
    if (kcal < min || kcal > max) {
      const diff = kcal < min ? min - kcal : kcal - max;
      issues.push({
        level: 'warning',
        sheet: 'Plans',
        row: 0,
        message: `Plan "${plan.id}" day ${day.day} totals ${kcal} kcal, ${diff} ${kcal < min ? 'below' : 'above'} the ${min}-${max} kcal band.`,
        suggestion: kcal < min ? 'Add food or increase portions on this day.' : 'Reduce portions or swap a dense item on this day.',
      });
    }
  }
  return issues;
}
