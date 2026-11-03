// Household measures for a gram amount: "1½ cups", "7 medium", "10 halves".
// One implementation for recipe text, cook mode and the grocery list.
import type { Food } from './types';

/** Volume and weight words: these take kitchen fractions (¼ ⅓ ½ ⅔ ¾). Anything else is a countable thing. */
const MEASURE_RX = /^(cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|fl|ml|g|pints?|quarts?|inch(es)?|pinch(es)?|dash(es)?)\b/i;
/** Size words inside a label's brackets: "1 tortilla (6 inch)" is one tortilla, not six inches. */
const SIZE_UNIT_RX = /^(inch(es)?|in|cm|mm|g|grams?|oz|ounces?|ml|lb|pounds?|diameter|dia|long|wide|thick)$/i;
const SPOON_RX = /^(tbsp|tsp|tablespoons?|teaspoons?)\b/i;
/** Size words in front of a count ("1 medium", "1 large, whole"): never pluralised. */
const SIZE_RX = /^(medium|large|small|extra|mini|jumbo|whole|baby)\b/i;

const VOLUME_FRACTIONS: [number, string][] = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
const HALVES: [number, string][] = [[0, ''], [0.5, '½'], [1, '']];
/** A counted thing under 2 reads in quarters: "¾ avocado", "¼ onion". */
const COUNT_FRACTIONS: [number, string][] = [[0, ''], [0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1, '']];

function nearest(x: number, table: [number, string][]): { value: number; text: string } {
  const whole = Math.floor(x);
  const [f, sym] = table.reduce((a, b) => (Math.abs(b[0] - (x - whole)) < Math.abs(a[0] - (x - whole)) ? b : a));
  const w = f === 1 ? whole + 1 : whole;
  return { value: w + (f === 1 ? 0 : f), text: `${w || ''}${sym}` || sym };
}

export function plural(word: string): string {
  if (/s$/i.test(word)) return word;
  if (/(ch|sh|x)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(lea|hal|loa)f$/i.test(word)) return `${word.slice(0, -1)}ves`;
  return `${word}s`;
}

export function singular(word: string): string {
  if (/ves$/i.test(word)) return `${word.slice(0, -3)}f`;
  if (/[^aeiou]ies$/i.test(word)) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|x)es$/i.test(word)) return word.slice(0, -2);
  if (/[^s]s$/i.test(word)) return word.slice(0, -1);
  return word;
}

/** Make the leading noun of a unit agree with the amount; size words and measures pass through. */
function agree(unit: string, n: number): string {
  const m = /^([A-Za-z]+)(.*)$/.exec(unit);
  if (!m || SIZE_RX.test(m[1]) || /^(oz|tbsp|tsp|fl|ml|g)$/i.test(m[1])) return unit;
  return `${n > 1 ? plural(m[1]) : singular(m[1])}${m[2]}`;
}

function parseLabel(label: string): { qty: number; unit: string } {
  const lead = /^(\d+(?:\.\d+)?|\d+\/\d+)\s+(.*)$/.exec(label);
  if (!lead) return { qty: 1, unit: label };
  const q = lead[1].includes('/') ? +lead[1].split('/')[0] / +lead[1].split('/')[1] : +lead[1];
  return { qty: q, unit: lead[2] };
}

/**
 * "1½ cups, chopped" for `grams` of a food, from the first serving that gives a sensible amount, or undefined.
 * - "1 oz (14 halves)" counts the halves: 20 g → "10 halves".
 * - Counted things round to quarters below 2 and to whole numbers from 2 ("7 medium", not "6¾ medium").
 * - Volumes use kitchen fractions, ⅓ and ⅔ included.
 */
export function measureText(food: Pick<Food, 'servings'> | undefined, grams: number, maxCount = 8): string | undefined {
  for (const s of food?.servings ?? []) {
    if (!(s.g > 0)) continue;
    const { qty, unit } = parseLabel(s.label);
    const pieces = /^[^(]*\((\d+)\s+([A-Za-z]+)\)\s*$/.exec(unit);
    // "(6 inch)" or "(30 g)" describe the size of one piece, not how many pieces it holds
    if (pieces && !SIZE_UNIT_RX.test(pieces[2])) {
      const n = Math.round((grams / s.g) * qty * +pieces[1]);
      if (n >= 1 && n <= 40) return `${n} ${agree(pieces[2], n)}`;
      continue;
    }
    const raw = (grams / s.g) * qty;
    const volume = MEASURE_RX.test(unit);
    const whole = { value: Math.round(raw), text: String(Math.round(raw)) };
    const r = volume
      ? raw >= 4 ? whole : nearest(raw, raw >= 2 ? HALVES : VOLUME_FRACTIONS)
      : raw >= 2 ? whole : nearest(raw, COUNT_FRACTIONS);
    // spoons stop at 8 (nobody measures 70 tbsp), counts at 40; the next serving (a cup, a bunch) usually reads better
    const cap = SPOON_RX.test(unit) ? 8 : volume ? maxCount : Math.min(maxCount, 40);
    if (raw < 0.2 || r.value <= 0 || r.value > cap) continue;
    return `${r.text} ${agree(unit, r.value)}`;
  }
  return undefined;
}
