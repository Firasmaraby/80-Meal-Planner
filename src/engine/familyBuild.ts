/**
 * From a family file to what ships in the app (scripts/build-plans.mjs is a thin wrapper):
 *   src/data/recipes.json       every recipe once, with its base ingredients
 *   src/data/libraryPlans.json  one compact plan per size: meals as { recipe, slot, g: [grams per ingredient] }
 * A family that fails the lab is refused unless `allowFail`; then only the bands whose two edges both pass are kept in `covers`.
 */
import { bandString, compactPlan, compileFamily, recipesOf } from './family';
import type { CompactPlan, LibraryRecipe } from './libraryPlans';
import { runLab, type LabDeps, type LabResult } from './familyLab';
import type { CalorieBand, PlanSize } from './types';

export interface FamilyBuild {
  id?: string;
  lab: LabResult;
  /** false when the family was refused (it failed the lab and `allowFail` is off, or it is malformed) */
  written: boolean;
  plans: CompactPlan[];
  recipes: LibraryRecipe[];
  /** sizes left out because none of their bands passed, and bands left out of `covers` */
  notes: string[];
}

/** The claimed bands of a size whose lowest and highest kcal both pass every gate. */
export function verifiedBands(lab: LabResult, size: PlanSize, claimed: CalorieBand[]): CalorieBand[] {
  const s = lab.sizes.find((x) => x.size === size);
  if (!s) return [];
  const failing = (kcal: number) => s.edges.find((e) => e.kcal === kcal)?.failures.length;
  return claimed.filter((b) => !failing(b.min) && !failing(b.max));
}

export function buildFamily(raw: unknown, deps: LabDeps, opts: { allowFail?: boolean } = {}): FamilyBuild {
  const lab = runLab(raw, deps);
  const id = lab.family?.id;
  if (!lab.family || lab.exitCode === 1) return { id, lab, written: false, plans: [], recipes: [], notes: ['The file is malformed, so there is nothing to build.'] };
  if (lab.exitCode === 2 && !opts.allowFail) return { id, lab, written: false, plans: [], recipes: [], notes: [`Refused: ${lab.failures.length} failure(s). Fix them, or pass --allow-fail.`] };

  const notes: string[] = [];
  const plans: CompactPlan[] = [];
  for (const c of compileFamily(lab.family, deps)) {
    const covers = verifiedBands(lab, c.size, c.covers);
    if (covers.length < c.covers.length) {
      const dropped = c.covers.filter((b) => !covers.some((v) => v.min === b.min)).map(bandString);
      notes.push(`${c.size}: bands not verified, left out of covers: ${dropped.join(', ')}`);
    }
    if (!covers.length) {
      notes.push(`${c.size}: no band passes, so the ${c.size} plan is not written`);
      continue;
    }
    c.plan.covers = covers;
    c.plan.band = { min: Math.min(...covers.map((b) => b.min)), max: Math.max(...covers.map((b) => b.max)) };
    plans.push(compactPlan(c.plan, deps.foods));
  }
  return { id, lab, written: true, plans, recipes: recipesOf(lab.family), notes };
}

/** One recipe list for the whole library. The same id in two families must be the same recipe; otherwise ids would collide. */
export function mergeRecipes(lists: LibraryRecipe[][]): LibraryRecipe[] {
  const byId = new Map<string, LibraryRecipe>();
  for (const r of lists.flat()) {
    const have = byId.get(r.id);
    if (!have) byId.set(r.id, r);
    else if (JSON.stringify({ ...have, family: '', slot: '' }) !== JSON.stringify({ ...r, family: '', slot: '' }))
      throw new Error(`Recipe id "${r.id}" is used by ${have.family} and ${r.family} with different content. Recipe ids are shared across the library, so rename one.`);
  }
  return [...byId.values()];
}

