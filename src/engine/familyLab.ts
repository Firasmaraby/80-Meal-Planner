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
import { HARD_NUTRIENTS, fixListForAI, gradePlan, type DayReport } from './planReport';
import { SIZING_TOLERANCE, sizingAdvice } from './personalize';
import { PLAN_STYLES, distinctGroceries, gradeOptionsFor, styleNutrientGates, styleStructureGates } from './planStyles';
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
  spiceG: 8,
  proteinSourceG: 15,
  ingredients: [4, 14],
  steps: [3, 9],
  repeats: 2,
  groceries: 45,
} as const;

const SALT = /^(table |sea |kosher )?salt\b/i;
const NOT_A_SPICE = /sauce|vinegar|\boil\b|paste|prepared|chutney|puree|ketchup|mayonnaise|dressing|miso|capers|horseradish|stock|olive|roasted|wasabi|extract|coffee/i;
const DRIED_SPICE =
  /\b(ground|dried|powder|seeds?|saffron|cayenne|paprika|cinnamon|clove|nutmeg|allspice|garam masala|curry|pepper|bay leaf|mace|turmeric|cardamom|seasoning|herbes|chili|masala)\b/i;
const PROTEIN_SOURCES = new Set<Food['category']>(['meat', 'poultry', 'fish', 'egg', 'legume', 'dairy']);

export const isOil = (f: Food) => f.category === 'oil_fat' && /\boil\b/i.test(f.name);
export const isSalt = (f: Food) => f.category === 'condiment' && SALT.test(f.name);
export const isDriedSpice = (f: Food) => f.category === 'condiment' && !SALT.test(f.name) && DRIED_SPICE.test(f.name) && !NOT_A_SPICE.test(f.name);

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
      for (const i of m.ingredients) {
        const f = getFood(foods, i.foodId);
        if (!f) continue;
        if (isOil(f)) oil += i.grams;
        else if (isSalt(f)) salt += i.grams;
        else if (isDriedSpice(f)) spice += i.grams;
        if (PROTEIN_SOURCES.has(f.category)) protein += ((f.n.protein ?? 0) * i.grams) / 100;
      }
      if (oil > LIMITS.oilG) add('oil', recipe, d.day, `${m.name}: ${Math.round(oil)} g of oil per serving (max ${LIMITS.oilG} g, 2 tbsp).`, 'Cut the oil, or move some of the fat to nuts, avocado or fish.');
      if (salt > LIMITS.saltG) add('salt', recipe, d.day, `${m.name}: ${salt.toFixed(1)} g of salt per serving (max ${LIMITS.saltG} g).`, 'Use less salt and add acid, herbs or spices for flavour.');
      if (spice > LIMITS.spiceG) add('spice', recipe, d.day, `${m.name}: ${spice.toFixed(1)} g of dried spices or herbs per serving (max ${LIMITS.spiceG} g).`, 'Use less of the dried spice, or switch to fresh herbs.');
      if ((m.slot === 'lunch' || m.slot === 'dinner') && protein < LIMITS.proteinSourceG)
        add('protein_source', recipe, d.day, `${m.name}: only ${protein.toFixed(1)} g of protein from a real protein source (a ${m.slot} needs ${LIMITS.proteinSourceG} g).`, 'Add fish, poultry, meat, eggs, tofu, yogurt or legumes.');
    }
  return [...groups.values()].map((g) => ({ ...g, message: g.days!.length > 1 ? `Days ${g.days!.join(', ')}: ${g.message}` : `Day ${g.day}: ${g.message}` }));
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
export function writingChecks(family: FamilyFile, raw: unknown): LabFailure[] {
  const out: LabFailure[] = [];
  const fail = (code: string, message: string, fix: string, recipe?: string, kind: LabFailure['kind'] = 'writing') => out.push({ kind, code, message, fix, recipe });
  const used = usage(family);

  for (const hit of lintDashes(raw)) {
    const recipeIndex = /^recipes\[(\d+)\]/.exec(hit.path)?.[1];
    fail('dash', `${hit.path}${recipeIndex ? ` (${family.recipes[+recipeIndex]?.id})` : ''}: has an em dash, en dash or "--" ("${hit.text.slice(0, 60)}").`, 'Use a comma, a full stop or "and".', recipeIndex ? family.recipes[+recipeIndex]?.id : undefined);
  }
  if (!family.summary?.trim()) fail('summary', 'summary is missing (one or two sentences for the plan card).', 'Add a summary.');
  if (!family.howItWorks?.trim()) fail('howItWorks', 'howItWorks is missing (a friendly paragraph on the logic of the week).', 'Add howItWorks.');

  for (const r of family.recipes) {
    const where = used.get(r.id);
    const snack = !!where && where.size === 1 && where.has('snack');
    const single = r.ingredients.length === 1;
    const [minI, maxI] = LIMITS.ingredients;
    const [minS, maxS] = LIMITS.steps;
    if (!where) fail('unused', `${r.name}: is not used in the week.`, 'Add it to the week or remove it.', r.id, 'cooking');
    if (r.ingredients.length > maxI) fail('ingredients', `${r.name}: ${r.ingredients.length} ingredients (max ${maxI}).`, 'Simplify the dish.', r.id, 'cooking');
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
    out.push({ kind: 'cooking', code: 'groceries', size, message: `${groceries.length} distinct groceries in the week (max ${max}).`, fix: 'Reuse ingredients across dishes so the shopping list is shorter.' });
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
  const { plan: sized, dayKcal } = sizePlan(base, kcal, deps);
  const opts = gradeOptionsFor(family.style, kcal);
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

  const writing = writingChecks(family, raw);
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
    ];
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

