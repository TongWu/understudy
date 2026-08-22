/* Screenshots of the real app running on the bundled sample, for the README.
 *
 * Generated rather than drawn, and from the shipped file over file://, so a
 * screenshot can never show something the product does not do — and it is
 * taken the way the product is actually opened. The faces are embedded, so
 * these are the real ones with no network at all.
 *
 * Run after `npm run build`:  node tools/shots.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');

const SHOTS = [
  ['library',      { view: 'library' },                                     1440, 900, '后台'],
  ['editor',       { view: 'editor', beatIndex: 4 },                        1440, 980, '编辑器 · 纸'],
  ['editor-night', { view: 'editor', beatIndex: 4, theme: 'night' },        1440, 980, '编辑器 · 夜'],
  ['prompter',     { view: 'prompter', beatIndex: 4 },                      1440, 810, '提词卡'],
  ['drawer',       { view: 'prompter', beatIndex: 4 },                      1440, 810, '弹药库', 'q'],
  ['recap',        { view: 'recap' },                                       1440, 980, '排练复盘'],
];

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
  await page.goto('file://' + path.join(ROOT, 'dist', 'understudy.html'));
  await page.waitForFunction(() => window.U && window.U.store, null, { timeout: 8000 });
  await page.evaluate((u) => {
    if (u.view === 'prompter' || u.view === 'presenter') window.U.run.start({ mode: 'live' });
    window.U.store.ui(u);
    if (u.beatIndex != null && window.U.run.current()) window.U.run.go(u.beatIndex);
  }, ui);
  if (key) await page.keyboard.press(key);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('  ' + name + '.png  ' + label);
  await page.close();
}
await browser.close();
