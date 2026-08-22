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
  const offsite = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  page.on('request', r => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) offsite.push(r.url()); });
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
    'the prompter prints exactly its eight on-stage keys (' + keys.prompter.join(' ') + ')');
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
  const html = await page.evaluate(() => window.U.io.exportHtml({ download: false }) || null);
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
    ok(false, 'exportHtml({ download: false }) gave nothing back to reopen');
  }

  /* The 旁批 are the layer the product promises stays yours. Asserted on the
     bytes of both files rather than on the object, because what leaves the
     machine is the file. */
  const notes = await page.evaluate(() => {
    /* Written now rather than taken from the sample, whose text is compiled
       into the application and would be found in any export of anything. */
    const needle = 'ZZ-PRIVATE-NEEDLE-ZZ';
    window.U.store.update(() => {
      const p = window.U.store.production();
      p.beats[0].notes = [needle + '-beat'];
      p.beats[0].cue[0].notes = [needle + '-cue'];
    });
    return {
      working: window.U.io.exportHtml({ download: false }).split(needle).length - 1,
      shared: window.U.io.exportHtml({ download: false, share: true }).includes(needle),
      /* And the export is the app, not a photograph of the screen it was
         taken from: the mounted view must not be serialised with it. */
      screen: /<div id="app"><\/div>/.test(window.U.io.exportHtml({ download: false }))
    };
  });
  ok(notes.working === 2, 'the working copy keeps your 旁批, on the beat and on the cue — it is your backup');
  ok(!notes.shared, 'the copy for somebody else carries neither');
  ok(notes.screen, 'and neither copy bakes in the screen that happened to be open');

  /* Every finding the checker can raise has to arrive as something a person
     can read and act on. A kind the panel does not know about prints its own
     name in latin in an otherwise Chinese screen, and its button does nothing
     — which is exactly how 提词太多 shipped until this assertion existed. */
  const chk = await page.evaluate(() => {
    window.U.store.ui({ view: 'editor' });
    const tab = [...document.querySelectorAll('.u-ed__tab')].find((t) => t.textContent.indexOf('检查') === 0);
    tab.click();
    const kinds = [...new Set(window.U.check.scan(window.U.store.production()).map((f) => f.kind))];
    const labels = [...document.querySelectorAll('.u-chk__top .u-pill')].map((n) => n.textContent);
    return { kinds: kinds, raw: labels.filter((t) => /^[a-z]+$/.test(t)), n: labels.length };
  });
  ok(chk.kinds.length >= 3 && chk.n > 0, 'the sample raises ' + chk.kinds.length + ' kinds of finding to look at');
  ok(chk.raw.length === 0, 'every one of them is labelled in words' + (chk.raw.length ? ' — got ' + chk.raw.join(' ') : ''));

  /* The checker counts paragraphs in markup; the editor holds DOM children.
     A <br> is two of the first and one of the second, and an empty <p> is one
     of the second and none of the first — so the index alone lands on the
     wrong sentence. The flash marks where it actually landed. */
  const landed = await page.evaluate(() => {
    window.U.store.update(() => {
      const b = window.U.store.production().beats[0];
      b.script = '<p>短。<br>' + 'It is a truth universally acknowledged that a sentence of this length, '
        + 'carrying clause after clause after clause, is exactly the kind of thing this check exists to find, '
        + 'and it keeps going well past the point where anyone could say it in one breath.</p>';
    });
    const tab = [...document.querySelectorAll('.u-ed__tab')].find((t) => t.textContent.indexOf('检查') === 0);
    tab.click();
    const long = window.U.check.scan(window.U.store.production()).find((f) => f.kind === 'long');
    if (!long) return { why: 'the crafted paragraph did not trip the length check' };
    const card = [...document.querySelectorAll('.u-chk__item')]
      .find((c) => (c.querySelector('.u-chk__msg') || {}).textContent === long.message);
    if (!card) return { why: 'the finding is not on the panel' };
    card.click();
    const kids = [...document.querySelectorAll('.u-ed__script > *')];
    return {
      paraIndex: long.paraIndex,
      flashed: kids.findIndex((el) => el.getAnimations().length > 0),
      holds: kids.findIndex((el) => el.textContent.includes('universally acknowledged'))
    };
  });
  ok(landed.flashed >= 0 && landed.flashed === landed.holds,
    'the check jumps to the sentence it found, not to a paragraph count that does not line up '
    + '(flashed ' + landed.flashed + ', holds it ' + landed.holds + ', counted ' + landed.paraIndex + ')'
    + (landed.why ? ' — ' + landed.why : ''));

  /* And the button on the one that has no paragraph to jump to. */
  const picked = await page.evaluate(() => {
    const card = [...document.querySelectorAll('.u-chk__item')]
      .find((c) => (c.querySelector('.u-chk__msg') || {}).textContent?.includes('提词'));
    if (!card) return 'no cue-overload finding on screen';
    card.querySelector('.u-chk__acts button').click();
    return document.activeElement.className;
  });
  ok(/u-ed__pick/.test(picked), 'the cue-overload fix puts a mark under the finger (' + picked + ')');

  /* The promise the whole build exists for: one file, no network. Asserted
     two ways, because either alone is weak — the page must not reach for a
     font CDN, and the faces must actually resolve from what is embedded. */
  ok(offsite.length === 0, 'nothing is fetched from a font CDN' + (offsite.length ? ' — ' + offsite[0] : ''));
  const faces = await page.evaluate(async () => {
    const fams = ['Newsreader', 'IBM Plex Sans', 'IBM Plex Mono', 'IBM Plex Sans Condensed', 'Instrument Serif'];
    await Promise.all(fams.map((f) => document.fonts.load('16px "' + f + '"')));
    return fams.filter((f) => document.fonts.check('16px "' + f + '"'));
  });
  ok(faces.length === 5, 'all five families resolve offline (' + faces.length + '/5)');

  ok(errors.length === 0, 'no page errors across the whole sweep' + (errors.length ? ' — ' + errors[0] : ''));
  await browser.close();
  if (failures) { console.log('\n' + failures + ' failure(s)'); process.exit(1); }
  console.log('\nintegration clean');
})();
