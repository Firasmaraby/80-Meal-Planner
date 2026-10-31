/**
 * A compact markdown rendering of a plan family for a human or a model to read as a hungry person would
 * (scripts/plan-review.mjs wraps `renderReview`): header, the week as a grid, each recipe once, the per-day numbers.
 */
import { dayPlanTotal, getFood } from './calc';
import { SIZE_LABEL, SLOTS, compileSize, householdMeasure, type CompileContext, type FamilyFile } from './family';
import { NUTRIENTS } from './nutrients';
import { gradePlan } from './planReport';
import { PLAN_STYLES, gradeOptionsFor } from './planStyles';
import type { MealSlot, PlanSize } from './types';

const CARB_LABEL = { whole: 'whole-food carbs', wholegrain: 'whole grains too', any: 'everything in moderation' } as const;
const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

const cell = (s: string) => s.replace(/\|/g, '/');
const n1 = (x: number | undefined) => (x == null ? 'n/a' : x.toFixed(1));

export function renderReview(family: FamilyFile, size: PlanSize, ctx: CompileContext): string {
  const compiled = compileSize(family, size, ctx);
  if (!compiled) throw new Error(`${family.id} has no "${size}" size.`);
  const { plan } = compiled;
  const recipes = new Map(family.recipes.map((r) => [r.id, r]));
  const style = PLAN_STYLES[family.style];
  const names = plan.slotNames ?? {};
  const slotName = (s: MealSlot) => names[s] ?? SLOT_LABEL[s];
  const out: string[] = [];

  out.push(`# ${family.name}`, '');
  out.push(`${style.label} · ${family.cuisine}${family.regions?.length ? ` (${family.regions.join(', ')})` : ''} · carb style: ${CARB_LABEL[plan.carbStyle ?? 'any']}${plan.tags.length ? ` · ${plan.tags.join(', ')}` : ''}`, '');
  if (family.summary) out.push(family.summary, '');
  if (family.howItWorks) out.push(`**How it works.** ${family.howItWorks}`, '');
  if (family.signature?.length) out.push(`**Signature dishes:** ${family.signature.map((id) => recipes.get(id)?.name ?? id).join('; ')}`, '');
  out.push(`Showing the ${SIZE_LABEL[size]} size: ${compiled.kcal} kcal, covers ${compiled.covers.map((b) => `${b.min}-${b.max}`).join(', ')}.`, '');

  // the week
  out.push('## The week', '');
  const slots = SLOTS.filter((s) => plan.days.some((d) => d.meals.some((m) => m.slot === s)));
  out.push(`| Day | ${slots.map(slotName).join(' | ')} |`, `|---|${slots.map(() => '---').join('|')}|`);
  for (const d of plan.days)
    out.push(`| ${d.day} | ${slots.map((s) => cell(d.meals.filter((m) => m.slot === s).map((m) => `${m.name}${m.leftover ? ' (leftover)' : ''}`).join(' + ') || '')).join(' | ')} |`);
  out.push('');

  // each recipe once, in order of first use
  out.push('## Recipes', '');
  const seen = new Set<string>();
  for (const d of plan.days)
    for (const m of d.meals) {
      if (!m.recipeId || seen.has(m.recipeId)) continue;
      seen.add(m.recipeId);
      const r = recipes.get(m.recipeId)!;
      const uses = plan.days.flatMap((x) => x.meals.filter((y) => y.recipeId === r.id).map((y) => `day ${x.day} ${slotName(y.slot).toLowerCase()}${y.leftover ? ' (leftover)' : ''}`));
      out.push(`### ${r.name}`, '');
      if (r.inspiredBy) out.push(`*Inspired by ${r.inspiredBy.replace(/^inspired by /i, '')}*`, '');
      if (r.about) out.push(r.about, '');
      out.push(`Used: ${uses.join(', ')}`, '');
      out.push('Ingredients (one serving, Standard size):');
      for (const i of r.ingredients) {
        const f = getFood(ctx.foods, i.food);
        const measure = f ? householdMeasure(f, i.g) : undefined;
        out.push(`- ${i.g} g ${f?.name ?? i.food}${measure ? ` (${measure})` : ''}${i.note ? `, ${i.note}` : ''}`);
      }
      out.push('');
      (r.steps ?? []).forEach((s, k) => out.push(`${k + 1}. ${s}`));
      out.push('');
      const facts = [
        r.prepMin != null ? `prep ${r.prepMin} min` : '',
        r.cookMin != null ? `cook ${r.cookMin} min` : '',
        r.servings ? `makes ${r.servings}` : '',
        r.tags?.length ? r.tags.join(', ') : '',
      ].filter(Boolean);
      if (facts.length) out.push(facts.join(' · '));
      if (r.tip) out.push(`Tip: ${r.tip}`);
      out.push('');
    }

  // per-day numbers for the chosen size
  const { panel, rules } = gradeOptionsFor(family.style, compiled.kcal);
  const report = gradePlan(plan, ctx.foods, ctx.catalog, { panel, rules });
  out.push(`## Numbers, ${SIZE_LABEL[size]} (${compiled.kcal} kcal)`, '');
  out.push('| Day | kcal | protein % | sat % | omega 6:3 | GL | fibre g | lowest nutrients |', '|---|---|---|---|---|---|---|---|');
  for (const r of report.days) {
    const day = plan.days.find((d) => d.day === r.day)!;
    const low = (Object.entries(r.coverage) as [keyof typeof NUTRIENTS, number][])
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([k, pct]) => `${NUTRIENTS[k].short} ${Math.round(pct * 100)}%`)
      .join(', ');
    out.push(`| ${r.day} | ${Math.round(r.kcal)} | ${Math.round(r.proteinPctKcal)} | ${n1(r.satFatPct)} | ${r.omegaRatio == null ? 'n/a' : `${r.omegaRatio.toFixed(1)}:1`} | ${Math.round(r.glycemicLoad)} | ${Math.round(dayPlanTotal(day, ctx.foods).fiber ?? 0)} | ${low} |`);
  }
  out.push('', `Fatty fish ${report.fishPerWeek.toFixed(1)} a week. Graded for ${panel.map((p) => p.sex + (p.lifeStage !== 'none' ? ` (${p.lifeStage})` : '')).join(' and ')}.`);
  return out.join('\n');
}

