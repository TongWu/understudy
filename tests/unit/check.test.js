'use strict';
/* The writing checks are the one part of the editor that is pure arithmetic on
   the production, so they get tested here rather than through a browser. Each
   kind gets a script that should trip it and a script that should not — a hint
   that fires on clean prose is worse than no hint, because you stop reading
   them. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function load() {
  delete require.cache[require.resolve('../../viewer/js/00-core.js')];
  delete require.cache[require.resolve('../../viewer/js/11-check.js')];
  globalThis.U = undefined;
  globalThis.document = undefined;      /* U.textOf must take the no-DOM path */
  const U = require('../../viewer/js/00-core.js');
  const check = require('../../viewer/js/11-check.js');
  return { U, check };
}
function sample(U) {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  (0, eval)(require('fs').readFileSync(path.join(__dirname, '../../viewer/js/02-sample.js'), 'utf8'));
  return U.sample();
}

/* n words in one sentence, at 120 words/min so the seconds come out round */
const words = (n) => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');
const talk = (scripts, extra) => Object.assign({
  id: 't', title: 't', target: 600, rate: { en: 120, zh: 200 }, terms: [], runs: [],
  beats: scripts.map((s, i) => ({
    id: 'b' + i, n: '0' + i, title: 'beat ' + i, budget: 600,
    cue: [], script: s, notes: []
  }))
}, extra || {});
const of = (findings, kind) => findings.filter((f) => f.kind === kind);

/* ---------- the pieces the four checks are built from ---------- */

test('plain text and paragraphs come out the same with or without a DOM', () => {
  const { check } = load();
  assert.equal(check.plain('<p>a <b>b</b>&amp;c</p>'), 'a b &c');
  assert.deepEqual(check.paragraphs('<p>one</p> <p>two</p>'), ['one', 'two']);
  assert.deepEqual(check.paragraphs(''), []);
});

test('sentences split on terminal punctuation but not on decimals', () => {
  const { check } = load();
  assert.deepEqual(check.sentences('One here. Two there! Three?'), ['One here.', 'Two there!', 'Three?']);
  assert.equal(check.sentences('It grew 1.5 times in one year.').length, 1);
  assert.equal(check.enWords('two words'), 2);
});

/* ---------- 太长 ---------- */

test('long: one unbreathable sentence is caught, with its own numbers', () => {
  const { check } = load();
  const found = of(check.scan(talk(['<p>' + words(45) + '.</p>'])), 'long');
  assert.equal(found.length, 1);
  assert.equal(found[0].beatIndex, 0);
  assert.match(found[0].message, /45 个词/);
  assert.match(found[0].message, /23 秒/);          /* 45 words at 120/min */
  assert.equal(found[0].where, '00 · 讲稿第 1 段');
});

test('long: the same words as two sayable sentences are left alone', () => {
  const { check } = load();
  const script = '<p>' + words(22) + '. ' + words(23) + '.</p>';
  assert.equal(of(check.scan(talk([script])), 'long').length, 0);
  /* and the threshold itself is a floor, not a ceiling */
  assert.equal(of(check.scan(talk(['<p>' + words(35) + '.</p>'])), 'long').length, 0);
  assert.equal(of(check.scan(talk(['<p>' + words(36) + '.</p>'])), 'long').length, 1);
});

/* ---------- 术语 ---------- */

test('term: fires once, on the first beat that uses it', () => {
  const { check } = load();
  const found = of(check.scan(talk(
    ['<p>nothing here</p>', '<p>we load it into Fieldbase nightly</p>', '<p>Fieldbase again</p>'],
    { terms: [{ term: 'Fieldbase', say: '' }] }
  )), 'term');
  assert.equal(found.length, 1);
  assert.equal(found[0].beatIndex, 1);
  assert.match(found[0].message, /术语表里还没写解释/);
  assert.equal(found[0].fix.action, 'glossary');
});

test('term: a glossary sentence is quoted, and a word never said is not raised', () => {
  const { check } = load();
  const withSay = of(check.scan(talk(['<p>the survey window is set</p>'],
    { terms: [{ term: 'survey window', say: 'the weeks a site can be walked in' }] })), 'term');
  assert.equal(withSay.length, 1);
  assert.match(withSay[0].message, /the weeks a site can be walked in/);
  assert.equal(withSay[0].fix.action, 'locate');

  /* not mentioned at all, and not a substring of a longer word */
  const clean = check.scan(talk(['<p>we ship to FieldbaseX only</p>'], { terms: [{ term: 'Fieldbase', say: '' }] }));
  assert.equal(of(clean, 'term').length, 0);
});

/* ---------- 太书面 ---------- */

test('bookish: two semicolons in one sentence is written, not spoken', () => {
  const { check } = load();
  const found = of(check.scan(talk(
    ['<p>joins are fine; filters ran; the parse worked.</p>'])), 'bookish');
  assert.equal(found.length, 1);
  assert.match(found[0].message, /2 个分号/);
  assert.equal(found[0].where, '00 · 讲稿第 1 段');
});

test('bookish: one semicolon per sentence reads aloud fine', () => {
  const { check } = load();
  const found = of(check.scan(talk(
    ['<p>joins are fine; filters ran. The parse worked; nothing dropped.</p>'])), 'bookish');
  assert.equal(found.length, 0);
});

/* ---------- 超预算 ---------- */

test('over: says how many seconds, and that moving the budget will not help', () => {
  const { check } = load();
  const roomy = of(check.scan(talk(['<p>' + words(60) + '.</p>'])), 'over');
  assert.equal(roomy.length, 0, '600s of budget swallows 30s of script');

  const tight = talk(['<p>' + words(60) + '.</p>']);
  tight.beats[0].budget = 10;
  const over = of(check.scan(tight), 'over');
  assert.equal(over.length, 1);
  assert.match(over[0].message, /超 0:20/);
  assert.match(over[0].message, /只有删词会/);
  assert.equal(over[0].fix.action, 'adopt');
  assert.equal(over[0].where, '00 · 整节');
});

test('over: a beat with room to spare is silent', () => {
  const { check } = load();
  const fits = talk(['<p>' + words(60) + '.</p>']);
  fits.beats[0].budget = 31;                       /* 30s of script */
  assert.equal(of(check.scan(fits), 'over').length, 0);
});

/* ---------- the real production ---------- */

test('scanning the sample talk gives well-formed findings in reading order', () => {
  const { U, check } = load();
  const found = check.scan(sample(U));
  assert.ok(found.length > 0);
  let last = -1;
  found.forEach((f) => {
    assert.ok(['long', 'term', 'bookish', 'over', 'cueload'].includes(f.kind), 'known kind: ' + f.kind);
    assert.equal(typeof f.beatIndex, 'number');
    assert.ok(f.where && f.message && f.fix && f.fix.label, 'every finding says where, what and what to do');
    assert.ok(f.beatIndex >= last, 'findings arrive in running order');
    last = f.beatIndex;
  });
  /* The over-budget findings must be exactly the beats whose script really
     does outrun its budget — computed here rather than hardcoded, so
     recalibrating the speaking rate changes the sample without silently
     changing what this test claims. */
  const p = sample(U);
  const overBeats = p.beats
    .map((b, i) => (U.estimate(b.script, p.rate) > b.budget ? i : -1))
    .filter((i) => i >= 0);
  assert.ok(overBeats.length > 0, 'the sample really does have beats written past their budget');
  assert.deepEqual(of(found, 'over').map((f) => f.beatIndex).sort((a, b) => a - b), overBeats);
  /* and every glossary entry that appears is flagged exactly once */
  const terms = of(found, 'term').map((f) => f.snippet);
  assert.equal(terms.length, new Set(terms).size);
});

test('scan copes with an empty or half-written production', () => {
  const { check } = load();
  assert.deepEqual(check.scan(null), []);
  assert.deepEqual(check.scan({ beats: [] }), []);
  assert.deepEqual(check.scan({ beats: [{ id: 'x', n: '00' }] }), []);
});
