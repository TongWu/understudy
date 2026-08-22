'use strict';
/* The parts of the stage that can be checked without a browser: which Q&A
   entry is relevant to the beat you are standing in, where the ↓ key lands,
   and what a re-plan drops on the floor. The screens themselves are driven in
   a real browser against the built file, the way tests/e2e-boot.js does. */
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
  ['01-store.js', '02-sample.js', '03-views.js', '05-run.js',
    '20-prompter.js', '21-drawer.js', '22-panic.js', '23-squeeze.js', '24-presenter.js'].forEach(run);
  U.store.put(U.sample());
  return U;
}

/* ---------------------------------------------------------------- keys */

test('the on-stage keys are bound, labelled, and in footer order', () => {
  const U = load();
  assert.deepEqual(U.keys.hints('prompter'), [
    { key: 'ArrowLeft', label: '换节' }, { key: 'ArrowRight', label: '换节' },
    { key: 'Space', label: '计时' }, { key: 'ArrowDown', label: '看讲稿' },
    { key: 'q', label: '弹药库' }, { key: 't', label: '只剩 N 分钟' },
    { key: 'b', label: '黑屏' }, { key: 'p', label: '切双屏' }
  ]);
});

test('layer keys are declared where their own footer prints them, not on the card', () => {
  const U = load();
  const onCard = U.keys.hints('prompter').map(h => h.key);
  ['/', 'm', 'Escape', 'ArrowUp', 'Enter'].forEach(k =>
    assert.ok(!onCard.includes(k), k + ' must not clutter the prompter footer'));
  assert.deepEqual(U.keys.hints('drawer').map(h => h.key),
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '/', 'm', 'Escape']);
  assert.deepEqual(U.keys.hints('panic').map(h => h.key), ['ArrowUp', 'ArrowDown', 'Escape', 'q']);
  assert.deepEqual(U.keys.hints('reflow').map(h => h.key), ['t', 'Enter', 'Escape']);
  assert.deepEqual(U.keys.hints('presenter').map(h => h.key),
    ['ArrowLeft', 'ArrowRight', 'Space', 'f', 'p']);
  /* every bound key on stage carries a label somewhere — nothing is bound and
     undiscoverable, which is the failure the design read-through caught */
  const labelled = new Set([].concat(...['prompter', 'drawer', 'panic', 'reflow', 'black', 'presenter']
    .map(v => U.keys.hints(v).map(h => h.key))));
  U.keys.all().filter(b => b.view === 'prompter' || b.view === 'presenter')
    .forEach(b => assert.ok(labelled.has(b.key), b.key + ' is bound but never printed'));
});

/* --------------------------------------------------------------- pacing */

test('the pacing readout always carries a word, never colour alone', () => {
  const U = load();
  assert.deepEqual(U.prompter.drift(-35), { word: '快', text: '0:35', tone: 'go' });
  assert.deepEqual(U.prompter.drift(115), { word: '慢', text: '1:55', tone: 'over' });
  assert.deepEqual(U.prompter.drift(12), { word: '慢', text: '0:12', tone: 'tight' });
  assert.deepEqual(U.prompter.drift(0), { word: '准点', text: '0:00', tone: 'go' });
  assert.equal(U.prompter.drift(null).word, '准点');
});

test('the countdown turns amber at fifteen seconds and red past zero', () => {
  const U = load();
  assert.equal(U.prompter.remainTone(60), '');
  assert.equal(U.prompter.remainTone(15), 'is-tight');
  assert.equal(U.prompter.remainTone(-1), 'is-over');
});

test('← → step over beats a re-plan struck out', () => {
  const U = load();
  const beats = U.store.beats();
  beats[5].skipped = true;
  assert.equal(U.prompter.nextIndex(4, 1), 6, 'skips 05 and lands on 06');
  assert.equal(U.prompter.nextBeat(4).n, '06');
  beats[5].skipped = false;
  assert.equal(U.prompter.nextIndex(4, 1), 5);
  assert.equal(U.prompter.nextIndex(9, 1), 9, 'the last beat is the end of the line');
  assert.equal(U.prompter.nextIndex(0, -1), 0);
});

/* -------------------------------------------------------------- 弹药库 */

test('questions about the beat you are standing in sort to the top', () => {
  const U = load();
  const beats = U.store.beats(), qa = U.store.production().qa;
  const rows = U.drawer.rank(qa, beats[4], beats);      /* 04 — columns U–Z */
  assert.match(U.textOf(rows[0].item.q), /repeat-visit column/);
  assert.ok(rows[0].related);
  assert.ok(rows[0].score > rows[rows.length - 1].score);
  /* the closing beat shares almost nothing with the column questions */
  const atClose = U.drawer.rank(qa, beats[9], beats);
  const history = atClose.find(r => /repeat-visit column/.test(U.textOf(r.item.q)));
  assert.ok(!history.related, 'no dot where it is not relevant');
  /* and the ranking is a total order that never loses an entry */
  assert.equal(rows.length, qa.length);
});

test('an explicit tag outranks anything the text happens to share', () => {
  const U = load();
  const beats = U.store.beats();
  const tagged = { q: 'Totally unrelated wording', a: 'Nothing in common at all', tags: ['04'], askedIn: [] };
  const wordy = { q: 'Do I have to fill the repeat-visit column?', a: 'Only where it is blank.', tags: [], askedIn: [] };
  const rows = U.drawer.rank([wordy, tagged], beats[4], beats);
  assert.equal(rows[0].item, tagged);
  assert.ok(U.drawer.relevance(tagged, beats[4], beats) >= 4);
});

/* A column is a word lifted out of whatever the beat happens to say, so it
   can be anything — including something a regular expression reads as syntax. */
test('a column whose name is regex syntax does not take the drawer down', () => {
  const U = load();
  const beat = { id: 'x', n: '00', title: 'count(*)', cue: [{ lead: 'column count(*) 是聚合', say: [], notes: [] }], script: '' };
  assert.doesNotThrow(() => U.drawer.colHit('the column count(*) is an aggregate', 'count(*)'));
  assert.ok(U.drawer.colHit('see column count(*) here', 'count(*)'));
  assert.doesNotThrow(() => U.drawer.rank([{ q: 'what is count(*)', a: 'a count' }], beat, [beat]));
});

test('an answer naming this beat’s column counts as relevant', () => {
  const U = load();
  const beats = U.store.beats();
  const item = { q: 'Where do I put the drift result?', a: 'Column W, next to the history check.', tags: [], askedIn: [] };
  assert.ok(U.drawer.relevance(item, beats[4], beats) >= 3, 'column W belongs to beat 04');
  assert.ok(U.drawer.relevance(item, beats[0], beats) < 3, 'the opening has no columns');
});

test('search filters on both the question and the answer, either language', () => {
  const U = load();
  const beats = U.store.beats(), qa = U.store.production().qa;
  const rows = U.drawer.rank(qa, beats[4], beats);
  assert.equal(U.drawer.search(rows, '').length, qa.length);
  const species = U.drawer.search(rows, 'SPECIES');
  assert.equal(species.length, 2, 'case-insensitive, and the answer counts too');
  species.forEach(r => assert.match(U.drawer.itemText(r.item).toLowerCase(), /species/));
  assert.ok(U.drawer.search(rows, 'designation').length >= 1, 'matches inside the answer');
  assert.equal(U.drawer.search(rows, 'zzz').length, 0);
  const zh = U.drawer.rank([{ q: '这一列谁填？', a: '橙色区是他们填的' }], beats[4], beats);
  assert.equal(U.drawer.search(zh, '橙色').length, 1);
});

test('M writes this room back onto the question, once', () => {
  const U = load();
  const item = U.store.production().qa[0];
  const stamp = U.drawer.stamp(U.store.production(), new Date(2026, 3, 16));
  assert.equal(stamp, '志愿者培训 · 4月16日');
  assert.equal(U.drawer.mark(item, stamp), true);
  assert.equal(U.drawer.mark(item, stamp), false, 'pressing M twice is not two rooms');
  assert.deepEqual(item.askedIn, [stamp]);
  /* and being asked is a tiebreak, so it climbs next time */
  const beats = U.store.beats();
  const pair = [{ q: 'a', a: 'a', askedIn: [] }, { q: 'b', a: 'b', askedIn: ['x', 'y'] }];
  assert.equal(U.drawer.rank(pair, beats[0], beats)[0].item.q, 'b');
});

test('the glossary knows which beat introduces a term', () => {
  const U = load();
  const beats = U.store.beats();
  const found = U.drawer.firstUsedIn({ term: 'Fieldbase' }, beats);
  assert.ok(found && Number(found.n) <= 4);
  assert.equal(U.drawer.firstUsedIn({ term: 'nowhere at all' }, beats), null);
});

/* ------------------------------------------------------------ 卡壳保险 */

test('↓ lands on the paragraph the clock says you are in', () => {
  const U = load();
  const beat = U.store.beats()[4];
  const parts = U.panic.split(beat.script);
  assert.ok(parts.length >= 4, 'a beat this long splits into something worth locating within');
  assert.equal(U.panic.locate(parts, 0, U.store.rate()), 0);
  assert.equal(U.panic.locate(parts, 1, U.store.rate()), parts.length - 1);
  /* 1:12 into a 2:30 beat — the case printed on the screen. Asserted as a
     position rather than a phrase: what matters is that a clock halfway
     through the beat lands somewhere in the middle of the script, whatever
     the script happens to say. */
  const at = U.panic.locate(parts, 72 / 150, U.store.rate());
  assert.ok(at > 0 && at < parts.length - 1, 'halfway through the beat is not the first or last part');
  /* and it never goes backwards as the clock moves forwards */
  let last = -1;
  for (let f = 0; f <= 1.0001; f += 0.05) {
    const i = U.panic.locate(parts, f, U.store.rate());
    assert.ok(i >= last, 'monotonic');
    last = i;
  }
});

test('the estimate weighs paragraphs by how long they take to say', () => {
  const U = load();
  const parts = U.panic.split('<p>' + 'word '.repeat(200) + '</p><p>short one</p>');
  assert.equal(parts.length, 2);
  assert.equal(U.panic.locate(parts, 0.5, U.store.rate()), 0, 'half way is still inside the long one');
  assert.equal(U.panic.split('').length, 0);
  assert.equal(U.panic.locate([], 0.5, U.store.rate()), 0, 'a beat with no script must not throw');
});

/* --------------------------------------------------------- 只剩 N 分钟 */

test('a re-plan cuts by importance and says so in words', () => {
  const U = load();
  const rest = U.store.beats().slice(5);            /* standing on 04 */
  const p = U.reflow.plan(rest, 180);
  assert.equal(p.from, 295);
  assert.ok(p.to <= 185 && p.cut > 0);
  const skipped = p.rows.filter(r => r.skip);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].beat.n, '08', 'the only importance-1 beat goes whole');
  assert.equal(U.reflow.how(skipped[0]), '整节跳过');
  const high = p.rows.find(r => r.beat.importance === 3);
  assert.match(U.reflow.how(high), /几乎不动/);
  assert.equal(U.reflow.importanceWord(high.beat), '高');
  assert.equal(U.reflow.importanceWord({ importance: 1 }), '低');
  /* asked for more time than the plan needs, nothing is cut */
  const roomy = U.reflow.plan(rest, 600);
  assert.equal(roomy.cut, 0);
  assert.equal(roomy.rows.filter(r => r.skip).length, 0);
});

test('连带 — a dropped beat names what is lost and where the line goes back', () => {
  const U = load();
  const rest = U.store.beats().slice(5);
  const hits = U.reflow.knockOn(U.reflow.plan(rest, 180).rows);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].beat.n, '08');
  assert.ok(hits[0].missing.length, 'says what nobody will cover now');
  assert.ok(hits[0].line.length > 10, 'and offers the one line to say instead');
  assert.equal(hits[0].into.n, '09', 'into the first beat that survives after it');
  assert.equal(U.reflow.knockOn(U.reflow.plan(rest, 600).rows).length, 0, 'nothing dropped, nothing to warn about');
});

/* The case the single-drop fixture above cannot tell apart: with two beats
   still standing after the one that goes, the make-up line belongs on the
   next one, not at the end of the talk twenty minutes later. */
test('the make-up line goes onto the next surviving beat, not the final one', () => {
  const U = load();
  const beats = U.store.beats();
  const rows = [
    { beat: beats[2], from: 60, to: 0, skip: true },
    { beat: beats[3], from: 60, to: 60, skip: false },
    { beat: beats[4], from: 60, to: 60, skip: false }
  ];
  assert.equal(U.reflow.knockOn(rows)[0].into.n, beats[3].n);
});

test('the last beat being the dropped one has nowhere to put the line back', () => {
  const U = load();
  const beats = U.store.beats();
  const rows = [
    { beat: beats[8], from: 45, to: 45, skip: false },
    { beat: beats[9], from: 45, to: 0, skip: true }
  ];
  const hit = U.reflow.knockOn(rows)[0];
  assert.equal(hit.into.n, '08', 'falls back to the last surviving beat before it');
});

test('adopting a plan moves the budgets, strikes the beat, and carries the line forward', () => {
  const U = load();
  const beats = U.store.beats();
  const rest = beats.slice(5);
  const p = U.reflow.plan(rest, 180);
  const before = beats[9].cue.length;
  U.reflow.adopt(p.rows);
  assert.equal(beats[8].skipped, true);
  assert.equal(beats[8].budget, 0);
  assert.equal(beats[8].budgetWas, 45);
  assert.equal(beats[9].cue.length, before + 1, 'the make-up line landed on the cue card');
  const added = beats[9].cue[beats[9].cue.length - 1];
  assert.equal(added.madeUpFor, beats[8].id);
  assert.match(added.lead, /补回 08/);
  /* adopting twice must not stack two copies of the same line */
  U.reflow.adopt(U.reflow.plan(beats.slice(5), 180).rows);
  assert.equal(beats[9].cue.filter(c => c.madeUpFor === beats[8].id).length, 1);
});

test('「我自己改」 moves the clock but drops nothing', () => {
  const U = load();
  const beats = U.store.beats();
  U.reflow.adopt(U.reflow.plan(beats.slice(5), 180).rows, { skip: false });
  assert.ok(!beats[8].skipped, 'nothing is struck out');
  assert.ok(beats[8].budget >= 1, 'and no beat is left with no time at all');
  assert.equal(beats[9].cue.filter(c => c.madeUpFor).length, 0, 'no line was added on your behalf');
});

/* ------------------------------------------------------------ 双屏 */

test('the corner line is the first sentence of the next beat, not its title', () => {
  const U = load();
  const beats = U.store.beats();
  assert.equal(U.presenter.firstLine(beats[5]), 'Second sheet: Sample Results.');
  assert.equal(U.presenter.firstLine({ script: '' }), '');
  assert.equal(U.presenter.cueAt(beats[4], 0), 0);
  assert.equal(U.presenter.cueAt(beats[4], 0.99), beats[4].cue.length - 1);
  assert.equal(U.presenter.cueAt({ cue: [] }, 0.5), -1);
});
