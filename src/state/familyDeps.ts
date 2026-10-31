/**
 * What the plan-family tools need from the catalog: foods, swap groups, the exact everyday ids and a food-id suggester.
 * Used by scripts/plan-lab.mjs, plan-review.mjs and build-plans.mjs (through lib/app.mjs) and by the tests.
 */
import type { LabDeps } from '@/engine/familyLab';

import { FOODS, FOOD_INDEX, SWAP_GROUPS, foodSearch } from './catalog';

// "salmon-atlantic-farmed-raw-914b10" -> "salmon atlantic farmed raw"
const asQuery = (id: string) => id.replace(/-[0-9a-f]{6}$/, '').replace(/-/g, ' ');

/** The nearest foods to a mistyped id: search the whole name, then fewer words ("salmon atlantic cooked" -> salmon atlantic, then salmon). */
function suggest(id: string): string[] {
  const words = asQuery(id).split(' ');
  const found: string[] = [];
  for (let n = words.length; n >= 1 && found.length < 3; n--)
    for (const h of foodSearch.search(words.slice(0, n).join(' '), { limit: 3, includeRare: true })) if (found.length < 3 && !found.includes(h.food.id)) found.push(h.food.id);
  return found;
}

export const familyDeps: LabDeps = {
  foods: FOOD_INDEX,
  catalog: FOODS,
  groups: SWAP_GROUPS,
  validate: {
    foodIds: new Set(FOODS.map((f) => f.id)),
    swapGroups: new Set(SWAP_GROUPS.map((g) => g.key)),
    suggest,
  },
};
