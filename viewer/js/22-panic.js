'use strict';
/* 卡壳保险 — the ↓ key. The only reason to open a script on stage is that you
   have lost your place, so this does not open at the top: it opens at the
   paragraph you are probably in, worked out from the clock.

   The estimate is printed on the screen in full — 本节已用 1:12 / 2:30 →
   稿子 48% 处 — because something that is guessing should say so, and because
   a speaker who can see the arithmetic can correct it in one keystroke rather
   than losing faith in the whole screen. */

U.panic = (function () {
  /* Paragraphs, kept as authored. No DOM here: the split has to work under
     node so it can be tested away from a browser. */
  function split(html) {
    var s = String(html == null ? '' : html);
    var parts = s.indexOf('<p') >= 0
      ? s.split(/<\/p\s*>/i).map(function (chunk) { return chunk.replace(/^[\s\S]*?<p[^>]*>/i, ''); })
      : s.split(/\n{2,}/);
    return parts.map(function (chunk) {
      return { html: chunk.trim(), text: U.textOf(chunk).trim() };
    }).filter(function (p) { return p.text.length > 0; });
  }
  /* Weighted by how long each paragraph takes to say, not by how long it looks
     — a line of Chinese and a line of English of the same width are not the
     same number of seconds. */
  function weights(parts, rate) {
    return parts.map(function (p) { return Math.max(0.001, U.estimate(p.html, rate)); });
  }
  function locate(parts, fraction, rate) {
    if (!parts || !parts.length) return 0;
    var w = weights(parts, rate);
    var total = w.reduce(function (a, b) { return a + b; }, 0);
    var goal = Math.max(0, Math.min(1, Number(fraction) || 0)) * total;
    var acc = 0;
    for (var i = 0; i < w.length; i++) {
      acc += w[i];
      if (goal < acc) return i;
    }
    return w.length - 1;
  }
  return { split: split, weights: weights, locate: locate };
})();

U.stage.define({
  id: 'panic',
  hints: [
    { key: 'ArrowUp', label: '微调', order: 10 },
    { key: 'ArrowDown', label: '微调', order: 11 },
    { key: 'Escape', label: '回提词卡', order: 20 },
    { key: 'q', label: '弹药库', order: 30 }
  ],
  mount: function (root) {
    var nudge = 0, at = -1, was = -1, parts = [], nodes = [];

    var sum = U.el('span', { class: 'u-mono u-panic__sum' });
    var tweak = U.el('span', { class: 'u-mono u-panic__tweak' });
    var dot = U.el('div', { class: 'u-panic__dot' });
    var rail = U.el('div', { class: 'u-panic__rail' }, [dot]);
    var body = U.el('div', { class: 'u-read u-panic__script' });

    root.appendChild(U.el('div', { class: 'u-panic' }, [
      U.el('div', { class: 'u-panic__bar' }, [
        U.el('span', { class: 'u-pill u-pill--tight' }, '卡壳保险'),
        U.el('span', { class: 'u-panic__hint' }, [
          U.el('span', { text: '按用时估的位置，可能差一两句 —— ' }),
          U.stage.chip('ArrowUp'), U.stage.chip('ArrowDown'),
          U.el('span', { text: ' 微调' })
        ]),
        tweak,
        U.el('div', { style: { flex: '1' } }),
        sum
      ]),
      U.el('div', { class: 'u-panic__body' }, [rail, body]),
      U.stage.footer('panic', [
        U.el('span', { class: 'u-lbl' }, '你大概讲到这里'),
        U.el('span', { class: 'u-mono u-stage__footnote' }, '高亮那段就是估的位置')
      ])
    ]));

    function build(beat) {
      parts = U.panic.split(beat && beat.script);
      U.clear(body);
      nodes = parts.map(function (p) {
        var el = U.el('p', { class: 'u-panic__p', html: p.html });
        body.appendChild(el);
        return el;
      });
      if (!parts.length) body.appendChild(U.el('p', { class: 'u-panic__p is-empty', text: '这一节还没有讲稿。' }));
    }

    function paint() {
      var beat = U.store.beat(), run = U.run.current();
      if (at !== U.store.get().ui.beatIndex) { at = U.store.get().ui.beatIndex; nudge = 0; was = -1; build(beat); }

      var f = U.run.scriptFraction ? U.run.scriptFraction() : 0;
      var guess = U.panic.locate(parts, f, U.store.rate());
      var here = Math.max(0, Math.min(Math.max(0, parts.length - 1), guess + nudge));
      nudge = here - guess;                  /* so holding ↑ at the top does not bank offsets */
      nodes.forEach(function (el, i) {
        el.className = 'u-panic__p' + (i === here ? ' is-here' : i < here ? ' is-past' : '');
      });
      var spent = run && run.perBeat[at] ? run.perBeat[at].spent : 0;
      var budget = (beat && Number(beat.budget)) || 0;
      sum.textContent = '本节已用 ' + U.fmt(spent) + ' / ' + U.fmt(budget) +
        ' → 稿子 ' + Math.round(f * 100) + '% 处';
      tweak.textContent = nudge ? (nudge > 0 ? '往后 ' + nudge + ' 段' : '往前 ' + (-nudge) + ' 段') : '';
      dot.style.top = (parts.length ? (here + 0.5) / parts.length * 100 : 50).toFixed(1) + '%';
      /* Only chase the estimate when it actually moves — a page that scrolls
         under you once a second is unreadable. */
      var el = nodes[here];
      if (here !== was && el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
      was = here;
    }

    paint();
    return {
      update: paint,
      keys: {
        ArrowUp: function () { nudge--; paint(); },
        ArrowDown: function () { nudge++; paint(); }
      }
    };
  }
});
