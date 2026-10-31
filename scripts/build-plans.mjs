#!/usr/bin/env node
// Compiles the plan families in content/families/*.json (files starting with "_" are skipped) into what ships in the app:
//
//   src/data/recipes.json       every recipe once, with its base ingredients (one serving, Standard size)
//   src/data/libraryPlans.json  one plan per size, each meal as { recipe, slot, g: [grams per ingredient], leftover?, heroes }
//
//   node scripts/build-plans.mjs [family.json ...] [--allow-fail] [--out dir]
//
//   family.json  build only these files (a file starting with "_" is built when named)
//   --allow-fail write a family even though it fails plan-lab; the failures are printed loudly and `covers` keeps only the
//                bands whose two edges pass
//   --out dir    write recipes.json and libraryPlans.json there instead of src/data (used to measure sizes without touching the app)
//
// Each plan stores its carbStyle, its verified covers, a heroes line per meal and the diet tags (vegan, vegetarian, pescatarian,
// gluten-free, dairy-free, nut-free). src/state/catalog.ts expands them into full MealPlans at startup.
//
// Exit code: 0 everything was written, 1 a file is malformed or ids collide, 2 some family was refused or written with failures.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { familyDeps, painter, readJson, root, startApp } from './lib/app.mjs';

const args = process.argv.slice(2);
const allowFail = args.includes('--allow-fail');
const outAt = args.indexOf('--out');
const outDir = outAt >= 0 ? path.resolve(args[outAt + 1]) : path.join(root, 'src', 'data');
const named = args.filter((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1));
const { red, yellow, green, dim, bold } = painter();

if (args.includes('--help') || args.includes('-h')) {
  console.error('Usage: node scripts/build-plans.mjs [family.json ...] [--allow-fail] [--out dir]');
  process.exit(0);
}

const familiesDir = path.join(root, 'content', 'families');
const files = named.length
  ? named
  : fs.existsSync(familiesDir)
    ? fs.readdirSync(familiesDir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => path.join(familiesDir, f))
    : [];

// one plan per line keeps diffs readable; no indentation keeps the file small
const stringify = (items) => (items.length ? `[\n${items.map((x) => JSON.stringify(x)).join(',\n')}\n]\n` : '[]\n');
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const { server, load } = await startApp();
let code = 0;
try {
  const [{ buildFamily, mergeRecipes }] = await Promise.all([load('/src/engine/familyBuild.ts')]);
  const deps = await familyDeps(load);
  const built = [];
  console.log(bold(`Building ${files.length} family file(s)${allowFail ? ' (--allow-fail)' : ''}`));

  for (const file of files) {
    const { raw, error } = readJson(file);
    if (error) {
      console.error(red(`ERROR ${error}`));
      code = Math.max(code, 1);
      continue;
    }
    const b = buildFamily(raw, deps, { allowFail });
    const name = b.id ?? path.basename(file);
    if (b.lab.exitCode === 1) {
      code = Math.max(code, 1);
      console.log(`${red('MALFORMED')} ${name}`);
      for (const i of b.lab.formatIssues.filter((x) => x.level === 'error')) console.log(`  ${i.path || '(file)'}: ${i.message}${i.suggestion ? ` ${i.suggestion}` : ''}`);
      continue;
    }
    if (b.lab.failures.length) {
      code = Math.max(code, 2);
      console.log(`${b.written ? red('WRITTEN WITH FAILURES') : red('REFUSED')} ${name}: ${b.lab.failures.length} plan-lab failure(s)`);
      const shown = b.lab.failures.slice(0, 25);
      for (const f of shown) console.log(red(`  FAIL [${f.size ? `${f.size}${f.kcal ? ` @${f.kcal}` : ''}` : 'file'}] ${f.message}`));
      if (b.lab.failures.length > shown.length) console.log(red(`  ... and ${b.lab.failures.length - shown.length} more (run scripts/plan-lab.mjs for all)`));
    }
    for (const n of b.notes.filter((x) => b.written)) console.log(yellow(`  ${n}`));
    if (!b.written) {
      console.log(dim(`  ${b.notes[0]}`));
      continue;
    }
    console.log(`${green('ok')} ${name}: ${b.plans.length} plan(s) [${b.plans.map((p) => p.size).join(', ')}], ${b.recipes.length} recipe(s)`);
    built.push(b);
  }

  let recipes;
  try {
    recipes = mergeRecipes(built.map((b) => b.recipes));
  } catch (e) {
    console.error(red(`ERROR ${e.message}`));
    process.exit(1);
  }
  const plans = built.flatMap((b) => b.plans);
  const outputs = { 'recipes.json': stringify(recipes), 'libraryPlans.json': stringify(plans) };
  fs.mkdirSync(outDir, { recursive: true });
  const shown = path.relative(root, outDir);
  console.log(`\n${bold('Output')} ${shown.startsWith('..') ? outDir : shown || '.'}`);
  for (const [name, text] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(outDir, name), text);
    console.log(`  ${name.padEnd(20)} ${kb(Buffer.byteLength(text)).padStart(10)}  (${kb(zlib.gzipSync(text).length)} gzipped)`);
  }
  console.log(`  ${plans.length} plan(s), ${recipes.length} recipe(s)${plans.length ? `, about ${kb(Buffer.byteLength(outputs['libraryPlans.json']) / plans.length)} per plan` : ''}`);
} catch (e) {
  console.error(e instanceof Error ? e.stack : e);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);
