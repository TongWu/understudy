'use strict';
/* 讲后回填 —— 趁记忆还热，逐节过一遍。

   v1 是边听边填，不是自动 diff：转写默认关（音频一送出去就离开了这台设备），
   所以顶上那句话必须一直挂着 ——「系统不知道你实际说了什么，只有你知道。」
   这不是谦辞，是这一屏的工作原理。 */

(function () {
  var body = null, open = null, drafts = {}, picked = {}, fresh = [], sig = '';
  var ta = null;

  var MARKS = ['漏讲了', '临场加了', '被打断', '讲顺了'];

  function prod() { return U.store.production() || { beats: [], runs: [], qa: [] }; }
  /* 回填的是「刚才那场」：优先真讲的那次，没有就是最近一次排练。 */
  function session() {
    var list = prod().runs || [];
    for (var i = list.length - 1; i >= 0; i--) if (list[i].mode === 'live') return list[i];
    return list[list.length - 1] || null;
  }
  function occasion(run) { return (run && run.at) || (prod().date || '').slice(0, 16) || '这一场'; }

  function draft(beatId) {
    if (!drafts[beatId]) drafts[beatId] = { marks: {}, text: '' };
    return drafts[beatId];
  }
  function markCount(beatId) {
    var d = drafts[beatId]; if (!d) return 0;
    return Object.keys(d.marks).filter(function (k) { return d.marks[k]; }).length + (d.text ? 1 : 0);
  }
  /* 每动一下就写进 run.afterNotes：回填最怕的是填了一半刷新掉。 */
  function persist() {
    var run = session(); if (!run) return;
    U.store.update(function () {
      run.afterNotes = Object.keys(drafts).map(function (id) {
        var d = drafts[id];
        return { beat: id, marks: Object.keys(d.marks).filter(function (k) { return d.marks[k]; }), text: d.text };
      }).filter(function (r) { return r.marks.length || r.text; });
    });
  }
  function loadDrafts(run) {
    drafts = {};
    ((run && run.afterNotes) || []).forEach(function (r) {
      var d = draft(r.beat);
      (r.marks || []).forEach(function (m) { d.marks[m] = true; });
      d.text = r.text || '';
    });
  }

  function svg(markup, cls) { return U.el('span', { class: cls || 'u-reh__ico', html: markup }); }
  var PLAY = '<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 2.2l8 4.8-8 4.8z" fill="currentColor"></path></svg>';
  var TICK = '<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6.4l2.8 2.8L10 3.6"></path></svg>';

  /* 波形是录的时候量出来的；没量到就说没录上，不画假的。 */
  function waveform(beatId) {
    var peaks = U.audio && U.audio.peaks ? U.audio.peaks(beatId) : null;
    if (!peaks || !peaks.length) return U.el('span', { class: 'u-mono u-db__nowave', text: '没录上' });
    var step = peaks.length / 40, bars = [];
    for (var i = 0; i < 40; i++) {
      var v = peaks[Math.min(peaks.length - 1, Math.floor(i * step))] || 0;
      bars.push(U.el('span', { class: 'u-db__wbar', style: { height: Math.max(2, Math.round(v * 17)) + 'px' } }));
    }
    return U.el('span', { class: 'u-db__wave' }, bars);
  }

  function beatRow(r, beat) {
    var on = open === r.id;
    var seg = U.audio && U.audio.segmentFor ? U.audio.segmentFor(r.id) : null;
    var marks = markCount(r.id);
    var row = U.el('button', {
      class: 'u-db__row' + (on ? ' is-open' : ''), 'aria-expanded': String(on),
      onclick: function () { open = on ? null : r.id; ta = null; paint(); }
    }, [
      U.el('span', { class: 'u-mono u-db__n', text: r.n }),
      U.el('span', { class: 'u-db__name' }, [
        U.el('span', { class: 'u-db__nametext', text: r.title }),
        marks ? U.el('span', { class: 'u-mono u-db__marks', text: '已记 ' + marks }) : null
      ]),
      U.el('span', { class: 'u-db__times' }, [
        U.el('span', { class: 'u-mono u-db__spent', text: U.fmt(r.spent) }),
        U.el('span', { class: 'u-mono u-db__diff' + (r.delta > 0 ? ' u-db__diff--over' : ''), text: U.fmtSigned(r.delta) })
      ]),
      waveform(r.id),
      seg
        ? U.el('span', { class: 'u-db__play' }, [svg(PLAY), U.el('span', { class: 'u-mono u-db__len', text: U.fmt(seg.seconds) })])
        : U.el('span')
    ]);
    if (!on) return [row];

    var d = draft(r.id);
    if (!ta) {
      ta = U.el('textarea', {
        class: 'u-db__ta', rows: '3',
        placeholder: '这一节实际发生了什么 —— 漏了哪句、临场加了什么、谁打断的',
        oninput: function () { d.text = ta.value; },
        onchange: function () { d.text = ta.value; persist(); }
      });
      ta.value = d.text;
    }

    var toggles = U.el('div', { class: 'u-db__toggles' }, MARKS.map(function (m) {
      return U.el('button', {
        class: 'u-pill u-db__mark' + (d.marks[m] ? ' is-on' : ''), 'aria-pressed': String(!!d.marks[m]),
        onclick: function () { d.marks[m] = !d.marks[m]; persist(); paint(); }, text: m
      });
    }));
    if (r.delta > 0) toggles.appendChild(U.el('span', { class: 'u-mono u-db__overnote', text: '比预算多 ' + U.fmt(r.delta) }));

    var offset = r.delta > 0 ? r.budget : 0;
    var panel = U.el('div', { class: 'u-db__panel' }, [
      toggles, ta,
      U.el('div', { class: 'u-db__acts' }, [
        U.el('button', {
          class: 'u-btn u-btn--primary u-db__act', text: '写进 ' + r.n + ' 的讲稿',
          onclick: function () {
            var text = (d.text || '').trim(); if (!text) return;
            U.store.update(function () {
              beat.script = (beat.script || '') + '<p>' + text.replace(/[<>&]/g, function (c) {
                return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
              }) + '</p>';
            });
            d.text = ''; ta = null; persist(); paint();
          }
        }),
        U.el('button', {
          class: 'u-btn u-db__act', text: '只作为旁批',
          onclick: function () {
            var text = (d.text || '').trim(); if (!text) return;
            U.store.update(function () { (beat.notes = beat.notes || []).push(text); });
            d.text = ''; ta = null; persist(); paint();
          }
        }),
        seg
          ? U.el('button', {
            class: 'u-btn u-db__act',
            text: offset ? '从超出预算那一刻（' + U.fmt(offset) + '）开始听' : '从头听这一节',
            onclick: function () { U.audio.play(r.id, offset); }
          })
          : U.el('span', { class: 'u-mono u-db__nowave', text: '这一节没录上，只能凭记忆填' })
      ])
    ]);
    return [row, panel];
  }

  /* ---------- 右栏：这场被问到了什么 ---------- */
  function qaRow(item, index) {
    var on = !!picked[index];
    var asked = (item.askedIn || []).length;
    return U.el('button', {
      class: 'u-db__qa', 'aria-pressed': String(on),
      onclick: function () { picked[index] = !on; paint(); }
    }, [
      U.el('span', { class: 'u-db__box' + (on ? ' is-on' : '') }, on ? svg(TICK) : null),
      U.el('span', { class: 'u-db__qtext' }, [
        U.el('span', { class: 'u-db__q', text: item.q }),
        U.el('span', {
          class: 'u-mono u-db__qmeta' + (asked ? '' : ' u-db__qmeta--new'),
          text: asked ? '以前被问过 ' + asked + ' 次' : '还没被问到过'
        })
      ])
    ]);
  }

  function writeBack() {
    var run = session(), key = occasion(run);
    U.store.update(function () {
      var p = prod();
      p.qa = p.qa || [];
      Object.keys(picked).forEach(function (i) {
        if (!picked[i]) return;
        var q = p.qa[Number(i)]; if (!q) return;
        q.askedIn = q.askedIn || [];
        if (q.askedIn.indexOf(key) < 0) q.askedIn.push(key);
      });
      fresh.forEach(function (text) {
        if (!text) return;
        p.qa.push({ q: text, a: '', tags: [], askedIn: [key] });
      });
    });
    picked = {}; fresh = [];
    paint();
  }

  function paint() {
    if (!body) return;
    var p = prod(), run = session();
    U.clear(body);
    if (!run) {
      body.appendChild(U.el('div', { class: 'u-rc__empty' }, [
        U.el('span', { class: 'u-ser u-reh__h1', text: '刚才那场' }),
        U.el('span', { class: 'u-rc__sub', text: '还没有讲过或排过 —— 回填要有一场才填得起来。' }),
        U.el('button', { class: 'u-btn u-btn--primary', text: '去排练', onclick: function () { U.views.show('rehearsal'); } })
      ]));
      return;
    }
    var rows = U.recap.beatRows(run, p.beats);
    var total = run.total || rows.reduce(function (a, r) { return a + r.spent; }, 0);
    var vs = total - (p.target || 0);
    var note = U.audio ? U.audio.note() : '这次没录上';

    body.appendChild(U.el('div', { class: 'u-db__head' }, [
      U.el('div', { class: 'u-rc__title' }, [
        U.el('span', { class: 'u-ser u-reh__h1', text: '刚才那场' }),
        U.el('span', {
          class: 'u-mono u-rc__sub',
          text: String(run.at || '').replace('T', ' ') + ' · ' + (p.audience ? p.audience + ' 人 · ' : '') +
            '实际 ' + U.fmt(total) + ' / 场地 ' + U.fmt(p.target) + ' · ' + (vs > 0 ? '超 ' : '快 ') + U.fmt(Math.abs(vs))
        })
      ]),
      U.el('div', { style: { flex: '1' } }),
      U.el('div', { class: 'u-db__rec' }, [
        U.el('span', { class: 'u-lbl', text: '录音' }),
        U.el('span', { class: 'u-mono u-db__recval', text: note })
      ]),
      U.el('button', { class: 'u-btn', text: '下次再说', onclick: function () { U.views.show('recap'); } }),
      U.el('button', {
        class: 'u-btn u-btn--primary', text: '存进这场记录',
        onclick: function () { persist(); writeBack(); U.views.show('recap'); }
      })
    ]));

    body.appendChild(U.el('div', { class: 'u-db__honest' },
      U.el('span', {
        html: '趁记忆还热，逐节过一遍。' +
          (U.audio && U.audio.segments().length ? '<b>每节都有录音</b>，边听边填' : '这次没录上，只能凭记忆填') +
          ' —— <b>系统不知道你实际说了什么，只有你知道。</b>'
      })));

    /* 左：逐节 */
    var list = U.el('div', { class: 'u-db__list' }, [
      U.el('div', { class: 'u-db__row u-db__row--head' }, [
        U.el('span', { class: 'u-lbl' }), U.el('span', { class: 'u-lbl', text: '逐节' }),
        U.el('span', { class: 'u-lbl u-rc__ra', text: '实际 · 差' }),
        U.el('span', { class: 'u-lbl', text: '录音' }), U.el('span', { class: 'u-lbl' })
      ])
    ]);
    rows.forEach(function (r, i) { beatRow(r, p.beats[i]).forEach(function (n) { list.appendChild(n); }); });

    /* 右：弹药库回填 */
    var prepared = U.el('div', { class: 'u-db__qgroup' }, [
      U.el('div', { class: 'u-db__qhead' }, [
        U.el('span', { class: 'u-lbl u-reh__lbl', text: '这场被问到了什么' }),
        U.el('span', {
          class: 'u-mono u-rc__hint',
          text: Object.keys(picked).filter(function (k) { return picked[k]; }).length + ' 个 · 新冒出来 ' + fresh.length + ' 个'
        })
      ]),
      U.el('span', { class: 'u-mono u-db__qnote', text: '准备过的 —— 勾上就写回弹药库，下次排更前' })
    ]);
    (p.qa || []).forEach(function (item, i) { prepared.appendChild(qaRow(item, i)); });

    var input = U.el('input', {
      class: 'u-db__input', type: 'text', placeholder: '现场新冒出来的问题，回车加进来',
      onkeydown: function (e) {
        if (e.key !== 'Enter') return;
        var v = input.value.trim(); if (!v) return;
        fresh.push(v); input.value = ''; paint();
      }
    });
    var newer = U.el('div', { class: 'u-db__qgroup' }, [
      U.el('span', { class: 'u-mono u-db__qnote u-db__qnote--new', text: '现场新冒出来的 —— 弹药库里没有，补进去' })
    ]);
    fresh.forEach(function (q, i) {
      newer.appendChild(U.el('div', { class: 'u-db__fresh' }, [
        U.el('span', { class: 'u-db__q', text: q }),
        U.el('button', {
          class: 'u-mono u-db__drop', text: '去掉', title: '不加了',
          onclick: function () { fresh.splice(i, 1); paint(); }
        })
      ]));
    });
    newer.appendChild(input);

    var right = U.el('div', { class: 'u-db__side' }, [
      prepared, newer,
      U.el('div', { class: 'u-db__sidefoot' }, [
        U.el('span', {
          class: 'u-db__sidenote',
          text: '写回去之后：勾上的下次自动排在弹药库最前面；新冒出来的会以空答案进弹药库，等你补。'
        }),
        U.el('button', { class: 'u-btn u-btn--primary u-db__writeback', text: '全部写回弹药库', onclick: writeBack })
      ])
    ]);

    body.appendChild(U.el('div', { class: 'u-db__grid' }, [list, right]));

    var keys = U.rehearsal.keybar('debrief');
    if (keys) body.appendChild(keys);
    /* 画完就把签名对上：不这样的话，任何一次本地互动（展开一节、勾一个问题）
       都会让下一次无关的 store 广播误以为「数据变了」而重画 —— 那一下会把
       正在打字的光标冲掉。 */
    sig = signature();
  }

  function signature() {
    var p = prod(), run = session();
    return [U.store.get().ui.view, (p.runs || []).length, (p.qa || []).length,
      run ? run.n : '-', open || '-', (U.audio ? U.audio.segments().length : 0)].join('|');
  }

  U.keys.bind('debrief', 'w', '全部写回弹药库', writeBack, 10);
  U.keys.bind('debrief', 'Escape', '回复盘', function () { U.views.show('recap'); }, 20);

  U.views.register('debrief', {
    mount: function (root) {
      var run = session();
      open = null; picked = {}; fresh = []; ta = null;
      loadDrafts(run);
      root.appendChild(U.el('div', { class: 'u-reh__page' }, [
        U.chrome.topbar({ crumb: '刚才那场' }),
        (body = U.el('div', { class: 'u-reh__body u-db' }))
      ]));
      paint();
      /* 刷新过一次，内存里的段就没了 —— 去 IndexedDB 里把这一场的捞回来。
         捞不到也不说什么，界面本来就写着「没录上」。 */
      if (run && U.audio && !U.audio.segments().length) {
        U.audio.restore(run.n).then(function (list) {
          if (list && list.length) paint();
        });
      }
    },
    /* 只在数据真的变了时重画 —— 不然打字打到一半会被主题开关冲掉。 */
    update: function () {
      var s = signature();
      if (s === sig) return;
      sig = s; paint();
    }
  });
})();
