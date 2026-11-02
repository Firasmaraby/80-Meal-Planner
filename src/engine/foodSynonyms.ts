import { tokens, type FoodSearch } from './search';
import type { Food } from './types';

/**
 * Names a cook uses for the same food. Each row is one food; a query that contains any term (as whole words) is also tried with each of the
 * other terms, so "hing" finds "Asafoetida" and "dahi" finds "Yogurt". Used by scripts/find-food.mjs (recipe writers looking for a food id);
 * the app's own search is unchanged. Keep terms lower case, plain letters.
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // Indian pantry
  ['hing', 'asafoetida', 'asafetida'],
  ['dahi', 'curd', 'yogurt', 'yoghurt'],
  ['atta', 'whole wheat flour', 'wholemeal flour', 'chapati flour'],
  ['chana', 'chickpea', 'garbanzo', 'garbanzo bean', 'kabuli chana'],
  ['chana dal', 'split chickpea', 'bengal gram'],
  ['besan', 'chickpea flour', 'gram flour', 'garbanzo flour'],
  ['rajma', 'kidney bean'],
  ['masoor', 'red lentil', 'masoor dal'],
  ['toor', 'arhar', 'pigeon pea', 'toor dal'],
  ['moong', 'mung', 'green gram', 'moong dal'],
  ['urad', 'black gram', 'urad dal'],
  ['methi', 'fenugreek'],
  ['kasuri methi', 'dried fenugreek leaves'],
  ['haldi', 'turmeric'],
  ['jeera', 'cumin'],
  ['dhania', 'coriander seed'],
  ['saunf', 'fennel seed'],
  ['elaichi', 'cardamom'],
  ['dalchini', 'cinnamon'],
  ['laung', 'clove'],
  ['tej patta', 'bay leaf', 'laurel leaves'],
  ['kadi patta', 'curry leaves'],
  ['rai', 'mustard seed'],
  ['kalonji', 'nigella', 'black cumin'],
  ['amchur', 'amchoor', 'mango powder'],
  ['imli', 'tamarind'],
  ['gur', 'jaggery', 'panela'],
  ['bhindi', 'okra', 'ladies finger'],
  ['baingan', 'eggplant', 'aubergine', 'brinjal'],
  ['ghee', 'clarified butter'],
  // vegetables and herbs, UK / US / other names
  ['scallion', 'green onion', 'spring onion'],
  ['cilantro', 'coriander leaves', 'dhania leaves'],
  ['zucchini', 'courgette'],
  ['arugula', 'rocket'],
  ['bell pepper', 'capsicum', 'sweet pepper'],
  ['beet', 'beetroot'],
  ['rutabaga', 'swede'],
  ['bok choy', 'pak choi'],
  ['snow pea', 'mangetout'],
  ['sweet corn', 'maize'],
  ['daikon', 'mooli', 'white radish'],
  // staples
  ['shrimp', 'prawn'],
  ['cornstarch', 'cornflour', 'corn starch'],
  ['all purpose flour', 'plain flour'],
  ['self rising flour', 'self raising flour'],
  ['powdered sugar', 'icing sugar', 'confectioners sugar'],
  ['superfine sugar', 'caster sugar'],
  ['ground beef', 'minced beef', 'beef mince'],
  ['ground pork', 'minced pork', 'pork mince'],
  ['rapeseed oil', 'canola oil'],
  ['tahini', 'sesame paste'],
  ['tofu', 'bean curd'],
  ['soy', 'soya'],
  // Middle East, Korea, Japan
  ['sumac', 'sumach'],
  ['za atar', 'zaatar', 'zatar'],
  ['labneh', 'labne', 'yogurt cheese', 'strained yogurt'],
  ['gochugaru', 'korean chili flake', 'korean red pepper flake'],
  ['gochujang', 'korean chili paste'],
  ['doenjang', 'korean soybean paste', 'soybean paste'],
  ['kombu', 'kelp', 'dried kelp'],
  ['perilla', 'shiso', 'egoma'],
  ['egusi', 'melon seed'],
  ['seven spice', 'baharat'],
  ['black salt', 'kala namak'],
  ['carom', 'ajwain', 'ajowan'],
  ['kashmiri mirch', 'kashmiri chili powder', 'kashmiri chilli powder'],
  ['chili', 'chilli', 'chile'],
  ['garam masala', 'warm spice blend'],
];

const MAX_VARIANTS = 8;

const termTokens = SYNONYM_GROUPS.map((g) => g.map((t) => tokens(t)));

// the app's tokenizer singularizes "leaves" to "leave"; a cook who types "leaf" means the same
const canon = (t: string) => (t === 'leaf' ? 'leave' : t);

function indexOfRun(hay: string[], needle: string[]): number {
  if (!needle.length) return -1;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (canon(hay[i + j]) !== canon(needle[j])) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

/**
 * The query itself first, then the same query with one known term swapped for each of its synonyms ("dahi low fat" ->
 * "yogurt low fat"). Whole-word match on the app's own tokenizer (singular forms, no stop words). At most 8 strings.
 */
export function expandQuery(query: string): string[] {
  const q = tokens(query);
  if (!q.length) return [];
  const out = [q.join(' ')];
  const seen = new Set(out);
  for (let g = 0; g < termTokens.length && out.length < MAX_VARIANTS; g++) {
    const terms = termTokens[g];
    // the longest term of the group that occurs in the query ("urad dal" rather than "urad" inside it)
    let t = -1;
    for (let i = 0; i < terms.length; i++) if (indexOfRun(q, terms[i]) >= 0 && (t < 0 || terms[i].length > terms[t].length)) t = i;
    if (t < 0) continue;
    const at = indexOfRun(q, terms[t]);
    for (let u = 0; u < terms.length && out.length < MAX_VARIANTS; u++) {
      if (u === t) continue;
      const v = [...q.slice(0, at), ...terms[u], ...q.slice(at + terms[t].length)].join(' ');
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
  }
  return out;
}

export interface FoodHit {
  /** the best food of this head */
  food: Food;
  /** every matching food with the same head, best first (the first is `food`) */
  group: Food[];
  /** the query variant that found it; undefined when the query as typed did */
  via?: string;
  /** match class 0..4 of the best member (see search.ts) */
  cls: number;
  score: number;
}

const isEveryday = (f: Food) => (f.tier === 'everyday' ? 1 : 0);
const byQuality = (a: Food, b: Food) => isEveryday(b) - isEveryday(a) || (b.rank ?? 50) - (a.rank ?? 50) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Search with synonyms: runs the query and its variants, keeps one row per head group (the best hit of any variant), and orders the rows like
 * the app's search: match class, everyday before extended, score, rank. The query as typed wins ties.
 */
export function findFoods(search: FoodSearch, query: string, opts: { limit?: number } = {}): { variants: string[]; hits: FoodHit[] } {
  const variants = expandQuery(query);
  const typed = variants[0];
  const rows = new Map<string, FoodHit & { members: Map<string, Food> }>();
  for (const v of variants) {
    for (const h of search.search(v, { limit: 200, includeRare: true })) {
      const key = h.food.head ? `head:${h.food.head}` : `id:${h.food.id}`;
      const cls = h.cls ?? 0;
      const cur = rows.get(key);
      if (!cur) {
        rows.set(key, { food: h.food, group: [], via: v === typed ? undefined : v, cls, score: h.score, members: new Map((h.group ?? [h.food]).map((f) => [f.id, f])) });
        continue;
      }
      for (const f of h.group ?? [h.food]) cur.members.set(f.id, f);
      const wins = cls - cur.cls || isEveryday(h.food) - isEveryday(cur.food) || h.score - cur.score;
      if (wins > 0) Object.assign(cur, { food: h.food, cls, score: h.score, via: v === typed ? undefined : v });
    }
  }
  const out: FoodHit[] = [...rows.values()].map(({ members, ...r }) => ({ ...r, group: [...members.values()].sort(byQuality) }));
  out.sort((a, b) => b.cls - a.cls || isEveryday(b.food) - isEveryday(a.food) || b.score - a.score || (b.food.rank ?? 50) - (a.food.rank ?? 50) || (a.food.id < b.food.id ? -1 : 1));
  for (const r of out) r.group = [r.food, ...r.group.filter((f) => f.id !== r.food.id)];
  // a word that only sits inside a longer one ("hing" in "scratching") is noise when the real thing was found
  const strong = out.some((r) => r.cls >= 2);
  return { variants, hits: (strong ? out.filter((r) => r.cls >= 2) : out).slice(0, opts.limit ?? 8) };
}
