// What a food is for, when its category alone gets it wrong.
import type { Food } from './types';

/**
 * Plant yogurts, plant milks and plant beverages that the sources file under "dairy": soy yogurt, oat beverage,
 * almond-based yogurt, non-dairy ice cream. They're dairy-free and vegan. A dairy food that merely contains a plant
 * word after the dairy word ("Greek yogurt, coconut blend") or goat's milk is still dairy.
 */
const PLANT_DAIRY_RX =
  /\b(soy|soya|almond|oat|coconut|cashew|rice|hemp|pea)(?:[ -]based)?[ ,-]+(?:\w+[ ,-]+)?(yogh?urts?|milks?|beverages?|drinks?|cheeses?)\b|\bnon[- ]dairy\b/i;

/** "Non-dairy" creamers, whiteners and toppings often carry caseinate (milk protein), and some are made up with milk. */
const STILL_DAIRY_RX = /creamer|whitener|topping|whipped|imitation|prepared with|(?<!ice )\bcream\b/i;

export const isPlantDairy = (f: Pick<Food, 'name' | 'category'>): boolean =>
  f.category === 'dairy' && PLANT_DAIRY_RX.test(f.name) && !STILL_DAIRY_RX.test(f.name);

/**
 * Wheat-gluten and textured-soy proteins live under "grain" or "other" in the sources but are a meal's protein,
 * like tofu: seitan, vital wheat gluten, fu, textured vegetable protein, soya chunks and granules.
 */
const WHEAT_PROTEIN_RX =
  /\bseitan\b|\b(vital )?wheat gluten\b|\bwheat[- ]gluten cake\b|\bfu\b.*\bgluten\b|\btextured (vegetable|soy) protein\b|\bsoya?,? textured\b|\bsoy protein,? (textured|granular)\b/i;
/** Foods that mention a protein but aren't one: lecithin, bars with protein added, sausages and burgers (prepared). */
const NOT_A_PROTEIN_RX = /gluten[- ]free|lecithin|\bbar\b|added/i;

/**
 * Fish Health Canada asks everyone to limit to 150 g a week for mercury: fresh or frozen tuna, shark, swordfish, marlin,
 * escolar and orange roughy (plus king mackerel and tilefish, which US advice adds). Canned light tuna and skipjack are low.
 */
const HIGH_MERCURY_RX = /\b(shark|swordfish|marlin|escolar|orange roughy|king mackerel|mackerel, king|tilefish)\b/i;
const LOW_MERCURY_TUNA_RX = /canned|\blight\b|skipjack|katsuobushi|bonito|in oil|in water/i;
export const isHighMercuryFish = (f: Pick<Food, 'name' | 'category'>): boolean =>
  f.category === 'fish' && (HIGH_MERCURY_RX.test(f.name) || (/\btuna\b/i.test(f.name) && !LOW_MERCURY_TUNA_RX.test(f.name)));

/** Liver of any animal (not cod liver oil): rich in preformed vitamin A, so once a week is plenty. */
export const isLiver = (f: Pick<Food, 'name' | 'category'>): boolean =>
  (f.category === 'meat' || f.category === 'poultry' || f.category === 'prepared') && /\bliver\b|liverwurst|p[âa]t[ée]/i.test(f.name) && !/\boil\b/i.test(f.name);

/**
 * Caffeine in mg per 100 g, from the food's name (the sources don't carry it). Typical values: brewed coffee 40,
 * espresso 212, instant powder 3,140, brewed black tea 20, green tea 12, matcha powder 3,200, cocoa powder 230,
 * dark chocolate 80, milk chocolate 20, cola 10, energy drink 32. Decaf and herbal teas are near zero.
 */
const CAFFEINE: [RegExp, number][] = [
  [/decaf|herbal|rooibos|chamomile|peppermint tea|caffeine[- ]free|coffee cake|creamer|whitener|tea biscuit/i, 0],
  [/matcha/i, 3200],
  [/coffee.*\b(instant|powder|dry)\b|instant coffee/i, 3140],
  [/espresso/i, 212],
  [/\bcoffee\b/i, 40],
  [/green tea|tea, green/i, 12],
  [/\b(black )?tea\b(?!.*\b(herbal|fruit)\b)/i, 20],
  [/cocoa(,| powder|\b).*unsweetened|unsweetened cocoa|cocoa powder|cacao/i, 230],
  [/dark chocolate|chocolate, dark|baking chocolate|70-85%/i, 80],
  [/milk chocolate|chocolate, milk/i, 20],
  [/energy drink/i, 32],
  [/\bcola\b/i, 10],
];
export const caffeineMgPer100g = (f: Pick<Food, 'name'>): number => {
  for (const [rx, mg] of CAFFEINE) if (rx.test(f.name)) return mg;
  return 0;
};

/** Categories that count as a meal's real protein. */
const PROTEIN_CATEGORIES = new Set<Food['category']>(['meat', 'poultry', 'fish', 'egg', 'legume', 'dairy']);

/** A food that counts as a meal's real protein (the plan lab's check and the sizer's protein floor). */
export const isProteinSource = (f: Pick<Food, 'name' | 'category'>): boolean =>
  PROTEIN_CATEGORIES.has(f.category) || (f.category !== 'prepared' && f.category !== 'sweet' && WHEAT_PROTEIN_RX.test(f.name) && !NOT_A_PROTEIN_RX.test(f.name));
