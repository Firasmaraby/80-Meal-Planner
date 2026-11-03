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

/** Categories that count as a meal's real protein. */
const PROTEIN_CATEGORIES = new Set<Food['category']>(['meat', 'poultry', 'fish', 'egg', 'legume', 'dairy']);

/** A food that counts as a meal's real protein (the plan lab's check and the sizer's protein floor). */
export const isProteinSource = (f: Pick<Food, 'name' | 'category'>): boolean =>
  PROTEIN_CATEGORIES.has(f.category) || (f.category !== 'prepared' && f.category !== 'sweet' && WHEAT_PROTEIN_RX.test(f.name) && !NOT_A_PROTEIN_RX.test(f.name));
