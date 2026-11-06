/**
 * The author's loop for a plan family (scripts/plan-lab.mjs is a thin wrapper around `runLab`).
 *
 * For every size and every calorie band it claims, at both edges of the band (lowest and highest kcal):
 *   1. size the size's plan to that kcal with the app's own engine (personalizeDay);
 *   2. grade each day against the reference panel and the style's rules (gradePlan);
 *   3. run the style's gates (planStyles.ts);
 *   4. run the cooking-sense checks on what a person would actually eat (oil, salt, spices, a protein source).
 * Once per file: the writing checks (dashes, about, steps, summary) and the shape of the week (ingredients and steps per
 * recipe, repeats, grocery count).
 *
 * Exit code: 0 passes, 1 the file is malformed (nothing was graded), 2 it is well formed but fails a gate.
 */
import { dayPlanTotal, getFood, type FoodIndex } from './calc';
import {
  SIZES,
  SIZE_LABEL,
  bandString,
  compileSize,
  lintDashes,
  sizePlan,
  validateFamily,
  type CompileContext,
  type FamilyFile,
  type FormatIssue,
  type ValidateContext,
} from './family';
import { boldStats, markerCount, paragraphWords, parseRich } from './richText';
import { HARD_NUTRIENTS, fixListForAI, gradePlan, type DayReport } from './planReport';
import { SIZING_TOLERANCE, sizingAdvice } from './personalize';
import { carbStyleFits, carbStyleOfIngredient } from './carbStyle';
import { isHighMercuryFish, isLiver, isProteinSource } from './foodRoles';
import { PLAN_STYLES, distinctGroceries, gradeOptionsFor, isSpiceShelf, styleNutrientGates, styleStructureGates } from './planStyles';
import type { CalorieBand, Food, MealPlan, NutrientKey, PlanSize } from './types';

export interface LabFailure {
  /** gate: the framework and style gates; cooking: amounts and shape of recipes; writing: the guide's voice rules */
  kind: 'gate' | 'cooking' | 'writing';
  code: string;
  message: string;
  fix?: string;
  size?: PlanSize;
  /** the calorie level the failing plan was sized to */
  kcal?: number;
  day?: number;
  days?: number[];
  recipe?: string;
}

export interface LabDay {
  day: number;
  kcal: number;
  proteinPct: number;
  satPct?: number;
  omega?: number;
  gl: number;
  fibre: number;
  under80: { key: NutrientKey; pct: number; hard: boolean }[];
}

export interface LabEdge {
  kcal: number;
  /** which band edges this level is: "1800-2000 min" */
  labels: string[];
  panel: string;
  days: LabDay[];
  failures: LabFailure[];
}

export interface LabSize {
  size: PlanSize;
  kcal: number;
  covers: string[];
  /** average calories of the days as the plan stands before any edge sizing */
  baseKcal: number;
  structure: LabFailure[];
  edges: LabEdge[];
}

export interface LabResult {
  exitCode: 0 | 1 | 2;
  family?: FamilyFile;
  formatIssues: FormatIssue[];
  writing: LabFailure[];
  sizes: LabSize[];
  failures: LabFailure[];
  /** fixListForAI over every graded edge that has framework gaps */
  fixList: string;
}

export interface LabDeps extends CompileContext {
  validate: ValidateContext;
}

// ── Cooking sense ──────────────────────────────────────────────────────────

export const LIMITS = {
  oilG: 27,
  saltG: 2.5,
  /** raw meat, poultry and fish in one serving, together: about 14 oz raw (300 g cooked), a big appetite at 3,200 kcal */
  fleshG: 400,
  /** per serving of a ~700 kcal meal; a bigger plate carries proportionally more (a 1,050 kcal curry may hold 12 g) */
  spiceG: 8,
  proteinSourceG: 15,
  ingredients: [4, 14],
  steps: [3, 9],
  repeats: 2,
  groceries: 45,
  /** dried spices, herbs, blends, salt and pepper: a pantry shelf, counted apart from the weekly groceries */
  spiceShelf: 25,
  /** do no harm: Health Canada's weekly limit for fresh tuna, shark, swordfish, marlin, escolar and orange roughy */
  highMercuryFishGWeek: 150,
  /** do no harm: liver is very high in vitamin A; a generous serving a week at most (each day's upper limit is gated too) */
  liverGWeek: 150,
} as const;

const SALT = /^(table |sea |kosher )?salt\b/i;
const NOT_A_SPICE = /sauce|vinegar|\boil\b|paste|prepared|chutney|puree|ketchup|mayonnaise|dressing|miso|capers|horseradish|stock|olive|roasted|wasabi|extract|coffee/i;
const DRIED_SPICE =
  /\b(ground|dried|powder|seeds?|saffron|cayenne|paprika|cinnamon|clove|nutmeg|allspice|garam masala|curry|pepper|bay leaf|mace|turmeric|cardamom|seasoning|herbes|chili|masala)\b/i;
// the same set the sizing engine protects when it trims a day

export const isOil = (f: Food) => f.category === 'oil_fat' && /\boil\b/i.test(f.name);
export const isSalt = (f: Food) => f.category === 'condiment' && SALT.test(f.name);
export const isDriedSpice = (f: Food) => f.category === 'condiment' && !SALT.test(f.name) && DRIED_SPICE.test(f.name) && !NOT_A_SPICE.test(f.name);

/** The dried-spice ceiling for one serving: 8 g up to a 700 kcal plate, then in proportion (seasoning grows with the pot). */
export const spiceLimit = (mealKcal: number) => LIMITS.spiceG * Math.max(1, mealKcal / 700);

export const countSentences = (text: string) => text.split(/[.!?]+(?:\s+|$)/).filter((s) => s.trim().length > 1).length;

/** Per-serving amount checks on a sized plan, grouped by recipe so a dish used on 3 days is one line. */
export function cookingSenseChecks(plan: MealPlan, foods: FoodIndex, size: PlanSize, kcal: number): LabFailure[] {
  const groups = new Map<string, LabFailure>();
  const add = (code: string, recipe: string, day: number, message: string, fix: string) => {
    const key = `${code}|${recipe}`;
    const g = groups.get(key);
    if (g) g.days!.push(day);
    else groups.set(key, { kind: 'cooking', code, message, fix, size, kcal, day, days: [day], recipe });
  };
  for (const d of plan.days)
    for (const m of d.meals) {
      const recipe = m.recipeId ?? m.name;
      let oil = 0;
      let salt = 0;
      let spice = 0;
      let protein = 0;
      let flesh = 0;
      let mealKcal = 0;
      for (const i of m.ingredients) {
        const f = getFood(foods, i.foodId);
        if (!f) continue;
        mealKcal += ((f.n.kcal ?? 0) * i.grams) / 100;
        if (isOil(f)) oil += i.grams;
        else if (isSalt(f)) salt += i.grams;
        else if (isDriedSpice(f)) spice += i.grams;
        if (f.category === 'meat' || f.category === 'poultry' || f.category === 'fish') flesh += i.grams;
        if (isProteinSource(f)) protein += ((f.n.protein ?? 0) * i.grams) / 100;
      }
      if (oil > LIMITS.oilG) add('oil', recipe, d.day, `${m.name}: ${Math.round(oil)} g of oil per serving (max ${LIMITS.oilG} g, 2 tbsp).`, 'Cut the oil, or move some of the fat to nuts, avocado or fish.');
      if (flesh > LIMITS.fleshG)
        add('portion', recipe, d.day, `${m.name}: ${Math.round(flesh)} g of raw meat, poultry or fish in one serving (max ${LIMITS.fleshG} g, about 14 oz).`, 'Write the dish closer to the size it is served at, or let the size add a side or snack instead of growing the meat.');
      if (salt > LIMITS.saltG) add('salt', recipe, d.day, `${m.name}: ${salt.toFixed(1)} g of salt per serving (max ${LIMITS.saltG} g).`, 'Use less salt and add acid, herbs or spices for flavour.');
      const spiceMax = spiceLimit(mealKcal);
      if (spice > spiceMax) add('spice', recipe, d.day, `${m.name}: ${spice.toFixed(1)} g of dried spices or herbs per serving (max ${spiceMax.toFixed(1)} g for a ${Math.round(mealKcal)} kcal plate).`, 'Use less of the dried spice, or switch to fresh herbs.');
      if ((m.slot === 'lunch' || m.slot === 'dinner') && protein < LIMITS.proteinSourceG)
        add('protein_source', recipe, d.day, `${m.name}: only ${protein.toFixed(1)} g of protein from a real protein source (a ${m.slot} needs ${LIMITS.proteinSourceG} g).`, 'Add fish, poultry, meat, eggs, tofu, seitan, yogurt or legumes.');
    }
  const perServing = [...groups.values()].map((g) => ({ ...g, message: g.days!.length > 1 ? `Days ${g.days!.join(', ')}: ${g.message}` : `Day ${g.day}: ${g.message}` }));
  return [...perServing, ...harmChecks(plan, foods, size, kcal)];
}

/** Week-level do-no-harm checks: high-mercury fish and liver are fine in moderation, never as a habit. */
export function harmChecks(plan: MealPlan, foods: FoodIndex, size: PlanSize, kcal: number): LabFailure[] {
  let mercuryG = 0;
  let liverG = 0;
  const liverDays = new Set<number>();
  for (const d of plan.days)
    for (const m of d.meals)
      for (const i of m.ingredients) {
        const f = getFood(foods, i.foodId);
        if (!f) continue;
        if (isHighMercuryFish(f)) mercuryG += i.grams;
        if (isLiver(f)) {
          liverG += i.grams;
          liverDays.add(d.day);
        }
      }
  const out: LabFailure[] = [];
  if (mercuryG > LIMITS.highMercuryFishGWeek)
    out.push({
      kind: 'cooking',
      code: 'mercury',
      size,
      kcal,
      message: `${Math.round(mercuryG)} g of fresh tuna, swordfish, shark, marlin or similar this week (Health Canada advises at most ${LIMITS.highMercuryFishGWeek} g a week).`,
      fix: 'Use salmon, trout, sardines, mackerel (not king) or canned light tuna instead on some days.',
    });
  if (liverG > LIMITS.liverGWeek) {
    const days = [...liverDays];
    out.push({
      kind: 'cooking',
      code: 'liver',
      size,
      kcal,
      day: days[0],
      days,
      message: `Days ${days.join(', ')}: ${Math.round(liverG)} g of liver this week (at most ${LIMITS.liverGWeek} g; it is very high in vitamin A).`,
      fix: 'Use a little less liver in the dish, or keep it to one dish a week; beef, lentils or eggs carry the iron elsewhere.',
    });
  }
  return out;
}

/** Slots each recipe is used in, to tell snacks and breakfasts from the rest. */
function usage(family: FamilyFile) {
  const slots = new Map<string, Set<string>>();
  const use = (recipe: string, slot: string) => (slots.get(recipe) ?? slots.set(recipe, new Set()).get(recipe)!).add(slot);
  for (const d of family.week) for (const m of d.meals) use(m.recipe, m.slot);
  // a size's adjust list can bring a recipe in (add) or exchange one (swap)
  for (const s of Object.values(family.sizes))
    for (const op of s?.adjust ?? []) {
      if ('add' in op) use(op.add.recipe, op.add.slot);
      else if ('swap' in op) for (const slot of slots.get(op.swap.from) ?? []) use(op.swap.to, slot);
    }
  return slots;
}

/** Writing and recipe-shape checks that do not depend on portion size. */
/** Limits on the rich text (paragraphs and **bold**) in the guide's section 7. */
export const RICH_LIMITS = { howItWorksMinParagraphs: 2, paragraphWords: 70, boldPerParagraph: 3, boldWords: 8 } as const;

/** Every string in the file with the path it sits at. */
function* stringsOf(value: unknown, path = ''): Generator<{ path: string; text: string }> {
  if (typeof value === 'string') yield { path, text: value };
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* stringsOf(v, `${path}[${i}]`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* stringsOf(v, path ? `${path}.${k}` : k);
}

/** Fields that may use paragraphs and bold: howItWorks at the plan level, about and tip on a recipe. */
const isRichPath = (path: string) => path === 'howItWorks' || /^recipes\[\d+\]\.(about|tip)$/.test(path);

/** Rich text checks: balanced `**` everywhere, and the shape of howItWorks, about and tip. */
function richChecks(family: FamilyFile, raw: unknown, fail: (code: string, message: string, fix: string, recipe?: string) => void) {
  const recipeOf = (path: string) => {
    const i = /^recipes\[(\d+)\]/.exec(path)?.[1];
    return i ? family.recipes[+i]?.id : undefined;
  };
  for (const { path, text } of stringsOf(raw))
    if (markerCount(text) % 2)
      fail('bold_unbalanced', `${path}: has an unmatched "**" ("${text.slice(0, 60)}").`, 'Close every bold phrase with a second "**", or remove the stray one.', recipeOf(path));

  for (const { path, text } of stringsOf(raw)) {
    if (!isRichPath(path)) continue;
    const recipe = recipeOf(path);
    parseRich(text).forEach((p, n) => {
      const words = paragraphWords(p);
      const { phrases, longest } = boldStats(p);
      const at = `${path}, paragraph ${n + 1}`;
      if (words > RICH_LIMITS.paragraphWords && path === 'howItWorks') fail('paragraph_long', `${at}: ${words} words (max ${RICH_LIMITS.paragraphWords}).`, 'Split it into shorter paragraphs with a blank line.', recipe);
      if (phrases > RICH_LIMITS.boldPerParagraph) fail('bold_many', `${at}: ${phrases} bold phrases (max ${RICH_LIMITS.boldPerParagraph}).`, 'Bold only the one or two phrases that matter.', recipe);
      if (longest > RICH_LIMITS.boldWords) fail('bold_long', `${at}: a bold phrase is ${longest} words (max ${RICH_LIMITS.boldWords}).`, 'Bold key words, never whole sentences.', recipe);
    });
  }
  const paragraphs = parseRich(family.howItWorks).length;
  if (family.howItWorks?.trim() && paragraphs < RICH_LIMITS.howItWorksMinParagraphs)
    fail('howItWorks_paragraphs', `howItWorks: ${paragraphs} paragraph (min ${RICH_LIMITS.howItWorksMinParagraphs}).`, 'Split it into short paragraphs with a blank line, each opening with a bolded key phrase.');
}

export function writingChecks(family: FamilyFile, raw: unknown, foods?: FoodIndex): LabFailure[] {
  const out: LabFailure[] = [];
  const fail = (code: string, message: string, fix: string, recipe?: string, kind: LabFailure['kind'] = 'writing') => out.push({ kind, code, message, fix, recipe });
  const used = usage(family);

  for (const hit of lintDashes(raw)) {
    const recipeIndex = /^recipes\[(\d+)\]/.exec(hit.path)?.[1];
    fail('dash', `${hit.path}${recipeIndex ? ` (${family.recipes[+recipeIndex]?.id})` : ''}: has an em dash, en dash or "--" ("${hit.text.slice(0, 60)}").`, 'Use a comma, a full stop or "and".', recipeIndex ? family.recipes[+recipeIndex]?.id : undefined);
  }
  if (!family.summary?.trim()) fail('summary', 'summary is missing (one or two sentences for the plan card).', 'Add a summary.');
  if (!family.howItWorks?.trim()) fail('howItWorks', 'howItWorks is missing (a friendly paragraph on the logic of the week).', 'Add howItWorks.');
  richChecks(family, raw, (code, message, fix, recipe) => fail(code, message, fix, recipe));
  // the week's text is shown for every size, so it can't quote one size's grams (the Prep screen sizes the batches)
  const gramsHit = /[^.]*\b\d+\s?g\b[^.]*/.exec(family.howItWorks ?? '');
  if (gramsHit) fail('grams_in_text', `howItWorks quotes grams ("${gramsHit[0].trim().slice(0, 70)}"), which only fit one size.`, 'Describe the batch in words ("the week\'s beans") and point to the Prep screen for amounts.');

  for (const r of family.recipes) {
    const where = used.get(r.id);
    const snack = !!where && where.size === 1 && where.has('snack');
    const single = r.ingredients.length === 1;
    const [minI, maxI] = LIMITS.ingredients;
    const [minS, maxS] = LIMITS.steps;
    // the cap is on things to buy and prep: dried spices, blends and salt don't count (a tagine needs its cinnamon)
    const counted = foods ? r.ingredients.filter((i) => { const f = getFood(foods, i.food); return !f || !isSpiceShelf(f); }).length : r.ingredients.length;
    if (!where) fail('unused', `${r.name}: is not used in the week.`, 'Add it to the week or remove it.', r.id, 'cooking');
    if (counted > maxI) fail('ingredients', `${r.name}: ${counted} ingredients besides spices and salt (max ${maxI}).`, 'Simplify the dish.', r.id, 'cooking');
    if (r.ingredients.length < minI && !snack && !single) fail('ingredients', `${r.name}: ${r.ingredients.length} ingredients (min ${minI}; snacks and single foods are exempt).`, 'Build more flavour and nutrition into the dish.', r.id, 'cooking');
    const steps = r.steps?.length ?? 0;
    if (!steps && !(snack && single)) fail('steps', `${r.name}: has no steps.`, 'Write 3 to 9 steps.', r.id);
    else if (steps && !snack && (steps < minS || steps > maxS)) fail('steps', `${r.name}: ${steps} steps (need ${minS} to ${maxS}).`, 'Combine or split steps.', r.id, 'cooking');
    const sentences = countSentences(r.about ?? '');
    if (!r.about?.trim()) fail('about', `${r.name}: has no "about".`, 'Write 2 or 3 sentences for someone browsing.', r.id);
    else if (sentences < 2 && !(snack && single)) fail('about', `${r.name}: "about" has ${sentences} sentence (needs 2 or 3).`, 'Say what it is, why it tastes good, and one plain nutrition point.', r.id);
  }
  return out;
}

/** Repeats and grocery count for a compiled size. */
export function weekChecks(family: FamilyFile, plan: MealPlan, foods: FoodIndex, size: PlanSize): LabFailure[] {
  const out: LabFailure[] = [];
  const names = new Map(family.recipes.map((r) => [r.id, r.name]));
  const breakfast = new Set(plan.days.flatMap((d) => d.meals.filter((m) => m.slot === 'breakfast').map((m) => m.recipeId)));
  const counts = new Map<string, number>();
  for (const d of plan.days) for (const m of d.meals) if (!m.leftover && m.recipeId) counts.set(m.recipeId, (counts.get(m.recipeId) ?? 0) + 1);
  for (const [id, n] of counts)
    if (n > LIMITS.repeats && !breakfast.has(id))
      out.push({ kind: 'cooking', code: 'repeats', size, recipe: id, message: `${names.get(id) ?? id}: cooked ${n} times in the week (max ${LIMITS.repeats}, except breakfasts and leftovers).`, fix: 'Swap one of the repeats for a different dish, or mark the repeat as a leftover.' });
  const groceries = distinctGroceries(plan, foods);
  const max = PLAN_STYLES[family.style].gates.maxGroceries ?? LIMITS.groceries;
  if (groceries.length > max)
    out.push({ kind: 'cooking', code: 'groceries', size, message: `${groceries.length} distinct groceries in the week (max ${max}; spices and dried herbs don't count).`, fix: 'Reuse ingredients across dishes so the shopping list is shorter.' });
  const shelf = distinctGroceries(plan, foods, true);
  if (shelf.length > LIMITS.spiceShelf)
    out.push({ kind: 'cooking', code: 'spice_shelf', size, message: `${shelf.length} spices, dried herbs and seasonings (max ${LIMITS.spiceShelf}).`, fix: 'Use a blend or reuse spices across dishes.' });
  return out;
}

// ── Grading ────────────────────────────────────────────────────────────────

function labDay(r: DayReport, plan: MealPlan, foods: FoodIndex): LabDay {
  const day = plan.days.find((d) => d.day === r.day)!;
  return {
    day: r.day,
    kcal: r.kcal,
    proteinPct: r.proteinPctKcal,
    satPct: r.satFatPct,
    omega: r.omegaRatio,
    gl: r.glycemicLoad,
    fibre: dayPlanTotal(day, foods).fiber ?? 0,
    under80: r.under80.map((u) => ({ ...u, hard: HARD_NUTRIENTS.includes(u.key) })),
  };
}

/** The distinct kcal levels to test for a size: both edges of every band it covers, each once. */
export function edgesOf(covers: CalorieBand[]): { kcal: number; labels: string[] }[] {
  const byKcal = new Map<number, string[]>();
  for (const b of covers) {
    for (const [kcal, end] of [[b.min, 'min'], [b.max, 'max']] as const) byKcal.set(kcal, [...(byKcal.get(kcal) ?? []), `${bandString(b)} ${end}`]);
  }
  return [...byKcal].sort((a, b) => a[0] - b[0]).map(([kcal, labels]) => ({ kcal, labels }));
}

/** Grade one plan already sized to `kcal`: day rows, framework issues, style gates and cooking sense. */
export function gradeEdge(family: FamilyFile, base: MealPlan, size: PlanSize, kcal: number, deps: LabDeps) {
  const opts = gradeOptionsFor(family.style, kcal);
  const { plan: sized, dayKcal } = sizePlan(base, kcal, deps, opts.panel ?? []);
  const band = base.covers?.find((b) => kcal >= b.min && kcal <= b.max) ?? base.band;
  const report = gradePlan({ ...sized, band }, deps.foods, deps.catalog, opts);
  const failures: LabFailure[] = [];
  const base_ = { kind: 'gate' as const, size, kcal };

  sized.days.forEach((d, i) => {
    const advice = sizingAdvice(dayKcal[i], kcal);
    if (!advice.ok)
      failures.push({ ...base_, code: 'sizing', day: d.day, message: `Day ${d.day}: sizes to ${Math.round(dayKcal[i])} kcal, more than ${Math.round(SIZING_TOLERANCE * 100)}% from ${kcal}.`, fix: advice.suggest === 'higher' ? 'The day is too small to reach this band: add food, or claim a higher band.' : 'The day cannot be trimmed this low without losing nutrients: claim a higher band for this size.' });
  });
  // kcal_low and kcal_high are the sizing check above; hard-from-food gaps are reported but never fail
  const framework = { ...report, issues: report.issues.filter((i) => i.level !== 'info' && i.code !== 'kcal_low' && i.code !== 'kcal_high') };
  for (const i of framework.issues) failures.push({ ...base_, code: i.code, day: i.day, message: i.message, fix: i.fix });
  failures.push(...styleNutrientGates(family.style, sized, deps.foods, kcal).map((g) => ({ ...base_, ...g })));
  failures.push(...cookingSenseChecks(sized, deps.foods, size, kcal));

  const panel = opts.panel.map((p) => `${p.sex}${p.lifeStage !== 'none' ? ` (${p.lifeStage})` : ''}`).join(' + ');
  return { sized, report: framework, days: report.days.map((r) => labDay(r, sized, deps.foods)), failures, panel };
}

/** Everything the lab does, from the parsed JSON to the exit code. */
export function runLab(raw: unknown, deps: LabDeps): LabResult {
  const { family, issues } = validateFamily(raw, deps.validate);
  if (!family) return { exitCode: 1, formatIssues: issues, writing: [], sizes: [], failures: [], fixList: '' };

  const writing = writingChecks(family, raw, deps.foods);
  const failures: LabFailure[] = [...writing];
  const reports = [];
  const sizes: LabSize[] = [];

  for (const name of SIZES) {
    const compiled = compileSize(family, name, deps);
    if (!compiled) continue;
    const { plan } = compiled;
    const baseKcal = plan.days.reduce((n, d) => n + (dayPlanTotal(d, deps.foods).kcal ?? 0), 0) / (plan.days.length || 1);
    const structure: LabFailure[] = [
      ...compiled.problems.map((message): LabFailure => ({ kind: 'cooking', code: 'adjust', size: name, message: `${SIZE_LABEL[name]}: ${message}`, fix: 'Fix the adjust list so every step applies.' })),
      ...weekChecks(family, plan, deps.foods, name),
      ...styleStructureGates(family.style, plan, deps.foods).map((g): LabFailure => ({ kind: 'gate', size: name, ...g })),
      ...carbPromise(family, plan, deps.foods, name),
    ];
    const minKcal = PLAN_STYLES[family.style].gates.minKcal;
    for (const b of compiled.covers)
      if (minKcal != null && b.min < minKcal)
        structure.push({ kind: 'gate', code: 'min_kcal', size: name, message: `${SIZE_LABEL[name]} claims ${bandString(b)}, below the ${minKcal} kcal floor for a ${PLAN_STYLES[family.style].label} plan.`, fix: `Claim only bands from ${minKcal} kcal up.` });
    failures.push(...structure);
    const edges: LabEdge[] = [];
    for (const { kcal, labels } of edgesOf(compiled.covers)) {
      const g = gradeEdge(family, plan, name, kcal, deps);
      edges.push({ kcal, labels, panel: g.panel, days: g.days, failures: g.failures });
      failures.push(...g.failures);
      if (g.report.issues.length) reports.push({ ...g.report, planId: `${family.id}-${name}@${kcal}`, planName: `${family.name} ${SIZE_LABEL[name]} at ${kcal} kcal` });
    }
    sizes.push({ size: name, kcal: compiled.kcal, covers: compiled.covers.map(bandString), baseKcal, structure, edges });
  }

  // fixListForAI ends with an instruction about re-sending CSV blocks; that is for the Excel and AI importer, not for a family file
  const fixList = reports.length ? fixListForAI({ reports }).split('\n').filter((l) => !l.startsWith('Return the corrected')).join('\n').trim() : '';
  return { exitCode: failures.length ? 2 : 0, family, formatIssues: issues, writing, sizes, failures, fixList };
}

/** A family that promises a carb style (the Everyday plans) may not serve a food beyond it at any size. */
function carbPromise(family: FamilyFile, plan: MealPlan, foods: FoodIndex, size: PlanSize): LabFailure[] {
  if (!family.carbStyle) return [];
  const out: LabFailure[] = [];
  const seen = new Set<string>();
  for (const d of plan.days)
    for (const m of d.meals)
      for (const i of m.ingredients) {
        const f = getFood(foods, i.foodId);
        if (!f || seen.has(f.id)) continue;
        // a spoonful of starch or flour thickening a sauce doesn't change the carb style (GUIDE §6, THICKENER_MAX_G)
        const cs = carbStyleOfIngredient(f, i.grams);
        if (carbStyleFits(cs, family.carbStyle)) continue;
        seen.add(f.id);
        out.push({
          kind: 'gate',
          code: 'carb_style',
          size,
          day: d.day,
          recipe: m.recipeId ?? m.name,
          message: `Day ${d.day}, ${m.name}: ${f.name} goes beyond the family's "${family.carbStyle}" carbs.`,
          fix: family.carbStyle === 'whole' ? 'Use legumes, potatoes, sweet potatoes, squash, fruit or intact grains (oats, quinoa, barley, buckwheat, millet).' : 'Use brown rice, whole-wheat pasta, whole-grain bread or corn tortillas, not refined ones.',
        });
      }
  return out;
}

