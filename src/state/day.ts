import { useMemo } from 'react';

import {
  addInto,
  boardProgress,
  calorieTarget,
  dayScore,
  ingredientsTotal,
  logsGlycemicLoad,
  logsTotal,
  macroTargets,
  pillars,
} from '@/engine/calc';
import type { Ingredient, Meal, MealPlan, MealSlot, NutrientVector, PlanDay } from '@/engine/types';

import { BUNDLED_PLANS, FOOD_INDEX, isFattyFish } from './catalog';
import { addDays, daysBetween, useStore, type Log } from './store';

export function useAllPlans(): MealPlan[] {
  const local = useStore((s) => s.localPlans);
  const remote = useStore((s) => s.remotePlans);
  return useMemo(() => {
    // newest version per id wins; remote > local > bundled on ties
    const byId = new Map<string, MealPlan>();
    for (const p of [...BUNDLED_PLANS, ...local, ...remote]) {
      const cur = byId.get(p.id);
      if (!cur || p.version >= cur.version) byId.set(p.id, p);
    }
    return [...byId.values()];
  }, [local, remote]);
}

export function usePlan(id?: string, version?: number): MealPlan | undefined {
  const local = useStore((s) => s.localPlans);
  const remote = useStore((s) => s.remotePlans);
  const all = useAllPlans();
  return useMemo(() => {
    if (!id) return undefined;
    // an enrollment pins its version, so users aren't disrupted by a new upload
    const pinned = [...remote, ...local, ...BUNDLED_PLANS].find((p) => p.id === id && p.version === version);
    return pinned ?? all.find((p) => p.id === id);
  }, [id, version, all, local, remote]);
}

export function planDayFor(plan: MealPlan, startedOn: string, date: string): PlanDay | undefined {
  if (!plan.days.length) return undefined;
  const n = daysBetween(startedOn, date);
  if (n < 0) return undefined;
  const sorted = [...plan.days].sort((a, b) => a.day - b.day);
  return sorted[n % sorted.length];
}

export interface DayMeal {
  meal: Meal; // for added meals, meal.id is the entry's uid
  ingredients: Ingredient[]; // effective (with the user's edits)
  edited: boolean;
  eaten: boolean;
  totals: NutrientVector;
  /** where it came from: the user's plan, or added from the meal library */
  source: 'plan' | 'added';
  /** library key, for opening the meal in the library */
  key?: string;
  /** the plan meal this added meal replaced */
  replaces?: string;
}

const SLOT_ORDER: Record<MealSlot, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };

export function useDay(date: string) {
  const profile = useStore((s) => s.profile);
  const enrollment = useStore((s) => s.enrollment);
  const allLogs = useStore((s) => s.logs);
  const dayEdits = useStore((s) => s.dayEdits);
  const planEdits = useStore((s) => s.planEdits);
  const dayAdds = useStore((s) => s.dayAdds);
  const daySkips = useStore((s) => s.daySkips);
  const plan = usePlan(enrollment?.planId, enrollment?.version);

  return useMemo(() => {
    const logs = allLogs.filter((l) => l.date === date);
    const planDay = plan && enrollment ? planDayFor(plan, enrollment.startedOn, date) : undefined;

    const skips = new Set(daySkips[date] ?? []);
    const fromPlan: DayMeal[] = (planDay?.meals ?? [])
      .filter((meal) => !skips.has(meal.id))
      .map((meal) => {
        const edit = dayEdits[`${date}|${meal.id}`] ?? (plan ? planEdits[`${plan.id}|${meal.id}`] : undefined);
        const ingredients = edit ?? meal.ingredients;
        const eatenLogs = logs.filter((l) => l.mealId === meal.id);
        const eaten = eatenLogs.length > 0;
        return {
          meal,
          ingredients,
          edited: !!edit,
          eaten,
          source: 'plan' as const,
          key: plan ? `${plan.id}~${meal.id}` : undefined,
          totals: eaten ? logsTotal(eatenLogs, FOOD_INDEX) : ingredientsTotal(ingredients, FOOD_INDEX),
        };
      });
    const fromLibrary: DayMeal[] = (dayAdds[date] ?? []).map((a) => {
      const meal: Meal = { id: a.uid, slot: a.slot, name: a.name, prepMinutes: a.prepMinutes, instructions: a.instructions, ingredients: a.ingredients };
      const eatenLogs = logs.filter((l) => l.mealId === a.uid);
      const eaten = eatenLogs.length > 0;
      return {
        meal,
        ingredients: a.ingredients,
        edited: false,
        eaten,
        source: 'added' as const,
        key: a.key,
        replaces: a.replaces,
        totals: eaten ? logsTotal(eatenLogs, FOOD_INDEX) : ingredientsTotal(a.ingredients, FOOD_INDEX),
      };
    });
    // stable order: by slot, plan meals before added ones within a slot
    const meals = [...fromPlan, ...fromLibrary].sort((a, b) => SLOT_ORDER[a.meal.slot] - SLOT_ORDER[b.meal.slot]);
    const skipped = (planDay?.meals ?? []).filter((m) => skips.has(m.id) && !fromLibrary.some((a) => a.replaces === m.id));

    const eaten = logsTotal(logs, FOOD_INDEX);
    const remaining = meals.filter((m) => !m.eaten);
    const projected = { ...eaten };
    for (const m of remaining) addInto(projected, ingredientsTotal(m.ingredients, FOOD_INDEX));

    const kcalTarget = plan ? Math.round((plan.band.min + plan.band.max) / 2) : calorieTarget(profile);
    const macros = macroTargets(profile, kcalTarget);
    const progress = boardProgress(eaten, profile);
    const projectedProgress = boardProgress(projected, profile);
    const gl = logsGlycemicLoad(logs, FOOD_INDEX);
    const extras = logs.filter((l) => !l.mealId);

    return {
      date,
      plan,
      planDay,
      meals,
      skipped,
      logs,
      extras,
      eaten,
      projected,
      macros,
      progress,
      projectedProgress,
      score: dayScore(progress),
      projectedScore: dayScore(projectedProgress),
      pillars: pillars(eaten, gl, profile, macros),
      profile,
    };
  }, [allLogs, date, plan, enrollment, dayEdits, planEdits, dayAdds, daySkips, profile]);
}

export type DayData = ReturnType<typeof useDay>;

/** Score history for the consistency calendar and streaks. */
export function useHistory(days = 35, end: string) {
  const profile = useStore((s) => s.profile);
  const logs = useStore((s) => s.logs);
  return useMemo(() => {
    const byDate = new Map<string, Log[]>();
    for (const l of logs) byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);
    const out: { date: string; ratio: number; logged: boolean; eightyDay: boolean; fish: boolean }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = addDays(end, -i);
      const l = byDate.get(date) ?? [];
      const s = dayScore(boardProgress(logsTotal(l, FOOD_INDEX), profile));
      out.push({ date, ratio: s.ratio, logged: l.length > 0, eightyDay: s.eightyDay, fish: l.some((x) => isFattyFish(x.foodId)) });
    }
    let streak = 0;
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].eightyDay) streak++;
      else if (i === out.length - 1) continue; // today isn't over yet
      else break;
    }
    const last7 = out.slice(-7);
    return {
      days: out,
      streak,
      fishThisWeek: last7.filter((d) => d.fish).length,
      eightyDaysThisWeek: last7.filter((d) => d.eightyDay).length,
    };
  }, [logs, profile, days, end]);
}
