import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Ingredient, LogItem, Meal, MealPlan, MealSlot, Profile } from '@/engine/types';

export const today = (d = new Date()) => {
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

export const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return today(new Date(y, m - 1, d + n));
};

export const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export type Log = LogItem & { updatedAt: string };

/** A meal the user put on a specific day, from the meal library. */
export interface AddedMeal {
  uid: string; // unique per day entry; used as the meal id for logging
  key: string; // library key `${planId}~${mealId}`
  slot: MealSlot;
  name: string;
  prepMinutes?: number;
  instructions?: string;
  ingredients: Ingredient[];
  /** the plan meal this one stands in for, if it was a replacement */
  replaces?: string;
}

export interface Enrollment {
  planId: string;
  version: number;
  startedOn: string;
}

export const DEFAULT_PROFILE: Profile = {
  sex: 'male',
  age: 35,
  heightCm: 178,
  weightKg: 80,
  activity: 'moderate',
  goal: 'maintain',
  lifeStage: 'none',
  proteinPerKg: 1.6,
  satFatPct: 10,
  sizeToMe: true,
  dislikes: [],
  diet: [],
};

interface State {
  onboarded: boolean;
  profile: Profile;
  enrollment?: Enrollment;
  logs: Log[];
  /** per-day ingredient edits for a plan meal: key `${date}|${mealId}` */
  dayEdits: Record<string, Ingredient[]>;
  /** "every time" edits for a plan meal: key `${planId}|${mealId}` */
  planEdits: Record<string, Ingredient[]>;
  /** meals added to a day from the library: key = date */
  dayAdds: Record<string, AddedMeal[]>;
  /** plan meal ids the user removed from a day: key = date */
  daySkips: Record<string, string[]>;
  favorites: string[];
  favoriteMeals: string[];
  recents: string[];
  includeRare: boolean;
  /** plans uploaded through the admin page while running without a backend */
  localPlans: MealPlan[];
  remotePlans: MealPlan[];

  setProfile: (p: Partial<Profile>) => void;
  finishOnboarding: () => void;
  enroll: (plan: MealPlan, startedOn?: string) => void;
  leavePlan: () => void;
  logMeal: (date: string, meal: Meal, ingredients: Ingredient[], planId?: string) => void;
  unlogMeal: (date: string, mealId: string) => void;
  addFood: (date: string, foodId: string, grams: number, slot?: MealSlot) => void;
  updateLog: (id: string, grams: number) => void;
  removeLog: (id: string) => void;
  editMeal: (date: string, planId: string, mealId: string, ings: Ingredient[], always: boolean) => void;
  resetMeal: (date: string, planId: string, mealId: string) => void;
  toggleFavorite: (foodId: string) => void;
  addMealToDay: (date: string, key: string, meal: Meal, opts?: { slot?: MealSlot; replaces?: string }) => string;
  removeMealFromDay: (date: string, mealId: string) => void;
  restorePlanMeal: (date: string, planMealId: string) => void;
  updateAddedMeal: (date: string, uid: string, ings: Ingredient[]) => void;
  toggleFavoriteMeal: (key: string) => void;
  setIncludeRare: (v: boolean) => void;
  addLocalPlans: (plans: MealPlan[]) => void;
  setRemotePlans: (plans: MealPlan[]) => void;
  resetAll: () => void;
}

const stamp = () => new Date().toISOString();

const initial = {
  onboarded: false,
  profile: DEFAULT_PROFILE,
  enrollment: undefined,
  logs: [] as Log[],
  dayEdits: {},
  planEdits: {},
  dayAdds: {} as Record<string, AddedMeal[]>,
  daySkips: {} as Record<string, string[]>,
  favorites: [] as string[],
  favoriteMeals: [] as string[],
  recents: [] as string[],
  includeRare: false,
  localPlans: [] as MealPlan[],
  remotePlans: [] as MealPlan[],
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

export const useStore = create<State>()(
  persist(
    (set) => ({
      ...initial,

      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      finishOnboarding: () => set({ onboarded: true }),

      enroll: (plan, startedOn = today()) => set({ enrollment: { planId: plan.id, version: plan.version, startedOn } }),
      leavePlan: () => set({ enrollment: undefined }),

      logMeal: (date, meal, ingredients, planId) =>
        set((s) => ({
          logs: [
            ...s.logs.filter((l) => !(l.date === date && l.mealId === meal.id)),
            ...ingredients.map((i) => ({
              id: uid(),
              date,
              at: stamp(),
              updatedAt: stamp(),
              foodId: i.foodId,
              grams: i.grams,
              planId,
              mealId: meal.id,
              slot: meal.slot,
            })),
          ],
        })),
      unlogMeal: (date, mealId) => set((s) => ({ logs: s.logs.filter((l) => !(l.date === date && l.mealId === mealId)) })),

      addFood: (date, foodId, grams, slot) =>
        set((s) => ({
          logs: [...s.logs, { id: uid(), date, at: stamp(), updatedAt: stamp(), foodId, grams, slot }],
          recents: [foodId, ...s.recents.filter((r) => r !== foodId)].slice(0, 20),
        })),
      updateLog: (id, grams) =>
        set((s) => ({ logs: s.logs.map((l) => (l.id === id ? { ...l, grams, updatedAt: stamp() } : l)) })),
      removeLog: (id) => set((s) => ({ logs: s.logs.filter((l) => l.id !== id) })),

      editMeal: (date, planId, mealId, ings, always) =>
        set((s) =>
          always
            ? {
                planEdits: { ...s.planEdits, [`${planId}|${mealId}`]: ings },
                dayEdits: omit(s.dayEdits, `${date}|${mealId}`),
              }
            : { dayEdits: { ...s.dayEdits, [`${date}|${mealId}`]: ings } },
        ),
      resetMeal: (date, planId, mealId) =>
        set((s) => ({
          dayEdits: omit(s.dayEdits, `${date}|${mealId}`),
          planEdits: omit(s.planEdits, `${planId}|${mealId}`),
        })),

      toggleFavorite: (id) =>
        set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [id, ...s.favorites] })),

      addMealToDay: (date, key, meal, opts = {}) => {
        const entry: AddedMeal = {
          uid: `add-${uid()}`,
          key,
          slot: opts.slot ?? meal.slot,
          name: meal.name,
          prepMinutes: meal.prepMinutes,
          instructions: meal.instructions,
          ingredients: meal.ingredients.map((i) => ({ ...i })),
          replaces: opts.replaces,
        };
        set((s) => ({
          dayAdds: { ...s.dayAdds, [date]: [...(s.dayAdds[date] ?? []), entry] },
          daySkips: opts.replaces
            ? { ...s.daySkips, [date]: [...new Set([...(s.daySkips[date] ?? []), opts.replaces])] }
            : s.daySkips,
          // a replaced meal that was already logged is no longer what was eaten
          logs: opts.replaces ? s.logs.filter((l) => !(l.date === date && l.mealId === opts.replaces)) : s.logs,
        }));
        return entry.uid;
      },
      removeMealFromDay: (date, mealId) =>
        set((s) => {
          const adds = s.dayAdds[date] ?? [];
          const added = adds.find((a) => a.uid === mealId);
          const logs = s.logs.filter((l) => !(l.date === date && l.mealId === mealId));
          if (added) return { logs, dayAdds: { ...s.dayAdds, [date]: adds.filter((a) => a.uid !== mealId) } };
          return { logs, daySkips: { ...s.daySkips, [date]: [...new Set([...(s.daySkips[date] ?? []), mealId])] } };
        }),
      restorePlanMeal: (date, planMealId) =>
        set((s) => ({
          daySkips: { ...s.daySkips, [date]: (s.daySkips[date] ?? []).filter((id) => id !== planMealId) },
          // drop any library meal that was standing in for it
          dayAdds: { ...s.dayAdds, [date]: (s.dayAdds[date] ?? []).filter((a) => a.replaces !== planMealId) },
          logs: s.logs.filter(
            (l) => !(l.date === date && (s.dayAdds[date] ?? []).some((a) => a.replaces === planMealId && a.uid === l.mealId)),
          ),
        })),
      updateAddedMeal: (date, mealUid, ings) =>
        set((s) => ({
          dayAdds: { ...s.dayAdds, [date]: (s.dayAdds[date] ?? []).map((a) => (a.uid === mealUid ? { ...a, ingredients: ings } : a)) },
        })),
      toggleFavoriteMeal: (key) =>
        set((s) => ({
          favoriteMeals: s.favoriteMeals.includes(key) ? s.favoriteMeals.filter((k) => k !== key) : [key, ...s.favoriteMeals],
        })),

      setIncludeRare: (v) => set({ includeRare: v }),
      addLocalPlans: (plans) =>
        set((s) => ({ localPlans: [...s.localPlans.filter((p) => !plans.some((n) => n.id === p.id)), ...plans] })),
      setRemotePlans: (plans) => set({ remotePlans: plans }),
      resetAll: () => set({ ...initial }),
    }),
    {
      name: 'eighty-v1',
      storage: createJSONStorage(() => safeStorage),
      version: 3,
      // v2: Focus 3 removed; meals can be added to / removed from a day
      migrate: (persisted, version) => {
        const st = (persisted ?? {}) as Record<string, unknown> & { profile?: Record<string, unknown> };
        if (version < 2 && st.profile) {
          const { focus: _f, focusStartedAt: _s, lockedIn: _l, ...profile } = st.profile;
          st.profile = profile;
        }
        // v3: plan sizing + dislikes
        if (version < 3) st.profile = { ...DEFAULT_PROFILE, ...(st.profile ?? {}) };
        return st as unknown as State;
      },
    },
  ),
);

function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _, ...rest } = rec;
  return rest;
}
