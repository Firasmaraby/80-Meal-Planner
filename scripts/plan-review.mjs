#!/usr/bin/env node
// A compact markdown rendering of a plan family, to read as a hungry person would (or to hand to a reviewing model):
// header, summary, how it works, signature dishes, the week as a grid, each recipe once, per-day numbers.
//
//   node scripts/plan-review.mjs content/families/<id>.json [--size standard]
//
// Exit code: 0 printed, 1 the file is malformed or has no such size. The rendering lives in src/engine/familyReview.ts.
import { familyDeps, readJson, startApp } from './lib/app.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--size');
const size = at >= 0 ? args[at + 1] : 'standard';
const file = args.find((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1));

if (!file || args.includes('--help') || args.includes('-h')) {
  console.error('Usage: node scripts/plan-review.mjs <family.json> [--size light|standard|big|xl]');
  process.exit(file ? 0 : 1);
}
const { raw, error } = readJson(file);
if (error) {
  console.error(error);
  process.exit(1);
}

const { server, load } = await startApp();
let code = 0;
try {
  const [{ validateFamily }, { renderReview }] = await Promise.all([load('/src/engine/family.ts'), load('/src/engine/familyReview.ts')]);
  const deps = await familyDeps(load);
  const { family, issues } = validateFamily(raw, deps.validate);
  if (!family) {
    for (const i of issues.filter((x) => x.level === 'error')) console.error(`ERROR ${i.path || '(file)'}: ${i.message}${i.suggestion ? ` ${i.suggestion}` : ''}`);
    console.error('The file is malformed. Run scripts/plan-lab.mjs for the full report.');
    code = 1;
  } else if (!family.sizes[size]) {
    console.error(`${family.id} has no "${size}" size (it has: ${Object.keys(family.sizes).join(', ')}).`);
    code = 1;
  } else {
    console.log(renderReview(family, size, deps));
  }
} catch (e) {
  console.error(e instanceof Error ? e.stack : e);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);
