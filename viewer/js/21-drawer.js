'use strict';
/* 弹药库 — the one place on stage you go to look something up: what you might
   be asked, the glossary, and the fallback lines.

   Two decisions from the design carry the whole screen. It rises from below
   the top bar, so the clock is never covered. And whatever relates to the beat
   you are standing in sorts to the top with an amber dot, because the question
   you are about to be asked is almost always about the slide that is up.

   Relevance is worked out here, in plain arithmetic, so it can be tested
   without a browser:
     · an explicit tag on the entry naming this beat — the strongest signal
     · the entry naming one of this beat's columns
     · words this beat uses that the rest of the talk mostly does not, which is
       what catches "repeat-visit column" on the beat about column W without
       anybody having tagged anything. */

U.drawer = (function () {
  var RELATED = 2;                 /* score at which an entry earns the dot */
  var COMMON = 0.25;               /* a word in more than this share of beats says nothing */
  /* The document-frequency cut below does most of the filtering; this short
     list is here so that a two-beat talk, where nothing is "common", still
     behaves. */
  var STOP = ('the and that this with have from they will what when where which who whose ' +
    'would could should there their them then than about into onto over under after before ' +
    'while your yours ours been being does done here more most some such only just also very ' +
    'much many both each other same well because please need needs want able really every ' +
    'else make makes take takes give gives back down again still even ever never always ' +
    'something anything nothing someone anyone everyone').split(' ');

  function tokens(text) {
    var t = String(text == null ? '' : text).toLowerCase(), out = [];
    (t.match(/[a-z][a-z0-9']{3,}/g) || []).forEach(function (w) {
      w = w.replace(/'s$/, '');
      if (STOP.indexOf(w) < 0) out.push(w);
    });
    (t.match(/[一-鿿]+/g) || []).forEach(function (run) {
      for (var i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
    });
    return out;
  }
  function set(list) {
    var o = {};
    list.forEach(function (w) { o[w] = true; });
    return o;
  }
  function beatText(beat) {
    if (!beat) return '';
    var parts = [beat.title || '', beat.nav || ''];
    (beat.cue || []).forEach(function (c) {
      parts.push(U.textOf(c.lead));
      (c.say || []).forEach(function (s) { parts.push(U.textOf(s)); });
      (c.notes || []).forEach(function (n) { parts.push(n); });
    });
    return parts.join(' ');
  }
  function itemText(item) {
    if (!item) return '';
    return [item.q, item.a, item.term, item.say, item.note, item.when,
      (item.tags || []).map(label).join(' ')].filter(Boolean).join(' ');
  }
  function label(tag) { return typeof tag === 'string' ? tag : (tag && (tag.label || tag.kind)) || ''; }
  function cols(beat) {
    var seen = {}, out = [];
    ((beat && beat.cue) || []).forEach(function (c) {
      (c.cols || []).forEach(function (col) {
        var k = String(col).trim();
        if (k && !seen[k]) { seen[k] = true; out.push(k); }
      });
    });
    return out;
  }
  function colHit(text, col) {
    var c = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:columns?|col|列)\\s*' + c + '\\b|\\b' + c + '\\s*列', 'i').test(text);
  }
  function tagHit(tag, beat) {
    var t = String(label(tag)).toLowerCase();
    if (!t) return false;
    if (t === String(beat.n).toLowerCase() || t === String(beat.id).toLowerCase()) return true;
    return (beat.tags || []).some(function (bt) { return String(label(bt)).toLowerCase() === t; });
  }

  /* Words this beat leans on that the rest of the running order does not. The
     document-frequency cut is what keeps "column" and "table" — true of every
     beat in this talk — from making everything look relevant. */
  function keywords(beat, beats) {
    var list = beats && beats.length ? beats : (beat ? [beat] : []);
    var df = {}, ceiling = Math.max(1, Math.round(list.length * COMMON));
    list.forEach(function (b) {
      Object.keys(set(tokens(beatText(b)))).forEach(function (w) { df[w] = (df[w] || 0) + 1; });
    });
    var keep = {};
    Object.keys(set(tokens(beatText(beat)))).forEach(function (w) {
      if ((df[w] || 0) <= ceiling) keep[w] = true;
    });
    return keep;
  }

  function relevance(item, beat, beats) {
    if (!beat) return 0;
    var text = itemText(item), score = 0;
    (item.tags || []).forEach(function (t) { if (tagHit(t, beat)) score += 4; });
    cols(beat).forEach(function (c) { if (colHit(text, c)) score += 3; });
    var keep = keywords(beat, beats), hits = 0;
    Object.keys(set(tokens(text))).forEach(function (w) { if (keep[w]) hits++; });
    return score + Math.min(3, hits);
  }

  /* Related first, then whatever has actually been asked most, then the order
     they were written in. A stable sort so the list does not shuffle under the
     speaker's eyes between two presses of the same key. */
  function rank(items, beat, beats) {
    return (items || []).map(function (item, i) {
      var score = relevance(item, beat, beats);
      return {
        item: item, index: i, score: score, related: score >= RELATED,
        asked: ((item && item.askedIn) || []).length
      };
    }).sort(function (a, b) {
      return (b.score - a.score) || (b.asked - a.asked) || (a.index - b.index);
    });
  }

  function search(rows, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(function (r) { return itemText(r.item).toLowerCase().indexOf(q) >= 0; });
  }

  /* Which beat introduces this term — the glossary's other job, and the reason
     a term entry can tell you "you explain this at 03". */
  function firstUsedIn(term, beats) {
    var needle = String((term && term.term) || term || '').toLowerCase();
    if (!needle) return null;
    var hit = null;
    (beats || []).some(function (b) {
      if ((beatText(b) + ' ' + U.textOf(b.script)).toLowerCase().indexOf(needle) >= 0) { hit = b; return true; }
      return false;
    });
    return hit;
  }

  /* The mark M writes back: which room asked it, and when. Next time it sorts
     higher — the drawer gets more right the more it is used. */
  function stamp(production, when) {
    var d = when || new Date();
    var occasion = (production && (production.occasion || production.title)) || '这一场';
    return occasion + ' · ' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function mark(item, text) {
    if (!item) return false;
    item.askedIn = item.askedIn || [];
    if (item.askedIn.indexOf(text) >= 0) return false;
    item.askedIn.push(text);
    return true;
  }

  return {
    RELATED: RELATED, tokens: tokens, beatText: beatText, itemText: itemText,
    cols: cols, keywords: keywords, relevance: relevance, rank: rank,
    search: search, firstUsedIn: firstUsedIn, stamp: stamp, mark: mark, label: label
  };
})();

/* ------------------------------------------------------------------ layer */
U.stage.define({
  id: 'drawer',
  hints: [
    { key: 'ArrowUp', label: '选', order: 10 },
    { key: 'ArrowDown', label: '选', order: 11 },
    { key: 'ArrowLeft', label: '切标签', order: 20 },
    { key: 'ArrowRight', label: '切标签', order: 21 },
    { key: '/', label: '搜', order: 30 },
    { key: 'm', label: '标记被问到', order: 40 },
    { key: 'Escape', label: '关', order: 50 }
  ],
  mount: function (root) {
    var TABS = [
      { id: 'qa', label: '可能被问', list: function (p) { return (p && p.qa) || []; } },
      { id: 'terms', label: '术语', list: function (p) { return (p && p.terms) || []; } },
      { id: 'fallbacks', label: '备用说法', list: function (p) { return (p && p.fallbacks) || []; } }
    ];
    var tab = 0, pick = 0, query = '', rows = [];

    var tabsEl = U.el('div', { class: 'u-drawer__tabs' });
    var input = U.el('input', {
      class: 'u-mono u-drawer__input', type: 'text', placeholder: '输入就筛 · 中英都行',
      oninput: function () { query = input.value; pick = 0; paint(); },
      onkeydown: function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); query = ''; input.value = ''; input.blur(); paint(); }
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      }
    });
    var list = U.el('div', { class: 'u-drawer__list' });
    var detail = U.el('div', { class: 'u-drawer__detail' });

    root.appendChild(U.el('div', { class: 'u-drawer' }, [
      U.el('div', { class: 'u-drawer__bar' }, [
        tabsEl,
        U.el('div', { style: { flex: '1' } }),
        U.el('label', { class: 'u-drawer__search' }, [U.stage.chip('/'), input])
      ]),
      U.el('div', { class: 'u-drawer__body' }, [list, detail]),
      U.stage.footer('drawer', [
        U.el('span', { class: 'u-lbl' }, '弹药库'),
        U.el('span', { class: 'u-mono u-stage__footnote' }, '时钟不会被盖住 —— 抽屉只从顶栏以下升起')
      ])
    ]));

    function current() { return rows[pick] || null; }

    function paint() {
      var p = U.store.production(), beat = U.store.beat(), beats = U.store.beats();
      rows = U.drawer.search(U.drawer.rank(TABS[tab].list(p), beat, beats), query);
      if (pick >= rows.length) pick = Math.max(0, rows.length - 1);

      U.clear(tabsEl);
      TABS.forEach(function (t, i) {
        tabsEl.appendChild(U.el('button', {
          class: 'u-lbl u-drawer__tab' + (i === tab ? ' is-on' : ''), 'aria-pressed': String(i === tab),
          onclick: function () { tab = i; pick = 0; paint(); }
        }, [t.label, U.el('span', { class: 'u-drawer__count' }, String(t.list(p).length))]));
      });

      U.clear(list);
      rows.forEach(function (r, i) {
        var it = r.item;
        var title = it.q != null ? U.textOf(it.q) : it.term != null ? it.term : it.when;
        var side = it.askedIn && it.askedIn.length ? '问过 ' + it.askedIn.length + ' 次' : '';
        list.appendChild(U.el('div', {
          class: 'u-drawer__row' + (i === pick ? ' is-on' : ''),
          onclick: function () { pick = i; paint(); }
        }, [
          U.el('span', { class: 'u-drawer__dot' + (r.related ? ' is-related' : '') }),
          U.el('span', { class: 'u-drawer__q', text: title }),
          side ? U.el('span', { class: 'u-mono u-drawer__asked', text: side }) : null
        ]));
      });
      list.appendChild(U.el('div', { class: 'u-drawer__legend' }, [
        U.el('span', { class: 'u-drawer__dot is-related' }),
        U.el('span', { class: 'u-mono', text: '= 和当前这节相关，自动排前面' })
      ]));

      paintDetail(beat, beats);
      var on = list.querySelector('.is-on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    }

    function paintDetail(beat, beats) {
      U.clear(detail);
      var r = current();
      if (!r) {
        detail.appendChild(U.el('div', { class: 'u-mono u-drawer__empty', text: '没有匹配的条目' }));
        return;
      }
      var it = r.item, chips = U.el('div', { class: 'u-drawer__chips' });
      if (r.related && beat) chips.appendChild(U.el('span', { class: 'u-chip', text: beat.n }));
      (it.tags || []).forEach(function (t) {
        chips.appendChild(U.el('span', { class: 'u-chip', text: U.drawer.label(t) }));
      });
      U.drawer.cols(beat).forEach(function (c) {
        if (new RegExp('(?:columns?|col|列)\\s*' + c + '\\b', 'i').test(U.drawer.itemText(it))) {
          chips.appendChild(U.el('span', { class: 'u-chip', text: c + ' 列' }));
        }
      });
      var used = it.term ? U.drawer.firstUsedIn(it, beats) : null;
      if (used) chips.appendChild(U.el('span', { class: 'u-chip', text: '第一次出现在 ' + used.n }));
      detail.appendChild(chips);

      detail.appendChild(U.el('div', { class: 'u-drawer__ask', html: it.q != null ? it.q : (it.term || it.when || '') }));
      var answer = it.a != null ? it.a : it.say;
      detail.appendChild(U.el('div', { class: 'u-read u-drawer__answer', html: answer || '还没写' }));
      if (it.note) {
        detail.appendChild(U.el('div', { class: 'u-drawer__note' }, [
          U.el('span', { class: 'u-lbl u-drawer__notelbl' }, '旁批'),
          U.el('span', { text: it.note })
        ]));
      }
      var asked = (it.askedIn || []).slice(-1)[0];
      detail.appendChild(U.el('div', { class: 'u-drawer__foot' }, [
        U.el('span', { class: 'u-mono u-drawer__last', text: asked ? '上次被问：' + asked : '还没被问到过' }),
        U.el('div', { style: { flex: '1' } }),
        it.q != null ? U.stage.chip('m') : null,
        it.q != null ? U.el('span', { class: 'u-mono u-drawer__markhint', text: '这场也被问到了 → 下次排更前' }) : null
      ]));
    }

    function move(d) { if (rows.length) { pick = Math.max(0, Math.min(rows.length - 1, pick + d)); paint(); } }

    paint();
    return {
      update: function () { /* the list is stable while the drawer is open */ },
      keys: {
        ArrowUp: function () { move(-1); },
        ArrowDown: function () { move(1); },
        ArrowLeft: function () { tab = (tab + TABS.length - 1) % TABS.length; pick = 0; paint(); },
        ArrowRight: function () { tab = (tab + 1) % TABS.length; pick = 0; paint(); },
        '/': function () { input.focus(); input.select(); },
        m: function () {
          var r = current();
          if (!r || r.item.q == null) return;
          var text = U.drawer.stamp(U.store.production());
          U.store.update(function () { U.drawer.mark(r.item, text); });
          paint();
        }
      }
    };
  }
});
