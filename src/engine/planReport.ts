/**
 * Framework grading for a meal plan, day by day. Used by the admin upload report,
 * the CLI, and to write a fix-list an AI plan-writer can act on.
 *
 * Plans are graded against a reference panel (an adult man and an adult woman, 31–50),
 * so a plan that passes works for either. A nutrient counts when every reference
 * person reaches 80% of their RDA/AI.
 */
import { boardProgress, dayPlanTotal, getFood, logsGlycemicLoad, omegaRatio, satFatPctOfKcal, type FoodIndex } from './calc';
import { COMPLETE_AT, NUTRIENTS } from './nutrients';
import type { Food, MealPlan, NutrientKey, Profile } from './types';

export const REFERENCE_PANEL: Pick<Profile, 'sex' | 'age' | 'lifeStage'>[] = [
  { sex: 'male', age: 40, lifeStage: 'none' },
  { sex: 'female', age: 40, lifeStage: 'none' },
];

/** Hard to reach from food alone in most diets; reported, but never block a plan. */
export const HARD_NUTRIENTS: NutrientKey[] = ['vitD', 'iodine', 'b7'];

export const RULES = {
  satFatMaxPct: 10,
  omegaMaxRatio: 4,
  glycemicLoadMax: 100,
  /** protein as % of the day's calories */
  proteinMinPctKcal: 20,
  fattyFishPerWeek: 2,
} as const;

export interface ReportIssue {
  level: 'error' | 'warning' | 'info';
  code:
    | 'kcal_low'
    | 'kcal_high'
    | 'micro_low'
    | 'micro_low_hard'
    | 'sat_fat_high'
    | 'omega_high'
    | 'gl_high'
    | 'protein_low'
    | 'fish_low';
  day?: number;
  nutrient?: NutrientKey;
  message: string;
  /** concrete, AI-actionable fix */
  fix?: string;
}

export interface DayReport {
  day: number;
  kcal: number;
  protein: number;
  proteinPctKcal: number;
  satFatPct?: number;
  omegaRatio?: number;
  glycemicLoad: number;
  /** lowest % of RDA across the reference panel, per board nutrient with data */
  coverage: Partial<Record<NutrientKey, number>>;
  under80: { key: NutrientKey; pct: number }[];
  fattyFishMeals: number;
}

export interface PlanReport {
  planId: string;
  planName: string;
  band: MealPlan['band'];
  days: DayReport[];
  fishPerWeek: number;
  issues: ReportIssue[];
  /** no errors and no non-hard micronutrient gaps */
  pass: boolean;
}

const isPlantBased = (plan: MealPlan) => plan.tags.some((t) => /vegetarian|vegan/i.test(t));
const round = (x: number) => Math.round(x);

export function gradePlan(plan: MealPlan, foods: FoodIndex, catalog: Food[] = []): PlanReport {
  const days = [...plan.days].sort((a, b) => a.day - b.day);
  const issues: ReportIssue[] = [];
  const dayReports: DayReport[] = days.map((d) => {
    const totals = dayPlanTotal(d, foods);
    const kcal = totals.kcal ?? 0;
    const protein = totals.protein ?? 0;
    const items = d.meals.flatMap((m) => m.ingredients);
    const coverage: DayReport['coverage'] = {};
    for (const person of REFERENCE_PANEL) {
      for (const p of boardProgress(totals, person)) {
        if (p.amount == null) continue;
        coverage[p.key] = Math.min(coverage[p.key] ?? Infinity, p.pct);
      }
    }
    const under80 = (Object.entries(coverage) as [NutrientKey, number][])
      .filter(([, pct]) => pct < COMPLETE_AT)
      .map(([key, pct]) => ({ key, pct }))
      .sort((a, b) => a.pct - b.pct);
    const fattyFishMeals = d.meals.filter((m) => m.ingredients.some((i) => getFood(foods, i.foodId)?.tags?.includes('fatty_fish'))).length;
    return {
      day: d.day,
      kcal,
      protein,
      proteinPctKcal: kcal ? ((protein * 4) / kcal) * 100 : 0,
      satFatPct: satFatPctOfKcal(totals),
      omegaRatio: omegaRatio(totals),
      glycemicLoad: logsGlycemicLoad(items, foods),
      coverage,
      under80,
      fattyFishMeals,
    };
  });

  for (const r of dayReports) {
    if (r.kcal < plan.band.min)
      issues.push({
        level: 'error',
        code: 'kcal_low',
        day: r.day,
        message: `Day ${r.day}: ${round(r.kcal)} kcal is below the ${plan.band.min}–${plan.band.max} band.`,
        fix: `Add about ${round(plan.band.min + 50 - r.kcal)} kcal on day ${r.day}, preferably from foods that also raise any nutrient listed below.`,
      });
    if (r.kcal > plan.band.max)
      issues.push({
        level: 'error',
        code: 'kcal_high',
        day: r.day,
        message: `Day ${r.day}: ${round(r.kcal)} kcal is above the ${plan.band.min}–${plan.band.max} band.`,
        fix: `Remove about ${round(r.kcal - plan.band.max + 50)} kcal on day ${r.day}: trim grains, oils or nut portions first, never vegetables.`,
      });
    for (const u of r.under80) {
      const hard = HARD_NUTRIENTS.includes(u.key);
      const sources = catalog.length ? bestSources(u.key, catalog, isPlantBased(plan)) : [];
      issues.push({
        level: hard ? 'info' : 'warning',
        code: hard ? 'micro_low_hard' : 'micro_low',
        day: r.day,
        nutrient: u.key,
        message: `Day ${r.day}: ${NUTRIENTS[u.key].label} at ${round(u.pct * 100)}% (needs ≥80%).`,
        fix: sources.length ? `Add or increase one of: ${sources.join(', ')}.` : undefined,
      });
    }
    if (r.satFatPct != null && r.satFatPct > RULES.satFatMaxPct)
      issues.push({
        level: 'warning',
        code: 'sat_fat_high',
        day: r.day,
        message: `Day ${r.day}: saturated fat is ${r.satFatPct.toFixed(1)}% of calories (max ${RULES.satFatMaxPct}%).`,
        fix: 'Swap butter, cheese, coconut or fatty meat for olive oil, fish, legumes or lean poultry.',
      });
    if (r.omegaRatio != null && r.omegaRatio > RULES.omegaMaxRatio)
      issues.push({
        level: 'warning',
        code: 'omega_high',
        day: r.day,
        message: `Day ${r.day}: omega-6:3 ratio is ${r.omegaRatio.toFixed(1)}:1 (aim ≤${RULES.omegaMaxRatio}:1).`,
        fix: 'Add fatty fish, chia, ground flax or walnuts; use olive oil instead of seed oils.',
      });
    if (r.glycemicLoad > RULES.glycemicLoadMax)
      issues.push({
        level: 'warning',
        code: 'gl_high',
        day: r.day,
        message: `Day ${r.day}: glycemic load ${round(r.glycemicLoad)} (aim ≤${RULES.glycemicLoadMax}).`,
        fix: 'Replace white rice, bread or pasta with legumes, quinoa, oats or barley.',
      });
    if (r.proteinPctKcal < RULES.proteinMinPctKcal)
      issues.push({
        level: 'warning',
        code: 'protein_low',
        day: r.day,
        message: `Day ${r.day}: protein is ${round(r.proteinPctKcal)}% of calories (aim ≥${RULES.proteinMinPctKcal}%).`,
        fix: 'Add lean protein: chicken, fish, eggs, Greek yogurt, tofu, tempeh or legumes.',
      });
  }

  const fish = dayReports.reduce((n, r) => n + r.fattyFishMeals, 0);
  const fishPerWeek = dayReports.length ? (fish * 7) / dayReports.length : 0;
  if (!isPlantBased(plan) && fishPerWeek < RULES.fattyFishPerWeek)
    issues.push({
      level: 'warning',
      code: 'fish_low',
      message: `Fatty fish appears ${fishPerWeek.toFixed(1)}× per week (aim ≥${RULES.fattyFishPerWeek}).`,
      fix: 'Use salmon, sardines, mackerel, trout or herring in at least two meals per 7 days.',
    });

  return {
    planId: plan.id,
    planName: plan.name,
    band: plan.band,
    days: dayReports,
    fishPerWeek,
    issues,
    pass: !issues.some((i) => i.level === 'error' || i.code === 'micro_low'),
  };
}

/** Everyday foods richest in a nutrient per 100 kcal, as food_ids an AI can use directly. */
export function bestSources(key: NutrientKey, catalog: Food[], plantOnly = false, limit = 4): string[] {
  return catalog
    .filter((f) => !f.rare && (f.rank ?? 50) >= 50 && (f.n[key] ?? 0) > 0 && (f.n.kcal ?? 0) > 0)
    .filter((f) => !plantOnly || !['meat', 'poultry', 'fish'].includes(f.category))
    .filter((f) => !['sweet', 'condiment', 'beverage'].includes(f.category))
    .sort((a, b) => (b.n[key]! / b.n.kcal!) - (a.n[key]! / a.n.kcal!))
    .slice(0, limit)
    .map((f) => f.id);
}

export interface FixListInput {
  reports: PlanReport[];
  /** structural problems from the importer (unknown foods, missing fields…) */
  importIssues?: { level: string; sheet: string; row: number; message: string; suggestion?: string }[];
}

/**
 * Plain-text fix list to paste back into the AI that wrote the plan.
 * Errors first, then the framework gaps, each with a concrete fix.
 */
export function fixListForAI({ reports, importIssues = [] }: FixListInput): string {
  const lines: string[] = [];
  const structural = importIssues.filter((i) => i.level === 'error');
  if (structural.length) {
    lines.push('FORMAT / FOOD ERRORS (fix these first):');
    for (const i of structural) {
      lines.push(`- ${i.sheet} row ${i.row}: ${i.message}${i.suggestion ? ` Use: ${i.suggestion}.` : ''}`);
    }
    lines.push('');
  }
  for (const r of reports) {
    const actionable = r.issues.filter((i) => i.level !== 'info');
    const info = r.issues.filter((i) => i.level === 'info');
    lines.push(`PLAN ${r.planId} "${r.planName}" (${r.band.min}–${r.band.max} kcal): ${actionable.length ? `${actionable.length} fix(es) needed` : 'passes all checks'}`);
    for (const i of actionable) lines.push(`- ${i.message}${i.fix ? ` Fix: ${i.fix}` : ''}`);
    if (info.length) {
      lines.push(`- Note (hard from food, do your best): ${[...new Set(info.map((i) => NUTRIENTS[i.nutrient!].label))].join(', ')}.`);
    }
    lines.push('');
  }
  lines.push('Return the corrected PLANS, MEALS and INGREDIENTS blocks in full, same format as before.');
  return lines.join('\n').trim();
}
