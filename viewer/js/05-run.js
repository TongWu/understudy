'use strict';
/* One run of the talk — a rehearsal or the real thing. Shared because both the
   stage screens and the rehearsal screens drive the same clock: whoever owned
   it privately would force the other to keep a second, drifting copy.

   The per-beat spend accrues to whichever beat is showing, which is what makes
   the recap able to say "the time leaked at 04" rather than only "you ran 47
   seconds over". */
U.run = (function () {
  var timer = null;

  function cur() { return U.store.get().run; }
  function beats() { return U.store.beats(); }

  function tick() {
    var r = cur();
    if (!r || !r.running) return;
    U.store.update(function () {
      r.elapsed += 1;
      var slot = r.perBeat[r.beatIndex];
      if (slot) slot.spent += 1;
    });
  }
  /* Wall-clock ticking is a browser concern. Under node the tests drive
     _tick() by hand, and an interval there would just hold the process open. */
  function arm(on) {
    if (typeof window === 'undefined') return;
    if (timer) { clearInterval(timer); timer = null; }
    if (on) timer = setInterval(tick, 1000);
  }

  return {
    /* difficulty: 1 照读 · 2 只看提词 · 3 冷启动 · 4 有人打断 */
    start: function (opts) {
      opts = opts || {};
      var p = U.store.production();
      U.store.update(function (s) {
        s.run = {
          mode: opts.mode || 'rehearse',
          difficulty: opts.difficulty || 1,
          target: opts.target || (p && p.target) || 0,
          recording: !!opts.recording,
          elapsed: 0, running: false, beatIndex: 0, finished: false,
          perBeat: beats().map(function (b) { return { beat: b.id, spent: 0 }; })
        };
        s.ui.beatIndex = 0;
      });
      return cur();
    },
    toggle: function (on) {
      var r = cur(); if (!r) return null;
      U.store.update(function () { r.running = on == null ? !r.running : !!on; });
      arm(r.running);
      return r;
    },
    /* Move to a beat. Keeps run.beatIndex and ui.beatIndex in step so the
       screens and the clock can never disagree about where you are. */
    go: function (index) {
      var r = cur(), n = beats().length;
      var i = Math.max(0, Math.min(n - 1, index));
      U.store.update(function (s) { s.ui.beatIndex = i; if (r) r.beatIndex = i; });
      return i;
    },
    next: function () { return this.go(U.store.get().ui.beatIndex + 1); },
    prev: function () { return this.go(U.store.get().ui.beatIndex - 1); },

    /* Seconds left in the current beat's budget — negative once over. */
    remaining: function () {
      var r = cur(); if (!r) return null;
      var b = beats()[r.beatIndex]; if (!b) return null;
      return (Number(b.budget) || 0) - (r.perBeat[r.beatIndex] || { spent: 0 }).spent;
    },
    /* Ahead (negative) or behind (positive) the plan, recomputed only when a
       beat changes so it does not twitch while you are talking. */
    drift: function () {
      var r = cur(); if (!r) return 0;
      return U.driftAt(r.elapsed, beats(), r.beatIndex);
    },
    /* How far into this beat's script you probably are — what the ↓ key
       lands on. An estimate, and the screen says so. */
    scriptFraction: function () {
      var r = cur(); if (!r) return 0;
      var b = beats()[r.beatIndex]; if (!b || !b.budget) return 0;
      return Math.max(0, Math.min(1, (r.perBeat[r.beatIndex] || { spent: 0 }).spent / b.budget));
    },
    finish: function () {
      var r = cur(); if (!r) return null;
      arm(false);
      var p = U.store.production();
      var record = {
        n: (p.runs || []).length + 1, at: new Date().toISOString().slice(0, 16),
        difficulty: r.difficulty, mode: r.mode,
        perBeat: r.perBeat.map(function (x) { return { beat: x.beat, spent: x.spent }; }),
        total: r.elapsed
      };
      U.store.update(function (s) { (p.runs = p.runs || []).push(record); r.running = false; r.finished = true; });
      return record;
    },
    current: cur,
    /* Tests drive the clock by hand rather than waiting on wall time. */
    _tick: tick
  };
})();
