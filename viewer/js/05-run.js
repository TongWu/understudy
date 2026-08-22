'use strict';
/* One run of the talk — a rehearsal or the real thing. Shared because both the
   stage screens and the rehearsal screens drive the same clock: whoever owned
   it privately would force the other to keep a second, drifting copy.

   The per-beat spend accrues to whichever beat is showing, which is what makes
   the recap able to say "the time leaked at 04" rather than only "you ran 47
   seconds over". */
U.run = (function () {
  var timer = null;
  /* Swappable so the tests can drive time by hand; nothing else touches it. */
  var now = function () {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  };

  function cur() { return U.store.get().run; }
  function beats() { return U.store.beats(); }

  /* Measured against a monotonic clock rather than counted per callback. A
     background tab is throttled to roughly one callback a minute, and the
     speaker WILL switch to their slide software — counting invocations would
     quietly undercount exactly the number this tool exists to report. Time
     recovered after a stall lands on the beat that was showing, because that
     is the beat it was spent on. */
  function tick() {
    var r = cur();
    if (!r || !r.running) return;
    var secs = Math.max(0, Math.round((api._now() - r.base) / 1000));
    var gained = secs - r.elapsed;
    if (gained <= 0) return;
    U.store.update(function () {
      r.elapsed = secs;
      var slot = r.perBeat[r.beatIndex];
      if (slot) slot.spent += gained;
    });
  }

  /* Which beats this run covers. A partial rehearsal that still let the
     arrows wander into unrehearsed beats would be a full rehearsal that
     happens to start in the middle. */
  function allowedIndexes() {
    var r = cur(), bs = beats();
    var ids = r && r.only;
    if (!ids || !ids.length) return null;
    var out = [];
    bs.forEach(function (b, i) { if (ids.indexOf(b.id) >= 0) out.push(i); });
    return out.length ? out : null;
  }
  /* Wall-clock ticking is a browser concern. Under node the tests drive
     _tick() by hand, and an interval there would just hold the process open. */
  function arm(on) {
    if (typeof window === 'undefined') return;
    if (timer) { clearInterval(timer); timer = null; }
    /* Twice a second: the clock is read, not counted, so a late callback
       costs nothing but a slightly stale countdown. */
    if (on) timer = setInterval(tick, 500);
  }

  var api = {
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
          elapsed: 0, running: false, beatIndex: 0, finished: false, base: 0,
          perBeat: beats().map(function (b) { return { beat: b.id, spent: 0 }; })
        };
        s.ui.beatIndex = 0;
      });
      return cur();
    },
    toggle: function (on) {
      var r = cur(); if (!r) return null;
      var want = on == null ? !r.running : !!on;
      U.store.update(function () {
        /* Re-anchor on resume so a pause does not count as elapsed time. */
        if (want && !r.running) r.base = api._now() - r.elapsed * 1000;
        r.running = want;
      });
      arm(r.running);
      return r;
    },
    /* True when this beat is part of the run. Navigation consults it. */
    allows: function (index) {
      var allowed = allowedIndexes();
      return !allowed || allowed.indexOf(index) >= 0;
    },
    allowed: allowedIndexes,
    /* Move to a beat. Keeps run.beatIndex and ui.beatIndex in step so the
       screens and the clock can never disagree about where you are. */
    go: function (index) {
      var r = cur(), n = beats().length;
      var i = Math.max(0, Math.min(n - 1, index));
      var allowed = allowedIndexes();
      if (allowed && allowed.indexOf(i) < 0) {
        i = allowed.reduce(function (best, k) {
          return Math.abs(k - index) < Math.abs(best - index) ? k : best;
        }, allowed[0]);
      }
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
    _tick: tick, _now: now
  };
  return api;
})();
