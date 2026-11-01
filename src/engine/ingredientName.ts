/**
 * Ingredient names for a recipe. The food library names what the database measured ("Egg, whole, raw"), which reads oddly
 * in an ingredient list. Trailing words that only describe the state of the food in the table are dropped.
 *
 * Kept on purpose: "cooked", "boiled", "dry", "dried", "uncooked" and the like. They tell the cook which amount is meant
 * (80 g of dry quinoa is not 80 g of cooked quinoa). "whole" stays after a dairy name, where it means whole milk.
 */
import type { Food } from './types';

const STATE_WORDS = new Set(['raw', 'whole', 'fresh']);
const DAIRY_HEAD = /\b(milk|cream|yogh?urt|kefir|buttermilk)\b/i;

export function displayIngredientName(food: Pick<Food, 'name'> | undefined, fallback = ''): string {
  const full = (food?.name ?? fallback).trim();
  const parts = full.split(',').map((s) => s.trim());
  const dairy = DAIRY_HEAD.test(parts[0]);
  while (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase();
    if (!STATE_WORDS.has(last) || (dairy && last === 'whole')) break;
    parts.pop();
  }
  return parts.join(', ') || full;
}
