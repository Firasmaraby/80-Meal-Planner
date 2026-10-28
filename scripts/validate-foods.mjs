#!/usr/bin/env node
// Validates src/data/foods.json (no dependencies).
// Errors (exit 1): duplicate ids, invalid nutrient keys, negative / non-numeric values, fat < satFat + mufa + pufa - 1,
//                  bad category/tag, missing src.
// Warnings: kcal not within ±15% of 4*protein + 4*(carbs-fiber) + 2*fiber + 9*fat.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, '..', 'src', 'data', 'foods.json');
const foods = JSON.parse(fs.readFileSync(file, 'utf8'));

const KEYS = new Set(['kcal','protein','carbs','fiber','sugar','fat','satFat','mufa','pufa','ala','epa','dha','la','vitA','vitC','vitD','vitE','vitK','b1','b2','b3','b5','b6','b7','folate','b12','choline','calcium','iron','magnesium','phosphorus','potassium','zinc','copper','manganese','selenium','iodine','sodium']);
const CATS = new Set(['fruit','vegetable','legume','grain','nut_seed','dairy','egg','meat','poultry','fish','oil_fat','beverage','condiment','sweet','prepared','other']);
const TAGS = new Set(['fatty_fish','leafy_green','whole_grain','plant_iron','fermented','processed']);

const errors = [];
const warns = [];
const seen = new Set();
let nullCounts = {};

for (const f of foods) {
  const id = f.id ?? '(no id)';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push(`${id}: id is not kebab-case`);
  if (seen.has(id)) errors.push(`${id}: duplicate id`);
  seen.add(id);
  if (!f.name) errors.push(`${id}: missing name`);
  if (!CATS.has(f.category)) errors.push(`${id}: bad category ${f.category}`);
  for (const t of f.tags ?? []) if (!TAGS.has(t)) errors.push(`${id}: bad tag ${t}`);
  if (!Array.isArray(f.src) || f.src.length === 0) errors.push(`${id}: missing src`);
  if (f.gi != null && !(f.gi >= 0 && f.gi <= 120)) errors.push(`${id}: gi out of range`);
  for (const s of f.servings ?? []) if (!(s.g > 0) || !s.label) errors.push(`${id}: bad serving ${JSON.stringify(s)}`);
  if (typeof f.rank === 'number' && (f.rank < 0 || f.rank > 100)) errors.push(`${id}: rank out of 0-100`);
  const n = f.n ?? {};
  for (const [k, v] of Object.entries(n)) {
    if (!KEYS.has(k)) { errors.push(`${id}: invalid nutrient key "${k}"`); continue; }
    if (v === null || v === undefined) { nullCounts[k] = (nullCounts[k] || 0) + 1; continue; }
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${id}.${k}: not a number (${v})`);
    else if (v < 0) errors.push(`${id}.${k}: negative (${v})`);
  }
  const g = (k) => (typeof n[k] === 'number' ? n[k] : null);
  // fat >= sat + mufa + pufa - 1 (use whichever parts are present)
  if (g('fat') != null) {
    const parts = (g('satFat') ?? 0) + (g('mufa') ?? 0) + (g('pufa') ?? 0);
    if (g('fat') < parts - 1) errors.push(`${id}: fat ${g('fat')} < satFat+mufa+pufa ${parts.toFixed(2)} - 1`);
  }
  if (g('pufa') != null && g('la') != null && g('ala') != null && g('la') + g('ala') > g('pufa') + 0.5)
    warns.push(`${id}: la+ala (${(g('la') + g('ala')).toFixed(2)}) exceeds pufa (${g('pufa')})`);
  // kcal sanity (Atwater with fiber at 2 kcal/g), warn only
  if (g('kcal') != null && g('protein') != null && g('carbs') != null && g('fat') != null) {
    const fiber = g('fiber') ?? 0;
    const est = 4 * g('protein') + 4 * Math.max(0, g('carbs') - fiber) + 2 * fiber + 9 * g('fat');
    if (est > 5) {
      const dev = (g('kcal') - est) / est;
      if (Math.abs(dev) > 0.15) warns.push(`${id}: kcal ${g('kcal')} vs Atwater estimate ${est.toFixed(0)} (${(dev * 100).toFixed(0)}%)`);
    }
  } else if (g('kcal') != null) {
    warns.push(`${id}: kcal present but protein/carbs/fat incomplete, cannot check energy`);
  }
}

console.log(`${foods.length} foods checked in ${file}`);
if (warns.length) { console.log(`\nWARNINGS (${warns.length}):`); warns.forEach((w) => console.log('  - ' + w)); }
if (errors.length) { console.log(`\nERRORS (${errors.length}):`); errors.forEach((e) => console.log('  - ' + e)); process.exit(1); }
console.log('\nNo errors.');
