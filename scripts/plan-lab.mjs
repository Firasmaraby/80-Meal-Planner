#!/usr/bin/env node
// The author's loop for a plan family: validates the file, compiles every size, and grades it at both edges of every
// calorie band it claims (framework gates, the style's gates, cooking-sense and writing checks).
//
//   node scripts/plan-lab.mjs content/families/<id>.json [--json]
//
// Prints each size and edge with one line per day (kcal, protein %, sat fat %, omega 6:3, glycemic load, fibre and the
// nutrients under 80%), then the failures with their fix hints.
// --json prints { formatIssues, sizes, failures, fixList, exitCode } instead.
//
// Exit code: 0 everything passes, 1 the file is malformed (nothing was graded), 2 it is well formed but fails a gate.
// The rules live in src/engine/familyLab.ts, family.ts and planStyles.ts; this script only loads the file and prints.
import path from 'node:path';

import { familyDeps, painter, readJson, startApp } from './lib/app.mjs';

const args = process.argv.slice(2);
const json = args.includes('--json');
const file = args.find((a) => !a.startsWith('--'));

if (!file || args.includes('--help') || args.includes('-h')) {
  console.error('Usage: node scripts/plan-lab.mjs <family.json> [--json]');
  process.exit(file ? 0 : 1);
}
const { raw, error } = readJson(file);
if (error) {
  console.error(error);
  process.exit(1);
}

const t0 = Date.now();
const { server, load } = await startApp();
let code = 1;
try {
  const [{ runLab }, { NUTRIENTS }, { SIZE_LABEL }, { PLAN_STYLES }] = await Promise.all([
    load('/src/engine/familyLab.ts'),
    load('/src/engine/nutrients.ts'),
    load('/src/engine/family.ts'),
    load('/src/engine/planStyles.ts'),
  ]);
  const result = runLab(raw, await familyDeps(load));
  code = result.exitCode;

  if (json) {
    const { family, ...rest } = result;
    console.log(JSON.stringify({ file, family: family?.id, ...rest }, null, 2));
  } else {
    const { red, yellow, green, dim, bold } = painter();
    const rule = (s) => console.log(`\n${bold(s)}\n${'─'.repeat(s.length)}`);
    const pad = (s, n) => String(s).padEnd(n);
    const padL = (s, n) => String(s).padStart(n);

    rule(`Format · ${path.basename(file)}`);
    const errors = result.formatIssues.filter((i) => i.level === 'error');
    console.log(`${errors.length} error(s), ${result.formatIssues.length - errors.length} warning(s)`);
    for (const i of result.formatIssues) {
      const tag = i.level === 'error' ? red('ERROR  ') : yellow('warning');
      console.log(`${tag} ${i.path || '(file)'}: ${i.message}${i.suggestion ? ` ${dim(`-> ${i.suggestion}`)}` : ''}`);
    }

    for (const s of result.sizes) {
      const name = result.family.name;
      rule(`${name} · ${SIZE_LABEL[s.size]} · ${s.kcal} kcal · covers ${s.covers.join(', ')} · week as written averages ${Math.round(s.baseKcal)} kcal`);
      for (const e of s.edges) {
        const bad = new Set(e.failures.filter((f) => f.day != null).map((f) => `${f.day}`));
        console.log(dim(`\n${e.kcal} kcal (${e.labels.join(', ')}) · graded for ${e.panel}`));
        console.log(dim(`${pad('day', 4)}${padL('kcal', 6)}  ${padL('prot%', 6)}${padL('sat%', 6)}${padL('ω6:3', 7)}${padL('GL', 5)}${padL('fibre', 6)}  under 80%`));
        for (const d of e.days) {
          const under = d.under80.map((u) => `${NUTRIENTS[u.key].short} ${Math.round(u.pct * 100)}%${u.hard ? '*' : ''}`).join(', ');
          const line =
            `${pad(d.day, 4)}${padL(Math.round(d.kcal), 6)}  ${padL(d.proteinPct.toFixed(0), 6)}${padL(d.satPct == null ? '-' : d.satPct.toFixed(1), 6)}` +
            `${padL(d.omega == null ? '-' : `${d.omega.toFixed(1)}:1`, 7)}${padL(Math.round(d.gl), 5)}${padL(Math.round(d.fibre), 6)}  ${under || dim('none')}`;
          console.log(bad.has(`${d.day}`) ? red(line) : line);
        }
      }
    }
    console.log(dim('\n* hard to reach from food (vitamin D, iodine, biotin): reported, never a failure'));

    rule(`Failures${result.failures.length ? ` (${result.failures.length})` : ''}`);
    if (!result.failures.length && code !== 1) console.log(green('None. Every gate passes.'));
    const where = (f) => [f.size ? `${f.size}${f.kcal ? ` @${f.kcal}` : ''}` : 'file', f.kind].join(' ');
    for (const f of result.failures) {
      console.log(`${red('FAIL')} [${where(f)}] ${f.message}${f.fix ? dim(` Fix: ${f.fix}`) : ''}`);
    }
    if (code === 0) console.log(`\n${green('PASS')} ${PLAN_STYLES[result.family.style].label} family "${result.family.id}" in ${Date.now() - t0} ms.`);
    else if (code === 2) console.log(`\n${red('NEEDS WORK')} ${result.failures.length} failure(s) in ${Date.now() - t0} ms.`);
    else console.log(`\n${red('MALFORMED')} fix the format errors first; nothing was graded.`);
  }
} catch (e) {
  console.error(e instanceof Error ? e.stack : e);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);
