'use strict';
/* The recap's arithmetic, away from the DOM. Charts fail as arithmetic far more
   often than as pixels, and arithmetic is the part node can actually check —
   above all that both tracks of the two-track timeline share one px/second. */
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
  run('01-store.js'); run('02-sample.js'); run('03-views.js'); run('05-run.js');
  run('30-rehearsal.js'); run('31-recap.js');
  U.store.put(U.sample());
  /* The clock is monotonic now, so drive it rather than counting callbacks. */
  U._t = 0;
  U.run._now = function () { return U._t; };
  U.advance = function (seconds) { U._t += seconds * 1000; U.run._tick(); };
  return U;
}

const beatsOf = (U) => U.store.production().beats;
const runsOf = (U) => U.store.production().runs;

test('beatRows pairs every beat with what that run actually spent on it', () => {
  const U = load();
  const rows = U.recap.beatRows(runsOf(U)[2], beatsOf(U));
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map(r => r.spent), [41, 96, 78, 94, 171, 88, 72, 62, 44, 46]);
  assert.deepEqual(rows.map(r => r.budget), [45, 90, 75, 90, 150, 75, 60, 70, 45, 45]);
  assert.deepEqual(rows.map(r => r.delta), [-4, 6, 3, 4, 21, 13, 12, -8, -1, 1]);
  assert.deepEqual(rows.filter(r => r.over).map(r => r.n), ['01', '02', '03', '04', '05', '06', '09']);
});

test('beatRows matches on beat id, not on array position', () => {
  const U = load();
  const beats = beatsOf(U);
  const scrambled = { perBeat: [{ beat: 's4', spent: 200 }, { beat: 'open', spent: 30 }] };
  const rows = U.recap.beatRows(scrambled, beats);
  assert.equal(rows[0].spent, 30, 'open kept its own number');
  assert.equal(rows[4].spent, 200, 's4 kept its own number');
  assert.equal(rows[1].ran, false, 'a beat this run never reached reads as not run');
});

test('both tracks of the timeline are drawn at one px/second', () => {
  const U = load();
  const beats = beatsOf(U), run = runsOf(U)[2];
  const tl = U.recap.timeline(run, beats, { width: 1176, target: 720 });
  const G = U.recap.GAP;
  tl.plan.forEach((s, i) => {
    assert.ok(Math.abs((s.w + G) / s.seconds - tl.scale) < 1e-9, 'plan segment ' + i + ' is on scale');
  });
  tl.actual.forEach((s, i) => {
    assert.ok(Math.abs((s.w + G) / s.seconds - tl.scale) < 1e-9, 'actual segment ' + i + ' is on scale');
  });
  // …and the same scale, which is the only reason the two rows can be read against each other.
  const planScale = (tl.plan[4].w + G) / tl.plan[4].seconds;
  const actualScale = (tl.actual[4].w + G) / tl.actual[4].seconds;
  assert.ok(Math.abs(planScale - actualScale) < 1e-9);
});

test('both tracks start at 0 and each segment starts where the last one ended', () => {
  const U = load();
  const beats = beatsOf(U), run = runsOf(U)[2];
  const tl = U.recap.timeline(run, beats, { width: 1176, target: 720 });
  assert.equal(tl.plan[0].x, 0);
  assert.equal(tl.actual[0].x, 0);
  let cum = 0;
  tl.actual.forEach((s) => {
    assert.ok(Math.abs(s.x - cum * tl.scale) < 1e-9, 'segment starts at its own cumulative time');
    cum += s.seconds;
  });
  assert.ok(Math.abs(cum - tl.actualTotal) < 1e-9);
});

test('the scale leaves room for whichever is longest — plan, actual, or the venue slot', () => {
  const U = load();
  const beats = beatsOf(U);
  const long = { perBeat: beats.map(b => ({ beat: b.id, spent: b.budget * 2 })) };
  const short = { perBeat: beats.map(b => ({ beat: b.id, spent: 1 })) };
  assert.equal(U.recap.timeline(long, beats, { width: 1000, target: 720 }).span, 1490);
  assert.equal(U.recap.timeline(short, beats, { width: 1000, target: 720 }).span, 745, 'plan still fits');
  const roomy = U.recap.timeline(short, beats, { width: 1000, target: 5000 });
  assert.equal(roomy.span, 5000, 'the venue line never falls off the right edge');
  assert.ok(roomy.target.x <= roomy.width);
});

test('a beat that overran is split into within-budget and over, and the split adds back up', () => {
  const U = load();
  const beats = beatsOf(U), run = runsOf(U)[2];
  const tl = U.recap.timeline(run, beats, { width: 1176, target: 720 });
  const s4 = tl.actual[4];                       // 150s budget, 171s spent
  assert.ok(s4.over, 'the overrun is its own piece');
  assert.ok(Math.abs(s4.over.w - 21 * tl.scale) < 1e-9, 'the red piece measures the 21 seconds over');
  assert.ok(Math.abs(s4.base.w + U.recap.SPLIT + s4.over.w - s4.w) < 1e-9, 'base + hairline + over = the whole beat');
  assert.equal(tl.actual[0].over, undefined, 'a beat inside its budget has no over piece');
});

test('a one-second overrun still gets a visible sliver rather than a negative one', () => {
  const U = load();
  const beats = beatsOf(U), run = runsOf(U)[2];
  const tl = U.recap.timeline(run, beats, { width: 1176, target: 720 });
  const s9 = tl.actual[9];                       // 45s budget, 46s spent
  assert.ok(s9.over, 'one second over is still over');
  assert.ok(s9.over.w >= 1, 'never a negative or invisible width');
  assert.ok(s9.base.w > 0);
});

test('minute ticks land on the minute and stop at the end of the span', () => {
  const U = load();
  const tl = U.recap.timeline(runsOf(U)[2], beatsOf(U), { width: 1176, target: 720 });
  assert.equal(tl.ticks.length, 14, '0′ through 13′ for a 13:12 span');
  assert.equal(tl.ticks[0].x, 0);
  tl.ticks.forEach(t => assert.ok(Math.abs(t.x - t.minute * 60 * tl.scale) < 1e-9));
  assert.ok(tl.ticks[tl.ticks.length - 1].x <= tl.width);
});

test('only runs at the same difficulty are comparable', () => {
  const U = load();
  const runs = runsOf(U);                        // 照读, 照读, 只看提词
  assert.equal(U.recap.sameDifficulty(runs, 1).length, 2);
  assert.equal(U.recap.sameDifficulty(runs, 2).length, 1);
  assert.equal(U.recap.sameDifficulty(runs, 4).length, 0);
  assert.equal(U.recap.previousSame(runs, runs[1]), runs[0]);
  assert.equal(U.recap.previousSame(runs, runs[2]), null, 'the first 只看提词 has nothing to be compared with');
});

test('with no same-difficulty predecessor the recap refuses to call it an improvement', () => {
  const U = load();
  const runs = runsOf(U);
  const easy = U.recap.comparison(runs, runs[1]);
  assert.equal(easy.comparable, true);
  assert.equal(easy.delta, 831 - 880);

  const harder = U.recap.comparison(runs, runs[2]);
  assert.equal(harder.comparable, false, '792 vs 831 is a different exam, not a faster run');
  assert.equal(harder.delta, 792 - 831, 'the number is still available…');
  assert.match(harder.why, /难度不同/, '…but it comes with why it does not count');

  assert.equal(U.recap.comparison([runs[0]], runs[0]).comparable, false);
  assert.equal(U.recap.comparison([runs[0]], runs[0]).delta, null);
});

test('trend points step evenly and the venue line sits inside the same scale', () => {
  const U = load();
  const tr = U.recap.trend(runsOf(U), { target: 720 });
  assert.equal(tr.points.length, 3);
  assert.deepEqual(tr.points.map(p => p.total), [880, 831, 792]);
  assert.deepEqual(tr.points.map(p => Math.round(p.x)), [34, 134, 234]);
  assert.equal(tr.min, 720, 'the venue slot anchors the bottom of the range');
  assert.equal(tr.max, 880);
  // slowest at the top, fastest below it, venue line below all three
  assert.ok(tr.points[0].y < tr.points[1].y && tr.points[1].y < tr.points[2].y);
  assert.ok(tr.points[2].y < tr.target.y);
  assert.equal(Math.round(tr.points[0].y * 10) / 10, 16.4);
  assert.equal(Math.round(tr.target.y * 10) / 10, 67.6);
  assert.equal(tr.points[2].last, true, 'only the last point gets labelled');
});

test('trend survives a single run and a flat line', () => {
  const U = load();
  const one = U.recap.trend([runsOf(U)[0]], { target: 720 });
  assert.equal(one.points.length, 1);
  assert.equal(one.points[0].x, 34);
  const flat = U.recap.trend([{ n: 1, total: 600 }, { n: 2, total: 600 }], {});
  flat.points.forEach(p => assert.ok(Number.isFinite(p.y)));
});

test('measured pace divides the script actually spoken by the time it actually took', () => {
  const U = load();
  const beats = beatsOf(U);
  const rate = U.recap.measuredRate(runsOf(U)[2], beats);
  assert.ok(rate.en > 60 && rate.en < 260, 'a plausible words-per-minute (' + Math.round(rate.en) + ')');
  assert.equal(rate.seconds, 792);
  // A run that only reached one beat is measured against that one beat alone.
  const partial = { perBeat: [{ beat: 'open', spent: 60 }] };
  const p = U.recap.measuredRate(partial, beats);
  assert.equal(p.seconds, 60);
  assert.equal(p.words, U.countWords(U.textOf(beats[0].script)).en);
  assert.equal(U.recap.measuredRate({ perBeat: [] }, beats), null, 'nothing spoken, nothing to measure');
});

test('the advice keeps the budget total put — moving budget is not cutting time', () => {
  const U = load();
  const beats = beatsOf(U), run = runsOf(U)[2];
  const a = U.recap.advice(run, runsOf(U), beats, 720, { en: 132, zh: 200 });
  const before = beats.reduce((x, b) => x + b.budget, 0);
  const after = a.proposal.reduce((x, v) => x + v, 0);
  assert.ok(Math.abs(after - before) <= 25, 'the proposal is a reshuffle, not a discount');
  assert.equal(a.overTarget, 792 - 720);
  assert.ok(a.cutWords > 0, 'and it says how much script has to go');
  assert.ok(a.moves.some(m => m.n === '04' && m.by > 0), '04 is where the budget has to grow');
});

test('findings name the beat that leaked and notice it leaks every time', () => {
  const U = load();
  const beats = beatsOf(U), runs = runsOf(U);
  const f = U.recap.findings(runs[1], runs, beats);      // 照读, and 照读 ran twice
  assert.ok(f.length);
  assert.match(f[0].title, /^04 超了/);
  assert.match(f[0].title, /同难度的 2 次都超/);
  const clean = U.recap.findings({ difficulty: 1, perBeat: beats.map(b => ({ beat: b.id, spent: b.budget })) }, [], beats);
  assert.match(clean[0].title, /没有超时的节/);
});

test('difficulty names and the ladder they sit on', () => {
  const U = load();
  assert.deepEqual(U.rehearsal.LEVELS.map(l => l.name), ['照读', '只看提词', '冷启动', '有人打断']);
  assert.deepEqual(U.rehearsal.LEVELS.map(l => l.order), ['shown', 'shown', 'hidden', 'hidden']);
  assert.deepEqual(U.rehearsal.LEVELS.map(l => l.script), ['shown', 'key', 'key', 'key']);
  assert.ok(U.rehearsal.LEVELS.every(l => l.cue === 'shown'), 'the cue card never goes away — that is the thing you use on stage');
  assert.equal(U.rehearsal.LEVELS.filter(l => l.interrupt).length, 1);
  assert.equal(U.rehearsal.suggested(runsOf(U)), 3, 'last run was 只看提词, so offer 冷启动 next');
  assert.equal(U.rehearsal.suggested([]), 1);
  assert.equal(U.rehearsal.suggested([{ difficulty: 4 }]), 4, 'the ladder stops at the top');
});

test('the setup screen says out loud when this run will not be comparable', () => {
  const U = load();
  const recent = runsOf(U);
  assert.match(U.rehearsal.stance(3, recent), /比前 3 次都难/);
  assert.match(U.rehearsal.stance(1, recent), /有 2 次同难度/);
  assert.match(U.rehearsal.stance(2, [recent[2]]), /一样是 只看提词/);
  assert.match(U.rehearsal.stance(2, []), /第一次排/);
});

test('overran lists the beats the last run spilled out of', () => {
  const U = load();
  const beats = beatsOf(U);
  assert.deepEqual(U.rehearsal.overran(runsOf(U)[2], beats).map(b => b.n),
    ['01', '02', '03', '04', '05', '06', '09']);
  assert.deepEqual(U.rehearsal.overran(null, beats), []);
});

test('a beat with an empty slot did not happen — it is not a beat you finished early', () => {
  const U = load();
  const beats = beatsOf(U);
  // U.run.start opens a 0-second slot for every beat, so a run that stopped at 02
  // still carries slots for 03…09.
  U.run.start({ mode: 'rehearse', difficulty: 2 });
  U.run.toggle(true);
  U.advance(50);
  U.run.go(1); U.advance(110);
  U.run.go(2); U.advance(70);
  const rec = U.run.finish();

  const rows = U.recap.beatRows(rec, beats);
  assert.equal(rows.filter(r => r.ran).length, 3, 'three beats actually happened');
  assert.equal(rows[3].ran, false, 'the fourth is not "1:30 under budget", it is unvisited');
  assert.equal(U.recap.covered(rec, beats), 3);

  const tl = U.recap.timeline(rec, beats, { width: 1000, target: 720 });
  assert.equal(tl.actual[3].w, 0, 'and it draws nothing rather than a misleading sliver');
  assert.ok(tl.actual[3].empty);
  assert.ok(tl.actual[2].w > 0);

  const f = U.recap.findings(rec, U.store.production().runs, beats);
  assert.match(f[0].title, /只走到 3 节/, 'the recap leads with how far you actually got');
  assert.ok(!f.some(x => /04 比预算快/.test(x.body)), 'and never credits an unvisited beat with being fast');
});

test('a short run is not compared against a full one, even at the same difficulty', () => {
  const U = load();
  const beats = beatsOf(U);
  const full = U.store.production().runs[2];                 // 只看提词, all ten beats
  const short = { n: 4, difficulty: 2, total: 230, perBeat: [{ beat: 'open', spent: 50 }, { beat: 's1', spent: 180 }] };
  const runs = U.store.production().runs.concat([short]);

  assert.equal(U.recap.comparison(runs, short).comparable, true, 'same difficulty alone would let it through');
  const guarded = U.recap.comparison(runs, short, beats);
  assert.equal(guarded.comparable, false, 'but coverage is the second gate');
  assert.match(guarded.why, /只走到 2 节/);
  assert.equal(U.recap.comparison(runs, full, beats).comparable, false, 'the full run still has no same-difficulty peer');
});
