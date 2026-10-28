/**
 * Excel meal-plan importer.
 *
 * Pure TypeScript (no React Native / DOM / fs): works in the web admin page (from an
 * ArrayBuffer) and in node tests. Nutrition is never read from the sheet; ingredients are
 * resolved to food ids through a `FoodResolver` and nutrition is computed later by the engine.
 *
 * Contract: `plans` only contains plans that have no `error` issues attributed to them, so a
 * caller that forgets to check `issues` still never receives a half-broken plan. Callers should
 * normally refuse the whole upload when any issue has level 'error'.
 */
import * as XLSX from 'xlsx';
import type { Ingredient, Meal, MealPlan, MealSlot, PlanDay } from '../engine/types';

export interface FoodResolver {
  byId(id: string): { id: string; name: string } | undefined;
  /** score 0..1, best first */
  search(name: string, limit?: number): { id: string; name: string; score: number }[];
}

export interface ImportIssue {
  level: 'error' | 'warning';
  sheet: string;
  /** 1-based Excel row number (1 = header row, also used for sheet-level problems) */
  row: number;
  message: string;
  suggestion?: string;
}

export interface ImportResult {
  plans: MealPlan[];
  issues: ImportIssue[];
}

export const DEFAULT_AUTO_ACCEPT_SCORE = 0.85;
const MAX_SUGGESTIONS = 3;
const MIN_KCAL = 1000;
const MAX_KCAL = 5000;
const MAX_DAY = 14;
const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const SLOT_RANK: Record<MealSlot, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };

const SHEETS = {
  plans: { name: 'Plans', required: ['plan_id', 'plan_name', 'calorie_min', 'calorie_max', 'cuisine'] },
  meals: { name: 'Meals', required: ['plan_id', 'day', 'slot', 'meal_id', 'meal_name'] },
  ingredients: { name: 'Ingredients', required: ['meal_id', 'grams'] },
} as const;

// ── cell helpers ───────────────────────────────────────────────────────────

type Cell = string | number | boolean | Date | null | undefined;

const normKey = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

function str(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return String(v).trim();
}

/** number from a cell: numeric cell or numeric text; NaN when absent/invalid */
function num(v: Cell): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = str(v).replace(/\s/g, '');
  if (s === '') return NaN;
  // allow a decimal comma ("37,5") but not thousands separators
  const n = Number(/^\d+,\d+$/.test(s) ? s.replace(',', '.') : s);
  return Number.isFinite(n) ? n : NaN;
}

const isExample = (id: string) => id.toUpperCase().startsWith('EXAMPLE');

interface SheetRow {
  /** 1-based Excel row number */
  row: number;
  get(col: string): Cell;
}

interface SheetData {
  rows: SheetRow[];
  columns: Set<string>;
}

function readSheet(wb: XLSX.WorkBook, name: string): SheetData | undefined {
  const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase());
  if (!sheetName) return undefined;
  const ws = wb.Sheets[sheetName];
  if (!ws || !ws['!ref']) return { rows: [], columns: new Set() };

  const startRow = XLSX.utils.decode_range(ws['!ref']).s.r; // 0-based
  const aoa = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '', blankrows: true });

  // the header is the first row that has any content
  const headerIdx = aoa.findIndex((r) => r.some((c) => str(c) !== ''));
  if (headerIdx < 0) return { rows: [], columns: new Set() };

  const colIndex = new Map<string, number>();
  aoa[headerIdx].forEach((h, i) => {
    const k = normKey(h);
    if (k && !colIndex.has(k)) colIndex.set(k, i);
  });

  const rows: SheetRow[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const cells = aoa[i];
    if (!cells.some((c) => str(c) !== '')) continue; // blank row
    rows.push({
      row: startRow + i + 1,
      get: (col) => {
        const idx = colIndex.get(col);
        return idx === undefined ? undefined : cells[idx];
      },
    });
  }
  return { rows, columns: new Set(colIndex.keys()) };
}

// ── importer ───────────────────────────────────────────────────────────────

interface PlanDraft {
  plan: MealPlan;
  row: number;
  /** day -> meals, in sheet order */
  byDay: Map<number, { meal: Meal; order: number }[]>;
  mealCount: number;
  /** meal rows that referenced this plan, valid or not (avoids a cascading "no meals" error) */
  mealRows: number;
}

interface MealDraft {
  meal: Meal;
  planId: string;
  row: number;
  /** ingredient rows seen for this meal, valid or not (avoids cascading "no ingredients" errors) */
  ingredientRows: number;
}

export function parsePlanWorkbook(
  data: ArrayBuffer | Uint8Array,
  foods: FoodResolver,
  opts?: { autoAcceptScore?: number },
): ImportResult {
  const autoAccept = opts?.autoAcceptScore ?? DEFAULT_AUTO_ACCEPT_SCORE;
  const issues: ImportIssue[] = [];
  const badPlans = new Set<string>();

  const warn = (sheet: string, row: number, message: string, suggestion?: string) =>
    issues.push({ level: 'warning', sheet, row, message, ...(suggestion ? { suggestion } : {}) });
  const fail = (sheet: string, row: number, message: string, planId?: string, suggestion?: string) => {
    issues.push({ level: 'error', sheet, row, message, ...(suggestion ? { suggestion } : {}) });
    if (planId) badPlans.add(planId);
  };

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: 'array' });
  } catch (e) {
    fail('Workbook', 1, `Could not read the file as an Excel workbook (${e instanceof Error ? e.message : String(e)}).`);
    return { plans: [], issues };
  }

  // sheets & required columns
  const sheets = {} as Record<keyof typeof SHEETS, SheetData | undefined>;
  let structureOk = true;
  for (const key of Object.keys(SHEETS) as (keyof typeof SHEETS)[]) {
    const def = SHEETS[key];
    const sd = readSheet(wb, def.name);
    sheets[key] = sd;
    if (!sd) {
      fail(def.name, 1, `Sheet "${def.name}" is missing. Start from the template file.`);
      structureOk = false;
      continue;
    }
    for (const col of def.required) {
      if (!sd.columns.has(col)) {
        fail(def.name, 1, `Column "${col}" is missing from the header row.`);
        structureOk = false;
      }
    }
  }
  if (sheets.ingredients && !sheets.ingredients.columns.has('food_id') && !sheets.ingredients.columns.has('food_name')) {
    fail('Ingredients', 1, 'Add a "food_id" and/or "food_name" column.');
    structureOk = false;
  }
  if (!structureOk) return { plans: [], issues };

  // ── Plans
  const plans = new Map<string, PlanDraft>();
  for (const r of sheets.plans!.rows) {
    const S = 'Plans';
    const id = str(r.get('plan_id'));
    if (isExample(id)) continue;

    const name = str(r.get('plan_name'));
    const cuisine = str(r.get('cuisine'));
    const minRaw = r.get('calorie_min');
    const maxRaw = r.get('calorie_max');
    const calMin = num(minRaw);
    const calMax = num(maxRaw);

    let ok = true;
    const need = (field: string, raw: Cell) => {
      if (str(raw) !== '') return false;
      fail(S, r.row, `Missing required field "${field}".`, id || undefined);
      ok = false;
      return true;
    };
    need('plan_id', id);
    need('plan_name', name);
    need('cuisine', cuisine);
    const minMissing = need('calorie_min', minRaw);
    const maxMissing = need('calorie_max', maxRaw);
    if (!minMissing && Number.isNaN(calMin)) {
      fail(S, r.row, `calorie_min "${str(minRaw)}" is not a number.`, id);
      ok = false;
    }
    if (!maxMissing && Number.isNaN(calMax)) {
      fail(S, r.row, `calorie_max "${str(maxRaw)}" is not a number.`, id);
      ok = false;
    }
    if (!Number.isNaN(calMin) && !Number.isNaN(calMax)) {
      if (calMin >= calMax) {
        fail(S, r.row, `calorie_min (${calMin}) must be lower than calorie_max (${calMax}).`, id);
        ok = false;
      }
      for (const [label, v] of [['calorie_min', calMin], ['calorie_max', calMax]] as const) {
        if (v < MIN_KCAL || v > MAX_KCAL) warn(S, r.row, `${label} ${v} is outside the usual ${MIN_KCAL}-${MAX_KCAL} range.`);
      }
    }
    if (!id) continue;

    if (plans.has(id)) {
      fail(S, r.row, `Duplicate plan_id "${id}" (first used on row ${plans.get(id)!.row}).`, id);
      continue;
    }

    let version = 1;
    const vRaw = r.get('version');
    if (str(vRaw) !== '') {
      const v = num(vRaw);
      if (Number.isInteger(v) && v >= 1) version = v;
      else warn(S, r.row, `version "${str(vRaw)}" is not a whole number of 1 or more; using 1.`);
    }

    const tags = Array.from(
      new Set(str(r.get('tags')).split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean)),
    );
    const description = str(r.get('description'));
    const author = str(r.get('author'));

    const plan: MealPlan = {
      id,
      version,
      name,
      band: { min: Number.isNaN(calMin) ? 0 : calMin, max: Number.isNaN(calMax) ? 0 : calMax },
      cuisine,
      tags,
      ...(description ? { description } : {}),
      ...(author ? { author } : {}),
      days: [],
    };
    plans.set(id, { plan, row: r.row, byDay: new Map(), mealCount: 0, mealRows: 0 });
    if (!ok) badPlans.add(id);
  }

  // ── Meals
  const meals = new Map<string, MealDraft>();
  const rejectedMealIds = new Set<string>(); // meal rows that failed; their ingredients are skipped silently
  let mealOrder = 0;
  for (const r of sheets.meals!.rows) {
    const S = 'Meals';
    const planId = str(r.get('plan_id'));
    const mealId = str(r.get('meal_id'));
    if (isExample(planId) || isExample(mealId)) continue;

    const name = str(r.get('meal_name'));
    const dayRaw = r.get('day');
    const slotRaw = str(r.get('slot')).toLowerCase();
    const dayNum = num(dayRaw);

    let ok = true;
    const need = (field: string, v: string) => {
      if (v === '') {
        fail(S, r.row, `Missing required field "${field}".`, planId || undefined);
        ok = false;
      }
    };
    need('plan_id', planId);
    need('meal_id', mealId);
    need('meal_name', name);
    need('slot', slotRaw);
    need('day', str(dayRaw));

    const draft = planId ? plans.get(planId) : undefined;
    if (draft) draft.mealRows++;
    if (planId && !draft) {
      fail(S, r.row, `plan_id "${planId}" is not defined on the Plans sheet.`, undefined, nearest(planId, [...plans.keys()]));
      ok = false;
    }
    if (str(dayRaw) !== '' && (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > MAX_DAY)) {
      fail(S, r.row, `day "${str(dayRaw)}" must be a whole number from 1 to ${MAX_DAY}.`, planId || undefined);
      ok = false;
    }
    if (slotRaw !== '' && !(slotRaw in SLOT_RANK)) {
      fail(S, r.row, `slot "${str(r.get('slot'))}" must be one of: ${SLOT_ORDER.join(', ')}.`, planId || undefined, nearest(slotRaw, SLOT_ORDER));
      ok = false;
    }
    if (mealId && meals.has(mealId)) {
      fail(S, r.row, `Duplicate meal_id "${mealId}" (first used on row ${meals.get(mealId)!.row}).`, planId || undefined);
      continue;
    }
    if (!ok || !draft) {
      if (mealId) rejectedMealIds.add(mealId);
      continue;
    }

    const prepRaw = r.get('prep_minutes');
    let prepMinutes: number | undefined;
    if (str(prepRaw) !== '') {
      const p = num(prepRaw);
      if (Number.isFinite(p) && p >= 0) prepMinutes = p;
      else warn(S, r.row, `prep_minutes "${str(prepRaw)}" is not a valid number; ignored.`);
    }
    const instructions = str(r.get('instructions'));
    const photoUrl = str(r.get('photo_url'));
    if (photoUrl && !/^https?:\/\//i.test(photoUrl)) warn(S, r.row, `photo_url "${photoUrl}" does not start with http:// or https://.`);

    const meal: Meal = {
      id: mealId,
      slot: slotRaw as MealSlot,
      name,
      ...(prepMinutes !== undefined ? { prepMinutes } : {}),
      ...(instructions ? { instructions } : {}),
      ...(photoUrl ? { photoUrl } : {}),
      ingredients: [],
    };
    meals.set(mealId, { meal, planId, row: r.row, ingredientRows: 0 });
    const list = draft.byDay.get(dayNum) ?? [];
    list.push({ meal, order: mealOrder++ });
    draft.byDay.set(dayNum, list);
    draft.mealCount++;

    if (meal.slot !== 'snack' && list.some((m) => m.meal !== meal && m.meal.slot === meal.slot)) {
      warn(S, r.row, `Plan "${planId}" day ${dayNum} has more than one ${meal.slot}.`);
    }
  }

  // ── Ingredients
  const searchCache = new Map<string, ReturnType<FoodResolver['search']>>();
  const search = (name: string) => {
    const k = name.toLowerCase();
    let hit = searchCache.get(k);
    if (!hit) {
      hit = foods.search(name, MAX_SUGGESTIONS);
      searchCache.set(k, hit);
    }
    return hit;
  };

  for (const r of sheets.ingredients!.rows) {
    const S = 'Ingredients';
    const mealId = str(r.get('meal_id'));
    if (isExample(mealId)) continue;

    if (!mealId) {
      fail(S, r.row, 'Missing required field "meal_id".');
      continue;
    }
    const md = meals.get(mealId);
    if (!md) {
      if (!rejectedMealIds.has(mealId)) {
        fail(S, r.row, `meal_id "${mealId}" is not defined on the Meals sheet.`, undefined, nearest(mealId, [...meals.keys()]));
      }
      continue;
    }
    md.ingredientRows++;
    const planId = md.planId;

    // grams
    const gramsRaw = r.get('grams');
    const grams = num(gramsRaw);
    let ok = true;
    if (str(gramsRaw) === '') {
      fail(S, r.row, 'Missing required field "grams".', planId);
      ok = false;
    } else if (Number.isNaN(grams)) {
      fail(S, r.row, `grams "${str(gramsRaw)}" is not a number.`, planId);
      ok = false;
    } else if (grams <= 0) {
      fail(S, r.row, `grams must be greater than 0 (got ${grams}).`, planId);
      ok = false;
    } else if (grams > 2000) {
      warn(S, r.row, `grams ${grams} is unusually large for one ingredient; check the unit.`);
    }

    // food
    const foodId = str(r.get('food_id'));
    const foodName = str(r.get('food_name'));
    let resolved: string | undefined;
    if (foodId) {
      const f = foods.byId(foodId);
      if (f) resolved = f.id;
      else if (!foodName) {
        fail(S, r.row, `food_id "${foodId}" was not found in the food database.`, planId);
        ok = false;
      } else {
        warn(S, r.row, `food_id "${foodId}" was not found; trying food_name "${foodName}" instead.`);
      }
    }
    if (!resolved && (foodName || !foodId)) {
      if (!foodName) {
        fail(S, r.row, 'Give either food_id or food_name.', planId);
        ok = false;
      } else {
        const hits = search(foodName);
        const top = hits[0];
        if (top && top.score >= autoAccept) {
          resolved = top.id;
          warn(S, r.row, `food_name "${foodName}" was matched to "${top.name}" (${top.id}, ${Math.round(top.score * 100)}% match). Check it, or put the id in food_id.`, top.id);
        } else {
          const sug = hits.slice(0, MAX_SUGGESTIONS).map((h) => `${h.id} (${h.name})`).join('; ');
          fail(S, r.row, `food_name "${foodName}" has no confident match.`, planId, sug || undefined);
          ok = false;
        }
      }
    }
    if (!ok || !resolved) continue;

    const swap = str(r.get('swap_group'));
    const note = str(r.get('note'));
    const ing: Ingredient = {
      foodId: resolved,
      grams,
      ...(swap ? { swapGroup: swap } : {}),
      ...(note ? { note } : {}),
    };
    md.meal.ingredients.push(ing);
  }

  // ── completeness
  for (const md of meals.values()) {
    if (md.ingredientRows === 0) fail('Meals', md.row, `Meal "${md.meal.id}" has no ingredients.`, md.planId);
  }
  for (const [id, d] of plans) {
    if (d.mealRows === 0) fail('Plans', d.row, `Plan "${id}" has no meals.`, id);
  }

  // ── assemble
  const out: MealPlan[] = [];
  for (const [id, d] of plans) {
    if (badPlans.has(id)) continue;
    const days: PlanDay[] = [...d.byDay.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([day, list]) => ({
        day,
        meals: list
          .slice()
          .sort((a, b) => SLOT_RANK[a.meal.slot] - SLOT_RANK[b.meal.slot] || a.order - b.order)
          .map((x) => x.meal),
      }));
    const gaps = days.some((x, i) => x.day !== i + 1);
    if (gaps) warn('Plans', d.row, `Plan "${id}" has days ${days.map((x) => x.day).join(', ')}; days normally run 1, 2, 3... without gaps.`);
    d.plan.days = days;
    out.push(d.plan);
  }
  return { plans: out, issues };
}

/** cheap "did you mean": candidate with the longest shared prefix / containment, case-insensitive */
function nearest(value: string, candidates: string[]): string | undefined {
  const v = value.toLowerCase();
  if (!v || candidates.length === 0) return undefined;
  let best: string | undefined;
  let bestScore = 0;
  for (const c of candidates) {
    const lc = c.toLowerCase();
    let s = 0;
    if (lc === v) s = 1;
    else if (lc.includes(v) || v.includes(lc)) s = 0.8;
    else {
      let i = 0;
      while (i < lc.length && i < v.length && lc[i] === v[i]) i++;
      s = i / Math.max(lc.length, v.length);
    }
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore >= 0.5 ? `Did you mean "${best}"?` : undefined;
}
