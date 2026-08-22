'use strict';
/* The two parts of import/export that have opinions rather than side effects:
   what the fill validator refuses, and what a talk looks like once it has been
   flattened into text somebody can paste elsewhere. Both are pure, so both are
   tested here rather than through a browser. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

function load() {
  delete require.cache[require.resolve('../../viewer/js/00-core.js')];
  globalThis.U = undefined;
  const U = require('../../viewer/js/00-core.js');
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.document = undefined;
  const run = (f) => (0, eval)(fs.readFileSync(path.join(__dirname, '../../viewer/js', f), 'utf8'));
  run('01-store.js');
  run('42-io.js');
  return U;
}

/* Three beats, a five-minute slot, one of them already written. */
function production() {
  return {
    id: 'fixture', title: '演讲', occasion: '内部培训', date: '2026-09-04T10:00',
    audience: 12, language: { speak: 'en', notes: 'zh' },
    target: 300, rate: { en: 120, zh: 200 },
    beats: [
      {
        id: 'a', n: '00', title: '开场', slideRef: 'slide 1', budget: 100, importance: 2,
        cue: [{ flag: 'SAY', cols: ['A'], lead: '<b>Hello</b> there', say: ['"Say this out loud."'], notes: [] }],
        script: '<p>One two three.</p><p>Four five.</p>',
        notes: ['这里说慢一点']
      },
      { id: 'b', n: '01', title: '正文', slideRef: '', budget: 100, importance: 3, cue: [], script: '', notes: [] },
      { id: 'c', n: '02', title: '收尾', slideRef: '', budget: 100, importance: 1, cue: [], script: '', notes: [] }
    ]
  };
}

/* A reply that satisfies every rule; each test bends exactly one thing. */
function reply(over) {
  const beats = ['00', '01', '02'].map((n, i) => ({
    n, title: '第 ' + i + ' 节', slideRef: 'slide ' + (i + 1), budget: 90,
    cue: [{ flag: 'SAY', cols: [], lead: 'lead ' + i, say: ['say ' + i] }],
    script: '<p>a script for beat ' + i + '</p>',
    notes: ['中文提醒 ' + i]
  }));
  return Object.assign({ beats }, over);
}
const codes = (list) => list.map((e) => e.code);

test('a well-formed reply passes and comes back normalised', () => {
  const U = load();
  const r = U.io.validateFill(JSON.stringify(reply()), production());
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.notices, []);
  assert.equal(r.beats.length, 3);
  assert.equal(r.total, 270);
  assert.equal(r.beats[0].cue[0].flag, 'SAY');
  assert.deepEqual(r.beats[0].cue[0].say, ['say 0']);
  assert.deepEqual(r.beats[2].notes, ['中文提醒 2']);
});

test('an object is accepted as readily as a string', () => {
  const U = load();
  assert.equal(U.io.validateFill(reply(), production()).ok, true);
});

test('the whole AI reply can be pasted, prose and code fence included', () => {
  const U = load();
  const wrapped = '好的，这是你要的台本：\n\n```json\n' + JSON.stringify(reply()) + '\n```\n\n需要我调整吗？';
  const r = U.io.validateFill(wrapped, production());
  assert.equal(r.ok, true);
  assert.equal(r.beats.length, 3);
});

test('rejects something that is not JSON at all', () => {
  const U = load();
  const r = U.io.validateFill('抱歉，我没法完成这个请求。', production());
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r.errors), ['parse']);
});

test('rejects JSON with no beats array', () => {
  const U = load();
  const r = U.io.validateFill('{"sections":[{"title":"x"}]}', production());
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r.errors), ['shape']);
});

test('rejects a reply whose beat count does not match the talk', () => {
  const U = load();
  const short = reply();
  short.beats.pop();
  const r = U.io.validateFill(short, production());
  assert.equal(r.ok, false);
  assert.ok(codes(r.errors).includes('count'));
  assert.ok(/3 节/.test(r.errors[0].text) && /2 节/.test(r.errors[0].text));
});

test('rejects a beat with no cue — the cue is the only thing read on stage', () => {
  const U = load();
  const bad = reply();
  bad.beats[1].cue = [];
  const r = U.io.validateFill(bad, production());
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r.errors), ['cue']);
  assert.ok(/01/.test(r.errors[0].text));
});

test('rejects a beat with no script', () => {
  const U = load();
  const bad = reply();
  bad.beats[2].script = '   ';
  const r = U.io.validateFill(bad, production());
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r.errors), ['script']);
  assert.ok(/02/.test(r.errors[0].text));
});

test('rejects budgets that add up past the venue slot, and says by how much', () => {
  const U = load();
  const fat = reply();
  fat.beats.forEach((b) => { b.budget = 150; });
  const r = U.io.validateFill(fat, production());
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r.errors), ['over']);
  assert.equal(r.total, 450);
  assert.ok(r.errors[0].text.includes('7:30'), r.errors[0].text);   /* 450s */
  assert.ok(r.errors[0].text.includes('5:00'), r.errors[0].text);   /* the 300s slot */
  assert.ok(r.errors[0].text.includes('2:30'), r.errors[0].text);   /* the overshoot */
});

test('a missing budget is estimated from the script and reported, not refused', () => {
  const U = load();
  const p = production();
  const partial = reply();
  delete partial.beats[0].budget;
  partial.beats[1].budget = 0;
  const r = U.io.validateFill(partial, p);
  assert.equal(r.ok, true);
  assert.deepEqual(codes(r.notices), ['budget']);
  assert.ok(/2 节没给 budget/.test(r.notices[0].text));
  assert.ok(/120 词\/分/.test(r.notices[0].text));
  assert.equal(r.beats[0].budget, Math.round(U.estimate(partial.beats[0].script, p.rate)));
  assert.ok(r.beats[0].budget > 0);
});

test('the fill lands on empty beats and leaves written ones alone', () => {
  const U = load();
  const p = production();
  U.store.put(p);
  const r = U.io.validateFill(reply(), p);
  const done = U.io.applyFill(r, p);
  assert.deepEqual(done.kept, ['00']);
  assert.deepEqual(done.filled, ['01', '02']);
  assert.equal(p.beats[0].script, '<p>One two three.</p><p>Four five.</p>');
  assert.equal(p.beats[0].title, '开场');
  assert.equal(p.beats[1].script, '<p>a script for beat 1</p>');
  assert.equal(p.beats[1].budget, 90);
  assert.deepEqual(p.beats[2].notes, ['中文提醒 2']);
});

test('a failed validation fills nothing', () => {
  const U = load();
  const p = production();
  U.store.put(p);
  const bad = reply();
  bad.beats[1].script = '';
  const done = U.io.applyFill(U.io.validateFill(bad, p), p);
  assert.deepEqual(done, { filled: [], kept: [] });
  assert.equal(p.beats[1].script, '');
});

test('plain text carries the talk, beat by beat', () => {
  const U = load();
  const text = U.io.plainText(production());
  const lines = text.split('\n');
  assert.equal(lines[0], '演讲');
  assert.equal(lines[1], '内部培训 · 2026-09-04 10:00 · 场地时间 5:00 · 3 节');
  assert.ok(text.includes('00  开场'));
  assert.ok(text.includes('    slide 1 · 预算 1:40'));
  assert.ok(text.includes('      · [SAY] (A) Hello there'));
  assert.ok(text.includes('        "Say this out loud."'));
  assert.ok(text.includes('    讲稿'));
  /* Paragraphs stay paragraphs — a wall of one line is not a 台本. */
  assert.ok(text.includes('      One two three.\n      Four five.'));
  /* An empty beat prints its heading and nothing it does not have. */
  assert.ok(text.includes('01  正文'));
  assert.equal(text.match(/提词/g).length, 1);
});

test('旁批 never leave the app', () => {
  const U = load();
  assert.ok(!U.io.plainText(production()).includes('这里说慢一点'));
});

test('plainText survives a production with nothing in it', () => {
  const U = load();
  assert.equal(U.io.plainText(null), '');
  const bare = { title: '', beats: [] };
  assert.equal(U.io.plainText(bare), '未命名\n场地时间 0:00 · 0 节\n');
});

/* The AI-fill paste is the one place text from outside becomes markup inside a
   page that holds every talk you have written. */
test('a fill is laundered before it is anything else', () => {
  const U = load();
  const res = U.io.validateFill(JSON.stringify({
    beats: [
      { n: '00', budget: 60, script: '<p>ok</p><img src=x onerror=steal()>',
        cue: [{ lead: '<b>lead</b><svg onload=steal()>', say: ['<span onclick=steal()>line</span>'] }] },
      { n: '01', budget: 60, script: '<p>b</p>', cue: [{ lead: 'l', say: ['s'] }] },
      { n: '02', budget: 60, script: '<p>c</p>', cue: [{ lead: 'l', say: ['s'] }] }
    ]
  }), production());
  const one = res.beats[0];
  assert.equal(one.script, '<p>ok</p>', 'the markup a script is made of survives, the rest does not');
  assert.equal(one.cue[0].lead, '<b>lead</b>');
  assert.equal(one.cue[0].say[0], '<span>line</span>');
  assert.ok(!/onerror|onload|onclick/.test(JSON.stringify(res.beats)), 'no handler anywhere in what was accepted');
});

/* 旁批 are the one thing the product promised would not travel. */
test('the copy for somebody else has no 旁批 in it, and nothing else is missing', () => {
  const U = load();
  const p = production();
  p.beats[0].cue[0].notes = ['别忘了停一拍'];
  const shared = U.io.strip(p);
  assert.equal(shared.beats[0].notes, undefined);
  assert.equal(shared.beats[0].cue[0].notes, undefined);
  assert.ok(!JSON.stringify(shared).includes('这里说慢一点'));
  assert.ok(!JSON.stringify(shared).includes('别忘了停一拍'));
  assert.equal(shared.beats.length, p.beats.length);
  assert.equal(shared.beats[0].script, p.beats[0].script, 'the talk itself is untouched');
  assert.equal(shared.beats[0].cue[0].say[0], p.beats[0].cue[0].say[0]);
  assert.deepEqual(p.beats[0].notes, ['这里说慢一点'], 'and the working copy keeps its own');
});
