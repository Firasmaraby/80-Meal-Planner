/**
 * Pure mapping from Eighty's nutrient model to HealthKit (iOS) and Health Connect (Android).
 *
 * Nothing in this file touches a native module (the imports below are type-only and erased at
 * build time), so it is safe on web and in vitest. The platform files `health.ios.ts` and
 * `health.android.ts` feed these tables and samples into the native APIs.
 *
 * Sample granularity (documented decision): ONE SAMPLE PER MEAL SLOT PER NUTRIENT, not one per log
 * item. A day has at most five groups (breakfast, lunch, dinner, snack, extras), so the Health app
 * shows a readable timeline (a day with 30 logged ingredients would otherwise create ~1000
 * HealthKit samples) and Health Connect gets a single NutritionRecord per meal. The cost is that
 * edits to one ingredient rewrite the whole day; since every sync replaces the day anyway, that is
 * free.
 */
import type { QuantityTypeIdentifierWriteable } from '@kingstinct/react-native-healthkit';
import type { NutritionRecord } from 'react-native-health-connect';

import { NUTRIENTS } from '@/engine/nutrients';
import type { MealSlot, NutrientKey, NutrientVector } from '@/engine/types';

// ── Units ──────────────────────────────────────────────────────────────────

/** The units used by NUTRIENTS[k].unit in src/engine/nutrients.ts. */
export type AppUnit = 'kcal' | 'g' | 'mg' | 'µg';

/** How many grams one unit weighs. kcal is handled separately (never converted). */
const GRAMS_PER: Record<Exclude<AppUnit, 'kcal'>, number> = { g: 1, mg: 1e-3, µg: 1e-6 };

/**
 * Convert between mass units. Energy (kcal) only converts to itself; mixing energy and mass throws,
 * which would be a mapping-table bug and should fail loudly in tests.
 */
export function convertUnit(value: number, from: AppUnit, to: AppUnit): number {
  if (from === to) return value;
  if (from === 'kcal' || to === 'kcal') throw new Error(`Cannot convert ${from} to ${to}`);
  return (value * GRAMS_PER[from]) / GRAMS_PER[to];
}

// ── Apple HealthKit ────────────────────────────────────────────────────────

/** Units HealthKit understands for dietary quantities (HKUnit strings; 'mcg' is micrograms). */
export type HealthKitUnit = 'kcal' | 'g' | 'mg' | 'mcg';

export interface HealthKitTarget {
  id: QuantityTypeIdentifierWriteable;
  unit: HealthKitUnit;
}

const HK_UNIT_TO_APP: Record<HealthKitUnit, AppUnit> = { kcal: 'kcal', g: 'g', mg: 'mg', mcg: 'µg' };

export const HEALTHKIT_MAP: Partial<Record<NutrientKey, HealthKitTarget>> = {
  kcal: { id: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', unit: 'kcal' },
  protein: { id: 'HKQuantityTypeIdentifierDietaryProtein', unit: 'g' },
  carbs: { id: 'HKQuantityTypeIdentifierDietaryCarbohydrates', unit: 'g' },
  fiber: { id: 'HKQuantityTypeIdentifierDietaryFiber', unit: 'g' },
  sugar: { id: 'HKQuantityTypeIdentifierDietarySugar', unit: 'g' },
  fat: { id: 'HKQuantityTypeIdentifierDietaryFatTotal', unit: 'g' },
  satFat: { id: 'HKQuantityTypeIdentifierDietaryFatSaturated', unit: 'g' },
  mufa: { id: 'HKQuantityTypeIdentifierDietaryFatMonounsaturated', unit: 'g' },
  pufa: { id: 'HKQuantityTypeIdentifierDietaryFatPolyunsaturated', unit: 'g' },
  vitA: { id: 'HKQuantityTypeIdentifierDietaryVitaminA', unit: 'mcg' },
  vitC: { id: 'HKQuantityTypeIdentifierDietaryVitaminC', unit: 'mg' },
  vitD: { id: 'HKQuantityTypeIdentifierDietaryVitaminD', unit: 'mcg' },
  vitE: { id: 'HKQuantityTypeIdentifierDietaryVitaminE', unit: 'mg' },
  vitK: { id: 'HKQuantityTypeIdentifierDietaryVitaminK', unit: 'mcg' },
  b1: { id: 'HKQuantityTypeIdentifierDietaryThiamin', unit: 'mg' },
  b2: { id: 'HKQuantityTypeIdentifierDietaryRiboflavin', unit: 'mg' },
  b3: { id: 'HKQuantityTypeIdentifierDietaryNiacin', unit: 'mg' },
  b5: { id: 'HKQuantityTypeIdentifierDietaryPantothenicAcid', unit: 'mg' },
  b6: { id: 'HKQuantityTypeIdentifierDietaryVitaminB6', unit: 'mg' },
  b7: { id: 'HKQuantityTypeIdentifierDietaryBiotin', unit: 'mcg' },
  folate: { id: 'HKQuantityTypeIdentifierDietaryFolate', unit: 'mcg' },
  b12: { id: 'HKQuantityTypeIdentifierDietaryVitaminB12', unit: 'mcg' },
  calcium: { id: 'HKQuantityTypeIdentifierDietaryCalcium', unit: 'mg' },
  iron: { id: 'HKQuantityTypeIdentifierDietaryIron', unit: 'mg' },
  magnesium: { id: 'HKQuantityTypeIdentifierDietaryMagnesium', unit: 'mg' },
  phosphorus: { id: 'HKQuantityTypeIdentifierDietaryPhosphorus', unit: 'mg' },
  potassium: { id: 'HKQuantityTypeIdentifierDietaryPotassium', unit: 'mg' },
  zinc: { id: 'HKQuantityTypeIdentifierDietaryZinc', unit: 'mg' },
  copper: { id: 'HKQuantityTypeIdentifierDietaryCopper', unit: 'mg' },
  manganese: { id: 'HKQuantityTypeIdentifierDietaryManganese', unit: 'mg' },
  selenium: { id: 'HKQuantityTypeIdentifierDietarySelenium', unit: 'mcg' },
  iodine: { id: 'HKQuantityTypeIdentifierDietaryIodine', unit: 'mcg' },
  sodium: { id: 'HKQuantityTypeIdentifierDietarySodium', unit: 'mg' },
};

// ── Android Health Connect ─────────────────────────────────────────────────

export type HealthConnectMassUnit = 'grams' | 'milligrams' | 'micrograms';

/** NutritionRecord fields that hold a Mass. */
export type HealthConnectMassField = {
  [F in keyof NutritionRecord]-?: NonNullable<NutritionRecord[F]> extends { unit: string; value: number } ? F : never;
}[keyof NutritionRecord];

export type HealthConnectTarget =
  | { field: 'energy'; unit: 'kilocalories' }
  | { field: Exclude<HealthConnectMassField, 'energy' | 'energyFromFat'>; unit: HealthConnectMassUnit };

const HC_UNIT_TO_APP: Record<HealthConnectTarget['unit'], AppUnit> = {
  kilocalories: 'kcal',
  grams: 'g',
  milligrams: 'mg',
  micrograms: 'µg',
};

export const HEALTH_CONNECT_MAP: Partial<Record<NutrientKey, HealthConnectTarget>> = {
  kcal: { field: 'energy', unit: 'kilocalories' },
  protein: { field: 'protein', unit: 'grams' },
  carbs: { field: 'totalCarbohydrate', unit: 'grams' },
  fiber: { field: 'dietaryFiber', unit: 'grams' },
  sugar: { field: 'sugar', unit: 'grams' },
  fat: { field: 'totalFat', unit: 'grams' },
  satFat: { field: 'saturatedFat', unit: 'grams' },
  mufa: { field: 'monounsaturatedFat', unit: 'grams' },
  pufa: { field: 'polyunsaturatedFat', unit: 'grams' },
  vitA: { field: 'vitaminA', unit: 'micrograms' },
  vitC: { field: 'vitaminC', unit: 'milligrams' },
  vitD: { field: 'vitaminD', unit: 'micrograms' },
  vitE: { field: 'vitaminE', unit: 'milligrams' },
  vitK: { field: 'vitaminK', unit: 'micrograms' },
  b1: { field: 'thiamin', unit: 'milligrams' },
  b2: { field: 'riboflavin', unit: 'milligrams' },
  b3: { field: 'niacin', unit: 'milligrams' },
  b5: { field: 'pantothenicAcid', unit: 'milligrams' },
  b6: { field: 'vitaminB6', unit: 'milligrams' },
  b7: { field: 'biotin', unit: 'micrograms' },
  folate: { field: 'folate', unit: 'micrograms' },
  b12: { field: 'vitaminB12', unit: 'micrograms' },
  calcium: { field: 'calcium', unit: 'milligrams' },
  iron: { field: 'iron', unit: 'milligrams' },
  magnesium: { field: 'magnesium', unit: 'milligrams' },
  phosphorus: { field: 'phosphorus', unit: 'milligrams' },
  potassium: { field: 'potassium', unit: 'milligrams' },
  zinc: { field: 'zinc', unit: 'milligrams' },
  copper: { field: 'copper', unit: 'milligrams' },
  manganese: { field: 'manganese', unit: 'milligrams' },
  selenium: { field: 'selenium', unit: 'micrograms' },
  iodine: { field: 'iodine', unit: 'micrograms' },
  sodium: { field: 'sodium', unit: 'milligrams' },
};

/**
 * Nutrients Eighty tracks that neither platform has a type for (no HealthKit identifier and no
 * NutritionRecord field): choline and the individual omega fatty acids. Total MUFA/PUFA/sat fat are
 * written, so the fat breakdown is still there.
 */
export const UNMAPPED_NUTRIENTS: NutrientKey[] = ['choline', 'ala', 'epa', 'dha', 'la'];

/**
 * Convert an amount in the app's unit to the unit a platform target expects. `appUnit` is the
 * NUTRIENTS[key].unit of the nutrient being written.
 */
export function toHealthKitValue(value: number, appUnit: AppUnit, target: HealthKitTarget): number {
  return convertUnit(value, appUnit, HK_UNIT_TO_APP[target.unit]);
}

export function toHealthConnectValue(value: number, appUnit: AppUnit, target: HealthConnectTarget): number {
  return convertUnit(value, appUnit, HC_UNIT_TO_APP[target.unit]);
}

/** Every HealthKit identifier this app writes; used for authorization and for deleting a day. */
export const HEALTHKIT_WRITE_TYPES: QuantityTypeIdentifierWriteable[] = Object.values(HEALTHKIT_MAP).map((t) => t.id);

// ── Aggregation ────────────────────────────────────────────────────────────

/** A log entry already resolved to nutrients (`scaled(food, grams)`), so this file needs no catalog. */
export interface HealthItem {
  id: string;
  /** undefined for "extras" logged outside a plan meal */
  slot?: MealSlot | null;
  nutrients: NutrientVector;
}

export type HealthSlot = MealSlot | 'extra';

export interface DaySample {
  /** stable id for the meal group, `eighty:<date>:<slot>`; used as the Health Connect clientRecordId */
  id: string;
  date: string;
  slot: HealthSlot;
  start: Date;
  end: Date;
  itemIds: string[];
  /** summed amounts in the app's unit; only nutrients with data and a positive total are present */
  values: Partial<Record<NutrientKey, number>>;
}

export const SLOT_ORDER: HealthSlot[] = ['breakfast', 'lunch', 'snack', 'dinner', 'extra'];

export const SLOT_LABEL: Record<HealthSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
  extra: 'Extras',
};

/** Local wall-clock start of the window used for each slot, as [hour, minute]. */
const SLOT_START: Record<HealthSlot, [number, number]> = {
  breakfast: [8, 0],
  lunch: [12, 30],
  snack: [15, 30],
  dinner: [19, 0],
  extra: [10, 0],
};
const WINDOW_MIN = 15;

export const sampleId = (date: string, slot: HealthSlot) => `eighty:${date}:${slot}`;

const parseDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m: m - 1, d };
};

/** Local midnight at the start of `date` and local midnight at the start of the next day. */
export function dayBounds(date: string): { start: Date; end: Date } {
  const { y, m, d } = parseDate(date);
  return { start: new Date(y, m, d), end: new Date(y, m, d + 1) };
}

/** Round to 3 decimals: far below any food-label precision, and keeps float noise out of Health. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The time window for a meal slot on `date`. Windows are fixed per slot (the log does not record
 * when a meal was eaten, only when it was logged), start on the slot's usual time and last 15
 * minutes. Health Connect needs end > start and apps dislike future-dated food, so on the current
 * day a window that would end after `now` is pulled back to finish at `now`, but never before the
 * start of the day.
 */
export function slotWindow(date: string, slot: HealthSlot, now: Date = new Date()): { start: Date; end: Date } {
  const { y, m, d } = parseDate(date);
  const [h, min] = SLOT_START[slot];
  const dayStart = new Date(y, m, d);
  let start = new Date(y, m, d, h, min);
  let end = new Date(start.getTime() + WINDOW_MIN * 60_000);
  if (end > now) {
    const pulledEnd = new Date(Math.max(now.getTime(), dayStart.getTime() + 60_000));
    end = pulledEnd;
    start = new Date(Math.max(dayStart.getTime(), pulledEnd.getTime() - WINDOW_MIN * 60_000));
  }
  return { start, end };
}

/**
 * Group a day's log items by meal slot and sum their nutrients into one sample per slot.
 *
 * - A nutrient that is null/undefined for every item in a group stays absent ("no data" is never
 *   written as 0). Totals that round to 0 are dropped too.
 * - Groups with no writable nutrient at all are omitted.
 * - Output order follows SLOT_ORDER so repeated syncs are deterministic.
 */
export function buildDaySamples(date: string, items: HealthItem[], now: Date = new Date()): DaySample[] {
  const groups = new Map<HealthSlot, HealthItem[]>();
  for (const item of items) {
    const slot: HealthSlot = item.slot ?? 'extra';
    const list = groups.get(slot);
    if (list) list.push(item);
    else groups.set(slot, [item]);
  }

  const out: DaySample[] = [];
  for (const slot of SLOT_ORDER) {
    const group = groups.get(slot);
    if (!group) continue;
    const totals: Partial<Record<NutrientKey, number>> = {};
    for (const item of group) {
      for (const k in item.nutrients) {
        const key = k as NutrientKey;
        const v = item.nutrients[key];
        if (v == null || !Number.isFinite(v)) continue;
        totals[key] = (totals[key] ?? 0) + v;
      }
    }
    const values: Partial<Record<NutrientKey, number>> = {};
    for (const k in totals) {
      const key = k as NutrientKey;
      if (!(key in HEALTHKIT_MAP) && !(key in HEALTH_CONNECT_MAP)) continue;
      const v = round3(totals[key] as number);
      if (v > 0) values[key] = v;
    }
    if (Object.keys(values).length === 0) continue;
    const { start, end } = slotWindow(date, slot, now);
    out.push({ id: sampleId(date, slot), date, slot, start, end, itemIds: group.map((i) => i.id), values });
  }
  return out;
}

// ── Platform payloads ──────────────────────────────────────────────────────

export interface HealthKitQuantity {
  id: QuantityTypeIdentifierWriteable;
  unit: HealthKitUnit;
  value: number;
}

/** The HealthKit quantity samples to save for one meal group. */
export function healthKitQuantities(sample: DaySample): HealthKitQuantity[] {
  const out: HealthKitQuantity[] = [];
  for (const k in sample.values) {
    const key = k as NutrientKey;
    const target = HEALTHKIT_MAP[key];
    const value = sample.values[key];
    if (!target || value == null) continue;
    const converted = toHealthKitValue(value, NUTRIENTS[key].unit, target);
    if (converted > 0) out.push({ id: target.id, unit: target.unit, value: converted });
  }
  return out;
}

export type HealthConnectNutrition = Partial<
  Record<HealthConnectTarget['field'], { value: number; unit: HealthConnectTarget['unit'] }>
>;

/** The NutritionRecord measurement fields (energy and every Mass) for one meal group. */
export function healthConnectFields(sample: DaySample): HealthConnectNutrition {
  const out: HealthConnectNutrition = {};
  for (const k in sample.values) {
    const key = k as NutrientKey;
    const target = HEALTH_CONNECT_MAP[key];
    const value = sample.values[key];
    if (!target || value == null) continue;
    const converted = toHealthConnectValue(value, NUTRIENTS[key].unit, target);
    if (converted > 0) out[target.field] = { value: converted, unit: target.unit };
  }
  return out;
}

// ── Facade contract ────────────────────────────────────────────────────────

export interface SyncResult {
  /** meal groups (samples / records) written for the day */
  samples: number;
  /** nutrient values that could not be written (for example one the user switched off in Health) */
  skipped: number;
}

/** Fallback shown when nothing else is known about why a sync failed. */
export const SYNC_FAILED = 'Couldn’t write to the health app.';

export function errorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return SYNC_FAILED;
}
