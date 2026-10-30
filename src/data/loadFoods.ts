/**
 * Decoder for the compact food bundles written by pipeline/consumer/export_app.py
 * (src/data/foods.everyday.json, src/data/foods.extended.json).
 *
 * Bundle: { v: 1, keys: NutrientKey[], dbs?: string[], foods: Row[] }
 * Row:    [id, name, category, head, form, rank, aliases[], tags[], servings[[label, g]], src[[db, ref]],
 *          estimated[], values[] (aligned to keys, null = no data), gi?]
 * `src[i][0]` is an index into `dbs` (a plain citation string is accepted too).
 */
import type { Food, FoodCategory, FoodSource, FoodTag, FoodTier, NutrientKey, NutrientVector, Serving } from '@/engine/types';

export type FoodRow = [
  id: string,
  name: string,
  category: FoodCategory,
  head: string,
  form: string,
  rank: number,
  aliases: string[],
  tags: FoodTag[],
  servings: [string, number][],
  src: [string | number, string][],
  estimated: NutrientKey[],
  values: (number | null)[],
  gi?: number | null,
];

export interface FoodBundle {
  v: 1;
  keys: NutrientKey[];
  dbs?: string[];
  foods: FoodRow[];
}

export function decodeFood(row: FoodRow, keys: NutrientKey[], dbs: string[] | undefined, tier: FoodTier): Food {
  const n: NutrientVector = {};
  const values = row[11];
  for (let i = 0; i < keys.length; i++) {
    const v = values[i];
    if (v != null) n[keys[i]] = v;
  }
  const src: FoodSource[] = row[9].map(([db, ref]) => ({ db: typeof db === 'number' ? (dbs?.[db] ?? String(db)) : db, ref }));
  const servings: Serving[] = row[8].map(([label, g]) => ({ label, g }));
  const food: Food = {
    id: row[0],
    name: row[1],
    category: row[2],
    head: row[3],
    form: row[4],
    rank: row[5],
    tier,
    n,
    src,
  };
  if (row[6].length) food.aliases = row[6];
  if (row[7].length) food.tags = row[7];
  if (servings.length) food.servings = servings;
  if (row[10].length) food.estimated = row[10];
  if (row[12] != null) food.gi = row[12];
  return food;
}

export function decodeFoods(bundle: FoodBundle, tier: FoodTier): Food[] {
  if (bundle.v !== 1) throw new Error(`unsupported food bundle version ${String(bundle.v)}`);
  return bundle.foods.map((row) => decodeFood(row, bundle.keys, bundle.dbs, tier));
}
