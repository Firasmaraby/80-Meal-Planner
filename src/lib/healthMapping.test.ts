import { describe, expect, it } from 'vitest';

import { NUTRIENTS } from '@/engine/nutrients';
import type { NutrientKey } from '@/engine/types';
import {
  HEALTH_CONNECT_MAP,
  HEALTHKIT_MAP,
  HEALTHKIT_WRITE_TYPES,
  UNMAPPED_NUTRIENTS,
  buildDaySamples,
  convertUnit,
  dayBounds,
  healthConnectFields,
  healthKitQuantities,
  sampleId,
  slotWindow,
  type HealthItem,
} from './healthMapping';

const ALL_KEYS = Object.keys(NUTRIENTS) as NutrientKey[];
const PAST_NOW = new Date(2030, 0, 1); // far after every test date, so windows are not clamped

describe('convertUnit', () => {
  it('converts between mass units and refuses energy', () => {
    expect(convertUnit(1, 'g', 'mg')).toBeCloseTo(1000);
    expect(convertUnit(2500, 'mg', 'g')).toBeCloseTo(2.5);
    expect(convertUnit(1.5, 'mg', 'µg')).toBeCloseTo(1500);
    expect(convertUnit(90, 'µg', 'mg')).toBeCloseTo(0.09);
    expect(convertUnit(2000, 'kcal', 'kcal')).toBe(2000);
    expect(() => convertUnit(1, 'kcal', 'g')).toThrow();
  });
});

describe('mapping tables', () => {
  it('cover every nutrient or list it as unmapped', () => {
    for (const k of ALL_KEYS) {
      const mapped = k in HEALTHKIT_MAP && k in HEALTH_CONNECT_MAP;
      const unmapped = UNMAPPED_NUTRIENTS.includes(k);
      expect(mapped !== unmapped, `${k} must be mapped on both platforms or listed as unmapped`).toBe(true);
    }
  });

  it('every requested vitamin and mineral is present', () => {
    const required: NutrientKey[] = [
      'kcal', 'protein', 'carbs', 'fat', 'satFat', 'mufa', 'pufa', 'fiber', 'sugar', 'sodium',
      'vitA', 'vitC', 'vitD', 'vitE', 'vitK', 'b1', 'b2', 'b3', 'b5', 'b6', 'b7', 'folate', 'b12',
      'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'copper', 'manganese', 'selenium', 'iodine',
    ];
    for (const k of required) {
      expect(HEALTHKIT_MAP[k], `HealthKit ${k}`).toBeDefined();
      expect(HEALTH_CONNECT_MAP[k], `Health Connect ${k}`).toBeDefined();
    }
  });

  it('uses a unique identifier / field per nutrient', () => {
    const hk = Object.values(HEALTHKIT_MAP).map((t) => t.id);
    expect(new Set(hk).size).toBe(hk.length);
    expect(HEALTHKIT_WRITE_TYPES).toEqual(hk);
    const hc = Object.values(HEALTH_CONNECT_MAP).map((t) => t.field);
    expect(new Set(hc).size).toBe(hc.length);
  });

  it('keeps each target unit at the same magnitude as the app unit (no silent unit drift)', () => {
    const hkUnit = { kcal: 'kcal', g: 'g', mg: 'mg', mcg: 'µg' } as const;
    const hcUnit = { kilocalories: 'kcal', grams: 'g', milligrams: 'mg', micrograms: 'µg' } as const;
    for (const k of ALL_KEYS) {
      const hk = HEALTHKIT_MAP[k];
      const hc = HEALTH_CONNECT_MAP[k];
      if (hk) expect(hkUnit[hk.unit], `HealthKit unit for ${k}`).toBe(NUTRIENTS[k].unit);
      if (hc) expect(hcUnit[hc.unit], `Health Connect unit for ${k}`).toBe(NUTRIENTS[k].unit);
    }
  });

  it('maps well-known identifiers correctly', () => {
    expect(HEALTHKIT_MAP.vitC).toEqual({ id: 'HKQuantityTypeIdentifierDietaryVitaminC', unit: 'mg' });
    expect(HEALTHKIT_MAP.vitD).toEqual({ id: 'HKQuantityTypeIdentifierDietaryVitaminD', unit: 'mcg' });
    expect(HEALTHKIT_MAP.b7).toEqual({ id: 'HKQuantityTypeIdentifierDietaryBiotin', unit: 'mcg' });
    expect(HEALTHKIT_MAP.kcal).toEqual({ id: 'HKQuantityTypeIdentifierDietaryEnergyConsumed', unit: 'kcal' });
    expect(HEALTH_CONNECT_MAP.carbs).toEqual({ field: 'totalCarbohydrate', unit: 'grams' });
    expect(HEALTH_CONNECT_MAP.b1).toEqual({ field: 'thiamin', unit: 'milligrams' });
    expect(HEALTH_CONNECT_MAP.vitK).toEqual({ field: 'vitaminK', unit: 'micrograms' });
    expect(HEALTH_CONNECT_MAP.kcal).toEqual({ field: 'energy', unit: 'kilocalories' });
  });
});

describe('slotWindow / dayBounds', () => {
  it('puts each slot at its usual time for past days', () => {
    const w = slotWindow('2026-03-05', 'lunch', PAST_NOW);
    expect(w.start).toEqual(new Date(2026, 2, 5, 12, 30));
    expect(w.end).toEqual(new Date(2026, 2, 5, 12, 45));
  });

  it('pulls a window that would end in the future back to now, never before midnight', () => {
    const now = new Date(2026, 2, 5, 9, 0);
    const w = slotWindow('2026-03-05', 'dinner', now);
    expect(w.end).toEqual(now);
    expect(w.start).toEqual(new Date(2026, 2, 5, 8, 45));
    const justAfterMidnight = new Date(2026, 2, 5, 0, 5);
    const early = slotWindow('2026-03-05', 'dinner', justAfterMidnight);
    expect(early.start.getTime()).toBeGreaterThanOrEqual(new Date(2026, 2, 5).getTime());
    expect(early.end.getTime()).toBeGreaterThan(early.start.getTime());
  });

  it('dayBounds spans exactly the local day', () => {
    const { start, end } = dayBounds('2026-12-31');
    expect(start).toEqual(new Date(2026, 11, 31));
    expect(end).toEqual(new Date(2027, 0, 1));
  });
});

describe('buildDaySamples', () => {
  const items: HealthItem[] = [
    { id: 'a', slot: 'breakfast', nutrients: { kcal: 200, protein: 10, vitC: 15.5, b12: null } },
    { id: 'b', slot: 'breakfast', nutrients: { kcal: 100, protein: 5.25, vitC: 4.5, iron: 1 } },
    { id: 'c', slot: 'dinner', nutrients: { kcal: 600, sodium: 800, choline: 120, epa: 0.1 } },
    { id: 'd', slot: undefined, nutrients: { kcal: 50, fiber: 2 } },
    { id: 'e', slot: null, nutrients: { kcal: 25 } },
  ];

  it('sums items into one sample per slot in a fixed order', () => {
    const samples = buildDaySamples('2026-03-05', items, PAST_NOW);
    expect(samples.map((s) => s.slot)).toEqual(['breakfast', 'dinner', 'extra']);
    const breakfast = samples[0];
    expect(breakfast.id).toBe('eighty:2026-03-05:breakfast');
    expect(breakfast.itemIds).toEqual(['a', 'b']);
    expect(breakfast.values).toEqual({ kcal: 300, protein: 15.25, vitC: 20, iron: 1 });
    expect(samples[2].values).toEqual({ kcal: 75, fiber: 2 });
    expect(samples[2].itemIds).toEqual(['d', 'e']);
  });

  it('never writes missing data as 0, and drops unmapped nutrients', () => {
    const samples = buildDaySamples('2026-03-05', items, PAST_NOW);
    expect('b12' in samples[0].values).toBe(false);
    expect(samples[1].values).toEqual({ kcal: 600, sodium: 800 }); // choline and EPA have no platform type
  });

  it('omits groups with nothing writable and returns [] for an empty day', () => {
    expect(buildDaySamples('2026-03-05', [], PAST_NOW)).toEqual([]);
    expect(buildDaySamples('2026-03-05', [{ id: 'x', slot: 'lunch', nutrients: { choline: 90, kcal: 0, protein: null } }], PAST_NOW)).toEqual([]);
  });

  it('is deterministic: the same input gives the same ids, so a re-sync replaces rather than appends', () => {
    const a = buildDaySamples('2026-03-05', items, PAST_NOW);
    const b = buildDaySamples('2026-03-05', [...items].reverse(), PAST_NOW);
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
    expect(a.map((s) => s.values)).toEqual(b.map((s) => s.values));
    expect(sampleId('2026-03-05', 'snack')).toBe('eighty:2026-03-05:snack');
  });

  it('removes float noise', () => {
    const [s] = buildDaySamples('2026-03-05', [
      { id: '1', slot: 'lunch', nutrients: { vitC: 0.1 } },
      { id: '2', slot: 'lunch', nutrients: { vitC: 0.2 } },
    ], PAST_NOW);
    expect(s.values.vitC).toBe(0.3);
  });
});

describe('platform payloads', () => {
  const [sample] = buildDaySamples(
    '2026-03-05',
    [{ id: 'a', slot: 'lunch', nutrients: { kcal: 520.4, protein: 31, carbs: 40, vitD: 6.2, vitC: 30, b1: 0.4, selenium: 55, sodium: 640, choline: 100 } }],
    PAST_NOW,
  );

  it('builds HealthKit quantities with correct identifiers and units', () => {
    const q = healthKitQuantities(sample);
    const byId = Object.fromEntries(q.map((x) => [x.id, x]));
    expect(byId.HKQuantityTypeIdentifierDietaryEnergyConsumed).toMatchObject({ unit: 'kcal', value: 520.4 });
    expect(byId.HKQuantityTypeIdentifierDietaryProtein).toMatchObject({ unit: 'g', value: 31 });
    expect(byId.HKQuantityTypeIdentifierDietaryVitaminD).toMatchObject({ unit: 'mcg', value: 6.2 });
    expect(byId.HKQuantityTypeIdentifierDietaryVitaminC).toMatchObject({ unit: 'mg', value: 30 });
    expect(byId.HKQuantityTypeIdentifierDietarySelenium).toMatchObject({ unit: 'mcg', value: 55 });
    expect(byId.HKQuantityTypeIdentifierDietarySodium).toMatchObject({ unit: 'mg', value: 640 });
    expect(q).toHaveLength(8); // choline is not written
  });

  it('builds Health Connect NutritionRecord fields with Mass / Energy units', () => {
    const f = healthConnectFields(sample);
    expect(f.energy).toEqual({ value: 520.4, unit: 'kilocalories' });
    expect(f.totalCarbohydrate).toEqual({ value: 40, unit: 'grams' });
    expect(f.vitaminD).toEqual({ value: 6.2, unit: 'micrograms' });
    expect(f.thiamin).toEqual({ value: 0.4, unit: 'milligrams' });
    expect(f.sodium).toEqual({ value: 640, unit: 'milligrams' });
    expect(Object.keys(f)).toHaveLength(8);
  });
});
