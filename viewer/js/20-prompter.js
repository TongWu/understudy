'use strict';
/* The prompter card — the one screen that is read while talking — and the
   layer stack everything else on stage rises into.

   Two things here are load-bearing and everything else follows from them:

   1. Layers rise from BELOW the top bar. The drawer, the script and the
      re-plan are not screens; they are panels stacked over the cue area, and
      the clock stays lit above them. Losing the sense of time on stage is
      worse than losing whatever the layer was for.
   2. Nothing prints a key hint by hand. The footer is rendered from
      U.keys.hints(), so a key cannot be bound and stay undiscoverable — the
      failure the design read-through caught. Layer keys declare their labels
      under the layer's own name and the layer footer prints those; the
      prompter's footer therefore stays exactly the six on-stage keys. */

U.stage = (function () {
  var defs = {};          /* id -> layer definition */
  var stack = [];         /* [{def, inst, el}] — top of stack takes the keys */
  var host = null;        /* layers mount here: below the top bar */
  var fullHost = null;    /* except a blackout, which covers the lot */
  var forwarded = {};     /* key -> already forwarded to the top layer */
  var topLevel = {};      /* key -> the prompter binds it itself, see pass() */

  var GLYPH = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    Space: '空格', Escape: 'Esc', Enter: 'Enter'
  };

  function top() { return stack.length ? stack[stack.length - 1] : null; }
  function glyph(key, over) {
    return (over && over[key]) || GLYPH[key] || (key.length === 1 ? key.toUpperCase() : key);
  }
  function chip(key, over) {
    return U.el('span', { class: 'u-stage__k', 'data-key': key }, glyph(key, over));
  }

  /* Chips and labels straight out of the key table. Consecutive keys sharing a
     label collapse into one group, which is how ← → reads as a single "换节". */
  function hintRow(view, over) {
    var hints = U.keys.hints(view);
    var row = U.el('div', { class: 'u-stage__hints', 'data-hints-for': view });
    for (var i = 0; i < hints.length;) {
      var j = i;
      while (j < hints.length && hints[j].label === hints[i].label) j++;
      var group = U.el('span', { class: 'u-stage__hint' });
      for (var k = i; k < j; k++) group.appendChild(chip(hints[k].key, over));
      group.appendChild(U.el('span', {
        class: 'u-mono u-stage__hintlabel', 'data-hint-label': hints[i].label
      }, hints[i].label));
      row.appendChild(group);
      i = j;
    }
    return row;
  }

  function footer(view, left, over) {
    return U.el('footer', { class: 'u-stage__foot' },
      (left || []).concat([U.el('div', { style: { flex: '1' } }), hintRow(view, over)]));
  }

  /* One dispatch rule on stage: the top layer gets first refusal on a key,
     then the prompter's own binding runs. Esc always means "leave this layer". */
  function layerKey(key, e) {
    var t = top();
    var fn = t && t.inst && t.inst.keys && t.inst.keys[key];
    if (fn) { fn(e); return true; }
    if (key === 'Escape' && t) { pop(); return true; }
    return false;
  }
  function ensureForward(key) {
    /* A key the prompter binds itself already offers the layer first refusal
       through pass(); a second binding here would fire the prompter's own
       action as well and, say, close the very layer that wanted the key. */
    if (forwarded[key] || topLevel[key]) return;
    forwarded[key] = true;
    /* No label: this binding is plumbing. The label lives on the layer's own
       declaration below, and the layer's footer prints it. */
    U.keys.bind('prompter', key, null, function (e) { layerKey(key, e); }, 900);
  }

  function define(def) {
    defs[def.id] = def;
    (def.hints || []).forEach(function (h) {
      /* Declared under the layer's id — a view name that is never current, so
         this binding is never dispatched. It exists so the layer footer can be
         rendered from U.keys.hints() like every other footer. */
      U.keys.bind(def.id, h.key, h.label, function () {}, h.order == null ? 50 : h.order);
      ensureForward(h.key);
    });
  }

  function push(id) {
    var def = defs[id];
    if (!def || !host) return null;
    var parent = def.full ? fullHost : host;
    var el = U.el('div', { class: 'u-stage__layer' + (def.full ? ' u-stage__layer--full' : ''), 'data-layer': id });
    parent.appendChild(el);
    var entry = { def: def, inst: def.mount(el) || {}, el: el };
    stack.push(entry);
    if (entry.inst.update) entry.inst.update(U.store.get());
    return entry;
  }
  function pop() {
    var t = stack.pop();
    if (!t) return false;
    if (t.inst && t.inst.unmount) t.inst.unmount();
    if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
    return true;
  }
  /* Q / ↓ / T swap rather than stack, so Esc from any of them lands back on
     the card instead of unwinding a pile the speaker cannot see. */
  function show(id) {
    var t = top();
    var same = t && t.def.id === id;
    while (stack.length) pop();
    return same ? null : push(id);
  }

  /* The prompter's own keys route through here: layer first, then the card. */
  function pass(key, fallback) {
    return function (e) { if (!layerKey(key, e)) fallback(e); };
  }
  function bindTop(key, label, fn, order) {
    topLevel[key] = true;
    U.keys.bind('prompter', key, label, pass(key, fn), order);
  }

  return {
    define: define, push: push, pop: pop, show: show, top: top,
    layerKey: layerKey, bindTop: bindTop,
    depth: function () { return stack.length; },
    has: function (id) { return stack.some(function (s) { return s.def.id === id; }); },
    reset: function (layerHost, rootHost) {
      while (stack.length) pop();
      host = layerHost; fullHost = rootHost || layerHost;
    },
    update: function (state) {
      stack.forEach(function (s) { if (s.inst && s.inst.update) s.inst.update(state); });
    },
    chip: chip, glyph: glyph, hintRow: hintRow, footer: footer
  };
})();

/* ---------------------------------------------------------------- prompter */
U.prompter = (function () {
  /* Beats a re-plan struck out are stepped over rather than counted down. */
  function skipped(b) { return !!(b && b.skipped); }
  /* A beat is reachable if a reallocation did not drop it and the run
     actually covers it — a partial rehearsal must not wander into beats the
     speaker chose not to practise. */
  function playable(beat, index) {
    return !skipped(beat) && (!U.run.allows || U.run.allows(index));
  }
  /* null when there is nothing that way. The caller decides what the end of a
     run means, which is not the same as clamping back onto the last beat. */
  function step(i, dir) {
    var beats = U.store.beats();
    for (var j = i + dir; j >= 0 && j < beats.length; j += dir) {
      if (playable(beats[j], j)) return j;
    }
    return null;
  }
  function nextIndex(i, dir) { var j = step(i, dir); return j == null ? i : j; }
  function nextBeat(i) { var j = step(i, 1); return j == null ? null : U.store.beats()[j]; }
  /* The end of the run is the only moment the speaker actually stops, so it is
     the only place that can record one. Without it a finished rehearsal never
     reached the history, the recap stayed on the previous run, and the
     microphone kept listening. */
  function finishRun() {
    var r = U.run.current();
    if (!r || r.finished) return null;
    U.run.toggle(false);
    var record = U.run.finish();
    U.views.show(r.mode === 'live' ? 'debrief' : 'recap');
    return record;
  }
  /* The pacing word comes first and the colour second — the number is read
     from two metres away, sometimes by someone who cannot separate the hues. */
  function drift(secs) {
    if (secs == null) return { word: '准点', text: '0:00', tone: 'go' };
    var n = Math.round(secs);
    if (n === 0) return { word: '准点', text: '0:00', tone: 'go' };
    if (n < 0) return { word: '快', text: U.fmt(-n), tone: 'go' };
    return { word: '慢', text: U.fmt(n), tone: n > 30 ? 'over' : 'tight' };
  }
  function remainTone(secs) {
    if (secs == null) return '';
    if (secs < 0) return 'is-over';
    if (secs <= 15) return 'is-tight';
    return '';
  }
  return {
    skipped: skipped, playable: playable, step: step, finishRun: finishRun,
    nextIndex: nextIndex, nextBeat: nextBeat,
    drift: drift, remainTone: remainTone,
    LAST_MINUTE: 60
  };
})();

U.views.register('prompter', {
  mount: function (root) {
    var ui = {};
    var shell = U.el('div', { class: 'u-stage u-prompter' });

    /* the running-order thread — one segment per beat, weighted by budget */
    ui.thread = U.el('div', { class: 'u-prompter__thread' });

    /* top bar: never covered by a layer */
    ui.n = U.el('span', { class: 'u-mono u-prompter__n' });
    ui.title = U.el('span', { class: 'u-ser u-prompter__title' });
    ui.remain = U.el('span', { class: 'u-mono u-prompter__remain', 'data-stage-clock': 'remaining' });
    ui.elapsed = U.el('span', { class: 'u-mono u-prompter__elapsed' });
    ui.total = U.el('span', { class: 'u-mono u-prompter__total' });
    ui.driftDot = U.el('span', { class: 'u-prompter__dot' });
    ui.drift = U.el('span', { class: 'u-mono u-prompter__drift' });

    var bar = U.el('header', { class: 'u-prompter__top', 'data-stage-topbar': '1' }, [
      U.el('div', { class: 'u-prompter__where' }, [ui.n, ui.title]),
      U.el('div', { style: { flex: '1' } }),
      U.el('div', { class: 'u-prompter__read' }, [
        U.el('span', { class: 'u-lbl' }, '本节剩余'), ui.remain
      ]),
      U.el('div', { class: 'u-prompter__sep' }),
      U.el('div', { class: 'u-prompter__read' }, [
        U.el('span', { class: 'u-lbl' }, '全场'),
        U.el('div', { class: 'u-prompter__pair' }, [ui.elapsed, ui.total])
      ]),
      U.el('div', { class: 'u-prompter__sep' }),
      U.el('div', { class: 'u-prompter__read' }, [
        U.el('span', { class: 'u-lbl' }, '进度'),
        U.el('div', { class: 'u-prompter__pair' }, [ui.driftDot, ui.drift])
      ])
    ]);

    /* everything below here can be covered by a layer */
    ui.cues = U.el('main', { class: 'u-prompter__cues' });
    ui.nextN = U.el('span', { class: 'u-mono u-prompter__nextn' });
    ui.nextTitle = U.el('span', { class: 'u-prompter__nexttitle' });
    ui.nextBudget = U.el('span', { class: 'u-mono u-prompter__nextbudget' });

    var card = U.el('div', { class: 'u-prompter__card' }, [
      ui.cues,
      U.stage.footer('prompter', [
        U.el('span', { class: 'u-lbl' }, '下一节'), ui.nextN, ui.nextTitle, ui.nextBudget
      ])
    ]);
    ui.stack = U.el('div', { class: 'u-prompter__stack' }, [card]);

    shell.appendChild(ui.thread);
    shell.appendChild(bar);
    shell.appendChild(ui.stack);
    root.appendChild(shell);

    U.stage.reset(ui.stack, shell);
    this._ui = ui;
    this._at = null;
  },

  update: function () {
    var ui = this._ui;
    if (!ui) return;
    var beats = U.store.beats(), i = U.store.get().ui.beatIndex;
    var beat = beats[i] || null, run = U.run.current();
    var remain = U.run.remaining();
    var totals = U.totals(beats, U.store.rate());

    /* --- top bar ------------------------------------------------------- */
    ui.n.textContent = (beat && beat.n) || '--';
    ui.n.appendChild(U.el('span', { class: 'u-prompter__of' }, ' / ' + beats.length));
    ui.title.textContent = (beat && beat.title) || '';
    ui.remain.textContent = remain == null ? '--:--' : U.fmt(remain);
    ui.remain.className = 'u-mono u-prompter__remain ' + U.prompter.remainTone(remain);
    ui.elapsed.textContent = U.fmt(run ? run.elapsed : 0);
    ui.total.textContent = '/ ' + U.fmt(totals.budget);
    var d = U.prompter.drift(run ? U.run.drift() : null);
    ui.drift.textContent = d.word + ' ' + d.text;
    ui.drift.className = 'u-mono u-prompter__drift is-' + d.tone;
    ui.driftDot.className = 'u-prompter__dot is-' + d.tone;

    /* --- the thread ----------------------------------------------------- */
    /* Under a minute the thread changes meaning: it stops saying "which beat"
       and says "how much of this one is left", eight pixels tall and shrinking
       evenly to nothing. At that point the first meaning is of no use — you
       are in this beat and about to leave it — and one line can only carry one
       thing if it is to be read out of the corner of an eye. */
    var last = remain != null && remain <= U.prompter.LAST_MINUTE;
    U.clear(ui.thread);
    ui.thread.className = 'u-prompter__thread' + (last ? ' u-prompter__thread--last' : '');
    ui.thread.setAttribute('data-thread', last ? 'last-minute' : 'running-order');
    if (last) {
      var left = Math.max(0, Math.min(1, (remain || 0) / U.prompter.LAST_MINUTE));
      var track = U.el('div', { class: 'u-prompter__lastTrack' + (remain < 0 ? ' is-over' : '') }, [
        U.el('div', { class: 'u-prompter__lastFill', style: { width: (left * 100).toFixed(2) + '%' } })
      ]);
      ui.thread.appendChild(track);
    } else {
      beats.forEach(function (b, j) {
        var w = Math.max(20, Number(b.budget) || 0);
        var seg = U.el('div', {
          class: 'u-prompter__seg' + (j < i ? ' is-done' : '') + (j === i ? ' is-now' : '') +
            (U.prompter.skipped(b) ? ' is-skip' : ''),
          style: { flex: String(w) }, title: b.n + ' ' + b.title
        });
        if (j === i) {
          var spent = run && run.perBeat[i] ? run.perBeat[i].spent : 0;
          var f = Math.max(0, Math.min(1, spent / (Number(b.budget) || 1)));
          seg.appendChild(U.el('div', { class: 'u-prompter__segfill', style: { width: (f * 100).toFixed(2) + '%' } }));
        }
        ui.thread.appendChild(seg);
      });
    }

    /* --- the cues (rebuilt only when the beat changes) -------------------- */
    if (this._at !== i) {
      this._at = i;
      U.clear(ui.cues);
      U.onstageCue(beat).forEach(function (c) {
        var flagged = /^(SLOW|PAUSE|ASK)$/.test(c.flag || '');
        var head = U.el('div', { class: 'u-prompter__cuehead' });
        if (c.flag) head.appendChild(U.el('span', {
          class: 'u-pill u-pill--' + (c.flag === 'OPEN' ? 'over' : c.flag === 'SAY' ? 'go' : 'tight')
        }, c.flag));
        (c.cols || []).forEach(function (col) {
          head.appendChild(U.el('span', { class: 'u-pill u-pill--tight u-prompter__col' }, col));
        });
        head.appendChild(U.el('span', { class: 'u-prompter__lead', html: c.lead || '' }));

        var item = U.el('div', { class: 'u-prompter__cue' + (flagged ? ' is-flagged' : '') }, [head]);
        (c.say || []).forEach(function (s) {
          item.appendChild(U.el('div', { class: 'u-read u-prompter__say', html: s }));
        });
        (c.notes || []).forEach(function (n) {
          item.appendChild(U.el('div', { class: 'u-prompter__note' }, [
            U.el('span', { class: 'u-lbl u-prompter__notelbl' }, '旁批'),
            U.el('span', { text: n })
          ]));
        });
        ui.cues.appendChild(item);
      });
      var nb = U.prompter.nextBeat(i);
      ui.nextN.textContent = nb ? nb.n : '';
      /* Say what the arrow does here, or the end of the run is a key that is
         bound and printed nowhere — the thing the key registry exists to stop. */
      ui.nextTitle.textContent = nb ? nb.title
        : '这是最后一节 · 按 → 结束，去' + (((U.run.current() || {}).mode === 'live') ? '回填' : '复盘');
      ui.nextBudget.textContent = nb ? U.fmt(nb.budget) : '';
    }

    U.stage.update(U.store.get());
  }
});

/* ------------------------------------------------------------------- keys */
/* The six on-stage keys, in the order the footer prints them. Every one of
   them is bound here and nowhere else, and the footer is rendered from this
   table rather than from a hand-written list. */
U.stage.bindTop('ArrowLeft', '换节', function () {
  var j = U.prompter.step(U.store.get().ui.beatIndex, -1);
  if (j != null) U.run.go(j);
}, 10);
U.stage.bindTop('ArrowRight', '换节', function () {
  var j = U.prompter.step(U.store.get().ui.beatIndex, 1);
  if (j != null) { U.run.go(j); return; }
  U.prompter.finishRun();
}, 11);
U.stage.bindTop('Space', '计时', function () { U.run.toggle(); }, 20);
U.stage.bindTop('ArrowDown', '看讲稿', function () { U.stage.show('panic'); }, 30);
U.stage.bindTop('q', '弹药库', function () { U.stage.show('drawer'); }, 40);
U.stage.bindTop('t', '只剩 N 分钟', function () { U.stage.show('reflow'); }, 50);
U.stage.bindTop('b', '黑屏', function () { U.stage.push('black'); }, 60);
/* The key table routed out of the double screen but never into it, so the
   second screen was unreachable once you were on the card. P is symmetric
   with the presenter's own P, which goes the other way. */
U.stage.bindTop('p', '切双屏', function () { U.views.show('presenter'); }, 70);

/* -------------------------------------------------------------- blackout */
/* Covers the top bar too — a blackout that leaves a 44px number glowing is not
   a blackout. What survives is the same two readings at the dimmest weight the
   stage palette has: going dark must never mean going blind to the clock. */
U.stage.define({
  id: 'black', full: true,
  hints: [
    { key: 'b', label: '回来', order: 10 },
    { key: 'Escape', label: '回来', order: 20 }
  ],
  mount: function (root) {
    var remain = U.el('span', { class: 'u-mono u-stage__blackClock', 'data-stage-clock': 'remaining' });
    var elapsed = U.el('span', { class: 'u-mono u-stage__blackElapsed' });
    root.className += ' u-stage__black';
    root.appendChild(U.el('div', { class: 'u-stage__blackInner' }, [
      remain, elapsed, U.el('span', { class: 'u-mono u-stage__blackHint' }, 'B 或 Esc 回来')
    ]));
    return {
      keys: { b: function () { U.stage.pop(); }, Escape: function () { U.stage.pop(); } },
      update: function () {
        var r = U.run.remaining(), run = U.run.current();
        remain.textContent = r == null ? '--:--' : U.fmt(r);
        elapsed.textContent = U.fmt(run ? run.elapsed : 0) + ' / ' + U.fmt(U.totals(U.store.beats(), U.store.rate()).budget);
      }
    };
  }
});
