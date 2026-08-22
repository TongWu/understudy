'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function load() {
  delete require.cache[require.resolve('../../viewer/js/00-core.js')];
  globalThis.U = undefined;
  const U = require('../../viewer/js/00-core.js');
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.document = undefined;
  require('fs').readFileSync;
  const run = (f) => (0, eval)(require('fs').readFileSync(path.join(__dirname, '../../viewer/js', f), 'utf8'));
  run('01-store.js'); run('02-sample.js'); run('05-run.js');
  U.store.put(U.sample());
  /* The clock is monotonic now, so the tests own it outright rather than
     counting callbacks — which is also the only way to reproduce a throttled
     tab, the case that made counting wrong in the first place. */
  U._t = 0;
  U.run._now = function () { return U._t; };
  U.advance = function (seconds) { U._t += seconds * 1000; U.run._tick(); };
  return U;
}

test('a run accrues spend to the beat that is showing', () => {
  const U = load();
  U.run.start({ mode: 'rehearse', difficulty: 3 });
  U.run.toggle(true);
  U.advance(10);
  U.run.go(1);
  U.advance(4);
  const r = U.run.current();
  assert.equal(r.elapsed, 14);
  assert.equal(r.perBeat[0].spent, 10);
  assert.equal(r.perBeat[1].spent, 4);
});

/* Between two callbacks there is up to half a second of unattributed time,
   and both boundaries land inside that gap. Time is moved without ticking
   here, which is exactly what a boundary arriving mid-interval looks like. */
test('time between callbacks settles on the beat it was spent on', () => {
  const U = load();
  U.run.start({});
  U.run.toggle(true);
  U.advance(10);
  U._t += 3000;                        // three seconds nobody has ticked yet
  U.run.go(1);
  U.advance(4);
  const r = U.run.current();
  assert.equal(r.perBeat[0].spent, 13, 'the three seconds belong to the beat that was showing');
  assert.equal(r.perBeat[1].spent, 4, 'not to the one just walked into');
  assert.equal(r.elapsed, 17);
});

test('pausing keeps what was spent before the pause', () => {
  const U = load();
  U.run.start({});
  U.run.toggle(true);
  U.advance(5);
  U._t += 2000;                        // two more, still unticked
  U.run.toggle(false);
  assert.equal(U.run.current().perBeat[0].spent, 7);
  assert.equal(U.run.current().elapsed, 7);
  U._t += 60000;                       // a long pause changes nothing
  U.run.toggle(true);
  U.advance(3);
  assert.equal(U.run.current().elapsed, 10);
  assert.equal(U.run.current().perBeat[0].spent, 10);
});

/* The clock ticks twice a second on the screen an audience is looking at.
   Serialising every talk in storage — slide images and all — at that rate is
   the one thing that must not happen there; the boundaries do the writing. */
test('the ticking clock does not write to storage; the boundaries do', () => {
  const U = load();
  let writes = 0;
  globalThis.localStorage.setItem = () => { writes++; };
  U.run.start({});
  U.run.toggle(true);
  const after = writes;
  U.advance(1); U.advance(1); U.advance(1);
  assert.equal(writes, after, 'three ticks, no writes');
  assert.equal(U.run.current().elapsed, 3, 'and the clock still moved');
  U.run.go(1);
  assert.ok(writes > after, 'changing beat settles it to storage');
  const atBeat = writes;
  U.advance(2);
  assert.equal(writes, atBeat, 'then quiet again');
  U.run.toggle(false);
  assert.ok(writes > atBeat, 'and so does pausing');
});

test('remaining counts down inside the current beat and goes negative', () => {
  const U = load();
  U.run.start({});                      // beat 00 budget is 45s
  U.run.toggle(true);
  U.advance(45);
  assert.equal(U.run.remaining(), 0);
  U.advance(1);
  assert.equal(U.run.remaining(), -1);
});

test('drift stays put mid-beat and only moves when a beat is finished', () => {
  const U = load();
  U.run.start({});
  U.run.toggle(true);
  U.advance(30);
  assert.equal(U.run.drift(), 30, 'nothing finished yet, so all of it is drift-from-zero');
  U.run.go(1);
  const atStart = U.run.drift();        // 30 elapsed − 45 budgeted for beat 00
  assert.equal(atStart, -15, 'finished beat 00 fifteen seconds early');
  U.advance(5);
  assert.equal(U.run.drift(), -10, 'drift moves with elapsed, not with a re-guess');
});

test('finish appends a run record the recap can read', () => {
  const U = load();
  const before = U.store.production().runs.length;
  U.run.start({ mode: 'rehearse', difficulty: 4 });
  U.run.toggle(true);
  U.advance(12);
  const rec = U.run.finish();
  assert.equal(U.store.production().runs.length, before + 1);
  assert.equal(rec.total, 12);
  assert.equal(rec.difficulty, 4);
  assert.equal(rec.perBeat.length, 10);
});

test('scriptFraction is where the ↓ key lands you', () => {
  const U = load();
  U.run.start({});
  U.run.go(4);                          // beat 04, budget 150s
  U.run.toggle(true);
  U.advance(72);
  assert.ok(Math.abs(U.run.scriptFraction() - 0.48) < 0.005);
});

test('a throttled tab does not lose the time it was throttled for', () => {
  const U = load();
  U.run.start({});
  U.run.go(4);
  U.run.toggle(true);
  /* One callback after ninety seconds of wall time — what a background tab
     actually delivers while the speaker is in their slide software. Counting
     invocations would have recorded one second. */
  U.advance(90);
  assert.equal(U.run.current().elapsed, 90);
  assert.equal(U.run.current().perBeat[4].spent, 90, 'the beat that was showing gets the time');
});

test('pausing does not accrue, and resuming does not backfill the pause', () => {
  const U = load();
  U.run.start({});
  U.run.toggle(true);
  U.advance(10);
  U.run.toggle(false);
  U._t += 300 * 1000;            /* five minutes of coffee */
  U.run.toggle(true);
  U.advance(5);
  assert.equal(U.run.current().elapsed, 15);
});

test('a partial rehearsal cannot wander outside the beats it covers', () => {
  const U = load();
  const beats = U.store.beats();
  U.run.start({});
  U.store.update((s) => { s.run.only = [beats[4].id, beats[5].id]; });
  assert.equal(U.run.allows(4), true);
  assert.equal(U.run.allows(0), false);
  U.run.go(0);
  assert.equal(U.store.get().ui.beatIndex, 4, 'snaps into the rehearsed set rather than including a beat you skipped');
  U.run.go(9);
  assert.equal(U.store.get().ui.beatIndex, 5);
});

test('finishing records the run so the recap has something to read', () => {
  const U = load();
  const before = U.store.production().runs.length;
  U.run.start({ mode: 'rehearse', difficulty: 3 });
  U.run.toggle(true);
  U.advance(42);
  const rec = U.run.finish();
  assert.equal(rec.total, 42);
  assert.equal(U.store.production().runs.length, before + 1);
  assert.equal(U.run.current().finished, true, 'so the recorder knows to stop');
});
