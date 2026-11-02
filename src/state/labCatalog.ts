/**
 * The whole library for the plan-writing tools: the everyday tier plus the extended tier (src/data/foods.extended.json), decoded once.
 * Used by scripts/find-food.mjs, plan-lab.mjs, plan-review.mjs, build-plans.mjs (through familyDeps.ts) and the tests; the app never imports this,
 * so its bundle is unchanged. A recipe may use an extended food: the next `python3 pipeline/consumer/build.py` promotes every food a family file uses
 * to the everyday tier (and the app then ships it in foods.everyday.json).
 */
import extendedJson from '@/data/foods.extended.json';
import { decodeFoods, type FoodBundle } from '@/data/loadFoods';
import { FoodSearch } from '@/engine/search';
import type { Food } from '@/engine/types';

import { FOODS, FoodIndex } from './catalog';

const have = new Set(FOODS.map((f) => f.id));
/** everyday first, then the extended foods that are not already in the catalog (the app appends them in place once loaded) */
export const LAB_FOODS: Food[] = [...FOODS, ...decodeFoods(extendedJson as unknown as FoodBundle, 'extended').filter((f) => !have.has(f.id))];
export const LAB_INDEX = new FoodIndex(LAB_FOODS);
export const labSearch = new FoodSearch(LAB_FOODS);
/** the everyday tier only: where "go-to source" suggestions come from */
export const EVERYDAY_FOODS: Food[] = LAB_FOODS.filter((f) => f.tier === 'everyday');
