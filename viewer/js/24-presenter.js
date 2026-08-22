'use strict';
/* 双屏演讲者视图 — the laptop screen while the room sees the slide.

   The thing worth defending here is the corner that never changes: the first
   sentence of the NEXT beat, always on screen. Changing beat is where people
   dry up, and the fix is not a bigger script — it is one sentence, already
   said out loud in rehearsal, sitting where your eye lands between slides. */

U.presenter = (function () {
  var bodyEl = null;                 /* the two columns, so ⌘⇧F can flip them */

  function firstLine(beat) {
    var parts = U.panic.split(beat && beat.script);
    var text = (parts[0] && parts[0].text) || '';
    var m = /^[\s\S]*?[.。?？!！]/.exec(text);
    return ((m && m[0]) || text).trim();
  }
  /* Which cue the clock has probably carried you to — literally the same
     estimate the ↓ key uses, run over the cue list instead of the script, so
     the two halves of this screen never point at different places. */
  function cueAt(beat, fraction, rate) {
    var cue = U.onstageCue(beat);
    if (!cue.length) return -1;
    return U.panic.locate(cue.map(function (c) {
      return { html: (c.lead || '') + ' ' + ((c.say || []).join(' ')) };
    }), fraction, rate);
  }
  /* A placeholder for the deck: v1 carries no slide images, so this draws the
     shape of one — a bright card, because a slide is a bright thing even in a
     dark room — with the columns this beat is about picked out. */
  function grid(host, beat, cols, rows) {
    U.clear(host);
    host.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    var mine = {};
    U.onstageCue(beat).forEach(function (c) {
      (c.cols || []).forEach(function (x) { mine[x] = true; });
    });
    var owned = Object.keys(mine).length;
    for (var i = 0; i < cols * rows; i++) {
      var col = i % cols;
      var isMine = owned && col >= cols - Math.min(cols - 1, owned);
      host.appendChild(U.el('div', { class: 'u-presenter__cell' + (isMine ? ' is-yours' : '') }));
    }
  }

  return {
    firstLine: firstLine, cueAt: cueAt, grid: grid,
    bind: function (el) { bodyEl = el; },
    swap: function () { if (bodyEl) bodyEl.classList.toggle('is-swapped'); }
  };
})();

U.views.register('presenter', {
  mount: function (root) {
    var ui = {};
    var shell = U.el('div', { class: 'u-stage u-presenter' });

    ui.thread = U.el('div', { class: 'u-prompter__thread' });
    ui.slideCount = U.el('span', { class: 'u-mono u-presenter__live' });
    ui.remain = U.el('span', { class: 'u-mono u-presenter__remain', 'data-stage-clock': 'remaining' });
    ui.elapsed = U.el('span', { class: 'u-mono u-presenter__elapsed' });
    ui.total = U.el('span', { class: 'u-mono u-presenter__total' });
    ui.driftDot = U.el('span', { class: 'u-prompter__dot' });
    ui.drift = U.el('span', { class: 'u-mono u-presenter__drift' });

    var bar = U.el('header', { class: 'u-presenter__top', 'data-stage-topbar': '1' }, [
      U.el('span', { class: 'u-lbl' }, '演讲者视图'),
      U.el('span', { class: 'u-presenter__badge' }, [
        U.el('span', { class: 'u-prompter__dot is-go' }), ui.slideCount
      ]),
      U.el('div', { style: { flex: '1' } }),
      U.el('div', { class: 'u-presenter__read' }, [U.el('span', { class: 'u-lbl' }, '本节剩余'), ui.remain]),
      U.el('div', { class: 'u-prompter__sep' }),
      U.el('div', { class: 'u-presenter__read' }, [U.el('span', { class: 'u-lbl' }, '全场'), ui.elapsed, ui.total]),
      U.el('div', { class: 'u-prompter__sep' }),
      U.el('div', { class: 'u-presenter__read' }, [ui.driftDot, ui.drift])
    ]);

    /* left — what the room is looking at */
    ui.slideTitle = U.el('div', { class: 'u-presenter__slidetitle' });
    ui.slideRef = U.el('div', { class: 'u-mono u-presenter__slideref' });
    ui.slideGrid = U.el('div', { class: 'u-presenter__grid' });
    ui.thumbGrid = U.el('div', { class: 'u-presenter__grid u-presenter__grid--thumb' });
    ui.nextTitle = U.el('span', { class: 'u-presenter__nexttitle' });
    ui.nextBudget = U.el('span', { class: 'u-mono u-presenter__nextbudget' });
    ui.firstLine = U.el('span', { class: 'u-read u-presenter__first' });

    var left = U.el('div', { class: 'u-presenter__left' }, [
      U.el('div', { class: 'u-presenter__slide' }, [
        U.el('div', { class: 'u-presenter__slidehead' }, [ui.slideTitle, ui.slideRef]),
        ui.slideGrid
      ]),
      U.el('div', { class: 'u-presenter__next' }, [
        U.el('span', { class: 'u-lbl' }, '下一张'),
        U.el('div', { class: 'u-presenter__thumb' }, [
          U.el('div', { class: 'u-presenter__thumbbar' }), ui.thumbGrid
        ]),
        U.el('div', { class: 'u-presenter__nextmeta' }, [
          U.el('div', { class: 'u-presenter__nextline' }, [ui.nextTitle, ui.nextBudget]),
          U.el('div', { class: 'u-presenter__firstline' }, [
            U.el('span', { class: 'u-lbl u-presenter__firstlbl' }, '开口第一句'), ui.firstLine
          ])
        ])
      ])
    ]);

    /* right — what only you can see */
    ui.cue = U.el('div', { class: 'u-presenter__cue' });
    ui.script = U.el('div', { class: 'u-read u-presenter__script' });
    var right = U.el('div', { class: 'u-presenter__right' }, [
      U.el('div', { class: 'u-presenter__block' }, [U.el('span', { class: 'u-lbl' }, '提词'), ui.cue]),
      U.el('div', { class: 'u-presenter__rule' }, [
        U.el('span', { class: 'u-lbl' }, '讲稿'),
        U.el('div', { class: 'u-presenter__hair' }),
        U.el('span', { class: 'u-mono u-presenter__auto' }, '自动跟读 · 关')
      ]),
      ui.script
    ]);

    ui.body = U.el('div', { class: 'u-presenter__body' }, [left, right]);
    ui.chips = U.el('div', { class: 'u-presenter__chips' });

    shell.appendChild(ui.thread);
    shell.appendChild(bar);
    shell.appendChild(ui.body);
    shell.appendChild(U.stage.footer('presenter', [ui.chips], { f: '⌘⇧F' }));
    root.appendChild(shell);

    this._ui = ui;
    this._at = null;
    this._was = -1;
    U.presenter.bind(ui.body);
  },

  update: function () {
    var ui = this._ui;
    if (!ui) return;
    var beats = U.store.beats(), i = U.store.get().ui.beatIndex;
    var beat = beats[i] || null, run = U.run.current();
    var remain = U.run.remaining(), totals = U.totals(beats, U.store.rate());
    var nb = U.prompter.nextBeat(i);

    ui.slideCount.textContent = '观众屏正在显示第 ' + (i + 1) + ' 张';
    ui.remain.textContent = remain == null ? '--:--' : U.fmt(remain);
    ui.remain.className = 'u-mono u-presenter__remain ' + U.prompter.remainTone(remain);
    ui.elapsed.textContent = U.fmt(run ? run.elapsed : 0);
    ui.total.textContent = '/ ' + U.fmt(totals.budget);
    var d = U.prompter.drift(run ? U.run.drift() : null);
    ui.drift.textContent = d.word + ' ' + d.text;
    ui.drift.className = 'u-mono u-presenter__drift is-' + d.tone;
    ui.driftDot.className = 'u-prompter__dot is-' + d.tone;

    /* the running-order thread, same rule as the card */
    U.clear(ui.thread);
    beats.forEach(function (b, j) {
      ui.thread.appendChild(U.el('div', {
        class: 'u-prompter__seg' + (j < i ? ' is-done' : '') + (j === i ? ' is-now' : '') +
          (U.prompter.skipped(b) ? ' is-skip' : ''),
        style: { flex: String(Math.max(20, Number(b.budget) || 0)) }
      }));
    });

    var f = run ? U.run.scriptFraction() : 0;
    if (this._at !== i) {
      this._at = i;
      ui.slideTitle.textContent = (beat && beat.title) || '';
      ui.slideRef.textContent = (beat && beat.slideRef) || '';
      U.presenter.grid(ui.slideGrid, beat, 18, 8);
      U.presenter.grid(ui.thumbGrid, nb, 9, 3);
      ui.nextTitle.textContent = nb ? nb.n + ' · ' + nb.title : '这是最后一节';
      ui.nextBudget.textContent = nb ? U.fmt(nb.budget) : '';
      ui.firstLine.textContent = nb ? '“' + U.presenter.firstLine(nb) + '”' : '';

      U.clear(ui.script);
      this._parts = U.panic.split(beat && beat.script);
      this._nodes = this._parts.map(function (p) {
        var el = U.el('p', { class: 'u-presenter__p', html: p.html });
        ui.script.appendChild(el);
        return el;
      });
      U.clear(ui.chips);
      beats.forEach(function (b, j) {
        ui.chips.appendChild(U.el('span', {
          class: 'u-mono u-presenter__bt' + (j === i ? ' is-now' : '') + (U.prompter.skipped(b) ? ' is-skip' : ''),
          text: j === i ? b.n + ' · ' + b.title : b.n
        }));
      });
      ui.chips.appendChild(U.el('span', { class: 'u-mono u-presenter__bt is-quiet', text: 'Q&A' }));
    }

    /* cue and script follow the clock */
    var at = U.presenter.cueAt(beat, f, U.store.rate());
    var c = U.onstageCue(beat)[at];
    U.clear(ui.cue);
    if (c) {
      var head = U.el('div', { class: 'u-presenter__cuehead' });
      if (c.flag) head.appendChild(U.el('span', { class: 'u-pill u-pill--tight' }, c.flag));
      (c.cols || []).forEach(function (col) { head.appendChild(U.el('span', { class: 'u-pill u-pill--tight' }, col)); });
      head.appendChild(U.el('span', { class: 'u-presenter__lead', html: c.lead || '' }));
      ui.cue.appendChild(head);
      (c.notes || []).forEach(function (n) {
        ui.cue.appendChild(U.el('div', { class: 'u-presenter__note' }, [
          U.el('span', { class: 'u-lbl u-prompter__notelbl' }, '旁批'), U.el('span', { text: n })
        ]));
      });
    }
    var here = U.panic.locate(this._parts || [], f, U.store.rate());
    (this._nodes || []).forEach(function (el, j) {
      el.className = 'u-presenter__p' + (j === here ? ' is-here' : '');
    });
    var at = (this._nodes || [])[here];
    if (here !== this._was && at && at.scrollIntoView) at.scrollIntoView({ block: 'center' });
    this._was = here;
  }
});

/* ------------------------------------------------------------------- keys */
U.keys.bind('presenter', 'ArrowLeft', '换节', function () {
  U.run.go(U.prompter.nextIndex(U.store.get().ui.beatIndex, -1));
}, 10);
U.keys.bind('presenter', 'ArrowRight', '换节', function () {
  U.run.go(U.prompter.nextIndex(U.store.get().ui.beatIndex, 1));
}, 11);
U.keys.bind('presenter', 'Space', '计时', function () { U.run.toggle(); }, 20);
U.keys.bind('presenter', 'f', '交换两块屏', function (e) {
  /* Printed as ⌘⇧F and it means it — a bare F must not throw the layout. */
  if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
  U.presenter.swap();
}, 30);
U.keys.bind('presenter', 'p', '切提词卡', function () { U.views.show('prompter'); }, 40);
