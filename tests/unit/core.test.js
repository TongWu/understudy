'use strict';
const test = require('node:test');
const assert = require('node:assert');
const U = require('../../viewer/js/00-core.js');

test('fmt / fmtSigned / parseTime round-trip the times the product prints', () => {
  assert.equal(U.fmt(745), '12:25');
  assert.equal(U.fmt(45), '0:45');
  assert.equal(U.fmt(-47), '−0:47');
  assert.equal(U.fmtSigned(21), '+0:21');
  assert.equal(U.fmtSigned(-8), '−0:08');
  assert.equal(U.fmtSigned(0), '0:00');
  assert.equal(U.parseTime('12:25'), 745);
  assert.equal(U.parseTime('nope'), null);
});

test('countWords splits the two channels rather than summing them', () => {
  const c = U.countWords('Column Z only accepts Pass or Fail 说慢，重复一次');
  assert.equal(c.en, 7);
  assert.equal(c.zh, 6);
});

test('estimate adds the English and Chinese channels at their own rates', () => {
  // 132 English words at 132 wpm is exactly one minute.
  const words = Array.from({ length: 132 }, (_, i) => 'w' + i).join(' ');
  assert.ok(Math.abs(U.estimate(words, { en: 132, zh: 200 }) - 60) < 0.001);
  // Markup must not be counted as speech.
  assert.equal(U.estimate('<b>one</b> two', { en: 60, zh: 200 }), 2);
});

test('driftAt measures against finished beats only, so it holds still mid-beat', () => {
  const beats = [{ budget: 45 }, { budget: 90 }, { budget: 75 }];
  assert.equal(U.driftAt(100, beats, 1), 55);    // 55s over, one beat done
  assert.equal(U.driftAt(120, beats, 2), -15);   // 15s ahead, two beats done
  assert.equal(U.driftAt(300, beats, 0), 300);   // nothing finished yet
});

test('squeeze protects importance 3, thins 2, and drops 1 whole', () => {
  const beats = [
    { id: 'a', budget: 75, importance: 2 },
    { id: 'b', budget: 60, importance: 3 },
    { id: 'c', budget: 45, importance: 1 },
  ];
  const rows = U.squeeze(beats, 100);
  const by = Object.fromEntries(rows.map(r => [r.beat.id, r]));
  assert.equal(by.c.skip, true, 'the least important beat goes first');
  assert.equal(by.c.to, 0);
  assert.ok(by.b.to >= 54, 'importance 3 gives up at most a tenth');
  assert.equal(rows.reduce((a, r) => a + r.to, 0), 100, 'lands exactly on the time available');
});

test('squeeze is a no-op when there is already enough time', () => {
  const beats = [{ budget: 60, importance: 2 }];
  assert.deepEqual(U.squeeze(beats, 120).map(r => r.to), [60]);
});
