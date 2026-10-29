import { describe, expect, it } from 'vitest';

import { boardProgress, dayScore } from '@/engine/calc';
import { requirementsFor } from '@/engine/dri';
import { BOARD_KEYS, NUTRIENTS } from '@/engine/nutrients';
import type { Food, NutrientKey, NutrientVector } from '@/engine/types';

import { FOOD_INDEX } from '@/state/catalog';
import { EATING_OUT, SUPPLEMENTS, foldInSupplements, supplementTotal } from '@/state/wellnessStore';

import {
  bestAndWorst,
  eightyStats,
  feelLine,
  feelSplit,
  isCheckinDue,
  kgToLb,
  lbToKg,
  nutrientHitRates,
  rescueOptions,
  settleToday,
  supplementCautions,
  topFoodSources,
  weightSeries,
  type DayTotals,
} from './insights';

const who = { sex: 'male', age: 35, lifeStage: 'none' } as const;
const req = requirementsFor(BOARD_KEYS, who);
const rda = (k: NutrientKey) => req[k]!.rda;
const MEASURED = BOARD_KEYS.filter((k) => !NUTRIENTS[k].sparse);

/** A day at `frac` of the RDA for the given keys (everything else absent). */
const vec = (keys: NutrientKey[], frac = 1): NutrientVector => Object.fromEntries(keys.map((k) => [k, rda(k) * frac]));
const day = (date: string, totals: NutrientVector, logged = true): DayTotals => ({ date, logged, totals });
/** every measured nutrient at 100%, so it is an Eighty day */
const full = (date: string) => day(date, vec(MEASURED));
/** every measured nutrient at 30%: logged, but not an Eighty day */
const thin = (date: string) => day(date, vec(MEASURED, 0.3));

describe('nutrientHitRates', () => {
  it('ranks nutrients by the share of logged days at 80%', () => {
    const days = [
      day('2026-10-01', vec(MEASURED)),
      day('2026-10-02', { ...vec(MEASURED), iron: rda('iron') * 0.5 }),
      day('2026-10-03', { ...vec(MEASURED), iron: rda('iron') * 0.9, zinc: rda('zinc') * 0.3 }),
    ];
    const rates = nutrientHitRates(days, who);
    const by = Object.fromEntries(rates.map((r) => [r.key, r]));
    expect(by.vitC.rate).toBe(1);
    expect(by.iron).toMatchObject({ hit: 2, of: 3 });
    expect(by.zinc).toMatchObject({ hit: 2, of: 3 });
    expect(rates[0].rate).toBeGreaterThanOrEqual(rates[rates.length - 1].rate);
    expect(rates[rates.length - 1].rate).toBeCloseTo(2 / 3);
  });

  it('ignores unlogged days and leaves thin-data nutrients (biotin, iodine) out', () => {
    const days = [full('2026-10-01'), day('2026-10-02', {}, false), { ...full('2026-10-03'), totals: { ...vec(MEASURED), b7: 0, iodine: 0 } }];
    const rates = nutrientHitRates(days, who);
    expect(rates.every((r) => r.of === 2)).toBe(true);
    expect(rates.find((r) => r.key === 'b7')).toBeUndefined();
    expect(rates.find((r) => r.key === 'iodine')).toBeUndefined();
  });

  it('counts a day only for the nutrients it has data on', () => {
    const rates = nutrientHitRates([day('2026-10-01', vec(['vitC'])), day('2026-10-02', vec(['vitC', 'iron'], 0.2))], who);
    expect(rates.find((r) => r.key === 'iron')).toMatchObject({ hit: 0, of: 1 });
    expect(rates.find((r) => r.key === 'vitC')).toMatchObject({ hit: 1, of: 2 });
  });

  it('splits best and worst without repeating a nutrient', () => {
    const rates = nutrientHitRates([full('2026-10-01')], who);
    const { best, worst } = bestAndWorst(rates, 5);
    expect(best).toHaveLength(5);
    expect(worst.some((w) => best.includes(w))).toBe(false);
    const few = bestAndWorst(rates.slice(0, 3), 5);
    expect(few.best).toHaveLength(3);
    expect(few.worst).toHaveLength(0);
  });
});

describe('eightyStats and settleToday', () => {
  const days = [full('2026-10-01'), thin('2026-10-02'), full('2026-10-03'), full('2026-10-04'), day('2026-10-05', {}, false)];

  it('counts Eighty days and logged days', () => {
    const s = eightyStats(days, who);
    expect(s.eightyDays).toBe(3);
    expect(s.loggedDays).toBe(4);
    expect(s.byDate.get('2026-10-02')).toBe(false);
    expect(s.byDate.has('2026-10-05')).toBe(false);
  });

  it('streak runs back from the latest day and stops at a miss or an unlogged day', () => {
    expect(eightyStats(days, who).streak).toBe(0); // the last day was not logged
    expect(eightyStats(days.slice(0, 4), who).streak).toBe(2);
    expect(eightyStats([thin('2026-10-01'), full('2026-10-02')], who).streak).toBe(1);
  });

  it('leaves out an unfinished today, but keeps today once it is an Eighty day', () => {
    const open = [full('2026-10-03'), thin('2026-10-04')];
    expect(settleToday(open, '2026-10-04', who)).toHaveLength(1);
    expect(eightyStats(settleToday(open, '2026-10-04', who), who).streak).toBe(1);
    const done = [full('2026-10-03'), full('2026-10-04')];
    expect(settleToday(done, '2026-10-04', who)).toHaveLength(2);
    expect(settleToday(open, '2026-10-09', who)).toHaveLength(2);
  });
});

describe('check-ins', () => {
  const c = (date: string, energy: number, sleep = 3, mood = 3) => ({ date, energy, sleep, mood, digestion: 3 });

  it('is due after seven days, or when there has never been one', () => {
    expect(isCheckinDue([], '2026-10-29')).toBe(true);
    expect(isCheckinDue([{ date: '2026-10-22' }], '2026-10-29')).toBe(true);
    expect(isCheckinDue([{ date: '2026-10-23' }], '2026-10-29')).toBe(false);
    expect(isCheckinDue([{ date: '2026-10-01' }, { date: '2026-10-28' }], '2026-10-29')).toBe(false);
  });

  it('compares Eighty days with other days only once there are four of each', () => {
    const flags = new Map<string, boolean>();
    const rows = [];
    for (let i = 1; i <= 4; i++) {
      flags.set(`2026-09-0${i}`, true);
      rows.push(c(`2026-09-0${i}`, 4, 4, 5));
      flags.set(`2026-09-1${i}`, false);
      rows.push(c(`2026-09-1${i}`, 3, 2, 3));
    }
    const split = feelSplit(rows, flags)!;
    expect(split.eighty.n).toBe(4);
    expect(split.eighty.avg.energy).toBe(4);
    expect(split.other.avg.sleep).toBe(2);
    expect(feelLine('energy', split)).toBe('On Eighty days you rated energy 4.0 vs 3.0 on other days');
    expect(feelSplit(rows.slice(1), flags)).toBeNull(); // only three Eighty days left
    expect(feelSplit(rows, flags, 5)).toBeNull();
  });

  it('skips check-ins on days with nothing logged', () => {
    const flags = new Map([['2026-09-01', true]]);
    const rows = [c('2026-09-01', 5), c('2026-09-02', 1)];
    expect(feelSplit(rows, flags, 1)).toBeNull(); // no "other" day with food logged
  });

  it('builds a weight series, oldest first, from check-ins that have one', () => {
    const rows = [
      { ...c('2026-10-20', 3), weightKg: 80.5 },
      c('2026-10-13', 3),
      { ...c('2026-10-06', 3), weightKg: 81.2 },
      { ...c('2026-09-01', 3), weightKg: 85 },
    ];
    expect(weightSeries(rows, '2026-10-01')).toEqual([
      { date: '2026-10-06', kg: 81.2 },
      { date: '2026-10-20', kg: 80.5 },
    ]);
    expect(lbToKg(kgToLb(80))).toBeCloseTo(80);
    expect(kgToLb(80)).toBeCloseTo(176.4, 1);
  });
});

const food = (id: string, n: NutrientVector, over: Partial<Food> = {}): Food => ({
  id,
  name: id,
  category: 'vegetable',
  n,
  src: [],
  rank: 80,
  ...over,
});

describe('topFoodSources', () => {
  it('ranks everyday foods by share of the RDA in one serving', () => {
    const foods = [
      food('liver', { iron: 6 }, { rare: true }),
      food('lentils', { iron: 3.3 }, { servings: [{ label: '1 cup', g: 200 }] }),
      food('spinach', { iron: 2.7 }, { servings: [{ label: '1 cup', g: 30 }] }),
      food('candy', { iron: 9 }, { category: 'sweet' }),
      food('bar', { iron: 8 }, { tags: ['processed'] }),
      food('obscure', { iron: 20 }, { rank: 10 }),
      food('none', { iron: 0 }),
    ];
    const top = topFoodSources('iron', foods, 8, 5);
    expect(top.map((t) => t.food.id)).toEqual(['lentils', 'spinach']);
    expect(top[0].pct).toBeCloseTo((3.3 * 2) / 8);
    expect(top[0].label).toBe('1 cup');
  });
});

describe('supplementCautions', () => {
  it('flags a nutrient whose food + supplement total passes the upper limit', () => {
    const supp = { vitD: 50 };
    const total = { vitD: 130 }; // UL 100
    expect(supplementCautions(supp, total, who)).toEqual([{ key: 'vitD', kind: 'total', amount: 130, limit: 100 }]);
  });

  it('flags supplement-only limits (magnesium, folate) that the food table does not list', () => {
    const c = supplementCautions({ magnesium: 400, folate: 400 }, { magnesium: 800, folate: 900 }, who);
    expect(c).toEqual([{ key: 'magnesium', kind: 'supplement', amount: 400, limit: 350 }]);
  });

  it('is quiet when nothing passes, and ignores nutrients the supplements did not touch', () => {
    expect(supplementCautions({ vitD: 25 }, { vitD: 40, iron: 90 }, who)).toEqual([]);
  });
});

describe('rescueOptions', () => {
  // Tiles: vitC, iron and zinc are the open ones; the rest are covered
  const base = vec(MEASURED);
  const projected: NutrientVector = { ...base, vitC: rda('vitC') * 0.3, iron: rda('iron') * 0.4, zinc: rda('zinc') * 0.5 };
  const meal = (key: string, kcal: number, n: NutrientVector, canSwap = true) => ({ key, kcal, totals: { kcal, ...n }, canSwap });
  const closesVitC = meal('vitc', 300, { vitC: rda('vitC') });
  const closesAll = meal('all', 500, { vitC: rda('vitC'), iron: rda('iron'), zinc: rda('zinc') });
  const closesNone = meal('none', 200, { protein: 30 });

  it('ranks by how many open tiles a meal finishes', () => {
    const out = rescueOptions({ projected, who, candidates: [closesVitC, closesNone, closesAll], headroomKcal: 800 });
    expect(out.map((o) => o.key)).toEqual(['all', 'vitc']);
    expect(out[0].plays[0].closes.sort()).toEqual(['iron', 'vitC', 'zinc']);
  });

  it('keeps add suggestions inside the calories that are left', () => {
    const out = rescueOptions({ projected, who, candidates: [closesAll, closesVitC], headroomKcal: 350 });
    expect(out.map((o) => o.key)).toEqual(['vitc']);
  });

  it('a swap frees the replaced meal’s calories', () => {
    const dinner = { totals: {}, kcal: 600 };
    const out = rescueOptions({ projected, who, candidates: [closesAll], headroomKcal: 100, swapOut: dinner });
    expect(out).toHaveLength(1);
    expect(out[0].plays.map((p) => p.mode)).toEqual(['swap']);
  });

  it('never offers a swap that drops a tile the plan was covering', () => {
    // the planned dinner is what covers magnesium; the candidate has none
    const dinner = { totals: { magnesium: rda('magnesium') }, kcal: 600 };
    const out = rescueOptions({ projected, who, candidates: [closesAll], headroomKcal: 100, swapOut: dinner });
    expect(out).toEqual([]);
    const roomy = rescueOptions({ projected, who, candidates: [closesAll], headroomKcal: 900, swapOut: dinner });
    expect(roomy[0].plays.map((p) => p.mode)).toEqual(['add']);
  });

  it('only swaps meals that can stand in for lunch or dinner', () => {
    const snack = meal('snack', 200, { vitC: rda('vitC') }, false);
    const out = rescueOptions({ projected, who, candidates: [snack], headroomKcal: 100, swapOut: { totals: {}, kcal: 600 } });
    expect(out).toEqual([]);
  });

  it('has nothing to rescue when every tile is already covered', () => {
    expect(rescueOptions({ projected: base, who, candidates: [closesAll], headroomKcal: 900 })).toEqual([]);
  });
});

describe('supplement and eating-out data', () => {
  it('sums one dose of each distinct supplement taken', () => {
    const t = supplementTotal(['d3-1000', 'b12-250', 'd3-1000', 'nope']);
    expect(t.vitD).toBe(25);
    expect(t.b12).toBe(250);
    expect(supplementTotal(undefined)).toEqual({});
    expect(SUPPLEMENTS.length).toBeGreaterThanOrEqual(12);
  });

  it('a supplement alone never reads as an Eighty day', () => {
    const lone = foldInSupplements({}, supplementTotal(['d3-1000', 'b12-250']));
    const score = dayScore(boardProgress(lone, who));
    expect(score.done).toBe(2);
    expect(score.of).toBeGreaterThan(20);
    expect(score.eightyDay).toBe(false);
    // no supplements: totals are left alone, so "no data" stays "no data"
    expect(foldInSupplements({ vitC: 5 }, {})).toEqual({ vitC: 5 });
    // food and supplement add up, and the supplement-only keys stay separate in supplementTotal
    expect(foldInSupplements({ vitD: 5 }, { vitD: 25 }).vitD).toBe(30);
  });

  it('registers estimates as prepared, processed foods with macros but no micros', () => {
    expect(EATING_OUT.length).toBeGreaterThanOrEqual(20);
    for (const m of EATING_OUT) {
      const f = FOOD_INDEX.get(m.foodId)!;
      expect(f.category).toBe('prepared');
      expect(f.tags).toContain('processed');
      expect(f.src).toEqual([{ db: 'Eighty estimate', ref: 'typical portion' }]);
      // logging the whole portion gives back the stated kcal
      expect((f.n.kcal! * m.grams) / 100).toBeCloseTo(m.kcal, 0);
      expect(f.n.vitC ?? null).toBeNull();
      expect(f.n.iron ?? null).toBeNull();
    }
  });
});
