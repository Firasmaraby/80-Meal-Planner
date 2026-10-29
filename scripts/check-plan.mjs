#!/usr/bin/env node
// Checks an AI-written (or hand-filled) meal plan against the Eighty framework, exactly like the Plan admin screen.
//
//   node scripts/check-plan.mjs <file.xlsx|file.txt> [--json]
//
//   .xlsx  the Excel template (Plans / Meals / Ingredients sheets)
//   .txt   the AI's answer: three CSV blocks under "=== PLANS ===", "=== MEALS ===", "=== INGREDIENTS ==="
//          (fences, markdown around it and ; delimiters are fine). Any other extension is read as text.
//
// Prints the import issues, a per-plan / per-day table (kcal vs band, protein %, sat fat %, omega 6:3, glycemic
// load, fatty-fish meals, nutrients under 80%) and then the fix-list to paste back to the AI.
// --json prints { issues, reports, fixList } instead.
//
// Exit code: 0 all plans pass, 1 import errors (nothing was graded or some plan was rejected), 2 plans import but need work.
//
// How it runs TypeScript: tsx and vite-node are not installed, so the script starts a tiny in-process Vite server
// (vite ships with vitest) and loads the app's own src/ modules through it. No extra install, no build step.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const json = args.includes('--json');
const file = args.find((a) => !a.startsWith('--'));

if (!file || args.includes('--help') || args.includes('-h')) {
  console.error('Usage: node scripts/check-plan.mjs <file.xlsx|file.txt> [--json]');
  process.exit(file ? 0 : 1);
}
if (!fs.existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'silent',
  appType: 'custom',
  clearScreen: false,
  resolve: { alias: { '@': path.join(root, 'src') } },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});

let code = 0;
try {
  const load = (p) => server.ssrLoadModule(p);
  const [{ parsePlanWorkbook }, { parsePlanText }, { gradePlan, fixListForAI, RULES }, { FOODS, FOOD_INDEX, foodResolver }, { NUTRIENTS }] =
    await Promise.all([
      load('/src/import/planWorkbook.ts'),
      load('/src/import/planText.ts'),
      load('/src/engine/planReport.ts'),
      load('/src/state/catalog.ts'),
      load('/src/engine/nutrients.ts'),
    ]);

  const buf = fs.readFileSync(file);
  const isXlsx = /\.(xlsx|xlsm|xls)$/i.test(file) || (buf[0] === 0x50 && buf[1] === 0x4b); // "PK" = zip
  const { plans, issues } = isXlsx
    ? parsePlanWorkbook(new Uint8Array(buf), foodResolver)
    : parsePlanText(buf.toString('utf8'), foodResolver);

  const reports = plans.map((p) => gradePlan(p, FOOD_INDEX, FOODS));
  const fixList = fixListForAI({ reports, importIssues: issues });
  const errors = issues.filter((i) => i.level === 'error');
  code = errors.length ? 1 : reports.some((r) => !r.pass) ? 2 : 0;

  if (json) {
    console.log(JSON.stringify({ file, issues, reports, fixList, exitCode: code }, null, 2));
  } else {
    const color = process.stdout.isTTY;
    const paint = (c, s) => (color ? `\x1b[${c}m${s}\x1b[0m` : s);
    const red = (s) => paint('31', s);
    const yellow = (s) => paint('33', s);
    const green = (s) => paint('32', s);
    const dim = (s) => paint('2', s);
    const bold = (s) => paint('1', s);
    const rule = (s) => console.log(`\n${bold(s)}\n${'─'.repeat(s.length)}`);

    rule(`Import · ${path.basename(file)}`);
    console.log(`${plans.length} plan(s) imported, ${errors.length} error(s), ${issues.length - errors.length} warning(s)`);
    for (const i of issues) {
      const tag = i.level === 'error' ? red('ERROR  ') : yellow('warning');
      console.log(`${tag} ${i.sheet} row ${i.row}: ${i.message}${i.suggestion ? ` ${dim(`→ ${i.suggestion}`)}` : ''}`);
    }

    const pad = (s, n) => String(s).padEnd(n);
    const padL = (s, n) => String(s).padStart(n);
    for (const r of reports) {
      rule(`${r.planName} (${r.planId}) · band ${r.band.min}–${r.band.max} kcal · ${r.pass ? green('PASS') : red('NEEDS WORK')} · fatty fish ${r.fishPerWeek.toFixed(1)}/wk`);
      console.log(dim(`${pad('day', 4)}${padL('kcal', 6)}  ${padL('prot%', 6)}${padL('sat%', 6)}${padL('ω6:3', 7)}${padL('GL', 5)}${padL('fish', 5)}  under 80%`));
      for (const d of r.days) {
        const kcalBad = d.kcal < r.band.min || d.kcal > r.band.max;
        const protBad = d.proteinPctKcal < RULES.proteinMinPctKcal;
        const satBad = d.satFatPct != null && d.satFatPct > RULES.satFatMaxPct;
        const omBad = d.omegaRatio != null && d.omegaRatio > RULES.omegaMaxRatio;
        const glBad = d.glycemicLoad > RULES.glycemicLoadMax;
        const cell = (text, w, bad) => (bad ? red(padL(text, w)) : padL(text, w));
        const under = d.under80.map((u) => `${NUTRIENTS[u.key].short} ${Math.round(u.pct * 100)}%`).join(', ');
        console.log(
          `${pad(d.day, 4)}${cell(Math.round(d.kcal), 6, kcalBad)}  ${cell(d.proteinPctKcal.toFixed(0), 6, protBad)}${cell(d.satFatPct == null ? '—' : d.satFatPct.toFixed(1), 6, satBad)}` +
            `${cell(d.omegaRatio == null ? '—' : `${d.omegaRatio.toFixed(1)}:1`, 7, omBad)}${cell(Math.round(d.glycemicLoad), 5, glBad)}${padL(d.fattyFishMeals, 5)}  ${under || dim('none')}`,
        );
      }
    }

    rule('Fix-list for the AI');
    console.log(fixList);
  }
} catch (e) {
  console.error(e instanceof Error ? e.stack : e);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);
