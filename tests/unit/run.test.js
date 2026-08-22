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
  return U;
}

test('a run accrues spend to the beat that is showing', () => {
  const U = load();
  U.run.start({ mode: 'rehearse', difficulty: 3 });
  U.run.toggle(true);
  for (let i = 0; i < 10; i++) U.run._tick();
  U.run.go(1);
  for (let i = 0; i < 4; i++) U.run._tick();
  const r = U.run.current();
  assert.equal(r.elapsed, 14);
  assert.equal(r.perBeat[0].spent, 10);
  assert.equal(r.perBeat[1].spent, 4);
});

test('remaining counts down inside the current beat and goes negative', () => {
  const U = load();
  U.run.start({});                      // beat 00 budget is 45s
  U.run.toggle(true);
  for (let i = 0; i < 45; i++) U.run._tick();
  assert.equal(U.run.remaining(), 0);
  U.run._tick();
  assert.equal(U.run.remaining(), -1);
});

test('drift stays put mid-beat and only moves when a beat is finished', () => {
  const U = load();
  U.run.start({});
  U.run.toggle(true);
  for (let i = 0; i < 30; i++) U.run._tick();
  assert.equal(U.run.drift(), 30, 'nothing finished yet, so all of it is drift-from-zero');
  U.run.go(1);
  const atStart = U.run.drift();        // 30 elapsed − 45 budgeted for beat 00
  assert.equal(atStart, -15, 'finished beat 00 fifteen seconds early');
  for (let i = 0; i < 5; i++) U.run._tick();
  assert.equal(U.run.drift(), -10, 'drift moves with elapsed, not with a re-guess');
});

test('finish appends a run record the recap can read', () => {
  const U = load();
  const before = U.store.production().runs.length;
  U.run.start({ mode: 'rehearse', difficulty: 4 });
  U.run.toggle(true);
  for (let i = 0; i < 12; i++) U.run._tick();
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
  for (let i = 0; i < 72; i++) U.run._tick();
  assert.ok(Math.abs(U.run.scriptFraction() - 0.48) < 0.005);
});
