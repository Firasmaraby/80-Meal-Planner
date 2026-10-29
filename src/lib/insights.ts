/**
 * Pure maths behind the report card, the weekly check-in and the "Life happened" rescue.
 * No React, no storage: everything here takes plain data, so it is easy to test.
 */
import { addInto, boardProgress, dayScore } from '@/engine/calc';
import { BOARD_KEYS, COMPLETE_AT, NUTRIENTS } from '@/engine/nutrients';
import type { Food, NutrientKey, NutrientVector, Profile } from '@/engine/types';
import { daysBetween } from '@/state/store';

type Who = Pick<Profile, 'sex' | 'age' | 'lifeStage'>;

export const KG_PER_LB = 0.45359237;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

// ── Days & hit rates ───────────────────────────────────────────────────────

/** One day of eating: nutrient totals from food (and supplements taken). */
export interface DayTotals {
  date: string;
  /** food was logged that day; unlogged days say nothing about what was eaten */
  logged: boolean;
  totals: NutrientVector;
}

export const isEightyDay = (d: DayTotals, who: Who) => d.logged && dayScore(boardProgress(d.totals, who)).eightyDay;

/**
 * Today isn't over until it's over: if it hasn't reached Eighty yet, leave it out of the
 * rates and the streak instead of counting a half-eaten day as a miss.
 */
export function settleToday(days: DayTotals[], todayDate: string, who: Who): DayTotals[] {
  const last = days[days.length - 1];
  if (last && last.date === todayDate && !isEightyDay(last, who)) return days.slice(0, -1);
  return days;
}

export interface EightyStats {
  eightyDays: number;
  loggedDays: number;
  /** consecutive Eighty days ending at the most recent day */
  streak: number;
  /** date → was an Eighty day, for every logged day */
  byDate: Map<string, boolean>;
}

export function eightyStats(days: DayTotals[], who: Who): EightyStats {
  const byDate = new Map<string, boolean>();
  let eightyDays = 0;
  let loggedDays = 0;
  for (const d of days) {
    if (!d.logged) continue;
    loggedDays++;
    const e = isEightyDay(d, who);
    byDate.set(d.date, e);
    if (e) eightyDays++;
  }
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (byDate.get(days[i].date)) streak++;
    else break;
  }
  return { eightyDays, loggedDays, streak, byDate };
}

export interface HitRate {
  key: NutrientKey;
  /** logged days the nutrient reached 80% */
  hit: number;
  /** logged days it was measured on */
  of: number;
  rate: number;
}

/**
 * For each board nutrient: the share of logged days it reached 80%, best first.
 * Nutrients the food data barely measures (biotin, iodine) are left out rather than
 * reported as misses, and a day only counts for a nutrient it has data for.
 */
export function nutrientHitRates(days: DayTotals[], who: Who): HitRate[] {
  const tally = new Map<NutrientKey, { hit: number; of: number }>();
  for (const d of days) {
    if (!d.logged) continue;
    for (const p of boardProgress(d.totals, who)) {
      if (NUTRIENTS[p.key].sparse || p.amount == null) continue;
      const t = tally.get(p.key) ?? { hit: 0, of: 0 };
      t.of++;
      if (p.complete) t.hit++;
      tally.set(p.key, t);
    }
  }
  return BOARD_KEYS.filter((k) => tally.has(k))
    .map((key) => {
      const t = tally.get(key)!;
      return { key, hit: t.hit, of: t.of, rate: t.hit / t.of };
    })
    .sort((a, b) => b.rate - a.rate || BOARD_KEYS.indexOf(a.key) - BOARD_KEYS.indexOf(b.key));
}

/** Top and bottom of a ranked list, without showing the same nutrient twice. */
export function bestAndWorst(rates: HitRate[], n = 5): { best: HitRate[]; worst: HitRate[] } {
  const best = rates.slice(0, n);
  const worst = rates.slice(best.length).slice(-n).reverse();
  return { best, worst };
}

// ── Check-ins ──────────────────────────────────────────────────────────────

export interface CheckinLike {
  date: string;
  energy: number;
  sleep: number;
  mood: number;
  digestion: number;
  weightKg?: number;
}

/** True when the last check-in is `gapDays` or more days old, or there has never been one. */
export function isCheckinDue(checkins: { date: string }[], todayDate: string, gapDays = 7): boolean {
  if (!checkins.length) return true;
  const last = checkins.reduce((m, c) => (c.date > m ? c.date : m), checkins[0].date);
  return daysBetween(last, todayDate) >= gapDays;
}

export const FEEL_KEYS = ['energy', 'sleep', 'mood'] as const;
export type FeelKey = (typeof FEEL_KEYS)[number];

export interface FeelGroup {
  n: number;
  avg: Record<FeelKey, number>;
}

export interface FeelSplit {
  eighty: FeelGroup;
  other: FeelGroup;
}

const avgOf = (rows: CheckinLike[]): FeelGroup => ({
  n: rows.length,
  avg: {
    energy: rows.reduce((s, r) => s + r.energy, 0) / rows.length,
    sleep: rows.reduce((s, r) => s + r.sleep, 0) / rows.length,
    mood: rows.reduce((s, r) => s + r.mood, 0) / rows.length,
  },
});

/**
 * Average energy, sleep and mood on check-in days that were Eighty days vs logged days that
 * weren't. Null until there are `minEach` of both kinds: a handful of ratings isn't a pattern.
 * A check-in on a day with nothing logged says nothing about food, so it is left out.
 */
export function feelSplit(checkins: CheckinLike[], eightyByDate: Map<string, boolean>, minEach = 4): FeelSplit | null {
  const eighty = checkins.filter((c) => eightyByDate.get(c.date) === true);
  const other = checkins.filter((c) => eightyByDate.get(c.date) === false);
  if (eighty.length < minEach || other.length < minEach) return null;
  return { eighty: avgOf(eighty), other: avgOf(other) };
}

/** "On Eighty days you rated energy 4.1 vs 3.2 on other days." A description, never a cause. */
export function feelLine(what: FeelKey, split: FeelSplit): string {
  const a = split.eighty.avg[what].toFixed(1);
  const b = split.other.avg[what].toFixed(1);
  return `On Eighty days you rated ${what} ${a} vs ${b} on other days`;
}

export interface WeightPoint {
  date: string;
  kg: number;
}

/** Weights from check-ins on or after `since`, oldest first. */
export function weightSeries(checkins: CheckinLike[], since: string): WeightPoint[] {
  return checkins
    .filter((c) => c.weightKg != null && c.date >= since)
    .map((c) => ({ date: c.date, kg: c.weightKg! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Food sources ───────────────────────────────────────────────────────────

export interface FoodSource {
  food: Food;
  label: string;
  grams: number;
  /** fraction of the full RDA/AI in one typical serving */
  pct: number;
}

/** Everyday foods that carry the most of a nutrient per typical serving. */
export function topFoodSources(key: NutrientKey, foods: Food[], rda: number, limit = 4): FoodSource[] {
  return foods
    .filter((f) => !f.rare && (f.rank ?? 0) >= 50 && (f.n[key] ?? 0) > 0 && f.category !== 'sweet' && !f.tags?.includes('processed'))
    .map((food) => {
      const s = food.servings?.[0] ?? { label: '100 g', g: 100 };
      return { food, label: s.label, grams: s.g, pct: (food.n[key]! * s.g) / 100 / rda };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
}

// ── Supplements ────────────────────────────────────────────────────────────

/**
 * Upper limits that apply to the supplement alone (the DRI table only lists ULs for total
 * intake from food). Folate is in µg DFE: the 1,000 µg folic acid limit is 1,700 µg DFE.
 */
export const SUPPLEMENT_ONLY_UL: Partial<Record<NutrientKey, number>> = { magnesium: 350, folate: 1700 };

export interface SupplementCaution {
  key: NutrientKey;
  /** 'total': food plus supplements pass the UL. 'supplement': the supplement alone passes its own limit. */
  kind: 'total' | 'supplement';
  amount: number;
  limit: number;
}

export function supplementCautions(supplementTotals: NutrientVector, totals: NutrientVector, who: Who): SupplementCaution[] {
  const out: SupplementCaution[] = [];
  const progress = new Map(boardProgress(totals, who).map((p) => [p.key, p]));
  for (const key of Object.keys(supplementTotals) as NutrientKey[]) {
    const fromSupp = supplementTotals[key] ?? 0;
    if (fromSupp <= 0) continue;
    const p = progress.get(key);
    if (p?.overUL && p.req.ul != null && p.amount != null) out.push({ key, kind: 'total', amount: p.amount, limit: p.req.ul });
    else if (SUPPLEMENT_ONLY_UL[key] != null && fromSupp > SUPPLEMENT_ONLY_UL[key]!)
      out.push({ key, kind: 'supplement', amount: fromSupp, limit: SUPPLEMENT_ONLY_UL[key]! });
  }
  return out;
}

// ── Rescue the rest of today ───────────────────────────────────────────────

export interface RescueCandidate {
  key: string;
  kcal: number;
  totals: NutrientVector;
  /** may stand in for a planned meal (lunch or dinner) */
  canSwap: boolean;
}

export type RescueMode = 'swap' | 'add';

export interface RescuePlay {
  mode: RescueMode;
  /** still-open tiles this would push past 80% */
  closes: NutrientKey[];
}

export interface RescueOption {
  key: string;
  kcal: number;
  plays: RescuePlay[];
  /** tie-break: how far it moves the open tiles that it doesn't finish */
  progress: number;
}

export interface RescueInput {
  /** everything eaten, plus what the rest of today's plan will add */
  projected: NutrientVector;
  who: Who;
  candidates: RescueCandidate[];
  /** target kcal minus eaten minus the plan meals still to come */
  headroomKcal: number;
  /** the planned meal a swap would replace, if there is one */
  swapOut?: { totals: NutrientVector; kcal: number };
  limit?: number;
}

/** The tiles that stay under 80% even after today's remaining meals. Thin-data nutrients are skipped. */
export function openTiles(projected: NutrientVector, who: Who): NutrientKey[] {
  return boardProgress(projected, who)
    .filter((p) => p.amount != null && !p.complete && !NUTRIENTS[p.key].sparse)
    .map((p) => p.key);
}

/**
 * Library meals ranked by how many open tiles they'd finish. Two ways to use one:
 * on top of the day ("add", must fit the calories left) or in place of the planned meal
 * ("swap", which frees that meal's calories but also its nutrients: a swap that would
 * drop a tile that was otherwise covered is never offered).
 */
export function rescueOptions(input: RescueInput): RescueOption[] {
  const { projected, who, candidates, headroomKcal, swapOut } = input;
  const open = openTiles(projected, who);
  if (!open.length) return [];
  const base = boardProgress(projected, who);
  const covered = base.filter((p) => p.amount != null && p.complete).map((p) => p.key);
  const need = new Map(base.map((p) => [p.key, p.req.rda * COMPLETE_AT - (p.amount ?? 0)]));
  const evaluate = (mode: RescueMode, after: NutrientVector, added: NutrientVector) => {
    const prog = new Map(boardProgress(after, who, open).map((p) => [p.key, p]));
    const closes = open.filter((k) => prog.get(k)?.complete);
    // partial credit for the open tiles it moves but doesn't finish
    const gain = open.reduce((s, k) => s + Math.min(1, Math.max(0, (added[k] ?? 0) / Math.max(need.get(k) ?? 1, 1e-9))), 0);
    return { play: { mode, closes } as RescuePlay, gain };
  };

  const options: RescueOption[] = [];
  for (const c of candidates) {
    const plays: { play: RescuePlay; gain: number }[] = [];

    if (c.kcal <= headroomKcal) {
      const after = addInto({ ...projected }, c.totals);
      plays.push(evaluate('add', after, c.totals));
    }
    if (swapOut && c.canSwap && c.kcal <= headroomKcal + swapOut.kcal) {
      const after: NutrientVector = { ...projected };
      for (const k of Object.keys(swapOut.totals) as NutrientKey[]) after[k] = (after[k] ?? 0) - (swapOut.totals[k] ?? 0);
      addInto(after, c.totals);
      const kept = boardProgress(after, who, covered).every((p) => p.complete);
      if (kept) plays.push(evaluate('swap', after, c.totals));
    }

    const useful = plays.filter((p) => p.play.closes.length > 0);
    if (!useful.length) continue;
    const best = useful.reduce((m, p) => (p.play.closes.length > m.play.closes.length || (p.play.closes.length === m.play.closes.length && p.gain > m.gain) ? p : m));
    options.push({ key: c.key, kcal: c.kcal, plays: useful.map((p) => p.play), progress: best.gain });
  }

  const most = (o: RescueOption) => Math.max(...o.plays.map((p) => p.closes.length));
  return options.sort((a, b) => most(b) - most(a) || b.progress - a.progress || a.kcal - b.kcal).slice(0, input.limit ?? 3);
}
