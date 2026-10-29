import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { KitchenDay, ReminderSettings } from '@/lib/kitchen';

import { useDay, type DayData } from './day';
import { addDays } from './store';

export type { ReminderSettings };

export const DEFAULT_REMINDERS: ReminderSettings = {
  meals: false,
  mealTimes: { breakfast: '08:00', lunch: '12:30', snack: '15:30', dinner: '18:30' },
  prepEvening: false,
  prepTime: '19:00',
  eveningCheck: false,
  eveningTime: '20:30',
};

interface KitchenState {
  /** how many people you cook for (1–8); grocery and prep amounts are multiplied by it */
  householdSize: number;
  /** food ids marked "already have" */
  pantry: string[];
  /** 0 = Sunday … 6 = Saturday */
  prepDay: number;
  reminders: ReminderSettings;

  setHouseholdSize: (n: number) => void;
  togglePantry: (foodId: string) => void;
  setPrepDay: (d: number) => void;
  setReminders: (r: Partial<ReminderSettings>) => void;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

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

export const useKitchen = create<KitchenState>()(
  persist(
    (set) => ({
      householdSize: 1,
      pantry: [],
      prepDay: 0,
      reminders: DEFAULT_REMINDERS,

      setHouseholdSize: (n) => set({ householdSize: clamp(n, 1, 8) }),
      togglePantry: (foodId) =>
        set((s) => ({ pantry: s.pantry.includes(foodId) ? s.pantry.filter((p) => p !== foodId) : [...s.pantry, foodId] })),
      setPrepDay: (d) => set({ prepDay: clamp(d, 0, 6) }),
      setReminders: (r) => set((s) => ({ reminders: { ...s.reminders, ...r, mealTimes: { ...s.reminders.mealTimes, ...r.mealTimes } } })),
    }),
    {
      name: 'eighty-kitchen-v1',
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      // keep new reminder fields (and nested meal times) when an older save is loaded
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<KitchenState>;
        return {
          ...current,
          ...p,
          householdSize: clamp(p.householdSize ?? current.householdSize, 1, 8),
          pantry: Array.isArray(p.pantry) ? p.pantry : current.pantry,
          reminders: { ...DEFAULT_REMINDERS, ...p.reminders, mealTimes: { ...DEFAULT_REMINDERS.mealTimes, ...p.reminders?.mealTimes } },
        };
      },
    },
  ),
);

// ── The next 7 days, as the kitchen sees them ──────────────────────────────

const toKitchenDay = (d: DayData): KitchenDay => ({
  date: d.date,
  meals: d.meals.map((m) => ({
    id: m.meal.id,
    slot: m.meal.slot,
    name: m.meal.name,
    prepMinutes: m.meal.prepMinutes,
    ingredients: m.ingredients,
    eaten: m.eaten,
  })),
});

/**
 * Seven days starting at `from`, from useDay: personalised portions, library meals added to a day,
 * skipped meals left out. (A fixed number of hook calls, so the rules of hooks hold.)
 */
export function useWeek(from: string): KitchenDay[] {
  const d0 = useDay(addDays(from, 0));
  const d1 = useDay(addDays(from, 1));
  const d2 = useDay(addDays(from, 2));
  const d3 = useDay(addDays(from, 3));
  const d4 = useDay(addDays(from, 4));
  const d5 = useDay(addDays(from, 5));
  const d6 = useDay(addDays(from, 6));
  return useMemo(() => [d0, d1, d2, d3, d4, d5, d6].map(toKitchenDay), [d0, d1, d2, d3, d4, d5, d6]);
}
