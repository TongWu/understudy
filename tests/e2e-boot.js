'use strict';
/* Boots the real shipped artefact the way a user does — a file:// double-click
   — because that path is the product's whole promise and it is where storage
   gets denied, fonts fail to load, and module order actually matters. */
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'understudy.html');
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { failures++; console.log('  ✗ FAIL: ' + msg); } };

function chromePath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const fs = require('fs');
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(require('os').homedir(), '.cache', 'ms-playwright')].filter(Boolean);
  for (const base of roots) {
    for (const d of (fs.existsSync(base) ? fs.readdirSync(base) : [])) {
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (d.startsWith('chromium-') && fs.existsSync(p)) return p;
    }
  }
  return undefined;   /* let playwright-core resolve from its own registry */
}

(async () => {
  execFileSync('python3', [path.join(ROOT, 'viewer', 'build_template.py')], { stdio: 'pipe' });
  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-proxy-server'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + OUT);
  await page.waitForFunction(() => window.U && window.U.store, null, { timeout: 5000 });

  ok(errors.length === 0, 'boots with no page errors' + (errors.length ? ' — ' + errors[0] : ''));

  const probe = await page.evaluate(() => {
    const U = window.U, p = U.store.production();
    const t = U.totals(p.beats, p.rate);
    return {
      version: U.version, beats: p.beats.length, budget: t.budget,
      estimate: Math.round(t.estimate), target: p.target,
      cue: p.beats.reduce((a, b) => a + b.cue.length, 0),
      qa: p.qa.length, terms: p.terms.length, runs: p.runs.map(r => r.total),
      theme: document.body.dataset.theme, density: document.body.dataset.density,
      views: U.views.names().sort(),
    };
  });

  ok(/^\d+\.\d+\.\d+$/.test(probe.version), 'the build stamped a version (' + probe.version + ')');
  ok(probe.beats === 10, 'sample production carries all ten beats');
  ok(probe.budget === 745, 'budgets total 12:25 (' + probe.budget + 's)');
  ok(probe.target === 720, 'venue slot is 12:00');
  ok(probe.cue === 45, 'the sample carries its 45 cue items');
  ok(probe.qa === 9 && probe.terms === 5, 'Q&A and glossary are present');
  ok(String(probe.runs) === '880,831,792', 'three rehearsal runs, getting faster');
  ok(probe.theme === 'paper' && probe.density === 'compact', 'opens on paper / compact');

  const themed = await page.evaluate(() => {
    window.U.store.ui({ theme: 'night', density: 'roomy' });
    return document.body.dataset.theme + '/' + document.body.dataset.density;
  });
  ok(themed === 'night/roomy', 'theme and density switches reach the body');

  const storageSafe = await page.evaluate(() => { try { window.U.store.save(); return true; } catch (e) { return false; } });
  ok(storageSafe, 'saving survives file:// storage being denied');

  console.log('  · registered views: ' + (probe.views.join(', ') || '(none yet)'));
  await browser.close();
  if (failures) { console.log('\n' + failures + ' failure(s)'); process.exit(1); }
  console.log('\nall good');
})();
