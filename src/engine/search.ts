import type { Food } from './types';

/**
 * In-memory food search. Fast enough for tens of thousands of foods on a phone:
 * tokens are pre-normalised once; a query is matched by token prefix with
 * a one-typo tolerance for longer words, then ranked by match quality + commonness.
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

/** true if a and b differ by at most one edit */
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
}

export interface SearchHit {
  food: Food;
  score: number; // 0..1
}

export class FoodSearch {
  private entries: Entry[];

  constructor(foods: Food[]) {
    this.entries = foods.map((food) => ({
      food,
      name: normalize(food.name),
      nameTokens: tokens(food.name),
      aliasTokens: (food.aliases ?? []).map(tokens),
      aliasNames: (food.aliases ?? []).map(normalize),
    }));
  }

  search(query: string, opts: { limit?: number; includeRare?: boolean } = {}): SearchHit[] {
    const q = tokens(query);
    const qNorm = normalize(query);
    if (!q.length) return [];
    const hits: SearchHit[] = [];
    for (const e of this.entries) {
      if (e.food.rare && !opts.includeRare) continue;
      const s = scoreEntry(e, q, qNorm);
      if (s > 0) hits.push({ food: e.food, score: s });
    }
    hits.sort((a, b) => b.score - a.score || (b.food.rank ?? 50) - (a.food.rank ?? 50));
    return hits.slice(0, opts.limit ?? 30);
  }
}

function tokenMatch(qt: string, cands: string[]): number {
  let best = 0;
  for (const c of cands) {
    if (c === qt) return 1;
    if (c.startsWith(qt)) best = Math.max(best, qt.length >= 3 ? 0.85 : 0.6);
    else if (qt.length >= 4 && withinOneEdit(qt, c)) best = Math.max(best, 0.7);
    else if (qt.length >= 5 && c.length > qt.length && withinOneEdit(qt, c.slice(0, qt.length))) best = Math.max(best, 0.55);
  }
  return best;
}

function scoreEntry(e: Entry, q: string[], qNorm: string): number {
  // exact name or alias match is the strongest signal
  if (e.name === qNorm || e.aliasNames.includes(qNorm)) return 0.97 + rankBoost(e.food) * 0.03;

  const fields = [e.nameTokens, ...e.aliasTokens];
  let best = 0;
  for (const f of fields) {
    let total = 0;
    for (const qt of q) {
      const m = tokenMatch(qt, f);
      if (m === 0) {
        total = 0;
        break;
      }
      total += m;
    }
    if (!total) continue;
    let s = total / q.length; // all query tokens matched
    // prefer names whose first word is the query's first word ("banana" over "bread, banana")
    if (f[0]?.startsWith(q[0])) s += 0.08;
    // prefer concise names: query covers more of the name
    s -= Math.min(0.2, Math.max(0, f.length - q.length) * 0.03);
    best = Math.max(best, s);
  }
  if (!best) return 0;
  return Math.min(0.96, best * 0.85 + rankBoost(e.food) * 0.15);
}

const rankBoost = (f: Food) => (f.rank ?? 50) / 100;
