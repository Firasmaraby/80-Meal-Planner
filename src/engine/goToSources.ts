import type { Food, NutrientKey } from './types';

/**
 * Go-to whole foods for each board nutrient, most practical first: what a dietitian would tell you to add.
 * Used by the AI fix-list ("Day 2: calcium 61%, add yogurt, sardines…"). Ranking the whole database by
 * density instead surfaces things nobody eats a serving of (dried agar, baking powder, freeze-dried chives).
 *
 * An entry is a food `head`, optionally `head:hint` where the hint must appear in the name
 * (e.g. calcium-set tofu, sardines canned with their bones).
 */
export const GO_TO_SOURCES: Partial<Record<NutrientKey, string[]>> = {
  vitA: ['sweet potato:baked', 'carrot', 'butternut squash', 'kale', 'spinach', 'cantaloupe', 'red bell pepper', 'egg'],
  vitC: ['red bell pepper', 'kiwi', 'orange', 'strawberries', 'broccoli', 'brussels sprouts', 'guava', 'cantaloupe'],
  vitD: ['salmon', 'trout', 'sardine:canned', 'mackerel', 'herring', 'egg', 'milk:2%', 'soy milk:vitamins a and d'],
  vitE: ['sunflower seeds', 'almonds', 'hazelnuts', 'peanut butter', 'wheat germ', 'avocado', 'spinach', 'trout'],
  vitK: ['kale', 'collard greens', 'spinach', 'swiss chard', 'broccoli', 'brussels sprouts', 'asparagus', 'green peas'],
  b1: ['pork tenderloin', 'sunflower seeds', 'black beans', 'lentils', 'green peas', 'oats', 'trout', 'whole wheat bread'],
  b2: ['milk:2%', 'yogurt', 'egg', 'almonds', 'mushroom', 'salmon', 'beef', 'tofu'],
  b3: ['chicken breast', 'tuna', 'salmon', 'turkey breast', 'peanuts', 'pork tenderloin', 'brown rice', 'mushroom'],
  b5: ['shiitake mushroom', 'sunflower seeds', 'avocado', 'chicken breast', 'salmon', 'egg', 'lentils', 'sweet potato'],
  b6: ['chickpeas', 'salmon', 'chicken breast', 'potato', 'banana', 'turkey breast', 'pistachios', 'sunflower seeds'],
  b7: ['egg', 'salmon', 'sunflower seeds', 'almonds', 'sweet potato', 'pork', 'mushroom', 'broccoli'],
  folate: ['lentils', 'chickpeas', 'black beans', 'edamame', 'spinach', 'asparagus', 'broccoli', 'avocado'],
  b12: ['clam', 'oysters', 'salmon', 'sardine:canned', 'tuna', 'beef', 'yogurt', 'milk:2%', 'egg'],
  choline: ['egg', 'beef', 'chicken breast', 'salmon', 'edamame', 'cod', 'shiitake mushroom', 'broccoli'],
  calcium: ['yogurt', 'milk:2%', 'sardine:canned', 'tofu:calcium', 'cheddar cheese', 'collard greens', 'kale', 'bok choy', 'tahini', 'almonds'],
  iron: ['lentils', 'beef', 'white beans', 'chickpeas', 'tofu:calcium', 'pumpkin seeds', 'spinach', 'oysters', 'quinoa'],
  magnesium: ['pumpkin seeds', 'chia seeds', 'almonds', 'cashews', 'spinach', 'black beans', 'edamame', 'quinoa', 'oats'],
  phosphorus: ['salmon', 'yogurt', 'lentils', 'pumpkin seeds', 'chicken breast', 'milk:2%', 'oats'],
  potassium: ['potato', 'sweet potato:baked', 'white beans', 'lentils', 'banana', 'avocado', 'spinach', 'salmon', 'yogurt'],
  zinc: ['oysters', 'beef', 'pumpkin seeds', 'chickpeas', 'lentils', 'cashews', 'yogurt', 'oats'],
  copper: ['oysters', 'cashews', 'sesame seeds', 'lentils', 'shiitake mushroom', 'chickpeas', 'dark chocolate:70', 'almonds'],
  manganese: ['oats', 'brown rice', 'chickpeas', 'hazelnuts', 'pecans', 'spinach', 'pineapple', 'mussels'],
  selenium: ['brazil nuts', 'tuna', 'sardine:canned', 'salmon', 'shrimp', 'turkey breast', 'egg', 'cottage cheese'],
  iodine: ['cod', 'haddock', 'yogurt', 'milk:2%', 'egg', 'shrimp', 'nori', 'table salt'],
};

const ANIMAL = new Set(['meat', 'poultry', 'fish']);
const NOT_A_PORTION = new Set(['dried', 'dish']);

/**
 * The foods to suggest for `key`: each go-to entry resolved to the best-ranked everyday food with that head
 * (and hint), that actually reports the nutrient. Plant-based plans skip meat, poultry and fish.
 */
export function goToSources(key: NutrientKey, catalog: Food[], plantOnly = false, limit = 4): Food[] {
  const byHead = new Map<string, Food[]>();
  for (const f of catalog) {
    if (!f.head || f.rare || f.tier === 'extended' || NOT_A_PORTION.has(f.form ?? '')) continue;
    if (!byHead.has(f.head)) byHead.set(f.head, []);
    byHead.get(f.head)!.push(f);
  }
  const out: Food[] = [];
  for (const spec of GO_TO_SOURCES[key] ?? []) {
    const [head, hint] = spec.split(':');
    const pick = (byHead.get(head) ?? [])
      .filter((f) => !hint || f.name.toLowerCase().includes(hint))
      .filter((f) => (f.n[key] ?? 0) > 0 && !(plantOnly && ANIMAL.has(f.category)))
      .sort((a, b) => (b.rank ?? 50) - (a.rank ?? 50))[0];
    if (pick) out.push(pick);
    if (out.length >= limit) break;
  }
  return out;
}
