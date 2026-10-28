import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Ingredient, LogItem, Meal, MealPlan, MealSlot, NutrientKey, Profile } from '@/engine/types';

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
  focus: ['vitC', 'iron', 'vitK'],
  lockedIn: [],
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
  favorites: string[];
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
  setFocus: (keys: NutrientKey[]) => void;
  lockInFocus: (next: NutrientKey[]) => void;
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
  favorites: [] as string[],
  recents: [] as string[],
  includeRare: false,
  localPlans: [] as MealPlan[],
  remotePlans: [] as MealPlan[],
};

export const useStore = create<State>()(
  persist(
    (set) => ({
      ...initial,

      setProfile: (p) => set((s) => ({ profile: { ...s.profile, ...p } })),
      finishOnboarding: () =>
        set((s) => ({ onboarded: true, profile: { ...s.profile, focusStartedAt: s.profile.focusStartedAt ?? today() } })),

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

      setFocus: (keys) => set((s) => ({ profile: { ...s.profile, focus: keys.slice(0, 3) } })),
      lockInFocus: (next) =>
        set((s) => ({
          profile: {
            ...s.profile,
            lockedIn: [...new Set([...s.profile.lockedIn, ...s.profile.focus])],
            focus: next.slice(0, 3),
            focusStartedAt: today(),
          },
        })),

      setIncludeRare: (v) => set({ includeRare: v }),
      addLocalPlans: (plans) =>
        set((s) => ({ localPlans: [...s.localPlans.filter((p) => !plans.some((n) => n.id === p.id)), ...plans] })),
      setRemotePlans: (plans) => set({ remotePlans: plans }),
      resetAll: () => set({ ...initial }),
    }),
    {
      name: 'eighty-v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);

function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _, ...rest } = rec;
  return rest;
}
