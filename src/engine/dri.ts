/**
 * Dietary Reference Intakes (US/Canada; Institute of Medicine / National Academies),
 * as summarised by the NIH Office of Dietary Supplements fact sheets.
 * Potassium and sodium use the 2019 NASEM update.
 *
 * Supports ages 14+. Values are RDA where one exists, otherwise AI.
 * ULs are only listed where they apply to total intake from food; ULs that
 * apply to supplements/fortificants only (magnesium, niacin, folic acid) are omitted
 * so we never warn about food sources.
 */
import type { LifeStage, NutrientKey, Profile, Sex } from './types';

type Row10 = [number, number, number, number, number, number, number, number, number, number];
type Row3 = [number, number, number];

interface DriRow {
  kind: 'rda' | 'ai';
  // [M14-18, M19-30, M31-50, M51-70, M71+, F14-18, F19-30, F31-50, F51-70, F71+]
  v: Row10;
  // pregnancy / lactation by [14-18, 19-30, 31-50]
  preg: Row3;
  lact: Row3;
  // UL by age group [14-18, 19-50, 51-70, 71+]; same for both sexes
  ul?: [number, number, number, number];
}

const same5 = (x: number): [number, number, number, number, number] => [x, x, x, x, x];
const row = (m: number[], f: number[]) => [...m, ...f] as Row10;

export const DRI: Partial<Record<NutrientKey, DriRow>> = {
  vitA: { kind: 'rda', v: row(same5(900), same5(700)), preg: [750, 770, 770], lact: [1200, 1300, 1300], ul: [2800, 3000, 3000, 3000] },
  vitC: { kind: 'rda', v: row([75, 90, 90, 90, 90], [65, 75, 75, 75, 75]), preg: [80, 85, 85], lact: [115, 120, 120], ul: [1800, 2000, 2000, 2000] },
  vitD: { kind: 'rda', v: row([15, 15, 15, 15, 20], [15, 15, 15, 15, 20]), preg: [15, 15, 15], lact: [15, 15, 15], ul: [100, 100, 100, 100] },
  vitE: { kind: 'rda', v: row(same5(15), same5(15)), preg: [15, 15, 15], lact: [19, 19, 19], ul: [800, 1000, 1000, 1000] },
  vitK: { kind: 'ai', v: row([75, 120, 120, 120, 120], [75, 90, 90, 90, 90]), preg: [75, 90, 90], lact: [75, 90, 90] },
  b1: { kind: 'rda', v: row(same5(1.2), [1.0, 1.1, 1.1, 1.1, 1.1]), preg: [1.4, 1.4, 1.4], lact: [1.4, 1.4, 1.4] },
  b2: { kind: 'rda', v: row(same5(1.3), [1.0, 1.1, 1.1, 1.1, 1.1]), preg: [1.4, 1.4, 1.4], lact: [1.6, 1.6, 1.6] },
  b3: { kind: 'rda', v: row(same5(16), same5(14)), preg: [18, 18, 18], lact: [17, 17, 17] },
  b5: { kind: 'ai', v: row(same5(5), same5(5)), preg: [6, 6, 6], lact: [7, 7, 7] },
  b6: { kind: 'rda', v: row([1.3, 1.3, 1.3, 1.7, 1.7], [1.2, 1.3, 1.3, 1.5, 1.5]), preg: [1.9, 1.9, 1.9], lact: [2.0, 2.0, 2.0], ul: [80, 100, 100, 100] },
  b7: { kind: 'ai', v: row([25, 30, 30, 30, 30], [25, 30, 30, 30, 30]), preg: [30, 30, 30], lact: [35, 35, 35] },
  folate: { kind: 'rda', v: row(same5(400), same5(400)), preg: [600, 600, 600], lact: [500, 500, 500] },
  b12: { kind: 'rda', v: row(same5(2.4), same5(2.4)), preg: [2.6, 2.6, 2.6], lact: [2.8, 2.8, 2.8] },
  choline: { kind: 'ai', v: row(same5(550), [400, 425, 425, 425, 425]), preg: [450, 450, 450], lact: [550, 550, 550], ul: [3000, 3500, 3500, 3500] },

  calcium: { kind: 'rda', v: row([1300, 1000, 1000, 1000, 1200], [1300, 1000, 1000, 1200, 1200]), preg: [1300, 1000, 1000], lact: [1300, 1000, 1000], ul: [3000, 2500, 2000, 2000] },
  iron: { kind: 'rda', v: row([11, 8, 8, 8, 8], [15, 18, 18, 8, 8]), preg: [27, 27, 27], lact: [10, 9, 9], ul: [45, 45, 45, 45] },
  magnesium: { kind: 'rda', v: row([410, 400, 420, 420, 420], [360, 310, 320, 320, 320]), preg: [400, 350, 360], lact: [360, 310, 320] },
  phosphorus: { kind: 'rda', v: row([1250, 700, 700, 700, 700], [1250, 700, 700, 700, 700]), preg: [1250, 700, 700], lact: [1250, 700, 700], ul: [4000, 4000, 4000, 3000] },
  potassium: { kind: 'ai', v: row([3000, 3400, 3400, 3400, 3400], [2300, 2600, 2600, 2600, 2600]), preg: [2600, 2900, 2900], lact: [2500, 2800, 2800] },
  zinc: { kind: 'rda', v: row(same5(11), [9, 8, 8, 8, 8]), preg: [12, 11, 11], lact: [13, 12, 12], ul: [34, 40, 40, 40] },
  copper: { kind: 'rda', v: row([0.89, 0.9, 0.9, 0.9, 0.9], [0.89, 0.9, 0.9, 0.9, 0.9]), preg: [1.0, 1.0, 1.0], lact: [1.3, 1.3, 1.3], ul: [8, 10, 10, 10] },
  manganese: { kind: 'ai', v: row([2.2, 2.3, 2.3, 2.3, 2.3], [1.6, 1.8, 1.8, 1.8, 1.8]), preg: [2.0, 2.0, 2.0], lact: [2.6, 2.6, 2.6], ul: [9, 11, 11, 11] },
  selenium: { kind: 'rda', v: row(same5(55), same5(55)), preg: [60, 60, 60], lact: [70, 70, 70], ul: [400, 400, 400, 400] },
  iodine: { kind: 'rda', v: row(same5(150), same5(150)), preg: [220, 220, 220], lact: [290, 290, 290], ul: [900, 1100, 1100, 1100] },
  fiber: { kind: 'ai', v: row([38, 38, 38, 30, 30], [26, 25, 25, 21, 21]), preg: [28, 28, 28], lact: [29, 29, 29] },
  ala: { kind: 'ai', v: row(same5(1.6), same5(1.1)), preg: [1.4, 1.4, 1.4], lact: [1.3, 1.3, 1.3] },
  la: { kind: 'ai', v: row([16, 17, 17, 14, 14], [11, 12, 12, 11, 11]), preg: [13, 13, 13], lact: [13, 13, 13] },
};

/** Chronic-disease risk reduction intake for sodium (NASEM 2019): reduce if above. */
export const SODIUM_LIMIT_MG = 2300;

function ageIndex(age: number): number {
  if (age < 19) return 0;
  if (age < 31) return 1;
  if (age < 51) return 2;
  if (age < 71) return 3;
  return 4;
}

function ulIndex(age: number): number {
  if (age < 19) return 0;
  if (age < 51) return 1;
  if (age < 71) return 2;
  return 3;
}

export interface Requirement {
  rda: number; // the full RDA/AI
  kind: 'rda' | 'ai';
  ul?: number;
}

export function requirement(
  key: NutrientKey,
  p: Pick<Profile, 'sex' | 'age' | 'lifeStage'>,
): Requirement | undefined {
  const r = DRI[key];
  if (!r) return undefined;
  const age = Math.max(14, p.age);
  const ai = ageIndex(age);
  let rda: number;
  if (p.sex === 'female' && p.lifeStage !== 'none') {
    const i = Math.min(ai, 2);
    rda = (p.lifeStage === 'pregnant' ? r.preg : r.lact)[i];
  } else {
    rda = r.v[ai + (p.sex === 'female' ? 5 : 0)];
  }
  return { rda, kind: r.kind, ul: r.ul?.[ulIndex(age)] };
}

export function requirementsFor(
  keys: NutrientKey[],
  p: { sex: Sex; age: number; lifeStage: LifeStage },
): Partial<Record<NutrientKey, Requirement>> {
  const out: Partial<Record<NutrientKey, Requirement>> = {};
  for (const k of keys) {
    const r = requirement(k, p);
    if (r) out[k] = r;
  }
  return out;
}
