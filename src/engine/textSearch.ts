import { expandQuery } from './foodSynonyms';
import { NUTRIENTS } from './nutrients';
import { TYPO, TYPO_PREFIX, normalize, tokenMatch, tokens, withinOneEdit } from './search';
import type { NutrientKey, NutrientVector } from './types';

/**
 * Forgiving search over plans and meals, built on the food search's tokenizer and matcher:
 *  - plurals fold to the singular ("salmons" finds salmon), accents and punctuation are ignored;
 *  - a token may be the start of a word ("lent" finds lentils);
 *  - one typo is forgiven on words of 4+ letters ("salomn"), but only when nothing matches cleanly;
 *  - cooks' synonyms are tried too ("aubergine" finds eggplant, "dahi" finds yogurt);
 *  - every query word must match somewhere in the doc.
 * Words are looked up in a vocabulary built once, so a query costs a pass over the distinct words, not every doc.
 */

export interface SearchField {
  text: string;
  /** how much a match here counts: a name beats an ingredient */
  weight: number;
}

export interface SearchDoc {
  key: string;
  fields: SearchField[];
}

const isTypo = (m: number) => m === TYPO || m === TYPO_PREFIX;

export class TextIndex {
  /** word -> doc key -> the heaviest field it appears in */
  private vocab = new Map<string, Map<string, number>>();
  private words: string[] = [];

  constructor(docs: SearchDoc[]) {
    for (const d of docs) {
      for (const f of d.fields) {
        for (const w of tokens(f.text)) {
          let m = this.vocab.get(w);
          if (!m) this.vocab.set(w, (m = new Map()));
          if ((m.get(d.key) ?? 0) < f.weight) m.set(d.key, f.weight);
        }
      }
    }
    this.words = [...this.vocab.keys()];
  }

  /**
   * Doc key -> relevance for a query. Null when the query has no words (show everything); an empty map when nothing
   * matches.
   */
  search(query: string): Map<string, number> | null {
    const variants = expandQuery(query);
    if (!variants.length) return null;
    const clean = new Map<string, number>();
    const typo = new Map<string, number>();
    // a synonym ("bean curd" for "tofu") counts a little less than the words the person typed
    variants.forEach((v, i) => {
      const scale = i === 0 ? 1 : SYNONYM_SCALE;
      merge(clean, this.match(v.split(' '), false), scale);
      if (!clean.size) merge(typo, this.match(v.split(' '), true), scale);
    });
    return clean.size ? clean : typo;
  }

  private match(q: string[], allowTypos: boolean): Map<string, number> {
    let acc: Map<string, number> | undefined;
    for (const qt of q) {
      const hits = new Map<string, number>();
      for (const w of this.words) {
        const m = tokenMatch(qt, [w]);
        if (!m || (isTypo(m) && !allowTypos)) continue;
        for (const [key, weight] of this.vocab.get(w)!) hits.set(key, Math.max(hits.get(key) ?? 0, m * weight));
      }
      if (!acc) acc = hits;
      else {
        const next = new Map<string, number>();
        for (const [k, s] of acc) {
          const h = hits.get(k);
          if (h) next.set(k, s + h);
        }
        acc = next;
      }
      if (!acc.size) break;
    }
    // the average word, so a two-word synonym can't outscore a one-word query by length alone
    const out = new Map<string, number>();
    for (const [k, v] of acc ?? []) out.set(k, v / q.length);
    return out;
  }
}

const SYNONYM_SCALE = 0.8;

function merge(into: Map<string, number>, from: Map<string, number>, scale: number) {
  for (const [k, s] of from) into.set(k, Math.max(into.get(k) ?? 0, s * scale));
}

// ── Nutrient queries ─────────────────────────────────────────────────────────

export interface NutrientQuery {
  /** summed together: omega-3 is ALA + EPA + DHA */
  keys: NutrientKey[];
  label: string;
  /** what's left of the query once the nutrient and words like "high" are taken out */
  rest: string;
}

/** Phrases (already normalised) that name a nutrient, longest wins. */
const NUTRIENT_PHRASES: [string[], NutrientKey[], string?][] = [
  [['protein'], ['protein']],
  [['fibre', 'fiber'], ['fiber'], 'Fibre'],
  [['omega 3', 'omega3', 'omega three'], ['ala', 'epa', 'dha'], 'Omega-3'],
  [['vitamin a', 'vit a'], ['vitA']],
  [['vitamin c', 'vit c'], ['vitC']],
  [['vitamin d', 'vit d'], ['vitD']],
  [['vitamin e', 'vit e'], ['vitE']],
  [['vitamin k', 'vit k'], ['vitK']],
  [['thiamin', 'thiamine', 'vitamin b1', 'b1'], ['b1']],
  [['riboflavin', 'vitamin b2', 'b2'], ['b2']],
  [['niacin', 'vitamin b3', 'b3'], ['b3']],
  [['pantothenic acid', 'vitamin b5', 'b5'], ['b5']],
  [['vitamin b6', 'b6'], ['b6']],
  [['biotin', 'vitamin b7', 'b7'], ['b7']],
  [['folate', 'folic acid', 'vitamin b9', 'b9'], ['folate'], 'Folate'],
  [['vitamin b12', 'b12'], ['b12']],
  [['choline'], ['choline']],
  [['calcium'], ['calcium']],
  [['iron'], ['iron']],
  [['magnesium'], ['magnesium']],
  [['phosphorus'], ['phosphorus']],
  [['potassium'], ['potassium']],
  [['zinc'], ['zinc']],
  [['copper'], ['copper']],
  [['manganese'], ['manganese']],
  [['selenium'], ['selenium']],
  [['iodine'], ['iodine']],
];

/** Words around a nutrient that only say "lots of it". */
const NUTRIENT_FILLER = new Set(['high', 'higher', 'highest', 'rich', 'in', 'lot', 'lots', 'of', 'more', 'most', 'good', 'great', 'source', 'sources', 'food', 'foods', 'meal', 'meals', 'plan', 'plans', 'best', 'top', 'with', 'packed', 'loaded', 'full', 'for', 'a', 'the']);

/**
 * "high iron", "iron rich lentils", "vitamin d", "omega-3", "calcuim": the nutrient to rank by, plus any words left
 * over to search with. Null when the query names no nutrient.
 */
export function parseNutrientQuery(query: string): NutrientQuery | null {
  const words = normalize(query).replace(/\bomega 3\b/g, 'omega3').split(' ').filter(Boolean);
  if (!words.length) return null;
  let best: { at: number; len: number; keys: NutrientKey[]; label?: string } | undefined;
  for (const [phrases, keys, label] of NUTRIENT_PHRASES) {
    for (const p of phrases) {
      const pw = p.replace(/\bomega 3\b/g, 'omega3').split(' ');
      for (let i = 0; i + pw.length <= words.length; i++) {
        // one typo is fine on a single long word ("calcuim", "magnesim")
        const ok = pw.every((w, j) => words[i + j] === w || (pw.length === 1 && w.length >= 5 && withinOneEdit(words[i + j], w)));
        if (ok && (!best || pw.length > best.len)) best = { at: i, len: pw.length, keys, label };
      }
    }
  }
  if (!best) return null;
  const rest = [...words.slice(0, best.at), ...words.slice(best.at + best.len)].filter((w) => !NUTRIENT_FILLER.has(w)).join(' ');
  return { keys: best.keys, label: best.label ?? NUTRIENTS[best.keys[0]].label, rest };
}

/** The amount of a nutrient query's nutrient in a set of totals (null when none of its parts has data). */
export function nutrientAmount(totals: NutrientVector, keys: NutrientKey[]): number | null {
  let sum = 0;
  let any = false;
  for (const k of keys) {
    const v = totals[k];
    if (v != null) {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}
