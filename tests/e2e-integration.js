'use strict';
/* The cross-module pass. Each screen module verifies itself; this one only
   asks what none of them can: do they still hold up together, in every theme
   and density, in the one artefact that actually ships. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'understudy.html');
let failures = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { failures++; console.log('  ✗ FAIL: ' + m); } };

function chromePath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), '.cache', 'ms-playwright')].filter(Boolean);
  for (const base of roots) {
    for (const d of (fs.existsSync(base) ? fs.readdirSync(base) : [])) {
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (d.startsWith('chromium-') && fs.existsSync(p)) return p;
    }
  }
}

(async () => {
  execFileSync('python3', [path.join(ROOT, 'viewer', 'build_template.py')], { stdio: 'pipe' });
  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-proxy-server'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  await page.goto('file://' + OUT);
  await page.waitForFunction(() => window.U && window.U.store, null, { timeout: 8000 });

  const views = await page.evaluate(() => window.U.views.names().sort());
  ok(views.length === 8, 'all eight views registered: ' + views.join(' '));

  /* Every screen, in all four combinations of the two switches. A screen that
     only survives the theme it was drawn in is the failure mode the token
     rule exists to prevent, and it is invisible until something is measured. */
  let bad = [];
  for (const view of views) {
    for (const theme of ['paper', 'night']) {
      for (const density of ['compact', 'roomy']) {
        const r = await page.evaluate(([v, t, d]) => {
          window.U.store.ui({ view: v, theme: t, density: d });
          const app = document.getElementById('app');
          const de = document.documentElement;
          return { kids: app.childElementCount, over: de.scrollWidth - de.clientWidth };
        }, [view, theme, density]);
        if (!r.kids) bad.push(view + '/' + theme + '/' + density + ' 空');
        if (r.over > 1) bad.push(view + '/' + theme + '/' + density + ' 横向溢出 ' + r.over + 'px');
      }
    }
  }
  ok(!bad.length, '8 views × 4 combinations all mount with no sideways scroll' + (bad.length ? ' — ' + bad.slice(0, 4).join('; ') : ''));

  /* The rule the design read-through produced: a key that is bound must be
     printed. Asserted against the registry rather than by reading footers. */
  const keys = await page.evaluate(() => {
    window.U.store.ui({ view: 'prompter' });
    return {
      prompter: window.U.keys.hints('prompter').map(h => h.key),
      unlabelled: window.U.keys.all().filter(b => !b.label).map(b => b.view + ':' + b.key),
      orphan: window.U.keys.all().filter(b => b.label && !window.U.keys.hints(b.view).some(h => h.key === b.key)).length
    };
  });
  ok(String(keys.prompter.sort()) === 'ArrowDown,ArrowLeft,ArrowRight,Space,b,p,q,t',
    'the prompter prints exactly its seven on-stage keys (' + keys.prompter.join(' ') + ')');
  ok(keys.orphan === 0, 'no key is bound with a label that no footer can render');

  /* The arithmetic the whole product rests on, read off the shipped file. */
  const nums = await page.evaluate(() => {
    const U = window.U, p = U.store.production(), t = U.totals(p.beats, p.rate);
    return {
      rate: p.rate.en, budget: t.budget, estimate: Math.round(t.estimate),
      lastRun: p.runs[p.runs.length - 1].total, target: p.target,
      explained: p.terms.filter(x => x.say).length
    };
  });
  ok(nums.rate === 129, 'speaking rate is derived from the runs, not chosen');
  ok(Math.abs(nums.estimate - nums.lastRun) <= 5,
    'the estimate agrees with the last rehearsal (' + nums.estimate + 's vs ' + nums.lastRun + 's)');
  ok(nums.estimate > nums.target, 'and still says the talk does not fit the slot — which is true');
  ok(nums.explained === 3, 'the glossary ships part-written, which is the state the check exists to catch');

  /* Export is only proven by reopening what it wrote. */
  const html = await page.evaluate(() => window.U.io.exportHtml({ returnOnly: true }) || null);
  if (html) {
    const tmp = path.join(os.tmpdir(), 'understudy-roundtrip.html');
    fs.writeFileSync(tmp, html);
    const p2 = await browser.newPage();
    const errs2 = [];
    p2.on('pageerror', e => errs2.push(String(e).slice(0, 120)));
    await p2.goto('file://' + tmp);
    await p2.waitForFunction(() => window.U && window.U.store, null, { timeout: 8000 });
    const back = await p2.evaluate(() => {
      const p = window.U.store.production();
      return { id: p.id, beats: p.beats.length, cue: p.beats.reduce((a, b) => a + b.cue.length, 0) };
    });
    ok(back.id === 'field-survey-workbook' && back.beats === 10 && back.cue === 45 && !errs2.length,
      'an exported copy reopens as the same talk, intact');
    await p2.close();
  } else {
    ok(false, 'exportHtml({returnOnly:true}) gave nothing back to reopen');
  }

  ok(errors.length === 0, 'no page errors across the whole sweep' + (errors.length ? ' — ' + errors[0] : ''));
  await browser.close();
  if (failures) { console.log('\n' + failures + ' failure(s)'); process.exit(1); }
  console.log('\nintegration clean');
})();
