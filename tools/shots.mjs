/* Screenshots of the real app running on the bundled sample, for the README.
 *
 * They are generated rather than drawn, and from the shipped file rather than
 * from the sources, so a screenshot can never show something the product does
 * not do. Run after `npm run build`.
 *
 * Fonts: the app links Google Fonts, which a sandbox or an offline machine
 * will not fetch — the shots then show fallback faces. If a local cache is
 * present (FONT_CACHE, a directory holding fonts.css plus the woff2 files) it
 * is used instead. Embedding the faces into the product would make this moot
 * and fix offline use at the same time; see CONTRACT.md §6.
 *
 * Run: node tools/shots.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const FONTS = process.env.FONT_CACHE || '/tmp/preview';

const SHOTS = [
  ['library',   { view: 'library' },                          1440, 900,  '后台'],
  ['editor',    { view: 'editor', beatIndex: 4 },             1440, 980,  '编辑器 · 纸'],
  ['editor-night', { view: 'editor', beatIndex: 4, theme: 'night' }, 1440, 980, '编辑器 · 夜'],
  ['prompter',  { view: 'prompter', beatIndex: 4 },           1440, 810,  '提词卡'],
  ['drawer',    { view: 'prompter', beatIndex: 4 },           1440, 810,  '弹药库', 'q'],
  ['recap',     { view: 'recap' },                            1440, 980,  '排练复盘'],
];

const MIME = { '.html': 'text/html', '.css': 'text/css', '.woff2': 'font/woff2' };

const built = fs.readFileSync(path.join(ROOT, 'dist', 'understudy.html'), 'utf8');
const hasFonts = fs.existsSync(path.join(FONTS, 'fonts.css'));
const page0 = hasFonts
  ? built.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/,
      '<link rel="stylesheet" href="fonts.css">')
  : built;
if (!hasFonts) console.log('no local font cache at ' + FONTS + ' — shots will use fallback faces');

/* Serve from the font cache so the page and the woff2 files share an origin. */
const root = hasFonts ? FONTS : os.tmpdir();
fs.writeFileSync(path.join(root, '__understudy-shot.html'), page0);
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port + '/__understudy-shot.html';

function chromePath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  for (const b of [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), '.cache', 'ms-playwright')].filter(Boolean)) {
    for (const d of (fs.existsSync(b) ? fs.readdirSync(b) : [])) {
      const p = path.join(b, d, 'chrome-linux', 'chrome');
      if (d.startsWith('chromium-') && fs.existsSync(p)) return p;
    }
  }
}

const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-proxy-server'] });
fs.mkdirSync(OUT, { recursive: true });
for (const [name, ui, w, h, label, key] of SHOTS) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto(base);
  await page.waitForFunction(() => window.U && window.U.store, null, { timeout: 8000 });
  await page.evaluate((u) => {
    if (u.view === 'prompter' || u.view === 'presenter') window.U.run.start({ mode: 'live' });
    window.U.store.ui(u);
    if (u.beatIndex != null && window.U.run.current()) window.U.run.go(u.beatIndex);
  }, ui);
  if (key) await page.keyboard.press(key);
  try { await page.evaluate(() => document.fonts.ready); } catch {}
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('  ' + name + '.png  ' + label);
  await page.close();
}
await browser.close();
server.close();
fs.rmSync(path.join(root, '__understudy-shot.html'), { force: true });
