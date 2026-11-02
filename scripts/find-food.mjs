#!/usr/bin/env node
// Find food ids for plan writing: the app's own search over the everyday AND extended tiers, with cook's synonyms.
//
//   node scripts/find-food.mjs <query> [more queries...] [--all]
//   node scripts/find-food.mjs hing dahi "urad dal" gochujang sumac cardamom
//
// Prints the top 8 food groups per query: id, name, tier, kcal and protein per 100 g, and a note. A query is also tried with its synonyms
// (hing = asafoetida, dahi = yogurt, atta = whole wheat flour ...; the table is src/engine/foodSynonyms.ts). --all lists every matching group
// and, under each, the other foods of that group. Quote multi-word queries.
//
// Extended foods are fine in a plan family: the pipeline promotes every food a family uses to the everyday tier on its next build.
// "curated" foods are Eighty composites of existing foods (pipeline/config/custom_foods.json); every value of them is an estimate.
// If nothing fits, say so in your hand-back.
import { painter, startApp } from './lib/app.mjs';

const args = process.argv.slice(2);
const all = args.includes('--all');
const queries = args.filter((a) => !a.startsWith('--'));
if (!queries.length || args.includes('--help') || args.includes('-h')) {
  console.error('Usage: node scripts/find-food.mjs <query> [more queries...] [--all]');
  process.exit(queries.length ? 0 : 1);
}

const t0 = Date.now();
const { server, load } = await startApp();
let code = 0;
try {
  const [{ labSearch }, { findFoods }] = await Promise.all([load('/src/state/labCatalog.ts'), load('/src/engine/foodSynonyms.ts')]);
  const { dim, bold, yellow } = painter();
  const num = (v, d = 0) => (v == null ? '   -' : Number(v).toFixed(d).padStart(5));
  const curated = (f) => f.src?.[0]?.db?.startsWith('Eighty composite');
  const note = (f) => {
    if (curated(f)) return 'curated estimate, every value estimated';
    if (f.tier === 'extended') return 'extended: fine to use, promoted to everyday on the next build';
    return '';
  };
  const line = (f, via, indent = '  ') =>
    `${indent}${f.id}  ${bold(f.name)}  [${f.tier}]  ${num(f.n.kcal)} kcal  ${num(f.n.protein, 1)} g protein` +
    (note(f) ? `  ${f.tier === 'extended' && !curated(f) ? yellow(note(f)) : dim(note(f))}` : '') +
    (via ? dim(`  (via "${via}")`) : '');

  for (const q of queries) {
    const { variants, hits } = findFoods(labSearch, q, { limit: all ? 500 : 8 });
    const tried = variants.slice(1);
    console.log(`\n${bold(`== ${q}`)}${tried.length ? dim(`   (also tried: ${tried.join(', ')})`) : ''}`);
    if (!hits.length) {
      console.log('  nothing found. Try another word, or use the nearest food and list this one as missing in your hand-back.');
      code = 0;
      continue;
    }
    hits.forEach((h, i) => {
      console.log(line(h.food, h.via, `${String(i + 1).padStart(2)}. `));
      if (all) for (const f of h.group.slice(1)) console.log(line(f, undefined, '      '));
      else if (h.group.length > 1) console.log(dim(`      +${h.group.length - 1} more of this kind (--all lists them)`));
    });
  }
  console.log(dim(`\n${queries.length} quer${queries.length === 1 ? 'y' : 'ies'} in ${Date.now() - t0} ms. Per 100 g. Copy the id exactly into the family file.`));
} catch (e) {
  console.error(e instanceof Error ? e.stack : e);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);
