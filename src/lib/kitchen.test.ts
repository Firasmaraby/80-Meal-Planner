import { describe, expect, it } from 'vitest';

import type { Food } from '@/engine/types';

import {
  aggregateGrocery,
  cookKind,
  daysUntilWeekday,
  dayLabel,
  findDurations,
  formatClock,
  formatDuration,
  formatTime,
  groupPrep,
  householdMeasure,
  planReminders,
  reminderDays,
  splitSteps,
  stepTime,
  type KitchenDay,
  type ReminderSettings,
} from './kitchen';

const food = (id: string, name: string, category: Food['category'], servings?: Food['servings']): Food =>
  ({ id, name, category, servings, n: {}, src: [] }) as Food;

const FOODS = new Map<string, Food>(
  [
    food('apple', 'Apple, raw', 'fruit', [{ label: '1 medium', g: 180 }]),
    food('lentils', 'Lentils, boiled', 'legume', [{ label: '1 cup', g: 200 }]),
    food('rice', 'Brown rice, long-grain, cooked', 'grain', [{ label: '1 cup', g: 195 }]),
    food('bread', 'Whole wheat bread', 'grain', [{ label: '1 slice', g: 40 }]),
    food('tofu', 'Tofu, firm, raw', 'legume'),
    food('oats', 'Oats, rolled, dry', 'grain'),
    food('chicken', 'Chicken breast, roasted, skinless', 'poultry'),
    food('salmon-raw', 'Salmon, raw', 'fish'),
    food('sweet-potato', 'Sweet potato, baked, flesh', 'vegetable'),
    food('olive-oil', 'Olive oil', 'oil_fat'),
    food('dry-lentils', 'Lentils, dry', 'legume'),
  ].map((f) => [f.id, f]),
);

const meal = (id: string, slot: 'breakfast' | 'lunch' | 'dinner' | 'snack', name: string, ings: [string, number][], extra = {}) => ({
  id,
  slot,
  name,
  ingredients: ings.map(([foodId, grams]) => ({ foodId, grams })),
  ...extra,
});

const week: KitchenDay[] = [
  {
    date: '2026-11-02', // Monday
    meals: [
      meal('m1', 'lunch', 'Lentil bowl', [['lentils', 150], ['rice', 100], ['apple', 90]], { prepMinutes: 25 }),
      meal('m2', 'dinner', 'Roast chicken', [['chicken', 120], ['olive-oil', 10]]),
    ],
  },
  {
    date: '2026-11-03',
    meals: [meal('m3', 'lunch', 'Lentil soup', [['lentils', 150], ['apple', 90]]), meal('add-1', 'snack', 'Apple', [['apple', 180]])],
  },
];

describe('aggregateGrocery', () => {
  it('sums ingredients across days and meals', () => {
    const items = aggregateGrocery(week, FOODS);
    const lentils = items.find((i) => i.foodId === 'lentils');
    expect(lentils?.grams).toBe(300);
    expect(lentils?.qty).toBe('300 g');
    expect(items.find((i) => i.foodId === 'apple')?.grams).toBe(360);
  });

  it('multiplies by household size', () => {
    const items = aggregateGrocery(week, FOODS, 2);
    expect(items.find((i) => i.foodId === 'lentils')?.grams).toBe(600);
    expect(items.find((i) => i.foodId === 'rice')?.grams).toBe(200);
  });

  it('gives a household measure from the first serving', () => {
    const apple = aggregateGrocery(week, FOODS).find((i) => i.foodId === 'apple');
    expect(apple?.hint).toBe('≈ 2 medium'); // 360 g / 180 g
    const lentils = aggregateGrocery(week, FOODS, 1).find((i) => i.foodId === 'lentils');
    expect(lentils?.hint).toBe('≈ 1½ cups'); // 300 g / 200 g
    expect(aggregateGrocery(week, FOODS).find((i) => i.foodId === 'olive-oil')?.hint).toBeUndefined();
  });

  it('groups by aisle, then name, and splits the food name', () => {
    const items = aggregateGrocery(week, FOODS);
    expect(items.map((i) => i.aisle)).toEqual(['Produce', 'Proteins', 'Legumes & grains', 'Legumes & grains', 'Pantry']);
    expect(items.find((i) => i.foodId === 'lentils')).toMatchObject({ name: 'Lentils', detail: 'boiled' });
  });

  it('leaves out meals already eaten, unless asked not to', () => {
    const eaten: KitchenDay[] = [{ date: '2026-11-02', meals: [{ ...week[0].meals[0], eaten: true }] }];
    expect(aggregateGrocery(eaten, FOODS)).toEqual([]);
    expect(aggregateGrocery(eaten, FOODS, 1, { skipEaten: false })).toHaveLength(3);
  });

  it('keeps unknown foods rather than dropping them', () => {
    const items = aggregateGrocery([{ date: '2026-11-02', meals: [meal('x', 'lunch', 'X', [['mystery', 50]])] }], FOODS);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ foodId: 'mystery', aisle: 'Pantry', grams: 50 });
  });
});

describe('householdMeasure', () => {
  it('handles fractions, plural units and tiny amounts', () => {
    expect(householdMeasure(FOODS.get('bread'), 120)).toBe('≈ 3 slices');
    expect(householdMeasure(FOODS.get('rice'), 195)).toBe('≈ 1 cup');
    expect(householdMeasure(FOODS.get('rice'), 20)).toBeUndefined();
    expect(householdMeasure(FOODS.get('chicken'), 100)).toBeUndefined();
  });
});

describe('cookKind', () => {
  it('picks cook-ahead foods', () => {
    expect(cookKind(FOODS.get('lentils'))).toBe('legume');
    expect(cookKind(FOODS.get('dry-lentils'))).toBe('legume');
    expect(cookKind(FOODS.get('rice'))).toBe('grain');
    expect(cookKind(FOODS.get('chicken'))).toBe('protein');
    expect(cookKind(FOODS.get('sweet-potato'))).toBe('other');
  });
  it('skips things you do not cook ahead', () => {
    for (const id of ['apple', 'bread', 'tofu', 'oats', 'salmon-raw', 'olive-oil']) expect(cookKind(FOODS.get(id))).toBeNull();
    expect(cookKind(undefined)).toBeNull();
  });
});

describe('groupPrep', () => {
  it('groups cook-ahead foods with totals and uses', () => {
    const groups = groupPrep(week, FOODS, 2);
    expect(groups.map((g) => g.kind)).toEqual(['grain', 'legume', 'protein']);
    const lentils = groups[1].items[0];
    expect(lentils.grams).toBe(600); // (150 + 150) × 2
    expect(lentils.uses).toEqual([
      { date: '2026-11-02', slot: 'lunch', mealId: 'm1', mealName: 'Lentil bowl', grams: 300 },
      { date: '2026-11-03', slot: 'lunch', mealId: 'm3', mealName: 'Lentil soup', grams: 300 },
    ]);
    expect(groups[0].items[0]).toMatchObject({ name: 'Brown rice', grams: 200 });
    expect(groups[0].tip).toMatch(/refrigerated/);
  });

  it('is empty when there is nothing to cook ahead', () => {
    expect(groupPrep([{ date: '2026-11-02', meals: [meal('a', 'snack', 'Apple', [['apple', 100]])] }], FOODS)).toEqual([]);
  });

  it('merges a food used twice in one meal', () => {
    const d: KitchenDay[] = [{ date: '2026-11-02', meals: [meal('a', 'lunch', 'Bowl', [['rice', 100], ['rice', 50]])] }];
    const rice = groupPrep(d, FOODS)[0].items[0];
    expect(rice.uses).toHaveLength(1);
    expect(rice.grams).toBe(150);
  });
});

describe('splitSteps', () => {
  it('splits on sentence ends', () => {
    expect(splitSteps('Roast the salmon at 200 °C for 12 to 15 minutes. Steam the broccoli! Serve over the quinoa.')).toEqual([
      'Roast the salmon at 200 °C for 12 to 15 minutes.',
      'Steam the broccoli!',
      'Serve over the quinoa.',
    ]);
  });
  it('keeps decimals and lower-case continuations together', () => {
    expect(splitSteps('Add 1.5 cups of stock. Simmer (or bake) until soft; then rest.')).toEqual([
      'Add 1.5 cups of stock.',
      'Simmer (or bake) until soft; then rest.',
    ]);
    expect(splitSteps('Mix well, e.g. with a fork. Done.')).toEqual(['Mix well, e.g. with a fork.', 'Done.']);
  });
  it('handles missing text and one-liners', () => {
    expect(splitSteps(undefined)).toEqual([]);
    expect(splitSteps('   ')).toEqual([]);
    expect(splitSteps('Slice the apple and eat it with the almonds.')).toEqual(['Slice the apple and eat it with the almonds.']);
  });
});

describe('findDurations', () => {
  const secs = (s: string) => findDurations(s).map((d) => d.seconds);
  it('reads minutes, min and hours', () => {
    expect(secs('Simmer for 10 minutes.')).toEqual([600]);
    expect(secs('Bake 20 min until golden.')).toEqual([1200]);
    expect(secs('Chill for 1 hour.')).toEqual([3600]);
    expect(secs('Marinate 2 hours or overnight.')).toEqual([7200]);
    expect(secs('Cook for 30 seconds.')).toEqual([30]);
    expect(secs('Rest 10min.')).toEqual([600]);
  });
  it('uses the lower end of a range', () => {
    expect(secs('Roast at 200 °C for 12 to 15 minutes.')).toEqual([720]);
    expect(secs('Simmer 1-2 hours.')).toEqual([3600]);
    expect(secs('Cook 5–7 min.')).toEqual([300]);
  });
  it('reads halves and words', () => {
    expect(secs('Steep for 1½ hours.')).toEqual([5400]);
    expect(secs('Rest for half an hour.')).toEqual([1800]);
    expect(secs('Leave it for an hour.')).toEqual([3600]);
  });
  it('treats "1 hour 30 minutes" as one timer, and separate steps as two', () => {
    expect(secs('Braise 1 hour 30 minutes.')).toEqual([5400]);
    expect(secs('Braise 1 hour and 15 minutes.')).toEqual([4500]);
    expect(secs('Simmer 10 minutes, then rest 5 minutes.')).toEqual([600, 300]);
  });
  it('ignores amounts that are not times', () => {
    expect(findDurations('Add 2 minced cloves and 200 g of rice.')).toEqual([]);
    expect(findDurations('Let it sit for a few minutes.')).toEqual([]);
    expect(findDurations('Set oven to 180 °C.')).toEqual([]);
  });
  it('labels durations', () => {
    expect(findDurations('Simmer 90 minutes.')[0].label).toBe('1 h 30 min');
    expect(formatDuration(45)).toBe('45 sec');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('time and date helpers', () => {
  it('steps times around the clock', () => {
    expect(stepTime('23:30', 0, 30)).toBe('00:00');
    expect(stepTime('00:00', -1, 0)).toBe('23:00');
    expect(stepTime('08:00', 0, -5)).toBe('07:55');
    expect(formatTime('18:30')).toBe('6:30 pm');
    expect(formatTime('00:05')).toBe('12:05 am');
    expect(formatTime('12:30')).toBe('12:30 pm');
  });
  it('labels days and finds the next weekday', () => {
    expect(dayLabel('2026-11-02', '2026-11-02')).toBe('Today');
    expect(dayLabel('2026-11-03', '2026-11-02')).toBe('Tomorrow');
    expect(dayLabel('2026-11-05', '2026-11-02')).toBe('Thu 5');
    expect(daysUntilWeekday('2026-11-02', 0)).toBe(6); // Mon → Sun
    expect(daysUntilWeekday('2026-11-01', 0)).toBe(0);
  });
});

describe('reminders', () => {
  const settings: ReminderSettings = {
    meals: true,
    mealTimes: { breakfast: '08:00', lunch: '12:30', snack: '15:30', dinner: '18:30' },
    prepEvening: true,
    prepTime: '19:00',
    eveningCheck: true,
    eveningTime: '20:30',
  };
  const days = reminderDays(week, FOODS, 1);
  const sunday = new Date(2026, 10, 1, 9, 0); // Sun 1 Nov, 09:00

  it('finds what to cook ahead for each day', () => {
    expect(days[0].cookAhead).toEqual([
      { name: 'Lentils', grams: 150, meals: ['Lentil bowl'] },
      { name: 'Brown rice', grams: 100, meals: ['Lentil bowl'] },
    ]);
    expect(days[1].cookAhead.map((a) => a.name)).toEqual(['Lentils']);
  });

  it('names real meals at meal times, with prep minutes for a single meal', () => {
    const r = planReminders({ ...settings, prepEvening: false, eveningCheck: false }, days, sunday);
    expect(r.find((x) => x.id === 'eighty-rem-meal-2026-11-02-lunch')?.body).toBe('Lunch: Lentil bowl · 25 min');
    expect(r.find((x) => x.id === 'eighty-rem-meal-2026-11-02-dinner')?.body).toBe('Dinner: Roast chicken');
    expect(r.find((x) => x.id === 'eighty-rem-meal-2026-11-03-snack')?.body).toBe('Snack: Apple');
    expect(r.find((x) => x.id === 'eighty-rem-meal-2026-11-02-lunch')?.at).toEqual(new Date(2026, 10, 2, 12, 30));
    expect(r.some((x) => x.id.includes('breakfast'))).toBe(false); // no breakfast on those days
  });

  it('joins two meals in the same slot', () => {
    const two = reminderDays(
      [{ date: '2026-11-02', meals: [meal('a', 'lunch', 'Soup', [['apple', 10]], { prepMinutes: 5 }), meal('b', 'lunch', 'Salad', [['apple', 10]])] }],
      FOODS,
    );
    expect(planReminders({ ...settings, prepEvening: false, eveningCheck: false }, two, sunday)[0].body).toBe('Lunch: Soup + Salad');
  });

  it('skips past times and eaten meals', () => {
    const late = new Date(2026, 10, 2, 13, 0);
    const r = planReminders({ ...settings, prepEvening: false, eveningCheck: false }, days, late);
    expect(r.some((x) => x.id.endsWith('2026-11-02-lunch'))).toBe(false);
    expect(r.some((x) => x.id.endsWith('2026-11-02-dinner'))).toBe(true);
    const ate = reminderDays([{ date: '2026-11-02', meals: [{ ...week[0].meals[1], eaten: true }] }], FOODS);
    expect(planReminders(settings, ate, sunday).filter((x) => !x.daily)).toEqual([]);
  });

  it('plans the night-before prep note', () => {
    const r = planReminders({ ...settings, meals: false, eveningCheck: false }, days, sunday);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ id: 'eighty-rem-prep-2026-11-02', at: new Date(2026, 10, 1, 19, 0) });
    expect(r[0].body).toBe('Tomorrow: Lentil bowl. Cook 150 g lentils and 100 g brown rice tonight.');
    expect(r[1].body).toBe('Tomorrow: Lentil soup. Cook 150 g lentils tonight.');
  });

  it('adds a generic daily evening check, and nothing when all is off', () => {
    const r = planReminders({ ...settings, meals: false, prepEvening: false }, days, sunday);
    expect(r).toEqual([
      { id: 'eighty-rem-evening', title: 'Your board', body: "See what's left on your board today", daily: { hour: 20, minute: 30 } },
    ]);
    expect(planReminders({ ...settings, meals: false, prepEvening: false, eveningCheck: false }, days, sunday)).toEqual([]);
  });

  it('stays under the iOS pending limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      date: `2026-12-${String(i + 1).padStart(2, '0')}`,
      meals: (['breakfast', 'lunch', 'snack', 'dinner'] as const).map((slot) => ({ slot, name: 'Meal' })),
      cookAhead: [{ name: 'Rice', grams: 100, meals: ['Meal'] }],
    }));
    expect(planReminders(settings, many, sunday).length).toBeLessThanOrEqual(61);
  });
});
