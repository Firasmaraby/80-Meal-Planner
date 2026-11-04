import type { PlanFamily } from './families';

/**
 * How the Plans tab groups the library:
 *  - everyday: global plans with no special diet or goal (the default view);
 *  - cuisine: regional kitchens with no special diet or goal;
 *  - diet: every plan built around a diet, a goal or a life stage (vegan, keto, muscle, budget, prenatal and the rest).
 * Plans without a style (samples, uploads) count as balanced.
 */
export type PlanCollection = 'everyday' | 'cuisine' | 'diet';

export const COLLECTION_LABEL: Record<PlanCollection, string> = {
  everyday: 'Everyday',
  cuisine: 'Cuisines',
  diet: 'Diets & goals',
};

export function planCollection(family: Pick<PlanFamily, 'style' | 'cuisine'>): PlanCollection {
  if (family.style && family.style !== 'balanced') return 'diet';
  return family.cuisine.trim().toLowerCase() === 'global' ? 'everyday' : 'cuisine';
}

// ── Calories per meal ────────────────────────────────────────────────────────

export type KcalBucket = 'under400' | '400-600' | '600-800' | '800+';

export const KCAL_BUCKETS: { key: KcalBucket; label: string; min: number; max: number }[] = [
  { key: 'under400', label: 'Under 400', min: 0, max: 400 },
  { key: '400-600', label: '400-600', min: 400, max: 600 },
  { key: '600-800', label: '600-800', min: 600, max: 800 },
  { key: '800+', label: '800+', min: 800, max: Infinity },
];

/** The bucket a meal's calories fall in: lower edge inclusive, so 400 kcal is "400-600". */
export function kcalBucketOf(kcal: number): KcalBucket {
  return (KCAL_BUCKETS.find((b) => kcal >= b.min && kcal < b.max) ?? KCAL_BUCKETS[0]).key;
}
