/**
 * "Find my plan": the quiz answers in, a ranked shortlist out.
 *
 * Hard filters decide what a person can be offered at all (diet, carb style, calorie band, life stage). Soft scores
 * rank what is left (why they came, the dishes they liked, weeknight time, who they cook for, budget). The top three
 * are kept different from each other, so the choice feels real without being a wall of plans.
 *
 * Pure: the quiz screens and the Plans tab "For you" row both call it.
 */
import { BAND_STEP, dayPlanTotal, type FoodIndex } from './calc';
import { dietMatches, familyVisible, pickSize, recipeMinutes, type PlanFamily, type SizePick } from './families';
import { planCollection } from './browse';
import type { CarbStyle, Goal, LifeStage, MealPlan, PlanStyle } from './types';

// ── Answers ──────────────────────────────────────────────────────────────────

export type QuizReason =
  | 'healthier'
  | 'lose'
  | 'muscle'
  | 'training'
  | 'energy'
  | 'heart'
  | 'blood-sugar'
  | 'pregnancy'
  | 'hormones'
  | 'gut'
  | 'ageing';

export type FlavourGroup = 'med' | 'mideast' | 'southasia' | 'eastasia' | 'seasia' | 'latin' | 'african' | 'northern';
export type Taste = 'yum' | 'nah';
export type WeeknightTime = 'quick' | 'medium' | 'love';
export type CookingFor = 'one' | 'two' | 'family';
export type Budget = 'cheap' | 'middle' | 'treat';
export type Nudge = 'quicker' | 'adventurous' | 'cheaper';

export interface QuizAnswers {
  /** up to two */
  reasons: QuizReason[];
  /** keyed by flavour group (one taste card per group) */
  tastes: Partial<Record<FlavourGroup, Taste>>;
  diet: string[];
  carbStyle?: CarbStyle;
  time?: WeeknightTime;
  cookingFor?: CookingFor;
  budget?: Budget;
  lifeStage?: LifeStage;
  /** the person's daily calorie target, once the body numbers are in */
  kcal?: number;
  /** the goal the calories were worked out for (the activity step); wins over the one read from the reasons */
  goal?: Goal;
  /** the person's daily protein goal in grams, once the body numbers are in */
  proteinGoal?: number;
}

export const EMPTY_ANSWERS: QuizAnswers = { reasons: [], tastes: {}, diet: [] };

export const REASONS: { key: QuizReason; label: string }[] = [
  { key: 'healthier', label: 'Eat healthier' },
  { key: 'lose', label: 'Lose weight' },
  { key: 'muscle', label: 'Build muscle' },
  { key: 'training', label: 'Fuel my training' },
  { key: 'energy', label: 'More energy' },
  { key: 'heart', label: 'Heart health' },
  { key: 'blood-sugar', label: 'Steadier blood sugar' },
  { key: 'pregnancy', label: 'Pregnancy or a new baby' },
  { key: 'hormones', label: 'Hormones (PCOS, menopause)' },
  { key: 'gut', label: 'Gut health' },
  { key: 'ageing', label: 'Ageing well' },
];

/** Lose wins over muscle (eating to lose while lifting keeps the deficit); muscle alone means a small surplus. */
export function goalFromReasons(reasons: QuizReason[]): Goal {
  if (reasons.includes('lose')) return 'lose';
  if (reasons.includes('muscle')) return 'gain';
  return 'maintain';
}

// ── Flavour groups and the taste test ────────────────────────────────────────

export const FLAVOUR_LABEL: Record<FlavourGroup, string> = {
  med: 'Mediterranean',
  mideast: 'Middle Eastern',
  southasia: 'South Asian',
  eastasia: 'East Asian',
  seasia: 'Southeast Asian',
  latin: 'Latin American',
  african: 'African',
  northern: 'North American and European',
};

/** One dish per flavour group: a signature dish of a regional plan, so the plate art and the name are real. */
export const TASTE_CARDS: { group: FlavourGroup; recipeId: string; title: string; from: string; blurb: string }[] = [
  { group: 'med', recipeId: 'lemon-chicken-potatoes', title: 'Greek lemon chicken and potatoes', from: 'Greece', blurb: 'Roasted with lemon, garlic and oregano, with a garlicky yogurt on the side' },
  { group: 'eastasia', recipeId: 'beef-bibimbap-namul', title: 'Bibimbap with beef and namul', from: 'Korea', blurb: 'A rice bowl topped with seared beef, sesame greens, carrots, mushrooms and an egg' },
  { group: 'latin', recipeId: 'mexico-salmon-tacos-baja', title: 'Baja-style salmon tacos', from: 'Mexico', blurb: 'Corn tortillas, crunchy cabbage slaw, jalapeño and a lime yogurt crema' },
  { group: 'southasia', recipeId: 'chicken-karahi-roti', title: 'Chicken karahi with roti', from: 'Pakistan', blurb: 'Chicken simmered with tomato, ginger, garlic and green chili, with warm roti' },
  { group: 'mideast', recipeId: 'shish-tawook-tabbouleh', title: 'Shish tawook with tabbouleh', from: 'Lebanon', blurb: 'Garlicky lemon chicken skewers with a fresh parsley and mint salad' },
  { group: 'seasia', recipeId: 'thai-viet-red-curry-chicken-tofu-gai-lan', title: 'Thai red curry with chicken', from: 'Thailand', blurb: 'Coconut, lemongrass and chili, with tofu and crisp gai lan' },
  { group: 'northern', recipeId: 'north-america-maple-mustard-roasted-salmon-squash-brussels', title: 'Maple-mustard salmon', from: 'Canada', blurb: 'Roasted on a sheet pan with butternut squash and Brussels sprouts' },
  { group: 'african', recipeId: 'chicken-yassa-millet', title: 'Chicken yassa with millet', from: 'Senegal', blurb: 'Chicken in a tangy sauce of slow-cooked onions, lime and mustard' },
];

const REGION_GROUP: Record<string, FlavourGroup> = {};
const put = (g: FlavourGroup, names: string) => names.split('|').forEach((n) => (REGION_GROUP[n.trim().toLowerCase()] = g));
put('med', 'Italy|Greece|Spain|France|the Mediterranean|Crete|Provence|Portugal|southern Italy|Sicily|the Greek islands|the Balkans');
put(
  'mideast',
  'Lebanon|Turkey|Morocco|Iran|Syria|the Levant|Levant|the Gulf|Egypt|Palestine|Middle East|Jordan|Tunisia|Algeria|Israel|Saudi Arabia|Emirates|Oman|Kuwait|Qatar|Bahrain|Gilan|Black Sea coast|Antalya|Southeast Anatolia|Cairo|Alexandria|Sudan',
);
put(
  'southasia',
  'India|Tamil Nadu|Gujarat|Punjab|Kerala|Karnataka|Pakistan|Sri Lanka|Maharashtra|Delhi|Lucknow|Lahore|Bengal|North India|Bangladesh|Andhra Pradesh|Rajasthan',
);
put('eastasia', 'Japan|China|Korea|Cantonese|Sichuan|Shanghainese|Northern China|Taiwan|East Asia');
put('seasia', 'Thailand|Vietnam|Philippines|Indonesia|Malaysia|Central Thailand|Isaan|Northern Vietnam|Southern Vietnam');
put(
  'latin',
  'Mexico|Peru|Colombia|Brazil|Cuba|Argentina|Jamaica|Trinidad and Tobago|Puerto Rico|Haiti|Latin America|Central America|the Caribbean|Central Mexico|Oaxaca|Yucatán|Pacific coast|Chile|the Southwest',
);
put('african', "Ethiopia|Kenya|Somalia|Tanzania|West Africa|South Africa|Zimbabwe|Mozambique|Botswana|Nigeria|Ghana|Senegal|Côte d'Ivoire");
put(
  'northern',
  'Canada|United States|the US|United Kingdom|Britain|England|Scandinavia|Sweden|Germany|Eastern Europe|Poland|Hungary|Norway|Denmark|Finland|Ukraine|Georgia|Iceland|New England|the South|the Midwest|the Pacific Northwest|the American South|The North',
);

/** Fallback when a family names no known region: its cuisine line. */
const CUISINE_GROUP: [RegExp, FlavourGroup][] = [
  [/mediterr|greek|italian|spanish/i, 'med'],
  [/middle east|levant|persian|turkish|gulf|north african|egyptian/i, 'mideast'],
  [/south asian|indian/i, 'southasia'],
  [/southeast|maritime/i, 'seasia'],
  [/east asian|chinese|japanese|korean|asian/i, 'eastasia'],
  [/latin|mexican|south american|caribbean/i, 'latin'],
  [/african/i, 'african'],
  [/north american|nordic|european|georgian/i, 'northern'],
];

// ── What the quiz knows about each family (computed once) ─────────────────────

interface FamilyFacts {
  /** share of the family's regions in each flavour group, summing to 1 when any are known */
  groups: Partial<Record<FlavourGroup, number>>;
  /** the group with the biggest share, for keeping the shortlist varied */
  mainGroup?: FlavourGroup;
  /** average prep plus cook minutes of the dinners cooked fresh */
  dinnerMinutes?: number;
  /** share of meals that are leftovers (cook once, eat twice) */
  leftoverShare: number;
}

const factsCache = new WeakMap<PlanFamily, FamilyFacts>();

export function familyFacts(f: PlanFamily): FamilyFacts {
  const hit = factsCache.get(f);
  if (hit) return hit;
  const counts: Partial<Record<FlavourGroup, number>> = {};
  let known = 0;
  for (const r of f.regions) {
    const g = REGION_GROUP[r.trim().toLowerCase()];
    if (g) {
      counts[g] = (counts[g] ?? 0) + 1;
      known++;
    }
  }
  if (!known) {
    const g = CUISINE_GROUP.find(([re]) => re.test(f.cuisine))?.[1];
    if (g) {
      counts[g] = 1;
      known = 1;
    }
  }
  const groups: Partial<Record<FlavourGroup, number>> = {};
  for (const g in counts) groups[g as FlavourGroup] = counts[g as FlavourGroup]! / known;
  const mainGroup = (Object.entries(groups) as [FlavourGroup, number][]).sort((a, b) => b[1] - a[1])[0]?.[0];

  const lead = f.sizes.find((p) => p.size === 'standard') ?? f.sizes[0];
  const mins: number[] = [];
  let meals = 0;
  let leftovers = 0;
  for (const d of lead?.days ?? [])
    for (const m of d.meals) {
      meals++;
      if (m.leftover) leftovers++;
      else if (m.slot === 'dinner') {
        const t = recipeMinutes(m);
        if (t) mins.push(t);
      }
    }
  const facts: FamilyFacts = {
    groups,
    mainGroup,
    dinnerMinutes: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : undefined,
    leftoverShare: meals ? leftovers / meals : 0,
  };
  factsCache.set(f, facts);
  return facts;
}

/** Share of a plan's calories that comes from protein, averaged over its days (0.25 = 25%). */
const proteinCache = new WeakMap<MealPlan, number>();
export function proteinShare(plan: MealPlan, foods: FoodIndex): number {
  const hit = proteinCache.get(plan);
  if (hit !== undefined) return hit;
  let kcal = 0;
  let protein = 0;
  for (const d of plan.days) {
    const t = dayPlanTotal(d, foods);
    kcal += t.kcal ?? 0;
    protein += t.protein ?? 0;
  }
  const share = kcal ? (protein * 4) / kcal : 0;
  proteinCache.set(plan, share);
  return share;
}

/** Grams of protein a day the plan gives at the person's calories (the app sizes the plan to them). */
export function proteinPerDay(plan: MealPlan, foods: FoodIndex, kcal: number): number {
  return Math.round((proteinShare(plan, foods) * kcal) / 4);
}

// ── Scoring ──────────────────────────────────────────────────────────────────

/** How strongly each reason pulls each plan style up. */
const REASON_STYLES: Record<QuizReason, Partial<Record<PlanStyle, number>>> = {
  healthier: {},
  lose: { 'fat-loss': 3, 'low-gi': 1 },
  muscle: { muscle: 3, 'muscle-plant': 3, endurance: 1 },
  training: { endurance: 3, muscle: 2, 'muscle-plant': 2 },
  energy: { 'iron-focus': 2, 'low-gi': 1 },
  heart: { heart: 3, 'low-gi': 1 },
  'blood-sugar': { 'low-gi': 3, pcos: 1, keto: 1 },
  pregnancy: { prenatal: 3, postpartum: 3 },
  hormones: { pcos: 3, menopause: 3 },
  gut: { gut: 3 },
  ageing: { 'healthy-aging': 3, heart: 1 },
};

/** What every plan already does for a reason, said when no plan built for it made the cut (true of every plan: the 80% framework). */
const REASON_ANYWAY: Partial<Record<QuizReason, string>> = {
  heart: 'High in fibre, low in saturated fat',
  'blood-sugar': 'Plenty of fibre in every day',
  gut: 'Plenty of fibre in every day',
  energy: 'Iron and B vitamins covered every day',
  ageing: 'Every vitamin and mineral, every day',
  hormones: 'Every vitamin and mineral, every day',
};

const REASON_PHRASE: Record<QuizReason, string> = {
  healthier: 'Everyday healthy eating',
  lose: 'Built for losing weight',
  muscle: 'Built for muscle',
  training: 'Built to fuel training',
  energy: 'Built for steady energy',
  heart: 'Built for heart health',
  'blood-sugar': 'Built for steady blood sugar',
  pregnancy: 'Made for pregnancy and new parents',
  hormones: 'Made for hormone health',
  gut: 'Built for gut health',
  ageing: 'Built for ageing well',
};

/** Styles that only make sense when someone asks for them. */
const NICHE: Partial<Record<PlanStyle, number>> = { ramadan: -4, keto: -2 };
/** Styles that say how someone eats: worth a nudge when the diet matches. */
const DIET_STYLES: Partial<Record<PlanStyle, string>> = {
  vegan: 'vegan',
  vegetarian: 'vegetarian',
  pescatarian: 'pescatarian',
  'gluten-free': 'gluten-free',
  'dairy-free': 'dairy-free',
};
const GENERAL: QuizReason[] = ['healthier', 'energy'];

export interface Match {
  family: PlanFamily;
  pick: SizePick;
  score: number;
  /** short phrases for "Why this fits you", best first */
  why: string[];
  /** grams of protein a day at the person's calories (or the size's own) */
  protein: number;
}

export interface MatchResult {
  /** best first, the top three varied */
  ranked: Match[];
  /** false when the carb choice had to be loosened to offer anything (the diet never is) */
  exact: boolean;
  /** plans still in the running, for the quiz counter */
  remaining: number;
  /** library size, for "we checked all of them" */
  total: number;
  sizes: number;
}

function hardPass(f: PlanFamily, a: QuizAnswers, foods: FoodIndex): boolean {
  if (a.carbStyle && !familyVisible(f, a.carbStyle, foods)) return false;
  if (a.diet.length && !dietMatches(f, a.diet)) return false;
  // a pregnancy or breastfeeding plan is built for that life stage only (until it's asked, every plan is still in the running)
  if (a.lifeStage && f.lifeStage && f.lifeStage !== 'none' && f.lifeStage !== a.lifeStage) return false;
  if (a.kcal && pickSize(f, a.kcal).gap > BAND_STEP) return false;
  return true;
}

/** A plan the soft answers have clearly ruled out. Each rule only ever adds as answers come in, so the counter only falls. */
function ruledOut(f: PlanFamily, a: QuizAnswers): boolean {
  const facts = familyFacts(f);
  const style = f.style ?? 'balanced';
  // came for something specific: purpose-built plans for other goals drop out
  if (a.reasons.length && REASON_STYLE_SET.has(style) && !a.reasons.some((r) => (REASON_STYLES[r][style] ?? 0) > 0)) return true;
  if (a.reasons.length && NICHE[style] !== undefined && !a.reasons.some((r) => (REASON_STYLES[r][style] ?? 0) > 0)) return true;
  // every flavour it cooks was a "not for me"
  const gs = Object.keys(facts.groups) as FlavourGroup[];
  if (gs.length && gs.every((g) => a.tastes[g] === 'nah')) return true;
  if (a.time === 'quick' && (facts.dinnerMinutes ?? 0) > 45) return true;
  return false;
}
const REASON_STYLE_SET = new Set<string>(Object.values(REASON_STYLES).flatMap((m) => Object.keys(m)));

function scoreFamily(f: PlanFamily, a: QuizAnswers, protein: { share: number; grams: number }, nudge?: Nudge): { score: number; why: string[] } {
  const facts = familyFacts(f);
  const style = (f.style ?? 'balanced') as PlanStyle;
  const why: { w: number; text: string }[] = [];
  let score = 0;

  // why they came
  for (const r of a.reasons) {
    const w = REASON_STYLES[r][style] ?? 0;
    if (w > 0) {
      score += w;
      why.push({ w: w + 1, text: REASON_PHRASE[r] });
    }
  }
  if (!a.reasons.some((r) => (REASON_STYLES[r][style] ?? 0) > 0)) {
    const anyway = a.reasons.map((r) => REASON_ANYWAY[r]).find(Boolean);
    if (anyway) why.push({ w: 1.2, text: anyway });
  }
  const general = !a.reasons.length || a.reasons.some((r) => GENERAL.includes(r));
  if (general && planCollection(f) === 'everyday') {
    score += 1.5;
    why.push({ w: 1, text: 'An everyday plan, easy to live with' });
  }
  score += NICHE[style] ?? 0;
  const dietStyle = DIET_STYLES[style];
  if (dietStyle && a.diet.includes(dietStyle)) score += 1.5;

  // protein, for people building muscle or training
  if (a.reasons.includes('muscle') || a.reasons.includes('training')) {
    const pct = protein.share * 100;
    score += Math.max(-1, Math.min(3, (pct - 20) / 3));
    if (a.proteinGoal && protein.grams < a.proteinGoal) score -= 3;
    if (pct >= 25) why.push({ w: 3.5, text: `High in protein: ${Math.round(pct)}% of calories` });
  }

  // life stage
  if (f.lifeStage && f.lifeStage !== 'none' && f.lifeStage === a.lifeStage) {
    score += 6;
    why.push({ w: 6, text: f.lifeStage === 'pregnant' ? 'Made for pregnancy' : 'Made for breastfeeding' });
  }

  // the taste test
  let taste = 0;
  const liked: FlavourGroup[] = [];
  for (const [g, share] of Object.entries(facts.groups) as [FlavourGroup, number][]) {
    const t = a.tastes[g];
    if (t === 'yum') {
      taste += share;
      liked.push(g);
    } else if (t === 'nah') taste -= share;
  }
  score += taste * 4;
  // focused tastes: someone who liked only a few kitchens wants the plans that cook them
  const yums = Object.values(a.tastes).filter((t) => t === 'yum').length;
  if (yums && yums <= 3 && facts.mainGroup && a.tastes[facts.mainGroup] === 'yum') score += 1.5;
  if (liked.length && taste > 0.25)
    why.push({ w: 2 + taste * 2, text: `Flavours you liked: ${liked.slice(0, 2).map((g) => FLAVOUR_LABEL[g]).join(', ')}` });
  if (nudge === 'adventurous') score += Object.keys(facts.groups).length * 0.8;

  // weeknight time
  const mins = facts.dinnerMinutes;
  const timeWeight = nudge === 'quicker' ? 3 : 1;
  if (mins !== undefined) {
    if (a.time === 'quick' || nudge === 'quicker') {
      score += timeWeight * (mins <= 25 ? 2 : mins <= 35 ? 1 : mins <= 45 ? 0 : -2);
      if (mins <= 35) why.push({ w: 1.5, text: `Dinners in about ${Math.max(10, Math.round(mins / 5) * 5)} minutes` });
    } else if (a.time === 'medium') score += mins <= 40 ? 0.5 : 0;
    else if (a.time === 'love') score += mins >= 35 ? 0.75 : 0;
  }
  if (style === 'quick' && (a.time === 'quick' || nudge === 'quicker')) score += 2;

  // who they cook for
  if (a.cookingFor === 'family' && style === 'family') {
    score += 2.5;
    why.push({ w: 2, text: 'Built for family dinners' });
  } else if (a.cookingFor === 'family') score += facts.leftoverShare;
  else if (a.cookingFor === 'one') {
    score += facts.leftoverShare * 2;
    if (facts.leftoverShare >= 0.15) why.push({ w: 1, text: 'Cook once, eat twice' });
  }

  // budget
  const cheapWeight = nudge === 'cheaper' ? 3 : a.budget === 'cheap' ? 1 : 0;
  if (style === 'budget' && cheapWeight) {
    score += 2.5 * cheapWeight;
    why.push({ w: 2, text: 'Easy on the grocery bill' });
  }
  if (cheapWeight) score += facts.leftoverShare * cheapWeight;

  return { score, why: why.sort((x, y) => y.w - x.w).map((x) => x.text) };
}

/** Pick the top three so they differ in kitchen or style; the rest follow by score. */
function diversify(sorted: Match[]): Match[] {
  const picked: Match[] = [];
  const rest = [...sorted];
  while (picked.length < 3 && rest.length) {
    let bestI = 0;
    let best = -Infinity;
    // never two of the same kitchen and the same style, when there is anything else to offer
    const twin = (m: Match) =>
      picked.some((p) => familyFacts(p.family).mainGroup === familyFacts(m.family).mainGroup && (p.family.style ?? 'balanced') === (m.family.style ?? 'balanced'));
    const allTwins = rest.every(twin);
    rest.forEach((m, i) => {
      if (!allTwins && twin(m)) return;
      const fm = familyFacts(m.family);
      let s = m.score;
      for (const p of picked) {
        const fp = familyFacts(p.family);
        if (fm.mainGroup && fm.mainGroup === fp.mainGroup) s -= 2;
        if ((m.family.style ?? 'balanced') === (p.family.style ?? 'balanced')) s -= 1;
      }
      if (s > best) {
        best = s;
        bestI = i;
      }
    });
    picked.push(rest.splice(bestI, 1)[0]);
  }
  return [...picked, ...rest];
}

const GOAL_TAIL: Record<Goal, string> = { lose: ' for steady weight loss', gain: ' for building muscle', maintain: '' };

export function matchPlans(families: PlanFamily[], a: QuizAnswers, foods: FoodIndex, nudge?: Nudge): MatchResult {
  const library = families.filter((f) => f.isLibrary);
  const pool = library.length ? library : families;
  const sizes = pool.reduce((n, f) => n + f.sizes.length, 0);

  // The diet is never relaxed (a vegan only ever sees vegan plans). When nothing fits, loosen the calorie band first
  // (the closest few sizes), then the carb style.
  let exact = true;
  let passed = pool.filter((f) => hardPass(f, a, foods));
  if (!passed.length && a.kcal) {
    const loose = { ...a, kcal: undefined };
    passed = pool
      .filter((f) => hardPass(f, loose, foods))
      .sort((x, y) => pickSize(x, a.kcal!).gap - pickSize(y, a.kcal!).gap)
      .slice(0, 3);
  }
  if (!passed.length && a.carbStyle) {
    exact = false;
    const loose = { ...a, carbStyle: undefined };
    passed = pool.filter((f) => hardPass(f, loose, foods));
  }

  let inRunning = passed.filter((f) => !ruledOut(f, a));
  if (!inRunning.length && a.carbStyle && a.carbStyle !== 'any') {
    // only plans for other purposes fit (gluten-free and whole-food carbs leaves the keto plans): loosen the carbs instead
    const loose = { ...a, carbStyle: undefined };
    const wider = pool.filter((f) => hardPass(f, loose, foods) && !ruledOut(f, loose));
    if (wider.length) {
      exact = false;
      passed = pool.filter((f) => hardPass(f, loose, foods));
      inRunning = wider;
    }
  }
  const scored = (inRunning.length ? inRunning : passed).map((family): Match => {
    const pick = pickSize(family, a.kcal ?? 2000);
    const share = proteinShare(pick.plan, foods);
    const grams = Math.round((share * (a.kcal ?? (pick.plan.band.min + pick.plan.band.max) / 2)) / 4);
    const { score, why } = scoreFamily(family, a, { share, grams }, nudge);
    const extra: string[] = [];
    if (a.diet.length) extra.push(a.diet.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(', '));
    if (a.kcal && pick.covered)
      extra.push(`Sized to your ${a.kcal.toLocaleString('en-CA')} kcal${GOAL_TAIL[a.goal ?? goalFromReasons(a.reasons)]}`);
    return { family, pick, score, why: [...why, ...extra].slice(0, 3), protein: grams };
  });
  scored.sort((x, y) => y.score - x.score || x.family.name.localeCompare(y.family.name));

  return { ranked: diversify(scored), exact, remaining: inRunning.length, total: pool.length, sizes };
}
