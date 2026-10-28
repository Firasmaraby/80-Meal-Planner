/**
 * Meal plan repository: reads published plans for the app and (admin only) uploads new
 * versions parsed from Excel.
 *
 * DB <-> domain mapping (snake_case <-> camelCase, 3 flat tables <-> nested MealPlan):
 *   meal_plans       -> MealPlan            (band_min/band_max -> band.{min,max})
 *   plan_meals       -> PlanDay[].meals[]   (day, position give the nesting and order)
 *   plan_ingredients -> Meal.ingredients[]
 *
 * Versioning: every upload creates version = max(existing) + 1 as a DRAFT. Published and
 * archived versions are immutable (database triggers), so users enrolled in an older
 * version keep exactly the plan they enrolled in. `publish_plan` flips the new version to
 * published and archives the previous one in one transaction.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Ingredient, Meal, MealPlan, MealSlot, PlanDay } from '../engine/types';
import { chunk } from './sync';
import { requireSupabase } from './supabase';

// ── Row types ────────────────────────────────────────────────────────────

export type PlanStatus = 'draft' | 'published' | 'archived';

export interface PlanRow {
  id: string;
  version: number;
  name: string;
  band_min: number;
  band_max: number;
  cuisine: string;
  tags: string[];
  description: string | null;
  author: string | null;
  status: PlanStatus;
  published_at?: string | null;
}

export interface PlanMealRow {
  plan_id: string;
  version: number;
  day: number;
  slot: MealSlot;
  position: number;
  meal_id: string;
  name: string;
  prep_minutes: number | null;
  instructions: string | null;
  photo_url: string | null;
}

export interface PlanIngredientRow {
  plan_id: string;
  version: number;
  meal_id: string;
  position: number;
  food_id: string;
  grams: number;
  swap_group: string | null;
  note: string | null;
}

export interface UploadedPlan {
  id: string;
  version: number;
  status: 'draft' | 'published';
}

const SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const PAGE = 1000; // Supabase's default max rows per request

// ── Pure: rows -> domain ──────────────────────────────────────────────────

const planKey = (id: string, version: number) => `${id}@${version}`;
const mealKey = (id: string, version: number, mealId: string) => `${id}@${version}#${mealId}`;

/** Build nested plans from the three flat tables. Pure; input order does not matter. */
export function assemblePlans(
  plans: readonly PlanRow[],
  meals: readonly PlanMealRow[],
  ingredients: readonly PlanIngredientRow[],
): MealPlan[] {
  const ingredientsByMeal = new Map<string, PlanIngredientRow[]>();
  for (const row of ingredients) {
    const k = mealKey(row.plan_id, row.version, row.meal_id);
    const list = ingredientsByMeal.get(k);
    if (list) list.push(row);
    else ingredientsByMeal.set(k, [row]);
  }

  const mealsByPlan = new Map<string, PlanMealRow[]>();
  for (const row of meals) {
    const k = planKey(row.plan_id, row.version);
    const list = mealsByPlan.get(k);
    if (list) list.push(row);
    else mealsByPlan.set(k, [row]);
  }

  return plans.map((p) => {
    const mealRows = (mealsByPlan.get(planKey(p.id, p.version)) ?? [])
      .slice()
      .sort((a, b) => a.day - b.day || a.position - b.position);

    const days: PlanDay[] = [];
    for (const m of mealRows) {
      let day = days[days.length - 1];
      if (!day || day.day !== m.day) {
        day = { day: m.day, meals: [] };
        days.push(day);
      }
      day.meals.push(rowToMeal(m, ingredientsByMeal.get(mealKey(m.plan_id, m.version, m.meal_id)) ?? []));
    }

    const plan: MealPlan = {
      id: p.id,
      version: p.version,
      name: p.name,
      band: { min: p.band_min, max: p.band_max },
      cuisine: p.cuisine,
      tags: p.tags ?? [],
      days,
    };
    if (p.description != null) plan.description = p.description;
    if (p.author != null) plan.author = p.author;
    return plan;
  });
}

function rowToMeal(m: PlanMealRow, ingredientRows: readonly PlanIngredientRow[]): Meal {
  const meal: Meal = {
    id: m.meal_id,
    slot: m.slot,
    name: m.name,
    ingredients: ingredientRows
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(rowToIngredient),
  };
  if (m.prep_minutes != null) meal.prepMinutes = m.prep_minutes;
  if (m.instructions != null) meal.instructions = m.instructions;
  if (m.photo_url != null) meal.photoUrl = m.photo_url;
  return meal;
}

function rowToIngredient(r: PlanIngredientRow): Ingredient {
  const ing: Ingredient = { foodId: r.food_id, grams: Number(r.grams) };
  if (r.swap_group != null) ing.swapGroup = r.swap_group;
  if (r.note != null) ing.note = r.note;
  return ing;
}

// ── Pure: domain -> rows ──────────────────────────────────────────────────

/** Flatten one plan into insertable rows for the given (new) version. Always a draft. */
export function planToRows(
  plan: MealPlan,
  version: number,
): { plan: PlanRow; meals: PlanMealRow[]; ingredients: PlanIngredientRow[] } {
  const meals: PlanMealRow[] = [];
  const ingredients: PlanIngredientRow[] = [];

  for (const day of plan.days) {
    day.meals.forEach((meal, position) => {
      meals.push({
        plan_id: plan.id,
        version,
        day: day.day,
        slot: meal.slot,
        position,
        meal_id: meal.id,
        name: meal.name,
        prep_minutes: meal.prepMinutes ?? null,
        instructions: meal.instructions ?? null,
        photo_url: meal.photoUrl ?? null,
      });
      meal.ingredients.forEach((ing, i) => {
        ingredients.push({
          plan_id: plan.id,
          version,
          meal_id: meal.id,
          position: i,
          food_id: ing.foodId,
          grams: ing.grams,
          swap_group: ing.swapGroup ?? null,
          note: ing.note ?? null,
        });
      });
    });
  }

  return {
    plan: {
      id: plan.id,
      version,
      name: plan.name,
      band_min: plan.band.min,
      band_max: plan.band.max,
      cuisine: plan.cuisine ?? '',
      tags: plan.tags ?? [],
      description: plan.description ?? null,
      author: plan.author ?? null,
      status: 'draft',
    },
    meals,
    ingredients,
  };
}

/**
 * Client-side validation that mirrors the database constraints, so an admin gets a readable
 * list of everything wrong with the spreadsheet instead of one opaque SQL error.
 */
export function validatePlan(plan: MealPlan): string[] {
  const errors: string[] = [];
  const at = `plan "${plan.id}"`;
  if (!plan.id?.trim()) errors.push('plan has no id');
  if (!plan.name?.trim()) errors.push(`${at}: name is empty`);
  if (!(plan.band?.min > 0) || !(plan.band?.max > plan.band?.min)) {
    errors.push(`${at}: calorie band must satisfy 0 < min < max (got ${plan.band?.min}-${plan.band?.max})`);
  }
  if (!plan.days?.length) errors.push(`${at}: has no days`);

  const seenDays = new Set<number>();
  const seenMeals = new Set<string>();
  for (const day of plan.days ?? []) {
    if (!Number.isInteger(day.day) || day.day < 1) errors.push(`${at}: invalid day number ${day.day}`);
    if (seenDays.has(day.day)) errors.push(`${at}: day ${day.day} appears twice`);
    seenDays.add(day.day);
    if (!day.meals?.length) errors.push(`${at}: day ${day.day} has no meals`);
    for (const meal of day.meals ?? []) {
      const where = `${at} day ${day.day} meal "${meal.id}"`;
      if (!meal.id?.trim()) errors.push(`${at} day ${day.day}: a meal has no id`);
      if (seenMeals.has(meal.id)) errors.push(`${where}: meal id is not unique within the plan`);
      seenMeals.add(meal.id);
      if (!meal.name?.trim()) errors.push(`${where}: name is empty`);
      if (!SLOTS.includes(meal.slot)) errors.push(`${where}: invalid slot "${meal.slot}"`);
      if (meal.prepMinutes != null && !(meal.prepMinutes >= 0)) errors.push(`${where}: invalid prep minutes`);
      if (!meal.ingredients?.length) errors.push(`${where}: has no ingredients`);
      for (const ing of meal.ingredients ?? []) {
        if (!ing.foodId?.trim()) errors.push(`${where}: an ingredient has no foodId`);
        if (!(Number.isFinite(ing.grams) && ing.grams > 0)) {
          errors.push(`${where}: ingredient "${ing.foodId}" needs grams > 0 (got ${ing.grams})`);
        }
      }
    }
  }
  return errors;
}

// ── Network helpers ───────────────────────────────────────────────────────

function fail(op: string, error: { message: string; code?: string }): never {
  const hint =
    error.code === '42501' || /row-level security/i.test(error.message)
      ? ' (only admins can upload plans; is profiles.is_admin set for this user?)'
      : '';
  throw new Error(`plansRepo ${op}: ${error.message}${hint}`, { cause: error });
}

type PageResult = PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>;

/** PostgREST caps every response at 1000 rows by default, so read in pages. */
async function fetchAll<T>(op: string, page: (from: number, to: number) => PageResult): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) fail(op, error);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

async function loadChildren(
  client: SupabaseClient,
  plans: readonly PlanRow[],
): Promise<{ meals: PlanMealRow[]; ingredients: PlanIngredientRow[] }> {
  const wanted = new Set(plans.map((p) => planKey(p.id, p.version)));
  const meals: PlanMealRow[] = [];
  const ingredients: PlanIngredientRow[] = [];

  for (const group of chunk(plans, 40)) {
    const ids = [...new Set(group.map((p) => p.id))];
    const versions = [...new Set(group.map((p) => p.version))];

    const m = await fetchAll<PlanMealRow>('fetch meals', (from, to) =>
      client
        .from('plan_meals')
        .select('*')
        .in('plan_id', ids)
        .in('version', versions)
        .order('plan_id')
        .order('version')
        .order('meal_id')
        .range(from, to),
    );
    const i = await fetchAll<PlanIngredientRow>('fetch ingredients', (from, to) =>
      client
        .from('plan_ingredients')
        .select('*')
        .in('plan_id', ids)
        .in('version', versions)
        .order('plan_id')
        .order('version')
        .order('meal_id')
        .order('position')
        .range(from, to),
    );
    // the id x version cross product can over-fetch; keep only the exact pairs
    meals.push(...m.filter((r) => wanted.has(planKey(r.plan_id, r.version))));
    ingredients.push(...i.filter((r) => wanted.has(planKey(r.plan_id, r.version))));
  }
  return { meals, ingredients };
}

// ── Public API ────────────────────────────────────────────────────────────

/** All currently published plans (one version per plan id), fully nested. */
export async function fetchPublishedPlans(client: SupabaseClient = requireSupabase()): Promise<MealPlan[]> {
  // The explicit filter matters: RLS also exposes drafts to admins and archived versions to
  // enrolled users, and this function must return only what is published.
  const plans = await fetchAll<PlanRow>('fetch plans', (from, to) =>
    client.from('meal_plans').select('*').eq('status', 'published').order('id').order('version').range(from, to),
  );
  const { meals, ingredients } = await loadChildren(client, plans);
  return assemblePlans(plans, meals, ingredients);
}

/**
 * One exact version, whatever its status. Use it to load the plan a user is ENROLLED in:
 * RLS lets users read an archived version they are enrolled in, and nothing else archived.
 */
export async function fetchPlanVersion(
  id: string,
  version: number,
  client: SupabaseClient = requireSupabase(),
): Promise<MealPlan | null> {
  const { data, error } = await client.from('meal_plans').select('*').eq('id', id).eq('version', version).maybeSingle();
  if (error) fail('fetch plan', error);
  if (!data) return null;
  const rows = [data as PlanRow];
  const { meals, ingredients } = await loadChildren(client, rows);
  return assemblePlans(rows, meals, ingredients)[0] ?? null;
}

/** Throw if any food / swap group referenced by the plans is missing from the catalog. */
async function assertReferencesExist(client: SupabaseClient, plans: readonly MealPlan[]): Promise<void> {
  const foodIds = new Set<string>();
  const groups = new Set<string>();
  for (const p of plans)
    for (const d of p.days)
      for (const m of d.meals)
        for (const ing of m.ingredients) {
          foodIds.add(ing.foodId);
          if (ing.swapGroup) groups.add(ing.swapGroup);
        }

  const missing = async (table: 'foods' | 'swap_groups', column: 'id' | 'key', values: Set<string>) => {
    const found = new Set<string>();
    for (const batch of chunk([...values], 100)) {
      const { data, error } = await client.from(table).select(column).in(column, batch);
      if (error) fail(`check ${table}`, error);
      for (const row of (data ?? []) as unknown as Record<string, string>[]) found.add(row[column]);
    }
    return [...values].filter((v) => !found.has(v));
  };

  const problems: string[] = [];
  const missingFoods = await missing('foods', 'id', foodIds);
  if (missingFoods.length) problems.push(`unknown foodId(s): ${missingFoods.slice(0, 10).join(', ')}${missingFoods.length > 10 ? ` (+${missingFoods.length - 10} more)` : ''}`);
  const missingGroups = await missing('swap_groups', 'key', groups);
  if (missingGroups.length) problems.push(`unknown swap group(s): ${missingGroups.join(', ')}`);
  if (problems.length) throw new Error(`plansRepo upload: ${problems.join('; ')}`);
}

async function nextVersion(client: SupabaseClient, id: string): Promise<number> {
  const { data, error } = await client
    .from('meal_plans')
    .select('version')
    .eq('id', id)
    .order('version', { ascending: false })
    .limit(1);
  if (error) fail('next version', error);
  const top = (data as { version: number }[] | null)?.[0]?.version ?? 0;
  return top + 1;
}

async function deleteDraft(client: SupabaseClient, id: string, version: number): Promise<void> {
  // cascades to plan_meals / plan_ingredients; only drafts can be deleted (trigger)
  await client.from('meal_plans').delete().eq('id', id).eq('version', version).eq('status', 'draft');
}

/**
 * Admin upload. For each plan: assigns the next version number for its id (any `version`
 * on the input is ignored), writes it as a draft, then, if `publish` is set and EVERYTHING
 * uploaded cleanly, publishes all of them via the `publish_plan` RPC.
 *
 * supabase-js has no multi-statement transaction, so the upload is made safe by order:
 *  1. validate everything locally and check food / swap-group references (no writes yet);
 *  2. write drafts (invisible to users); on any failure the drafts of this call are deleted;
 *  3. publish last. A failure here leaves the remaining versions as drafts to retry.
 */
export async function uploadPlans(
  plans: MealPlan[],
  { publish }: { publish: boolean },
  client: SupabaseClient = requireSupabase(),
): Promise<UploadedPlan[]> {
  if (!plans.length) return [];

  const errors = plans.flatMap(validatePlan);
  const ids = plans.map((p) => p.id);
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) {
    errors.push(`plan id "${id}" appears more than once in this upload`);
  }
  if (errors.length) throw new Error(`Plan file has ${errors.length} problem(s):\n- ${errors.join('\n- ')}`);

  await assertReferencesExist(client, plans);

  const created: UploadedPlan[] = [];
  try {
    for (const plan of plans) {
      // two admins uploading the same plan at once collide on the primary key: retry
      for (let attempt = 0; ; attempt++) {
        const version = await nextVersion(client, plan.id);
        const rows = planToRows(plan, version);
        const { error } = await client.from('meal_plans').insert(rows.plan);
        if (error) {
          if (error.code === '23505' && attempt < 2) continue;
          fail(`insert plan ${plan.id}`, error);
        }
        created.push({ id: plan.id, version, status: 'draft' });

        for (const batch of chunk(rows.meals, 500)) {
          const r = await client.from('plan_meals').insert(batch);
          if (r.error) fail(`insert meals of ${plan.id}@${version}`, r.error);
        }
        for (const batch of chunk(rows.ingredients, 500)) {
          const r = await client.from('plan_ingredients').insert(batch);
          if (r.error) fail(`insert ingredients of ${plan.id}@${version}`, r.error);
        }
        break;
      }
    }
  } catch (e) {
    await Promise.allSettled(created.map((c) => deleteDraft(client, c.id, c.version)));
    throw e;
  }

  if (publish) {
    for (const c of created) {
      const { error } = await client.rpc('publish_plan', { p_id: c.id, p_version: c.version });
      if (error) {
        const done = created.filter((x) => x.status === 'published').map((x) => `${x.id}@${x.version}`);
        throw new Error(
          `plansRepo publish ${c.id}@${c.version}: ${error.message}. ` +
            `Uploaded as drafts (retry publishing). Already published: ${done.join(', ') || 'none'}.`,
          { cause: error },
        );
      }
      c.status = 'published';
    }
  }
  return created;
}
