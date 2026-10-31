/**
 * Carb style: the strictest setting on which a food, a meal or a whole plan still fits.
 *
 *   whole       legumes, potatoes, fruit and intact grains (oats, quinoa, barley...); no bread, rice, pasta or flour products
 *   wholegrain  adds brown/red/black rice, whole-wheat and rye products, corn tortillas, bulgur, soba
 *   any         adds white rice, white pasta, naan and the other refined staples
 *
 * Foods are classified by category and by regexes over their name and head, so it works for any food in the library
 * (carbStyle.test.ts pins 30 real names from the everyday tier and checks that every grain-category food gets an answer).
 */
import { getFood, type FoodIndex } from './calc';
import type { CarbStyle, Food, MealPlan } from './types';

const ORDER: Record<CarbStyle, number> = { whole: 0, wholegrain: 1, any: 2 };

/** Only these categories can hold a grain product; a legume flour or a rice milk is never one. */
const CHECKED = new Set<Food['category']>(['grain', 'prepared', 'sweet', 'other', 'vegetable', 'dairy']);

const test = (re: RegExp, s: string) => re.test(s);

// not carbohydrate staples even though the name says pasta, rice or couscous
const NOT_A_STAPLE = /^(pasta|spaghetti) sauce|squash|konjac|shirataki|for couscous|nukazuke|rice vinegar|shepherd|cottage pie|brandade|cabbage rolls|fruit leather|cassava \(manioc\), raw/;
// leavening and ready-to-eat whole-grain cereals
const LEAVENING = /\b(yeast|baking (soda|powder))\b/;
const WHOLEGRAIN_CEREAL = /\bbulgur\b|taco shell|tostada|shredded wheat|bran flakes|muesli|granola|popcorn|hominy|cornmeal|corn grits|\bgrits\b|polenta|\bmasa\b/;
// refined starches
const STARCH = /starch|tapioca|arrowroot|rice paper/;
// baked goods and sweets: refined unless the name says whole grain
const PASTRY =
  /\b(cakes?|cupcake|cookies?|pies?|tarts?|muffins?|pancakes?|waffles?|crepe|cr[eê]pes?|croissant|doughnut|danish|pastry|brownie|scones?|biscuit|brioche|eclair|cream puff|baklava|gingerbread|shortbread|mochi|pudding|crumpet|cinnamon roll|sweet roll|stuffing|crouton|breadcrumb|cracker meal|pretzel|crust|phyllo|dough|dumplings?|rusk|sponge|wafer|macaroon|cereal bar|fruitcake|french toast|corn ?flakes|puffed|toast, french)\b/;
// bread, pasta, noodle, tortilla, couscous, flour and cracker products
const PRODUCT =
  /\b(bread|bagel|buns?|rolls?|pit+a|naan|chapati|roti|paratha|tortillas?|wraps?|taco|tostada|pasta|spaghetti|macaroni|lasagna|gnocchi|noodles?|vermicelli|couscous|flour|crackers?|crispbread|breadsticks?|baguette|ciabatta|toast|sandwich|kebab|hot dog|muffin)\b/;
// what makes a product whole grain
const WHOLE_WHEAT = /whole[ -]?(wheat|grain|meal)|wholegrain|wholemeal/;
const WHOLEGRAIN_PRODUCT =
  /rye|pumpernickel|sprouted|multi-?grain|\bsoba\b|buckwheat|bulgur|\bbrown\b|\boat(meal|s)?\b|\bspelt\b|\bbarley\b|quinoa|amaranth|sorghum|\bteff\b|millet|\bcorn\b.*(tortilla|taco|tostada|wrap|chips)|(tortilla|taco|tostada|wrap).*\bcorn\b/;
const RICE = /\brice\b|risotto|pilaf|pilau|paella|biryani|congee|sushi|dolma/;
const COLOURED_RICE = /\b(brown|red|black) rice\b|\brice,? (brown|red|black)\b/;
// intact grains and the bran or germ of a grain
const INTACT =
  /\b(oats?|oatmeal|porridge|quinoa|buckwheat|barley|millet|freekeh|amaranth|teff|spelt|farro|kamut|khorasan|sorghum|rye|wild rice|chia|bran|germ)\b|steel[ -]cut|wheat berr/;

/** The carb style of a single food. */
export function carbStyleOfFood(food: Pick<Food, 'name' | 'head' | 'category'>): CarbStyle {
  if (!CHECKED.has(food.category)) return 'whole';
  const text = `${food.name} ${food.head ?? ''}`.toLowerCase();
  const grain = food.category === 'grain';
  if (test(NOT_A_STAPLE, text) || test(LEAVENING, text)) return 'whole';
  if (test(WHOLEGRAIN_CEREAL, text)) return 'wholegrain';
  if (test(STARCH, text)) return 'any';
  if (test(PASTRY, text)) return test(WHOLE_WHEAT, text) ? 'wholegrain' : 'any';
  if (test(PRODUCT, text)) return test(WHOLE_WHEAT, text) || test(WHOLEGRAIN_PRODUCT, text) ? 'wholegrain' : 'any';
  if (test(INTACT, text)) return 'whole';
  if (test(RICE, text)) return test(COLOURED_RICE, text) ? 'wholegrain' : 'any';
  // a grain-category food nothing above recognised (cream of wheat, semolina, corn flakes...) is a refined product
  return grain ? 'any' : 'whole';
}

/** The most permissive level any ingredient of the plan needs. */
export function carbStyleOfPlan(plan: Pick<MealPlan, 'days'>, foods: FoodIndex): CarbStyle {
  let worst: CarbStyle = 'whole';
  for (const day of plan.days)
    for (const meal of day.meals)
      for (const ing of meal.ingredients) {
        const f = getFood(foods, ing.foodId);
        if (!f) continue;
        const s = carbStyleOfFood(f);
        if (ORDER[s] > ORDER[worst]) worst = s;
        if (worst === 'any') return worst;
      }
  return worst;
}

/** True when a plan at `plan` style suits someone who wants at most `wanted` (whole fits everyone). */
export const carbStyleFits = (plan: CarbStyle, wanted: CarbStyle) => ORDER[plan] <= ORDER[wanted];
