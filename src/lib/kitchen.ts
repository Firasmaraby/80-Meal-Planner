/**
 * Kitchen helpers: the grocery list, batch-cook prep, cook-mode steps and timers,
 * and the reminder schedule. All pure (no React, no storage), so they are easy to test.
 * Amounts are always grams; the household measure ("≈ 3 medium") comes from Food.servings[0].
 */
import { roundGrams } from '@/engine/calc';
import type { Food, FoodCategory, Ingredient, MealPlan, MealSlot } from '@/engine/types';

export type FoodLookup = { get(id: string): Food | undefined };

/** One meal on one day, as the kitchen sees it (already personalised by useDay). */
export interface KitchenMeal {
  id: string;
  slot: MealSlot;
  name: string;
  prepMinutes?: number;
  ingredients: Ingredient[];
  eaten?: boolean;
}

export interface KitchenDay {
  date: string; // YYYY-MM-DD
  meals: KitchenMeal[];
}

// ── Dates (local, no timezone surprises) ───────────────────────────────────

const z2 = (n: number) => String(n).padStart(2, '0');
const parseDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fmtDate = (d: Date) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
export const shiftDate = (date: string, n: number) => {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
};

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const weekdayOf = (date: string) => parseDate(date).getDay();

/** "Today", "Tomorrow", otherwise "Wed 4". */
export function dayLabel(date: string, todayDate: string): string {
  if (date === todayDate) return 'Today';
  if (date === shiftDate(todayDate, 1)) return 'Tomorrow';
  const d = parseDate(date);
  return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()}`;
}

/** Days from `fromDate` until the next time `weekday` (0 = Sunday) comes round; 0 when it is that day. */
export function daysUntilWeekday(fromDate: string, weekday: number): number {
  return (weekday - weekdayOf(fromDate) + 7) % 7;
}

/** The first 7 days of a plan as a cycle (Day 1..7), for previewing a plan you are not following. */
export function planPreviewDays(plan: MealPlan, from: string, count = 7): KitchenDay[] {
  const sorted = [...plan.days].sort((a, b) => a.day - b.day);
  if (!sorted.length) return [];
  return Array.from({ length: count }, (_, i) => ({
    date: shiftDate(from, i),
    meals: sorted[i % sorted.length].meals.map((m) => ({
      id: m.id,
      slot: m.slot,
      name: m.name,
      prepMinutes: m.prepMinutes,
      ingredients: m.ingredients,
    })),
  }));
}

// ── Amounts ────────────────────────────────────────────────────────────────

export const fmtQty = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(1)} kg` : `${roundGrams(g)} g`);

const fmtCount = (n: number) => {
  if (n >= 10) return String(Math.round(n));
  const r = Math.round(n * 2) / 2;
  const whole = Math.floor(r);
  const half = r - whole === 0.5;
  if (!whole) return '½';
  return half ? `${whole}½` : String(whole);
};

const PLURALIZE =
  /^(cup|slice|fillet|clove|piece|stalk|head|can|stick|leaf|sprig|ear|breast|thigh|bunch|handful|serving|patty|link|wedge|spear|floret|pod|stem|tortilla|pita)\b/i;

/** "≈ 3 medium" from the food's first household serving, when it has one and the amount is worth a measure. */
export function householdMeasure(f: Food | undefined, grams: number): string | undefined {
  const s = f?.servings?.[0];
  if (!s || !s.g) return undefined;
  const m = s.label.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s+(.*)$/);
  let qty = 1;
  let label = s.label;
  if (m) {
    qty = m[1].includes('/') ? Number(m[1].split('/')[0]) / Number(m[1].split('/')[1]) : Number(m[1]);
    label = m[2];
  }
  const n = (grams / s.g) * qty;
  if (n < 0.25) return undefined;
  if (n > 1 && PLURALIZE.test(label)) label = label.replace(PLURALIZE, (w) => (w.toLowerCase().endsWith('s') ? w : `${w}s`));
  return `≈ ${fmtCount(n)} ${label}`;
}

/** "Lentils, boiled" → { name: "Lentils", detail: "boiled" } */
export function splitFoodName(f: Food | undefined, fallback: string) {
  const [first, ...rest] = (f?.name ?? fallback).split(',');
  return { name: first.trim(), detail: rest.join(',').trim() || undefined };
}

// ── Grocery ────────────────────────────────────────────────────────────────

export const AISLES = ['Produce', 'Proteins', 'Legumes & grains', 'Dairy', 'Nuts & seeds', 'Pantry'] as const;
export type Aisle = (typeof AISLES)[number];

const AISLE_OF: Partial<Record<FoodCategory, Aisle>> = {
  fruit: 'Produce',
  vegetable: 'Produce',
  meat: 'Proteins',
  poultry: 'Proteins',
  fish: 'Proteins',
  egg: 'Proteins',
  legume: 'Legumes & grains',
  grain: 'Legumes & grains',
  dairy: 'Dairy',
  nut_seed: 'Nuts & seeds',
};

export const aisleOf = (f: Food | undefined): Aisle => (f && AISLE_OF[f.category]) || 'Pantry';

export interface GroceryItem {
  foodId: string;
  name: string;
  detail?: string;
  grams: number;
  qty: string;
  hint?: string;
  aisle: Aisle;
}

export interface GroceryOptions {
  /** leave out meals already eaten (default true): you do not need to shop for them */
  skipEaten?: boolean;
}

/** Sum every ingredient over the given days, × household size, with a household measure. */
export function aggregateGrocery(days: KitchenDay[], foods: FoodLookup, household = 1, opts: GroceryOptions = {}): GroceryItem[] {
  const skipEaten = opts.skipEaten ?? true;
  const totals = new Map<string, number>();
  for (const day of days)
    for (const meal of day.meals) {
      if (skipEaten && meal.eaten) continue;
      for (const ing of meal.ingredients) totals.set(ing.foodId, (totals.get(ing.foodId) ?? 0) + ing.grams);
    }
  const items = [...totals.entries()].map(([foodId, raw]): GroceryItem => {
    const f = foods.get(foodId);
    const grams = roundGrams(raw * household);
    return { foodId, ...splitFoodName(f, foodId), grams, qty: fmtQty(grams), hint: householdMeasure(f, grams), aisle: aisleOf(f) };
  });
  return items.sort((a, b) => AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle) || a.name.localeCompare(b.name) || (a.detail ?? '').localeCompare(b.detail ?? ''));
}

// ── Prep (batch cooking) ───────────────────────────────────────────────────

export type CookKind = 'grain' | 'legume' | 'protein' | 'other';

export const COOK_KINDS: CookKind[] = ['grain', 'legume', 'protein', 'other'];

export const COOK_LABEL: Record<CookKind, string> = {
  grain: 'Grains',
  legume: 'Legumes',
  protein: 'Proteins',
  other: 'Other cooked foods',
};

/** Short, food-safe guidance per kind. */
export const COOK_TIP: Record<CookKind, string> = {
  grain: 'Cook once, cool quickly and chill within 2 hours. Keeps 3–5 days refrigerated, or freeze portions. Reheat until steaming hot.',
  legume: 'Starting dry? Soak overnight, then simmer until soft. Cooked legumes keep about 4 days refrigerated, or freeze portions.',
  protein: 'Cook within 3–4 days of eating, or freeze portions. Chill within 2 hours and reheat until steaming hot.',
  other: 'Roasted or baked foods keep about 3–4 days refrigerated. Chill within 2 hours.',
};

const COOKED_WORD = /\b(cooked|boiled|roasted|baked)\b/i;
/** Grains and legumes that are eaten as they are, so there is nothing to cook ahead. */
const READY_TO_EAT = /\b(bread|tortilla|pita|tofu|tempeh|edamame|oats|hummus)\b/i;
const PROTEIN: FoodCategory[] = ['meat', 'poultry', 'fish', 'egg'];

/**
 * Is this food something you cook ahead? Grains and legumes (unless they come ready to eat, like
 * bread or tofu), plus anything whose name says it is cooked, boiled, roasted or baked.
 */
export function cookKind(f: Food | undefined): CookKind | null {
  if (!f) return null;
  const cooked = COOKED_WORD.test(f.name);
  if (f.category === 'grain' || f.category === 'legume') {
    if (!cooked && READY_TO_EAT.test(f.name)) return null;
    return f.category;
  }
  if (!cooked) return null;
  return PROTEIN.includes(f.category) ? 'protein' : 'other';
}

export interface PrepUse {
  date: string;
  slot: MealSlot;
  mealId: string;
  mealName: string;
  grams: number; // × household
}

export interface PrepItem {
  foodId: string;
  name: string;
  detail?: string;
  kind: CookKind;
  grams: number; // × household
  qty: string;
  hint?: string;
  uses: PrepUse[];
}

export interface PrepGroup {
  kind: CookKind;
  label: string;
  tip: string;
  items: PrepItem[];
}

/** Cook-ahead foods over the given days: totals × household, and which days and meals use them. */
export function groupPrep(days: KitchenDay[], foods: FoodLookup, household = 1, opts: GroceryOptions = {}): PrepGroup[] {
  const skipEaten = opts.skipEaten ?? true;
  const byFood = new Map<string, PrepItem>();
  for (const day of days)
    for (const meal of day.meals) {
      if (skipEaten && meal.eaten) continue;
      for (const ing of meal.ingredients) {
        const f = foods.get(ing.foodId);
        const kind = cookKind(f);
        if (!kind) continue;
        let item = byFood.get(ing.foodId);
        if (!item) {
          item = { foodId: ing.foodId, ...splitFoodName(f, ing.foodId), kind, grams: 0, qty: '', uses: [] };
          byFood.set(ing.foodId, item);
        }
        const grams = ing.grams * household;
        const prior = item.uses.find((u) => u.date === day.date && u.mealId === meal.id);
        if (prior) prior.grams += grams;
        else item.uses.push({ date: day.date, slot: meal.slot, mealId: meal.id, mealName: meal.name, grams });
      }
    }
  const items = [...byFood.values()].map((it) => {
    const uses = it.uses.map((u) => ({ ...u, grams: roundGrams(u.grams) }));
    const grams = roundGrams(it.uses.reduce((s, u) => s + u.grams, 0));
    return { ...it, uses, grams, qty: fmtQty(grams), hint: householdMeasure(foods.get(it.foodId), grams) };
  });
  return COOK_KINDS.map((kind) => ({
    kind,
    label: COOK_LABEL[kind],
    tip: COOK_TIP[kind],
    items: items.filter((i) => i.kind === kind).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length);
}

// ── Cook mode: steps and timers ────────────────────────────────────────────

/** Split instructions into steps at sentence ends. Decimals ("1.5 cups") and "e.g." style stops stay whole. */
export function splitSteps(text?: string | null): string[] {
  if (!text) return [];
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9("'“])/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

export interface StepDuration {
  seconds: number;
  /** "10 min", "1 h 30 min" */
  label: string;
}

const NUM = String.raw`\d+\/\d+|\d+(?:\.\d+)?(?:\s?[½¼¾])?|[½¼¾]`;
const DURATION = new RegExp(
  String.raw`(?<![\d./])(${NUM})(?:\s*(?:to|-|–|—)\s*(?:${NUM}))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b`,
  'gi',
);
const WORD_DURATION = /\b(half an hour|an hour)\b/gi;
const FRACTION: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75 };

function toNumber(s: string): number {
  const t = s.trim();
  if (t.includes('/')) {
    const [a, b] = t.split('/').map(Number);
    return b ? a / b : 0;
  }
  const m = t.match(/^(\d+(?:\.\d+)?)?\s*([½¼¾])?$/);
  if (!m) return 0;
  return (m[1] ? Number(m[1]) : 0) + (m[2] ? FRACTION[m[2]] : 0);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "12:05" style countdown. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${z2(m)}:${z2(s)}` : `${m}:${z2(s)}`;
}

/**
 * Durations mentioned in a step ("10 minutes", "20 min", "1 hour", "1 hour 30 minutes").
 * A range ("12 to 15 minutes") gives its lower end, so the timer says "go and check".
 */
export function findDurations(step: string): StepDuration[] {
  const found: { index: number; end: number; seconds: number; unit: 'h' | 'm' | 's' | 'w' }[] = [];
  for (const m of step.matchAll(DURATION)) {
    const n = toNumber(m[1]);
    const u = m[2].toLowerCase();
    const unit = u.startsWith('h') ? 'h' : u.startsWith('m') ? 'm' : 's';
    const seconds = Math.round(n * (unit === 'h' ? 3600 : unit === 'm' ? 60 : 1));
    if (seconds > 0) found.push({ index: m.index ?? 0, end: (m.index ?? 0) + m[0].length, seconds, unit });
  }
  for (const m of step.matchAll(WORD_DURATION)) {
    found.push({ index: m.index ?? 0, end: (m.index ?? 0) + m[0].length, seconds: /half/i.test(m[0]) ? 1800 : 3600, unit: 'w' });
  }
  found.sort((a, b) => a.index - b.index);
  // "1 hour 30 minutes" is one timer
  const merged: typeof found = [];
  for (const cur of found) {
    const prev = merged[merged.length - 1];
    if (prev && prev.unit === 'h' && cur.unit === 'm' && /^\s*(,|and)?\s*$/i.test(step.slice(prev.end, cur.index))) {
      prev.seconds += cur.seconds;
      prev.end = cur.end;
      prev.unit = 'w';
    } else merged.push({ ...cur });
  }
  return merged.filter((d) => d.seconds <= 24 * 3600).map((d) => ({ seconds: d.seconds, label: formatDuration(d.seconds) }));
}

// ── Reminders ──────────────────────────────────────────────────────────────

export interface ReminderSettings {
  meals: boolean;
  mealTimes: Record<MealSlot, string>; // 'HH:MM'
  prepEvening: boolean;
  prepTime: string;
  eveningCheck: boolean;
  eveningTime: string;
}

export function parseHHMM(t: string): { hour: number; minute: number } {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  const hour = m ? Math.min(23, Number(m[1])) : 0;
  const minute = m ? Math.min(59, Number(m[2])) : 0;
  return { hour, minute };
}

export const toHHMM = (hour: number, minute: number) => `${z2(((hour % 24) + 24) % 24)}:${z2(((minute % 60) + 60) % 60)}`;

/** Move a time by whole hours / minutes, wrapping round the clock. */
export function stepTime(t: string, dHours: number, dMinutes: number): string {
  const { hour, minute } = parseHHMM(t);
  const total = (((hour * 60 + minute + dHours * 60 + dMinutes) % 1440) + 1440) % 1440;
  return toHHMM(Math.floor(total / 60), total % 60);
}

/** "6:30 pm" */
export function formatTime(t: string): string {
  const { hour, minute } = parseHHMM(t);
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${z2(minute)} ${hour < 12 ? 'am' : 'pm'}`;
}

const SLOT_TITLE: Record<MealSlot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Snack', dinner: 'Dinner' };
const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner'];
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** What a notification needs to know about one upcoming day. */
export interface ReminderDay {
  date: string;
  /** meals not yet eaten */
  meals: { slot: MealSlot; name: string; prepMinutes?: number }[];
  /** grains and legumes that need cooking ahead, × household */
  cookAhead: { name: string; grams: number; meals: string[] }[];
}

export function reminderDays(days: KitchenDay[], foods: FoodLookup, household = 1): ReminderDay[] {
  return days.map((day) => {
    const live = day.meals.filter((m) => !m.eaten);
    const ahead = new Map<string, { name: string; grams: number; meals: Set<string> }>();
    for (const meal of live)
      for (const ing of meal.ingredients) {
        const f = foods.get(ing.foodId);
        const kind = cookKind(f);
        if (kind !== 'grain' && kind !== 'legume') continue;
        const cur = ahead.get(ing.foodId) ?? { name: splitFoodName(f, ing.foodId).name, grams: 0, meals: new Set<string>() };
        cur.grams += ing.grams * household;
        cur.meals.add(meal.name);
        ahead.set(ing.foodId, cur);
      }
    return {
      date: day.date,
      meals: live.map((m) => ({ slot: m.slot, name: m.name, prepMinutes: m.prepMinutes })),
      cookAhead: [...ahead.values()].map((a) => ({ name: a.name, grams: roundGrams(a.grams), meals: [...a.meals] })),
    };
  });
}

export interface PlannedReminder {
  id: string;
  title: string;
  body: string;
  /** one-off, local time */
  at?: Date;
  /** repeats every day at this time */
  daily?: { hour: number; minute: number };
}

const joinList = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function atTime(date: string, t: string): Date {
  const { hour, minute } = parseHHMM(t);
  const d = parseDate(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** iOS keeps only the 64 soonest pending notifications; stay safely under that. */
export const MAX_DATED_REMINDERS = 60;

/** The notifications to schedule: meal times, the night-before prep note, and a daily evening check. */
export function planReminders(settings: ReminderSettings, days: ReminderDay[], now: Date = new Date()): PlannedReminder[] {
  const out: PlannedReminder[] = [];

  if (settings.meals) {
    for (const day of days)
      for (const slot of SLOT_ORDER) {
        const here = day.meals.filter((m) => m.slot === slot);
        if (!here.length) continue;
        const at = atTime(day.date, settings.mealTimes[slot]);
        if (at <= now) continue;
        const names = here.map((m) => m.name).join(' + ');
        const mins = here.length === 1 && here[0].prepMinutes ? ` · ${here[0].prepMinutes} min` : '';
        out.push({ id: `eighty-rem-meal-${day.date}-${slot}`, title: 'Time to eat', body: `${SLOT_TITLE[slot]}: ${names}${mins}`, at });
      }
  }

  if (settings.prepEvening) {
    for (const day of days) {
      if (!day.cookAhead.length) continue;
      const at = atTime(shiftDate(day.date, -1), settings.prepTime);
      if (at <= now) continue;
      const mealNames = [...new Set(day.cookAhead.flatMap((a) => a.meals))];
      const shown = mealNames.slice(0, 2).join(', ') + (mealNames.length > 2 ? ` and ${mealNames.length - 2} more` : '');
      const things = day.cookAhead.slice(0, 3).map((a) => `${a.grams} g ${lower(a.name)}`);
      const more = day.cookAhead.length > 3 ? ' and more' : '';
      out.push({
        id: `eighty-rem-prep-${day.date}`,
        title: 'Prep tonight',
        body: `Tomorrow: ${shown}. Cook ${joinList(things)}${more} tonight.`,
        at,
      });
    }
  }

  const dated = out.sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)).slice(0, MAX_DATED_REMINDERS);

  if (settings.eveningCheck) {
    const { hour, minute } = parseHHMM(settings.eveningTime);
    dated.push({ id: 'eighty-rem-evening', title: 'Your board', body: "See what's left on your board today", daily: { hour, minute } });
  }
  return dated;
}
