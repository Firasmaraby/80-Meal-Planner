/**
 * How the person feels and what they take besides food: weekly check-ins, supplements,
 * and the "ate out" estimates that sit beside the food catalog.
 * Kept apart from the main store so it can't disturb the log, and persisted the same way.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { addInto } from '@/engine/calc';
import { BOARD_KEYS, NUTRIENTS } from '@/engine/nutrients';
import type { Food, NutrientVector } from '@/engine/types';
import eatingOutJson from '@/data/eatingOut.json';
import supplementsJson from '@/data/supplements.json';

import { FOOD_INDEX } from './catalog';

// ── Check-ins ──────────────────────────────────────────────────────────────

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface Checkin {
  date: string; // YYYY-MM-DD local; one per day, the latest wins
  energy: Rating;
  sleep: Rating;
  mood: Rating;
  digestion: Rating;
  weightKg?: number;
}

// ── Supplements ────────────────────────────────────────────────────────────

export interface Supplement {
  id: string;
  name: string;
  /** "1,000 IU (25 µg)" */
  dose: string;
  /** what one dose adds, in the same units as a food's nutrients */
  n: NutrientVector;
  note?: string;
}

export const SUPPLEMENTS = supplementsJson as unknown as Supplement[];
export const SUPPLEMENT_INDEX = new Map(SUPPLEMENTS.map((s) => [s.id, s]));

/** The nutrients of one dose of each supplement, summed. Unknown ids are ignored; each counts once. */
export function supplementTotal(ids: readonly string[] | undefined): NutrientVector {
  const acc: NutrientVector = {};
  for (const id of new Set(ids ?? [])) {
    const s = SUPPLEMENT_INDEX.get(id);
    if (s) addInto(acc, s.n);
  }
  return acc;
}

/**
 * Fold supplement nutrients into a day's totals, in place.
 * A supplement alone must not read as a whole day: nutrients with no data are normally left
 * out of the score, so a lone vitamin D tablet would be "2 of 2 tiles at 80%". With any
 * supplement in play, every measured tile is scored instead, and sits at 0 until food fills it.
 */
export function foldInSupplements(totals: NutrientVector, supp: NutrientVector): NutrientVector {
  if (!Object.keys(supp).length) return totals;
  addInto(totals, supp);
  for (const k of BOARD_KEYS) if (!NUTRIENTS[k].sparse && totals[k] == null) totals[k] = 0;
  return totals;
}

// ── "I ate out" estimates ──────────────────────────────────────────────────

export interface EatingOutMeal {
  /** the Food id it logs as */
  foodId: string;
  name: string;
  portion: string;
  grams: number;
  /** per portion */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  satFat: number;
  fiber: number;
  sodium: number;
}

interface EatingOutRow extends Omit<EatingOutMeal, 'foodId'> {
  id: string;
}

export const EATING_OUT_CITATION: string = eatingOutJson.citation;

const ESTIMATE_SRC = { db: 'Eighty estimate', ref: 'typical portion' };

/** Per-100 g Food objects for the estimates. Micros are null: unknown is not zero. */
function estimateFood(m: EatingOutRow): Food {
  const per100 = (v: number) => Math.round((v / m.grams) * 1000) / 10;
  const n: NutrientVector = {
    kcal: per100(m.kcal),
    protein: per100(m.protein),
    carbs: per100(m.carbs),
    fat: per100(m.fat),
    satFat: per100(m.satFat),
    fiber: per100(m.fiber),
    sodium: per100(m.sodium),
  };
  return {
    id: `est-${m.id}`,
    name: m.name,
    category: 'prepared',
    tags: ['processed'],
    servings: [{ label: m.portion, g: m.grams }],
    n,
    src: [ESTIMATE_SRC],
    rare: true,
    rank: 0,
  };
}

const ROWS = eatingOutJson.meals as EatingOutRow[];

export const EATING_OUT: EatingOutMeal[] = ROWS.map((m) => ({ ...m, foodId: `est-${m.id}` }));
export const ESTIMATE_FOODS: Food[] = ROWS.map(estimateFood);

/**
 * Estimates resolve by id (so a logged "pho" still shows its numbers after a restart) but
 * live outside FOODS: they never appear in search, the gap closer or the nutrient sheets.
 * This module is imported by state/day.ts, so the index is filled before any day is computed.
 */
for (const f of ESTIMATE_FOODS) FOOD_INDEX.set(f.id, f);

const ESTIMATE_IDS = new Set(ESTIMATE_FOODS.map((f) => f.id));
export const isEstimate = (foodId: string) => ESTIMATE_IDS.has(foodId);

// ── Store ──────────────────────────────────────────────────────────────────

export type WeightUnit = 'kg' | 'lb';

interface State {
  checkins: Checkin[];
  /** which supplements the person takes ("my supplements") */
  supplements: { id: string; active: boolean }[];
  /** supplement ids taken per day: key = date */
  takenOn: Record<string, string[]>;
  weightUnit: WeightUnit;
  /** the check-in prompt is hidden for the rest of this date */
  promptSnoozedOn?: string;

  addCheckin: (c: Checkin) => void;
  setSupplementActive: (id: string, active: boolean) => void;
  setTaken: (date: string, id: string, taken: boolean) => void;
  setWeightUnit: (u: WeightUnit) => void;
  snoozeCheckinPrompt: (date: string) => void;
  resetWellness: () => void;
}

const initial = {
  checkins: [] as Checkin[],
  supplements: [] as { id: string; active: boolean }[],
  takenOn: {} as Record<string, string[]>,
  weightUnit: 'kg' as WeightUnit,
  promptSnoozedOn: undefined as string | undefined,
};

/**
 * Storage can be unavailable (private browsing, sandboxed web previews).
 * Never let that stop the app from starting: fall back to in-memory for the session.
 */
const memory = new Map<string, string>();
const safeStorage = {
  getItem: async (k: string) => {
    try {
      return await AsyncStorage.getItem(k);
    } catch {
      return memory.get(k) ?? null;
    }
  },
  setItem: async (k: string, v: string) => {
    memory.set(k, v);
    try {
      await AsyncStorage.setItem(k, v);
    } catch {
      /* in-memory only */
    }
  },
  removeItem: async (k: string) => {
    memory.delete(k);
    try {
      await AsyncStorage.removeItem(k);
    } catch {
      /* in-memory only */
    }
  },
};

export const useWellness = create<State>()(
  persist(
    (set) => ({
      ...initial,

      addCheckin: (c) =>
        set((s) => ({
          checkins: [...s.checkins.filter((x) => x.date !== c.date), c].sort((a, b) => a.date.localeCompare(b.date)),
        })),

      setSupplementActive: (id, active) =>
        set((s) => ({
          supplements: s.supplements.some((x) => x.id === id)
            ? s.supplements.map((x) => (x.id === id ? { ...x, active } : x))
            : [...s.supplements, { id, active }],
        })),

      setTaken: (date, id, taken) =>
        set((s) => {
          const cur = s.takenOn[date] ?? [];
          const next = taken ? [...new Set([...cur, id])] : cur.filter((x) => x !== id);
          return { takenOn: { ...s.takenOn, [date]: next } };
        }),

      setWeightUnit: (weightUnit) => set({ weightUnit }),
      snoozeCheckinPrompt: (date) => set({ promptSnoozedOn: date }),
      resetWellness: () => set({ ...initial }),
    }),
    {
      name: 'eighty-wellness-v1',
      storage: createJSONStorage(() => safeStorage),
      version: 1,
    },
  ),
);

/** The supplement ids that count toward a day's board: taken that day. */
export const takenIds = (takenOn: Record<string, string[]>, date: string) => takenOn[date] ?? [];

/** Active supplements not yet taken on a day: what "projected" assumes will still be taken. */
export const plannedIds = (supplements: { id: string; active: boolean }[], taken: readonly string[]) =>
  supplements.filter((s) => s.active && !taken.includes(s.id)).map((s) => s.id);
