#!/usr/bin/env node
/**
 * Turn a web export (`npx expo export --platform web`) into a portable demo
 * that works from any URL path (e.g. a hosted preview page), not just the domain root.
 *
 *   node scripts/make-demo.mjs <export-dir> <out-dir>            folder with relative paths
 *   node scripts/make-demo.mjs <export-dir> <out.html> --single  one self-contained page
 *
 * Needs `asyncRoutes: false` (app.json) so the whole app is a single JS bundle.
 * - asset/script URLs become relative (folder mode) or inlined (single mode)
 * - a boot script resets the router path to "/" so Expo Router opens on its home route
 */
import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const [src, out, flag] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node scripts/make-demo.mjs <export-dir> <out> [--single]');
  process.exit(1);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const resetRoute = `try{history.replaceState(null,'','/')}catch(e){}`;

if (flag === '--single') {
  // inline the entry bundle that index.html loads; lazy chunks (e.g. native-only modules
  // behind a web guard) are never requested on web, so they're left out
  const entry = readFileSync(join(src, 'index.html'), 'utf8').match(/src="\/(_expo\/static\/js\/web\/entry-[^"]+\.js)"/)?.[1];
  if (!entry) throw new Error('no entry bundle in index.html; set asyncRoutes: false');
  const js = [join(src, entry)];
  const MIME = { '.ttf': 'font/ttf', '.png': 'image/png' };
  // embed every asset the bundle references as a data: URI
  const bundle = readFileSync(js[0], 'utf8')
    .replace(/"\/(assets\/[^"]+)"/g, (m, rel) => {
      const p = join(src, rel);
      const mime = MIME[extname(p)];
      return mime ? JSON.stringify(`data:${mime};base64,${readFileSync(p).toString('base64')}`) : m;
    })
    .replaceAll('</script', '<\\/script');
  const css = walk(join(src, '_expo/static/css')).map((f) => readFileSync(f, 'utf8')).join('\n');
  const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Eighty</title>
<meta name="description" content="Eighty: a micronutrient-first meal plan app (interactive demo with sample plans)">
<style>
  :root { --bg: #F6F4EE; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0C110F; color-scheme: dark } }
  :root[data-theme="dark"] { --bg: #0C110F; color-scheme: dark }
  html, body { height: 100%; }
  body { overflow: hidden; background: var(--bg); }
  #root { display: flex; height: 100%; flex: 1; }
  ${css}
</style>
</head>
<body>
<div id="root"></div>
<script>${resetRoute}</script>
<script>${bundle}</script>
</body>
</html>
`;
  writeFileSync(out, page);
  console.log(`single-page demo: ${out} (${(page.length / 1e6).toFixed(1)} MB)`);
} else {
  rmSync(out, { recursive: true, force: true });
  cpSync(src, out, { recursive: true });
  const boot = `<script>(function(){var b=document.createElement('base');b.href=location.href.replace(/[?#].*$/,'').replace(/[^/]*$/,'');document.head.insertBefore(b,document.head.firstChild);${resetRoute}})();</script>`;
  const html = readFileSync(join(out, 'index.html'), 'utf8')
    .replace('<head>', `<head>\n    ${boot}`)
    .replaceAll('href="/', 'href="./')
    .replaceAll('src="/', 'src="./');
  writeFileSync(join(out, 'index.html'), html);
  let rewritten = 0;
  for (const file of walk(out).filter((f) => f.endsWith('.js') || f.endsWith('.css'))) {
    const code = readFileSync(file, 'utf8');
    const next = code.replaceAll('"/assets/', '"./assets/');
    if (next !== code) {
      writeFileSync(file, next);
      rewritten++;
    }
  }
  console.log(`demo ready in ${out} (${rewritten} bundle file(s) rewritten)`);
}
