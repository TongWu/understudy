'use strict';
/* 只剩 N 分钟 — the T key. Somebody at the back holds up three fingers; this
   turns that into a plan for the beats you have not given yet.

   The arithmetic is U.squeeze(): importance 3 barely moves, 2 gives up a
   third, 1 goes whole. What this screen adds is the part a speaker actually
   needs before they dare press it — 连带: what nobody will say once a beat is
   dropped, and the one line to put back so it is not simply lost. A tool that
   only subtracts is a tool you do not touch while people are watching. */

U.reflow = (function () {
  var WORD = { 1: '低', 2: '中', 3: '高' };

  function importance(beat) {
    var n = Number(beat && beat.importance) || 2;
    return Math.max(1, Math.min(3, n));
  }
  function importanceWord(beat) { return WORD[importance(beat)]; }

  function plan(beats, seconds) {
    var rows = U.squeeze(beats || [], Math.max(0, Number(seconds) || 0));
    var from = rows.reduce(function (a, r) { return a + r.from; }, 0);
    var to = rows.reduce(function (a, r) { return a + r.to; }, 0);
    return { rows: rows, from: from, to: to, cut: from - to, seconds: seconds };
  }

  /* Said in terms of the cue card, because that is what the speaker will be
     looking at when the cut has to happen. */
  function how(row) {
    if (!row) return '';
    if (row.skip) return '整节跳过';
    var cues = (row.beat.cue || []).length;
    if (!row.from || row.to >= row.from) return '照原样讲';
    var ratio = row.to / row.from;
    if (ratio >= 0.9) return '几乎不动 —— 只压掉 ' + U.fmt(row.from - row.to);
    if (!cues) return '压到 ' + U.fmt(row.to) + '，讲要点就走';
    var keep = Math.max(1, Math.round(cues * ratio));
    return '讲前 ' + keep + ' 条提词，其余 ' + (cues - keep) + ' 条带过';
  }

  function firstSay(beat) {
    var line = '';
    ((beat && beat.cue) || []).some(function (c) {
      var say = (c.say || [])[0];
      if (say) { line = U.textOf(say).trim(); return true; }
      return false;
    });
    if (!line) {
      var text = U.textOf((beat && beat.script) || '').trim();
      var m = /^[\s\S]*?[.。?？!！]/.exec(text);      /* no lookbehind: this ships to Safari too */
      line = ((m && m[0]) || text).trim();
    }
    /* the authored line usually carries its own quotes; the screen adds a pair
       of its own, and two sets of quotes read as a typo */
    return line.replace(/^["“”']+/, '').replace(/["“”']+$/, '').trim();
  }
  function leads(beat) {
    return ((beat && beat.cue) || []).map(function (c) { return U.textOf(c.lead).trim(); })
      .filter(Boolean);
  }

  /* What a dropped beat takes with it, and where the make-up line goes: the
     first beat that survives after it, because that is the next time you will
     have the room's attention. */
  function knockOn(rows) {
    var out = [];
    (rows || []).forEach(function (row, i) {
      if (!row.skip) return;
      var into = null;
      for (var j = i + 1; j < rows.length; j++) if (!rows[j].skip) { into = rows[j].beat; break; }
      if (!into) for (var k = i - 1; k >= 0; k--) if (!rows[k].skip) { into = rows[k].beat; break; }
      out.push({
        beat: row.beat, missing: leads(row.beat).slice(0, 2),
        more: Math.max(0, leads(row.beat).length - 2),
        line: firstSay(row.beat), into: into
      });
    });
    return out;
  }

  /* The make-up line, as a cue item, so adopting a plan puts it where it will
     actually be read rather than in a note nobody opens. */
  function makeUpCue(hit) {
    return {
      flag: 'SAY', cols: [],
      lead: '<b>补回 ' + U.esc(hit.beat.n) + '</b> —— ' + U.esc(hit.missing[0] || hit.beat.title),
      say: hit.line ? [U.esc(hit.line)] : [],
      notes: ['这句是跳过 ' + hit.beat.n + ' 之后补的'],
      madeUpFor: hit.beat.id
    };
  }

  function adopt(rows, opts) {
    opts = opts || {};
    var hits = opts.skip === false ? [] : knockOn(rows);
    U.store.update(function () {
      rows.forEach(function (r) {
        if (r.beat.budgetWas == null) r.beat.budgetWas = r.from;
        if (opts.skip === false) { r.beat.budget = Math.max(r.to, 1); return; }
        r.beat.budget = r.to;
        if (r.skip) r.beat.skipped = true;
      });
      hits.forEach(function (hit) {
        if (!hit.into || !hit.line) return;
        hit.into.cue = (hit.into.cue || []).filter(function (c) { return c.madeUpFor !== hit.beat.id; });
        hit.into.cue.push(makeUpCue(hit));
      });
    });
    return hits;
  }

  return {
    importance: importance, importanceWord: importanceWord, plan: plan, how: how,
    knockOn: knockOn, leads: leads, firstSay: firstSay, adopt: adopt, makeUpCue: makeUpCue
  };
})();

/* ------------------------------------------------------------------ layer */
U.stage.define({
  id: 'reflow',
  hints: [
    { key: 't', label: '改时间', order: 10 },
    { key: 'Enter', label: '采用', order: 20 },
    { key: 'Escape', label: '取消', order: 30 }
  ],
  mount: function (root) {
    var PICKS = [120, 180, 300];
    var seconds = 180, rest = [], p = null;

    var picks = U.el('div', { class: 'u-reflow__picks' });
    var custom = U.el('input', {
      class: 'u-mono u-reflow__custom', type: 'text', placeholder: '自定义', size: '6',
      oninput: function () {
        var v = U.parseTime(custom.value);
        if (v != null) { seconds = v; paint(); }
      },
      onkeydown: function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); custom.blur(); }
        if (e.key === 'Enter') { e.preventDefault(); custom.blur(); }
      }
    });
    var headline = U.el('div', { class: 'u-reflow__headline' });
    var table = U.el('div', { class: 'u-reflow__table' });
    var knock = U.el('div', { class: 'u-reflow__knock' });
    var actions = U.el('div', { class: 'u-reflow__actions' });

    root.appendChild(U.el('div', { class: 'u-reflow' }, [
      U.el('div', { class: 'u-reflow__bar' }, [
        U.el('span', { class: 'u-ser u-reflow__ask' }, '他们说还剩多久？'),
        U.el('div', { style: { flex: '1' } }), picks, custom
      ]),
      headline, table, knock, actions,
      U.stage.footer('reflow', [
        U.el('span', { class: 'u-lbl' }, '只剩 N 分钟'),
        U.el('span', { class: 'u-mono u-stage__footnote' }, '重要度在编辑器里设，台上只做算术')
      ])
    ]));

    function dots(beat) {
      var n = U.reflow.importance(beat), wrap = U.el('span', { class: 'u-reflow__imp' });
      for (var i = 1; i <= 3; i++) wrap.appendChild(U.el('span', { class: 'u-reflow__impdot' + (i <= n ? ' is-on' : '') }));
      wrap.appendChild(U.el('span', { class: 'u-mono u-reflow__impword', text: U.reflow.importanceWord(beat) }));
      return wrap;
    }
    function row(cls, cells) {
      return U.el('div', { class: 'u-reflow__row' + (cls ? ' ' + cls : '') }, cells);
    }

    function paint() {
      var beats = U.store.beats(), i = U.store.get().ui.beatIndex;
      rest = beats.slice(i + 1).filter(function (b) { return !b.skipped; });
      p = U.reflow.plan(rest, seconds);

      U.clear(picks);
      PICKS.forEach(function (s) {
        picks.appendChild(U.el('button', {
          class: 'u-mono u-reflow__pick' + (s === seconds ? ' is-on' : ''),
          onclick: function () { seconds = s; custom.value = ''; paint(); }
        }, U.fmt(s)));
      });

      U.clear(headline);
      headline.appendChild(U.el('span', { class: 'u-reflow__line' }, [
        U.el('span', { text: '还剩 ' }), U.el('b', { class: 'u-mono', text: String(rest.length) }),
        U.el('span', { text: ' 节，原计划要 ' }), U.el('b', { class: 'u-mono', text: U.fmt(p.from) }),
        U.el('span', { text: '。' })
      ]));
      headline.appendChild(U.el('span', {
        class: 'u-reflow__cut' + (p.cut > 0 ? ' is-over' : ' is-go'),
        text: p.cut > 0 ? '要砍 ' + U.fmt(p.cut) + '。' : '时间够，不用砍。'
      }));
      headline.appendChild(U.el('div', { style: { flex: '1' } }));
      headline.appendChild(U.el('span', { class: 'u-mono u-reflow__note', text: '按重要度砍，高的几乎不动' }));

      U.clear(table);
      table.appendChild(row('is-head', [
        U.el('span', { class: 'u-lbl' }), U.el('span', { class: 'u-lbl', text: '剩下的节' }),
        U.el('span', { class: 'u-lbl', text: '怎么砍' }), U.el('span', { class: 'u-lbl', text: '重要度' }),
        U.el('span', { class: 'u-lbl', text: '预算 → 改成' }),
        U.el('span', { class: 'u-lbl u-reflow__right', text: '差' })
      ]));
      p.rows.forEach(function (r) {
        table.appendChild(row(r.skip ? 'is-skip' : '', [
          U.el('span', { class: 'u-mono u-reflow__n', text: r.beat.n }),
          U.el('span', { class: 'u-reflow__title', text: r.beat.title }),
          U.el('span', { class: 'u-mono u-reflow__how', text: U.reflow.how(r) }),
          dots(r.beat),
          U.el('div', { class: 'u-reflow__times' }, [
            U.el('span', { class: 'u-mono u-reflow__was', text: U.fmt(r.from) }),
            U.el('span', { class: 'u-mono u-reflow__arrow', text: '→' }),
            U.el('span', { class: 'u-mono u-reflow__now' + (r.skip ? ' is-over' : ''), text: r.skip ? '跳过' : U.fmt(r.to) })
          ]),
          U.el('span', {
            class: 'u-mono u-reflow__delta' + (r.from - r.to > 0 ? ' is-over' : ''),
            text: r.from - r.to > 0 ? '−' + U.fmt(r.from - r.to) : '0:00'
          })
        ]));
      });
      table.appendChild(row('is-total', [
        U.el('span'), U.el('span', { class: 'u-mono u-reflow__n', text: '合计' }),
        U.el('span'), U.el('span'),
        U.el('div', { class: 'u-reflow__times' }, [
          U.el('span', { class: 'u-mono u-reflow__was', text: U.fmt(p.from) }),
          U.el('span', { class: 'u-mono u-reflow__arrow', text: '→' }),
          U.el('span', { class: 'u-mono u-reflow__now is-go', text: U.fmt(p.to) })
        ]),
        U.el('span', { class: 'u-mono u-reflow__delta is-over', text: '−' + U.fmt(p.cut) })
      ]));

      /* 连带 — the reason this screen is safe to press */
      U.clear(knock);
      var hits = U.reflow.knockOn(p.rows);
      if (!hits.length) {
        knock.appendChild(U.el('span', { class: 'u-lbl u-reflow__knocklbl', text: '连带' }));
        knock.appendChild(U.el('span', { class: 'u-reflow__knocktext', text: '没有整节被跳过，不会漏掉什么。' }));
      }
      hits.forEach(function (hit) {
        knock.appendChild(U.el('span', { class: 'u-lbl u-reflow__knocklbl', text: '连带' }));
        knock.appendChild(U.el('span', { class: 'u-reflow__knocktext' }, [
          U.el('span', { text: '跳过 ' + hit.beat.n + ' 之后就没人讲「' + (hit.missing[0] || hit.beat.title) + '」了。' }),
          hit.into && hit.line ? U.el('span', { text: hit.into.n + ' 补一句：' }) : null,
          hit.into && hit.line ? U.el('span', { class: 'u-read u-reflow__makeup', text: '“' + hit.line + '”' }) : null,
          hit.into && hit.line
            ? U.el('span', { text: ' 采用的话这句会加到 ' + hit.into.n + ' 的提词卡最后。' })
            : U.el('span', { text: ' 后面没有能补的节了 —— 这一段就是真的不讲了。' })
        ]));
      });

      U.clear(actions);
      var skipped = p.rows.filter(function (r) { return r.skip; }).map(function (r) { return r.beat.n; });
      actions.appendChild(U.el('button', {
        class: 'u-btn u-btn--primary u-reflow__go', onclick: function () { apply({}); }
      }, skipped.length ? '采用 · 台本顺序上划掉 ' + skipped.join('、') : '采用 · 只改时间'));
      actions.appendChild(U.el('button', {
        class: 'u-btn', title: '只把预算改成新的时间，不跳过任何一节，也不加补回的那句',
        onclick: function () { apply({ skip: false }); }
      }, '我自己改'));
      actions.appendChild(U.el('button', { class: 'u-btn', onclick: function () { U.stage.pop(); } }, '取消'));
      actions.appendChild(U.el('span', {
        class: 'u-mono u-reflow__note', text: '「我自己改」只改时间，不跳过任何一节'
      }));
    }

    function apply(opts) {
      U.reflow.adopt(p.rows, opts);
      U.stage.pop();
    }

    paint();
    return {
      update: function () { /* the plan is a snapshot; the clock behind it keeps running */ },
      keys: {
        t: function () {
          var at = PICKS.indexOf(seconds);
          seconds = PICKS[(at + 1) % PICKS.length];
          custom.value = '';
          paint();
        },
        Enter: function () { apply({}); }
      }
    };
  }
});
