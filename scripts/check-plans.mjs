#!/usr/bin/env node
// Checks the sample meal plans against the Eighty framework (no dependencies).
//   node scripts/check-plans.mjs [plans.json] [foods.json | bundle.json] [swapGroups.json]
//   (default foods: src/data/foods.everyday.json + foods.extended.json, with src/data/legacyIdMap.json for old ids;
//    a plain array of Food objects, e.g. pipeline/config/legacy/foods.json, is accepted too)
// Per plan and day: kcal (vs band), protein, fiber, sat-fat % of kcal, omega-6:3 ratio, and % of an adult-male
// RDA/AI for each micronutrient. Missing (null) food data counts as 0, so every figure is a lower bound for nutrients;
// the omega-6:3 ratio is flagged "~" when a noticeable amount of fat comes from foods that have no linoleic-acid data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'src', 'data');
const plansFile = process.argv[2] || path.join(dataDir, 'plans.json');
const foodsFile = process.argv[3];
const groupsFile = process.argv[4] || path.join(dataDir, 'swapGroups.json');

const plans = JSON.parse(fs.readFileSync(plansFile, 'utf8'));
// compact bundle -> Food (see src/data/loadFoods.ts)
function decodeBundle(b) {
  return b.foods.map((r) => {
    const n = {};
    b.keys.forEach((k, i) => { if (r[11][i] != null) n[k] = r[11][i]; });
    const f = { id: r[0], name: r[1], category: r[2], head: r[3], form: r[4], rank: r[5], n };
    if (r[7].length) f.tags = r[7];
    if (r[12] != null) f.gi = r[12];
    return f;
  });
}
function loadFoods() {
  const list = [];
  const files = foodsFile ? [foodsFile] : [path.join(dataDir, 'foods.everyday.json'), path.join(dataDir, 'foods.extended.json')];
  for (const file of files) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    list.push(...(Array.isArray(j) ? j : decodeBundle(j)));
  }
  const map = new Map(list.map((f) => [f.id, f]));
  if (!foodsFile) {
    const legacy = JSON.parse(fs.readFileSync(path.join(dataDir, 'legacyIdMap.json'), 'utf8'));
    for (const [oldId, newId] of Object.entries(legacy)) if (map.has(newId) && !map.has(oldId)) map.set(oldId, map.get(newId));
  }
  return map;
}
const foods = loadFoods();
const groups = new Map(JSON.parse(fs.readFileSync(groupsFile, 'utf8')).map((g) => [g.key, g]));

// adult male RDA / AI
const RDA = {
  vitA: 900, vitC: 90, vitD: 15, vitE: 15, vitK: 120, b1: 1.2, b2: 1.3, b3: 16, b5: 5, b6: 1.3, folate: 400, b12: 2.4,
  choline: 550, calcium: 1000, iron: 8, magnesium: 420, phosphorus: 700, potassium: 3400, zinc: 11, copper: 0.9,
  manganese: 2.3, selenium: 55, fiber: 38,
  iodine: 150, // extra: shown because it is a stated framework challenge (not in the required list)
};
const LABEL = {
  vitA: 'A', vitC: 'C', vitD: 'D', vitE: 'E', vitK: 'K', b1: 'B1', b2: 'B2', b3: 'B3', b5: 'B5', b6: 'B6', folate: 'B9', b12: 'B12',
  choline: 'Chol', calcium: 'Ca', iron: 'Fe', magnesium: 'Mg', phosphorus: 'P', potassium: 'K+', zinc: 'Zn', copper: 'Cu',
  manganese: 'Mn', selenium: 'Se', fiber: 'Fib', iodine: 'I',
};
const KEYS = Object.keys(RDA);
const WEIGHT_KG = 80;
const pad = (s, w) => String(s).padStart(w);

const problems = [];
let anyFail = false;

function dayTotals(plan, day) {
  const t = { kcal: 0, protein: 0, carbs: 0, fiber: 0, fat: 0, satFat: 0, la: 0, om3: 0, fatNoLa: 0, giCarbs: 0, giSum: 0, carbsAll: 0 };
  for (const k of KEYS) t[k] = 0;
  let fish = 0;
  for (const meal of day.meals) {
    for (const ing of meal.ingredients) {
      const f = foods.get(ing.foodId);
      if (!f) { problems.push(`${plan.name} day ${day.day} ${meal.id}: unknown foodId ${ing.foodId}`); continue; }
      if (ing.swapGroup) {
        const g = groups.get(ing.swapGroup);
        if (!g) problems.push(`${plan.name} ${meal.id}: unknown swapGroup ${ing.swapGroup}`);
        else if (!g.foodIds.includes(ing.foodId)) problems.push(`${plan.name} ${meal.id}: ${ing.foodId} is not in swap group ${ing.swapGroup}`);
      }
      const x = ing.grams / 100;
      const v = (k) => (typeof f.n[k] === 'number' ? f.n[k] * x : 0);
      for (const k of ['kcal', 'protein', 'carbs', 'fiber', 'fat', 'satFat', 'la']) t[k] += v(k);
      t.om3 += v('ala') + v('epa') + v('dha');
      if (typeof f.n.la !== 'number' && typeof f.n.fat === 'number') t.fatNoLa += v('fat');
      for (const k of KEYS) if (k !== 'fiber') t[k] += v(k);
      t.fiber = t.fiber; // already summed above
      const avail = Math.max(0, v('carbs') - v('fiber'));
      t.carbsAll += avail;
      if (typeof f.gi === 'number') { t.giCarbs += avail; t.giSum += avail * f.gi; }
      if (f.tags && f.tags.includes('fatty_fish') && meal.slot !== 'snack') fish += 1;
      else if (f.tags && f.tags.includes('fatty_fish')) fish += 1;
    }
  }
  t.fishItems = fish;
  return t;
}

function fmtRow(label, t) {
  const satPct = t.kcal ? ((t.satFat * 9) / t.kcal) * 100 : 0;
  const ratio = t.om3 > 0 ? t.la / t.om3 : Infinity;
  const approx = t.fatNoLa > 5 ? '~' : ' ';
  const cells = KEYS.map((k) => {
    const pct = (t[k] / RDA[k]) * 100;
    return pad(Math.round(pct) + (pct < 80 ? '-' : ' '), 5);
  }).join('');
  return `${label} ${pad(Math.round(t.kcal), 5)} ${pad(t.protein.toFixed(0), 4)} ${pad((t.protein / WEIGHT_KG).toFixed(2), 5)} ${pad(t.fiber.toFixed(0), 4)} ${pad(satPct.toFixed(1), 5)} ${pad(ratio === Infinity ? 'inf' : ratio.toFixed(1) + approx, 6)}|${cells}`;
}

const header =
  'day  kcal    P  g/kg  fib  sat%  n6:n3 |' + KEYS.map((k) => pad(LABEL[k], 5)).join('');

for (const plan of plans) {
  console.log(`\n== ${plan.name}  (${plan.band.min}-${plan.band.max} kcal; ${plan.tags.join(', ')}; ${plan.cuisine})`);
  console.log(header);
  const days = plan.days.map((d) => ({ d, t: dayTotals(plan, d) }));
  let fishTotal = 0;
  const avg = {};
  for (const { d, t } of days) {
    const inBand = t.kcal >= plan.band.min && t.kcal <= plan.band.max;
    const meals = d.meals.filter((m) => m.slot !== 'snack').length;
    const snacks = d.meals.filter((m) => m.slot === 'snack').length;
    console.log(fmtRow(` D${d.day}`, t) + (inBand ? '' : '  <-- OUT OF BAND') + (meals === 3 && snacks >= 1 && snacks <= 2 ? '' : '  <-- MEAL COUNT'));
    if (!inBand) anyFail = true;
    fishTotal += t.fishItems;
    for (const k of Object.keys(t)) avg[k] = (avg[k] || 0) + t[k] / days.length;
  }
  console.log(fmtRow('avg', avg));
  const per = days.map(({ t }) => KEYS.filter((k) => k !== 'iodine' && (t[k] / RDA[k]) * 100 >= 80).length);
  const required = KEYS.filter((k) => k !== 'iodine').length;
  const giPct = avg.carbsAll ? (avg.giCarbs / avg.carbsAll) * 100 : 0;
  console.log(
    `micros >=80% per day (of ${required}): ${per.join(' / ')} | fatty-fish servings over 3 days: ${fishTotal} | ` +
      `avg GI ${avg.giCarbs ? (avg.giSum / avg.giCarbs).toFixed(0) : 'n/a'} (GI known for ${giPct.toFixed(0)}% of available carbs)`,
  );
  const lowAvg = KEYS.filter((k) => (avg[k] / RDA[k]) * 100 < 80).map((k) => `${LABEL[k]} ${Math.round((avg[k] / RDA[k]) * 100)}%`);
  console.log(`below 80% on average: ${lowAvg.length ? lowAvg.join(', ') : 'none'}`);
  const proteinPerKg = avg.protein / WEIGHT_KG;
  const satAvg = ((avg.satFat * 9) / avg.kcal) * 100;
  const ratioAvg = avg.la / (avg.om3 || 1e-9);
  console.log(`avg protein ${proteinPerKg.toFixed(2)} g/kg (80 kg) | avg sat fat ${satAvg.toFixed(1)}% kcal | avg n6:n3 ${ratioAvg.toFixed(1)}:1`);
}

console.log('\nLegend: cells are % of adult-male RDA/AI; "-" marks <80%. n6:n3 = la/(ala+epa+dha); "~" = >5 g of that day\'s fat comes from foods without linoleic-acid data (ratio understated). Missing food data counts as 0.');
if (problems.length) { console.log('\nPROBLEMS:'); problems.forEach((p) => console.log('  - ' + p)); anyFail = true; }
process.exit(anyFail ? 1 : 0);
