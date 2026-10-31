import type { Food } from './types';

/**
 * In-memory food search. Fast enough for tens of thousands of foods on a phone:
 * tokens are pre-normalised once; a query is matched by token prefix with
 * a one-typo tolerance for longer words, then ranked by match quality + commonness.
 *
 * Library rules (foods that carry `head` / `tier`; pipeline/search_check.py is the Python twin, keep them in step):
 *  - head grouping: results are grouped by `head`, the best member is shown, the others come back as `group`;
 *  - exact head beats the rest. Match class: 4 exact head (same tokens as the query), 3 exact name / alias,
 *    (3 also: a multi-word query that is the start of the name), 2 every query token matches (exact or prefix), 1 the query is only contained in the
 *    head ("apple" in "pineapple"), 0.5 a match that needs a typo. A better class always wins: Apple, raw > Apple pie > Pineapple;
 *  - typo matches only show when nothing matches without one ("feta" never brings up "keta salmon");
 *  - inside a class an `everyday` food beats an `extended` one;
 *  - composite foods (dish, branded / ultra-processed, mix / dough / drink / dessert ...) drop two classes unless the query asks for them.
 * Foods without `head` behave as before: every food is its own group and there is no tier preference.
 */

const STOP = new Set(['and', 'or', 'with', 'of', 'the', 'a', 'in', 'raw']);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t && !STOP.has(t))
    .map(singular);
}

function singular(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 3 && t.endsWith('es') && /(ch|sh|x|o)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

/** true if a and b differ by at most one edit (insert, delete, substitute or swap two neighbours) */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length === b.length && i + 1 < a.length && a[i] === b[j + 1] && a[i + 1] === b[j]) {
      // adjacent swap ("appel" / "apple") counts as one edit
      i += 2;
      j += 2;
      continue;
    }
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

interface Entry {
  food: Food;
  name: string; // normalised display name
  nameTokens: string[];
  aliasTokens: string[][];
  aliasNames: string[];
  head: string; // normalised head ('' = none)
  headTokens: string[];
  everyday: boolean;
  composite: boolean;
  processed: boolean;
}

const COMPOSITE_RX = /\b(?:mix|dough|flavou?red|drink|beverage|punch|cocoa|shake|dessert|pudding|splash|cocktail|imitation|substitute|topping|filling|dressing|sauce|soup|salad|sandwich|pie|cake|cookie|candy|burger|pizza)\b/i;

const MIXED_RX = /\b(?:with|and)\b/i; // "Corn with red pepper", "Milk and cereal bar": a mixed food

export interface SearchHit {
  food: Food;
  score: number; // 0..1
  /** match class 0..4, see the module comment */
  cls?: number;
  /** every matching food with the same head, best first (the first is `food`) */
  group?: Food[];
}

const cmpId = (a: Food, b: Food) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const makeEntry = (food: Food): Entry => ({
  food,
  name: normalize(food.name),
  nameTokens: tokens(food.name),
  aliasTokens: (food.aliases ?? []).map(tokens),
  aliasNames: (food.aliases ?? []).map(normalize),
  head: food.head ? normalize(food.head) : '',
  headTokens: food.head ? tokens(food.head) : [],
  everyday: food.tier === 'everyday',
  processed: !!food.tags?.includes('processed'),
  composite:
    food.form === 'dish' || !!food.tags?.includes('processed') || COMPOSITE_RX.test(food.name) || MIXED_RX.test(food.name.split(',')[0]),
});

export class FoodSearch {
  private entries: Entry[];

  constructor(foods: Food[]) {
    this.entries = foods.map(makeEntry);
  }

  /** Rebuild the index (the extended tier arrived). */
  setFoods(foods: Food[]): void {
    this.entries = foods.map(makeEntry);
  }

  search(query: string, opts: { limit?: number; includeRare?: boolean } = {}): SearchHit[] {
    const q = tokens(query);
    const qNorm = normalize(query);
    if (!q.length) return [];
    interface Raw { cls: number; ev: number; score: number; rank: number; food: Food }
    const raw: Raw[] = [];
    for (const e of this.entries) {
      if (e.food.rare && !opts.includeRare) continue;
      const [score, cls0] = scoreEntry(e, q, qNorm);
      let cls = cls0;
      if (score > 0 && cls >= 1 && e.composite && (cls < 4 || e.processed) && !(COMPOSITE_RX.test(query) && COMPOSITE_RX.test(e.food.name))) cls = Math.max(1, cls - 2);
      if (score > 0) raw.push({ cls, ev: e.everyday ? 1 : 0, score, rank: e.food.rank ?? 50, food: e.food });
    }
    // best member first: class, everyday, score, rank
    raw.sort((a, b) => b.cls - a.cls || b.ev - a.ev || b.score - a.score || b.rank - a.rank || cmpId(a.food, b.food));
    const groups = new Map<string, SearchHit & { ev: number; rank: number }>();
    for (const r of raw) {
      const key = r.food.head ? `head:${r.food.head}` : `id:${r.food.id}`;
      const g = groups.get(key);
      if (!g) groups.set(key, { food: r.food, score: r.score, cls: r.cls, ev: r.ev, rank: r.rank, group: [r.food] });
      else g.group!.push(r.food);
    }
    const out = [...groups.values()];
    out.sort((a, b) => b.cls! - a.cls! || b.ev - a.ev || b.score - a.score || b.rank - a.rank || cmpId(a.food, b.food));
    const typoOnly = out.length > 0 && out[0].cls! < 1;
    return (typoOnly ? out : out.filter((g) => g.cls! >= 1))
      .slice(0, opts.limit ?? 30).map(({ food, score, cls, group }) => ({ food, score, cls, group }));
  }
}

const TYPO = 0.7;
const TYPO_PREFIX = 0.55;

function tokenMatch(qt: string, cands: string[]): number {
  let best = 0;
  for (const c of cands) {
    if (c === qt) return 1;
    if (c.startsWith(qt)) best = Math.max(best, qt.length >= 3 ? 0.85 : 0.6);
    else if (qt.length >= 4 && withinOneEdit(qt, c)) best = Math.max(best, TYPO);
    else if (qt.length >= 5 && c.length > qt.length && withinOneEdit(qt, c.slice(0, qt.length))) best = Math.max(best, TYPO_PREFIX);
  }
  return best;
}

const sameTokens = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');

/** [score 0..1, match class 0..4]; class 0 = no match, 0.5 = typo match. */
function scoreEntry(e: Entry, q: string[], qNorm: string): [number, number] {
  // 4: the query names the head (same tokens, any order)
  if (e.headTokens.length && sameTokens(e.headTokens, q)) return [(e.head === qNorm ? 0.99 : 0.98) + rankBoost(e.food) * 0.01, 4];
  // 3: exact name or alias is the strongest signal after the head
  if (e.name === qNorm || e.aliasNames.includes(qNorm) || e.aliasTokens.some((a) => a.length && sameTokens(a, q))) {
    return [0.97 + rankBoost(e.food) * 0.03, 3];
  }

  // 3: a multi-word query that is the start of the name ("skim milk" -> "Skim milk, UHT") beats a scattered token match
  if (q.length >= 2 && `${e.name} `.startsWith(`${qNorm} `)) return [0.95 + rankBoost(e.food) * 0.01, 3];

  const fields = [e.nameTokens, ...e.aliasTokens, ...(e.headTokens.length ? [e.headTokens] : [])];
  let best = 0;
  let cls = 0;
  for (const f of fields) {
    let total = 0;
    let typo = false;
    for (const qt of q) {
      const m = tokenMatch(qt, f);
      if (m === 0) {
        total = 0;
        break;
      }
      if (m === TYPO || m === TYPO_PREFIX) typo = true;
      total += m;
    }
    if (!total) continue;
    let s = total / q.length; // all query tokens matched
    // prefer names whose first word is the query's first word ("banana" over "bread, banana")
    if (f[0]?.startsWith(q[0])) s += 0.08;
    // prefer concise names: query covers more of the name
    s -= Math.min(0.2, Math.max(0, f.length - q.length) * 0.03);
    best = Math.max(best, s);
    cls = Math.max(cls, typo ? 0.5 : 2);
  }
  if (!best) {
    // 1: the end of a longer word in the head / name ("apple" in "pineapple", not "chia" in "macchiato") - weakest; 4+ letters
    const hay = e.head || e.name;
    if (qNorm.length >= 4 && !qNorm.includes(' ') && hay.split(' ').some((w) => w.length > qNorm.length && w.endsWith(qNorm))) {
      return [0.3 + rankBoost(e.food) * 0.1, 1];
    }
    return [0, 0];
  }
  return [Math.min(0.96, best * 0.85 + rankBoost(e.food) * 0.15), cls];
}

const rankBoost = (f: Food) => (f.rank ?? 50) / 100;
