// Shared by the plan-authoring scripts (plan-lab, plan-review, build-plans): loads the app's TypeScript through an
// in-process Vite server, exactly like scripts/check-plan.mjs (tsx and vite-node are not installed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Start the Vite server. `load('/src/engine/x.ts')` gives that module; call `server.close()` when done. */
export async function startApp() {
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
  return { server, load: (p) => server.ssrLoadModule(p) };
}

/** What the engine's family tools need from the catalog (foods, swap groups, everyday ids, a food-id suggester). */
export async function familyDeps(load) {
  return (await load('/src/state/familyDeps.ts')).familyDeps;
}

/** Read a JSON file. Returns { raw } or { error }. */
export function readJson(file) {
  if (!fs.existsSync(file)) return { error: `File not found: ${file}` };
  try {
    return { raw: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: `${file} is not valid JSON: ${e.message}` };
  }
}

export function painter(stream = process.stdout) {
  const on = stream.isTTY;
  const p = (c) => (s) => (on ? `\x1b[${c}m${s}\x1b[0m` : s);
  return { red: p('31'), yellow: p('33'), green: p('32'), dim: p('2'), bold: p('1') };
}
