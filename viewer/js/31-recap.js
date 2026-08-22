'use strict';
/* 排练复盘 —— 时间是从哪一节漏出去的。

   主图是两条轨道共用一个 px/秒刻度、都左对齐于 0：只有这样，「计划到这里的时候
   实际才走到那里」才是看出来的，不是算出来的。几何全部是纯函数（U.recap.*），
   因为图表最容易错的地方是算术，而算术是可以在 node 里测的。

   同难度才横向比。样例里第 3 次是「只看提词」，前两次是「照读」—— 那个
   「快了 39 秒」是换了张卷子，不是进步，界面必须说出来。 */

U.recap = (function () {

  var GAP = 2;        /* 段与段之间留底色的缝，而不是画边框 */
  var SPLIT = 1.5;    /* 一节内部「预算内 / 超出」之间的发丝缝 */

  function num(v) { return Number(v) || 0; }
  function budgetOf(b) { return num(b && b.budget); }

  /* ---------- 一次 run 的逐节数字 ---------- */
  function beatRows(run, beats) {
    var per = (run && run.perBeat) || [];
    var byId = {}, keyed = false;
    per.forEach(function (s) { if (s && s.beat) { byId[s.beat] = s; keyed = true; } });
    /* 对得上 id 就按 id 对 —— 只在整份记录都没有 id 时才退回按位置。
       半对半错地混着来，只会让某一节悄悄顶替另一节的数字。 */
    return (beats || []).map(function (b, i) {
      var slot = keyed ? (byId[b.id] || null) : (per[i] || null);
      var spent = slot ? num(slot.spent) : 0;
      var budget = budgetOf(b);
      return {
        i: i, id: b.id, n: b.n, title: b.nav || b.title || b.id,
        budget: budget, spent: spent, delta: spent - budget,
        over: spent > budget,
        /* 「讲到了」= 真的花过时间。U.run.start 会给每一节都开一个 0 秒的格子，
           所以格子在不代表这一节讲过 —— 认格子的话，没走到的节会以「比预算快
           1:30」的身份进复盘。 */
        ran: !!slot && spent > 0
      };
    });
  }

  /* ---------- 一条轨道 ----------
     items: [{id, n, seconds, budget?}]。budget 给了且超了，就把这一段切成
     「预算内」和「超出」两块。x 直接由累计秒数乘刻度算出，所以两条轨道的
     px/秒必然相同 —— 这不是约定，是构造出来的。 */
  function lane(items, scale, gap) {
    var g = gap == null ? GAP : gap, cum = 0;
    return (items || []).map(function (it) {
      var sec = num(it.seconds);
      var x = cum * scale;
      /* 没讲到的一节不是一根 1px 的小条，是什么都没有 —— 画个小条会让人以为
         那里发生过什么。 */
      var w = sec > 0 ? Math.max(1, sec * scale - g) : 0;
      var seg = { id: it.id, n: it.n, seconds: sec, budget: it.budget, x: x, w: w, at: cum, empty: sec <= 0 };
      if (it.budget != null && sec > num(it.budget) && w - SPLIT - 1 >= 1) {
        var over = (sec - num(it.budget)) * scale;
        over = Math.max(1, Math.min(over, w - SPLIT - 1));
        seg.base = { x: x, w: w - over - SPLIT };
        seg.over = { x: x + (w - over - SPLIT) + SPLIT, w: over };
      }
      cum += sec;
      return seg;
    });
  }

  function totals(run, beats) {
    var rows = beatRows(run, beats);
    return {
      plan: rows.reduce(function (a, r) { return a + r.budget; }, 0),
      actual: rows.reduce(function (a, r) { return a + r.spent; }, 0),
      rows: rows
    };
  }

  /* ---------- 计划 / 实际 双轨 ---------- */
  function timeline(run, beats, opts) {
    opts = opts || {};
    var width = num(opts.width) || 1176;
    var gap = opts.gap == null ? GAP : opts.gap;
    var t = totals(run, beats);
    var target = num(opts.target);
    var extra = (opts.also || []).map(function (r) { return totals(r, beats).actual; });
    var span = Math.max.apply(null, [t.plan, t.actual, target, 1].concat(extra));
    var scale = width / span;

    var plan = lane(t.rows.map(function (r) { return { id: r.id, n: r.n, seconds: r.budget }; }), scale, gap);
    var actual = lane(t.rows.map(function (r) { return { id: r.id, n: r.n, seconds: r.spent, budget: r.budget }; }), scale, gap);

    var ticks = [];
    for (var m = 0; m * 60 <= span; m++) ticks.push({ minute: m, x: m * 60 * scale, label: m + '′' });

    return {
      width: width, span: span, scale: scale, gap: gap,
      planTotal: t.plan, actualTotal: t.actual, rows: t.rows,
      plan: plan, actual: actual, ticks: ticks,
      target: target ? { seconds: target, x: target * scale } : null
    };
  }

  /* 对比模式：同一把尺子上叠几次 run，每条轨道都要标出自己的难度。 */
  function laneFor(run, beats, scale, gap) {
    var rows = beatRows(run, beats);
    return lane(rows.map(function (r) { return { id: r.id, n: r.n, seconds: r.spent, budget: r.budget }; }), scale, gap);
  }

  /* ---------- 只跟同难度比 ---------- */
  function sameDifficulty(runs, difficulty) {
    return (runs || []).filter(function (r) { return (r.difficulty || 1) === Number(difficulty); });
  }
  /* 这次之前、同难度的那一次。没有就是没有 —— 不要拿隔壁难度凑数。 */
  function previousSame(runs, run) {
    var list = runs || [], at = list.indexOf(run);
    if (at < 0) at = list.length;
    for (var i = at - 1; i >= 0; i--) if ((list[i].difficulty || 1) === (run.difficulty || 1)) return list[i];
    return null;
  }
  function previousAny(runs, run) {
    var list = runs || [], at = list.indexOf(run);
    if (at < 0) at = list.length;
    return at > 0 ? list[at - 1] : null;
  }
  function covered(run, beats) {
    return beatRows(run, beats).filter(function (r) { return r.ran; }).length;
  }
  /* 「比上一次」这一格该说什么。可比就给差值，不可比就说明白为什么。
     两道门：难度要一样，走过的节数也要一样 —— 只练了三节的 3:50 跟走完全场的
     13:12 摆在一起，那个「快了 9:22」是纯粹的假话。 */
  function comparison(runs, run, beats) {
    var same = previousSame(runs, run);
    if (same) {
      if (beats) {
        var mine = covered(run, beats), theirs = covered(same, beats);
        if (mine !== theirs) return {
          comparable: false, other: same, delta: num(run.total) - num(same.total),
          why: '这一遍只走到 ' + mine + ' 节，第 ' + same.n + ' 次走了 ' + theirs + ' 节，比总时长没有意义'
        };
      }
      return { comparable: true, other: same, delta: num(run.total) - num(same.total) };
    }
    var any = previousAny(runs, run);
    if (!any) return { comparable: false, other: null, delta: null, why: '第一次排，还没有可比的' };
    return {
      comparable: false, other: any, delta: num(run.total) - num(any.total),
      why: '上一次是' + (U.rehearsal ? U.rehearsal.levelName(any.difficulty) : String(any.difficulty)) + '，难度不同，不能直接比'
    };
  }

  /* ---------- 三次趋势 ---------- */
  function trend(runs, opts) {
    opts = opts || {};
    var list = (runs || []).slice(-(opts.take || 3));
    var box = { w: num(opts.width) || 300, h: num(opts.height) || 88 };
    var top = opts.top == null ? 16.4 : opts.top, bottom = opts.bottom == null ? 67.6 : opts.bottom;
    var left = opts.left == null ? 34 : opts.left, right = opts.right == null ? 234 : opts.right;
    var target = num(opts.target);
    var vals = list.map(function (r) { return num(r.total); });
    var lo = Math.min.apply(null, vals.concat(target ? [target] : []));
    var hi = Math.max.apply(null, vals.concat(target ? [target] : []));
    function y(v) { return hi === lo ? (top + bottom) / 2 : top + (hi - v) / (hi - lo) * (bottom - top); }
    var step = list.length > 1 ? (right - left) / (list.length - 1) : 0;
    return {
      width: box.w, height: box.h, min: lo, max: hi,
      points: list.map(function (r, i) {
        return { x: left + i * step, y: y(num(r.total)), total: num(r.total), run: r, last: i === list.length - 1 };
      }),
      target: target ? { seconds: target, y: y(target) } : null
    };
  }

  /* ---------- 实测语速：这次讲完的那些节，稿子有多少字 ÷ 实际用了多久 ---------- */
  function measuredRate(run, beats) {
    var rows = beatRows(run, beats), en = 0, zh = 0, secs = 0;
    rows.forEach(function (r, i) {
      if (!r.spent) return;
      var c = U.countWords(U.textOf((beats[i] || {}).script));
      en += c.en; zh += c.zh; secs += r.spent;
    });
    if (!secs) return null;
    return { seconds: secs, words: en, chars: zh, en: en / (secs / 60), zh: zh / (secs / 60) };
  }

  /* ---------- 发现 ---------- */
  function findings(run, runs, beats) {
    var rows = beatRows(run, beats), out = [];
    var overs = rows.filter(function (r) { return r.ran && r.over; });
    var worst = overs.slice().sort(function (a, b) { return b.delta - a.delta; })[0];
    var peers = sameDifficulty(runs, run.difficulty || 1);

    if (worst) {
      var alsoOver = peers.filter(function (r) {
        var rr = beatRows(r, beats)[worst.i];
        return rr && rr.over;
      }).length;
      out.push({
        title: worst.n + ' 超了 ' + Math.round(worst.delta) + ' 秒' +
          (alsoOver > 1 ? ' —— 同难度的 ' + alsoOver + ' 次都超' : ' —— 全场最多的一节'),
        body: alsoOver > 1
          ? '每次都超，问题就不在临场发挥，在稿子。这一节 ' + U.fmt(worst.budget) + ' 的预算里塞了 ' +
            ((beats[worst.i] || {}).cue || []).length + ' 条提词。'
          : '这一节 ' + U.fmt(worst.budget) + ' 的预算里塞了 ' + ((beats[worst.i] || {}).cue || []).length + ' 条提词。'
      });
    }
    var rushed = rows.filter(function (r) { return worst && r.ran && r.i > worst.i && r.delta <= -5; })
      .sort(function (a, b) { return a.delta - b.delta; })[0];
    if (rushed) {
      out.push({
        title: '超时之后你在赶',
        body: rushed.n + ' 比预算快 ' + Math.abs(Math.round(rushed.delta)) + ' 秒 —— 全场压缩最狠的一节。' +
          '压缩是发生了，但它不是你选的，是被前面挤出来的。'
      });
    }
    var steady = rows.filter(function (r) { return r.ran && !r.over && Math.abs(r.delta) <= 5; });
    if (steady.length) {
      out.push({
        title: steady.length + ' 节稳在预算里',
        body: steady.map(function (r) { return r.n; }).join(' · ') + ' 都在正负 5 秒内，不用再练。'
      });
    }
    var missed = rows.filter(function (r) { return !r.ran; });
    if (missed.length) out.unshift({
      title: '这一遍只走到 ' + rows.filter(function (r) { return r.ran; }).length + ' 节',
      body: missed.map(function (r) { return r.n; }).join(' · ') + ' 没讲到，所以下面的数字只说得了走完的那几节。'
    });
    else if (!overs.length) out.unshift({ title: '这一遍没有超时的节', body: '全场每一节都落在预算里 —— 可以升一级难度再排。' });
    return out;
  }

  /* ---------- 建议 ----------
     挪预算不会让演讲变短，只有删词会。这条必须写在建议里，不然「重排预算」
     看起来就像解决了问题。 */
  function advice(run, runs, beats, target, rate) {
    var t = totals(run, beats), rows = t.rows;
    var sum = t.plan || 1;
    var wish = rows.map(function (r) { return r.ran ? r.spent : r.budget; });
    var wsum = wish.reduce(function (a, b) { return a + b; }, 0) || 1;
    var scaled = wish.map(function (v) { return Math.max(5, Math.round(v * sum / wsum / 5) * 5); });
    var moves = rows.map(function (r, i) { return { n: r.n, id: r.id, from: r.budget, to: scaled[i], by: scaled[i] - r.budget }; })
      .filter(function (m) { return m.by !== 0; })
      .sort(function (a, b) { return Math.abs(b.by) - Math.abs(a.by); });
    var overBy = t.actual - num(target);
    var wpm = (rate && rate.en) || U.DEFAULT_RATE.en;
    return {
      moves: moves.slice(0, 4), proposal: scaled, planTotal: sum,
      overTarget: overBy,
      cutWords: overBy > 0 ? Math.round(overBy / 60 * wpm) : 0
    };
  }

  return {
    GAP: GAP, SPLIT: SPLIT,
    beatRows: beatRows, lane: lane, laneFor: laneFor, totals: totals, timeline: timeline,
    sameDifficulty: sameDifficulty, previousSame: previousSame, previousAny: previousAny,
    comparison: comparison, covered: covered, trend: trend, measuredRate: measuredRate,
    findings: findings, advice: advice
  };
})();

/* ================= 视图 ================= */
(function () {
  var R = U.recap;
  var body = null, selected = null, compare = false, drawn = null;

  function prod() { return U.store.production() || { beats: [], runs: [], target: 0 }; }
  function runs() { return prod().runs || []; }
  function current() {
    var list = runs();
    if (selected != null && list[selected]) return list[selected];
    return list[list.length - 1] || null;
  }
  function diffName(d) { return U.rehearsal ? U.rehearsal.levelName(d) : String(d); }

  function svg(markup, cls) { return U.el('span', { class: cls || 'u-reh__ico', html: markup }); }
  var PLAY = '<svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 2.2l8 4.8-8 4.8z" fill="currentColor"></path></svg>';

  function tile(label, main, note, cls) {
    return U.el('div', { class: 'u-card u-rc__tile' + (cls ? ' ' + cls : '') }, [
      U.el('span', { class: 'u-lbl', text: label }), main,
      note ? U.el('span', { class: 'u-mono u-rc__tilenote', text: note }) : null
    ]);
  }

  /* ---------- 主图 ---------- */
  function drawTimeline(host) {
    var p = prod(), run = current();
    if (!run || !host) return;
    var width = host.clientWidth || 1176;
    var also = compare ? runs().slice(-3).filter(function (r) { return r !== run; }) : [];
    var tl = R.timeline(run, p.beats, { width: width, target: p.target, also: also });
    drawn = tl;
    U.clear(host);

    /* 场地时间标注：右对齐到线的左边，不压到刻度。这一行永远在（没有场地时间时
       是空的），因为左边那列的对齐是按它的高度算的。 */
    host.appendChild(U.el('div', { class: 'u-rc__tlab' },
      tl.target ? U.el('span', {
        class: 'u-mono u-rc__tlabtext', style: { width: Math.max(0, tl.target.x - 7) + 'px' },
        text: U.fmt(tl.target.seconds) + ' 场地时间 →'
      }) : null));

    /* 一节 = 一个定位盒子，里面 1~2 块填色。「超出」是这一节内部的一块，
       不是另一节 —— 分成两个平级的段会让这一节在量尺子的时候少掉一截。 */
    function laneEl(segs, kind) {
      var row = U.el('div', { class: 'u-rc__lane' });
      segs.forEach(function (s) {
        if (s.empty) return;
        var fills = s.over
          ? [U.el('div', { class: 'u-rc__fill u-rc__fill--' + kind, style: { left: '0px', width: s.base.w + 'px' } }),
             U.el('div', { class: 'u-rc__fill u-rc__fill--over', style: { left: (s.base.w + R.SPLIT) + 'px', width: s.over.w + 'px' } })]
          : [U.el('div', { class: 'u-rc__fill u-rc__fill--' + kind, style: { left: '0px', width: s.w + 'px' } })];
        row.appendChild(U.el('div', {
          class: 'u-rc__seg u-rc__seg--' + kind, style: { left: s.x + 'px', width: s.w + 'px' },
          'data-seconds': String(s.seconds), 'data-beat': s.id
        }, fills));
        row.appendChild(U.el('div', { class: 'u-mono u-rc__segn u-rc__segn--' + kind, style: { left: (s.x + 4) + 'px' }, text: s.n }));
      });
      return row;
    }

    var stack = U.el('div', { class: 'u-rc__stack' });
    stack.appendChild(laneEl(tl.plan, 'plan'));
    stack.appendChild(laneEl(tl.actual, 'actual'));
    also.forEach(function (r) {
      stack.appendChild(laneEl(R.laneFor(r, p.beats, tl.scale, tl.gap), 'other'));
    });

    var ticks = U.el('div', { class: 'u-rc__ticks' });
    tl.ticks.forEach(function (t) {
      ticks.appendChild(U.el('div', { class: 'u-rc__tick', style: { left: t.x + 'px' } }));
      ticks.appendChild(U.el('div', { class: 'u-mono u-rc__ticklab', style: { left: (t.x + 4) + 'px' }, text: t.label }));
    });
    stack.appendChild(ticks);
    if (tl.target) stack.appendChild(U.el('div', {
      class: 'u-rc__tline',
      style: { left: tl.target.x + 'px', height: (24 * (2 + also.length) + 2 * (1 + also.length)) + 'px' }
    }));
    host.appendChild(stack);
  }

  function timelineCard() {
    var p = prod(), run = current();
    var t = R.totals(run, p.beats);
    var also = compare ? runs().slice(-3).filter(function (r) { return r !== run; }) : [];

    var gutter = U.el('div', { class: 'u-rc__gutter' }, [
      U.el('div', { class: 'u-rc__gut' }, [
        U.el('span', { class: 'u-mono u-rc__gutname', text: '计划' }),
        U.el('span', { class: 'u-mono u-rc__gutval', text: U.fmt(t.plan) })
      ]),
      U.el('div', { class: 'u-rc__gut' }, [
        U.el('span', {
          class: 'u-mono u-rc__gutname u-rc__gutname--on',
          text: compare ? '第 ' + run.n + ' 次 · ' + diffName(run.difficulty) : '实际'
        }),
        U.el('span', { class: 'u-mono u-rc__gutval' + (t.actual > (p.target || t.plan) ? ' u-rc__gutval--over' : ''), text: U.fmt(t.actual) })
      ])
    ]);
    also.forEach(function (r) {
      gutter.appendChild(U.el('div', { class: 'u-rc__gut' }, [
        U.el('span', { class: 'u-mono u-rc__gutname', text: '第 ' + r.n + ' 次 · ' + diffName(r.difficulty) }),
        U.el('span', { class: 'u-mono u-rc__gutval', text: U.fmt(r.total) })
      ]));
    });

    var host = U.el('div', { class: 'u-rc__chart' });
    var card = U.el('div', { class: 'u-card u-rc__tl' }, [
      U.el('div', { class: 'u-rc__tlhead' }, [
        U.el('span', { class: 'u-lbl u-reh__lbl', text: '计划 / 实际 · 同一条时间轴' }),
        U.el('span', { class: 'u-mono u-rc__hint', text: '时间从哪一节开始漏出去的' }),
        U.el('div', { style: { flex: '1' } }),
        U.el('div', { class: 'u-rc__key' }, [
          U.el('span', { class: 'u-rc__kbox u-rc__kbox--plan' }), U.el('span', { class: 'u-mono u-rc__ktext', text: '计划' })
        ]),
        U.el('div', { class: 'u-rc__key' }, [
          U.el('span', { class: 'u-rc__kbox u-rc__kbox--actual' }), U.el('span', { class: 'u-mono u-rc__ktext', text: '实际' })
        ]),
        U.el('div', { class: 'u-rc__key' }, [
          U.el('span', { class: 'u-rc__kbox u-rc__kbox--over' }), U.el('span', { class: 'u-mono u-rc__ktext', text: '超出预算的部分' })
        ]),
        also.length ? U.el('div', { class: 'u-rc__key' }, [
          U.el('span', { class: 'u-rc__kbox u-rc__kbox--other' }), U.el('span', { class: 'u-mono u-rc__ktext', text: '另外几次（左边标着难度）' })
        ]) : null
      ]),
      U.el('div', { class: 'u-rc__tlbody' }, [gutter, host])
    ]);
    return { card: card, host: host };
  }

  /* ---------- 逐节对比 ---------- */
  function beatTable() {
    var p = prod(), run = current();
    var rows = R.beatRows(run, p.beats);
    var maxSec = Math.max.apply(null, rows.map(function (r) { return Math.max(r.budget, r.spent); }).concat([1]));
    var RW = 260, s2 = RW / maxSec;

    var table = U.el('div', { class: 'u-rc__tbl' }, [
      U.el('div', { class: 'u-rc__trow u-rc__trow--head' }, [
        U.el('span', { class: 'u-lbl' }), U.el('span', { class: 'u-lbl', text: '逐节' }),
        U.el('span', { class: 'u-lbl', text: '预算 / 实际' }),
        U.el('span', { class: 'u-lbl u-rc__ra', text: '实际 · 差' }),
        U.el('span', { class: 'u-lbl', text: '录音' })
      ])
    ]);
    rows.forEach(function (r) {
      var bars = U.el('div', { class: 'u-rc__bars' }, [
        U.el('div', { class: 'u-rc__bar u-rc__bar--plan', style: { width: (r.budget * s2) + 'px' } })
      ]);
      if (!r.ran) { /* 没讲到就没有实际那一条 */ }
      else if (r.over) {
        var w = r.spent * s2, ow = Math.max(1, (r.spent - r.budget) * s2);
        bars.appendChild(U.el('div', { class: 'u-rc__barrow' }, [
          U.el('div', { class: 'u-rc__bar u-rc__bar--actual', style: { width: Math.max(1, w - ow - 1.5) + 'px' } }),
          U.el('div', { style: { width: '1.5px' } }),
          U.el('div', { class: 'u-rc__bar u-rc__bar--over', style: { width: ow + 'px' } })
        ]));
      } else {
        bars.appendChild(U.el('div', { class: 'u-rc__bar u-rc__bar--actual', style: { width: (r.spent * s2) + 'px' } }));
      }
      var seg = U.audio && U.audio.segmentFor ? U.audio.segmentFor(r.id) : null;
      table.appendChild(U.el('div', { class: 'u-rc__trow' }, [
        U.el('span', { class: 'u-mono u-rc__tn', text: r.n }),
        U.el('span', { class: 'u-rc__ttitle', text: r.title }),
        bars,
        r.ran
          ? U.el('div', { class: 'u-rc__tdelta' }, [
            U.el('span', { class: 'u-mono u-rc__tspent', text: U.fmt(r.spent) }),
            U.el('span', { class: 'u-mono u-rc__tdiff' + (r.delta > 0 ? ' u-rc__tdiff--over' : ''), text: U.fmtSigned(r.delta) })
          ])
          : U.el('div', { class: 'u-rc__tdelta' }, U.el('span', { class: 'u-mono u-rc__noaudio', text: '这一遍没讲到' })),
        seg
          ? U.el('button', {
            class: 'u-rc__play', title: '放这一节的录音',
            onclick: function () { U.audio.play(r.id, 0); }
          }, [svg(PLAY), U.el('span', { class: 'u-mono u-rc__playlen', text: U.fmt(seg.seconds) })])
          : U.el('span', { class: 'u-mono u-rc__noaudio', text: '没录上' })
      ]));
    });
    return table;
  }

  /* ---------- 趋势 ---------- */
  function trendBlock() {
    var p = prod(), list = runs();
    var tr = R.trend(list, { target: p.target });
    var parts = [];
    if (tr.target) {
      parts.push('<line x1="24" y1="' + tr.target.y.toFixed(1) + '" x2="252" y2="' + tr.target.y.toFixed(1) + '" stroke="var(--over)" stroke-width="1"></line>');
      parts.push('<text x="258" y="' + (tr.target.y + 3.4).toFixed(1) + '" font-family="var(--mono)" font-size="9.5" fill="var(--over)">' + U.fmt(tr.target.seconds) + '</text>');
    }
    parts.push('<polyline points="' + tr.points.map(function (pt) { return pt.x.toFixed(1) + ',' + pt.y.toFixed(1); }).join(' ') +
      '" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></polyline>');
    tr.points.forEach(function (pt) {
      parts.push('<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="' + (pt.last ? 4.5 : 4) +
        '" fill="var(--ink)" stroke="var(--paper)" stroke-width="2"></circle>');
    });
    var last = tr.points[tr.points.length - 1];
    if (last) parts.push('<text x="' + (last.x + 12).toFixed(1) + '" y="' + (last.y + 3.4).toFixed(1) +
      '" font-family="var(--mono)" font-size="12" font-weight="600" fill="var(--ink)">' + U.fmt(last.total) + '</text>');
    tr.points.forEach(function (pt) {
      parts.push('<text x="' + (pt.x - 10).toFixed(1) + '" y="85" font-family="var(--mono)" font-size="9.5" fill="var(--ink-3)">第 ' + pt.run.n + ' 次</text>');
    });

    var mixed = tr.points.some(function (pt) { return (pt.run.difficulty || 1) !== (tr.points[0].run.difficulty || 1); });
    return U.el('div', { class: 'u-rc__trend' }, [
      U.el('div', { class: 'u-rc__trendhead' }, [
        U.el('span', { class: 'u-lbl u-reh__lbl', text: tr.points.length + ' 次排练' }),
        U.el('span', { class: 'u-mono u-rc__hint', text: '每次都在靠近 ' + U.fmt(p.target) })
      ]),
      U.el('div', {
        class: 'u-rc__trendsvg',
        html: '<svg width="300" height="88" viewBox="0 0 300 88" role="img" aria-label="' +
          tr.points.map(function (pt) { return '第 ' + pt.run.n + ' 次 ' + U.fmt(pt.total); }).join('、') +
          '，场地时间 ' + U.fmt(p.target) + '">' + parts.join('') + '</svg>'
      }),
      U.el('div', { class: 'u-rc__trendlegend' }, tr.points.map(function (pt) {
        return U.el('span', { class: 'u-pill', text: '第 ' + pt.run.n + ' 次 · ' + diffName(pt.run.difficulty) });
      })),
      mixed ? U.el('span', { class: 'u-rc__warn', text: '这几次难度不同 —— 折线是趋势，不是成绩，别当成「越来越快」。' }) : null
    ]);
  }

  /* ---------- 发现与建议 ---------- */
  function adviceBlock() {
    var p = prod(), run = current();
    var a = R.advice(run, runs(), p.beats, p.target, U.store.rate());
    var up = a.moves.filter(function (m) { return m.by > 0; }).slice(0, 2);
    var down = a.moves.filter(function (m) { return m.by < 0; }).slice(0, 2);
    var line = up.length
      ? '按你的实测重排预算：' + up.map(function (m) { return m.n + ' 从 ' + U.fmt(m.from) + ' 改成 ' + U.fmt(m.to); }).join('，') +
        (down.length ? '，从 ' + down.map(function (m) { return m.n; }).join('、') +
          (down.length > 1 ? ' 各收回 ' : ' 收回 ') +
          down.map(function (m) { return Math.abs(m.by) + ' 秒'; }).join('、') : '') + '。'
      : '预算和你的实测已经对得上了，不用挪。';
    return U.el('div', { class: 'u-rc__advice' }, [
      U.el('span', { class: 'u-lbl u-reh__lbl', text: '建议' }),
      U.el('span', { class: 'u-rc__adviceline', text: line }),
      U.el('span', { class: 'u-mono u-rc__hint', text: '预算合计 ' + U.fmt(a.planTotal) + ' 不变，但每节终于对得上你的语速' }),
      U.el('span', {
        class: 'u-rc__honest',
        html: a.overTarget > 0
          ? '<b>挪预算不会让演讲变短，只有删词会。</b>想真的讲进 ' + U.fmt(p.target) + '，还得删掉约 ' +
            Math.round(a.overTarget) + ' 秒的稿子 —— 按你的实测语速大约 ' + a.cutWords + ' 个词。'
          : '<b>挪预算不会让演讲变短，只有删词会。</b>这一遍已经落在 ' + U.fmt(p.target) + ' 之内，稿子不用删。'
      }),
      U.el('div', { class: 'u-rc__acts' }, [
        U.el('button', {
          class: 'u-btn u-btn--primary u-rc__act', text: '按实测重排预算',
          onclick: function () {
            U.store.update(function () {
              (prod().beats || []).forEach(function (b, i) { if (a.proposal[i] != null) b.budget = a.proposal[i]; });
            });
          }
        }),
        up[0] ? U.el('button', {
          class: 'u-btn u-rc__act', text: '只改 ' + up[0].n + ' 的预算',
          onclick: function () {
            U.store.update(function () {
              (prod().beats || []).forEach(function (b) { if (b.id === up[0].id) b.budget = up[0].to; });
            });
          }
        }) : null
      ])
    ]);
  }

  function paint() {
    if (!body) return;
    var p = prod(), list = runs(), run = current();
    U.clear(body);
    if (!run) {
      body.appendChild(U.el('div', { class: 'u-rc__empty' }, [
        U.el('span', { class: 'u-ser u-reh__h1', text: '排练复盘' }),
        U.el('span', { class: 'u-rc__sub', text: '还没有排过 —— 先去排一次，这里才有东西可看。' }),
        U.el('button', { class: 'u-btn u-btn--primary', text: '去排练', onclick: function () { U.views.show('rehearsal'); } })
      ]));
      return;
    }

    var t = R.totals(run, p.beats);
    var cmp = R.comparison(list, run, p.beats);
    var mr = R.measuredRate(run, p.beats);
    var overs = t.rows.filter(function (r) { return r.over; });
    var vsTarget = t.actual - (p.target || 0);

    /* 头 */
    var pills = U.el('div', { class: 'u-rc__pills' });
    list.slice(-3).forEach(function (r) {
      var on = r === run;
      pills.appendChild(U.el('button', {
        class: 'u-pill u-rc__pill' + (on ? ' is-on' : ''), 'aria-pressed': String(on),
        onclick: function () { selected = list.indexOf(r); compare = false; paint(); },
        text: '第 ' + r.n + ' 次 · ' + diffName(r.difficulty)
      }));
    });
    if (list.length > 1) pills.appendChild(U.el('button', {
      class: 'u-pill u-rc__pill' + (compare ? ' is-on' : ''), 'aria-pressed': String(compare),
      onclick: function () { compare = !compare; paint(); }, text: '叠起来看'
    }));

    body.appendChild(U.el('div', { class: 'u-rc__head' }, [
      U.el('div', { class: 'u-rc__title' }, [
        U.el('span', { class: 'u-ser u-reh__h1', text: '排练复盘' }),
        U.el('span', {
          class: 'u-mono u-rc__sub',
          text: '第 ' + run.n + ' 次 · ' + String(run.at || '').replace('T', ' ') + ' · ' + diffName(run.difficulty)
        })
      ]),
      U.el('div', { style: { flex: '1' } }),
      pills
    ]));

    /* 统计条 */
    var hero = U.el('div', { class: 'u-rc__heroval' }, [
      U.el('span', { class: 'u-mono u-rc__hero', text: U.fmt(t.actual) }),
      U.el('div', { class: 'u-rc__herodelta' }, [
        U.el('span', {
          class: 'u-mono u-rc__badge u-rc__badge--' + (vsTarget > 0 ? 'over' : 'go'),
          text: (vsTarget > 0 ? '超 ' : '快 ') + U.fmt(Math.abs(vsTarget))
        }),
        U.el('span', { class: 'u-mono u-rc__heronote', text: '比场地时间 ' + U.fmt(p.target) })
      ])
    ]);
    body.appendChild(U.el('div', { class: 'u-rc__stats' }, [
      tile('全程', hero, null, 'u-rc__tile--hero'),
      tile('超时的节',
        U.el('span', { class: 'u-mono u-rc__stat' }, [String(overs.length), U.el('span', { class: 'u-rc__unit', text: ' 节' })]),
        overs.length ? overs.map(function (r) { return r.n; }).join(' · ') : '一节都没超'),
      tile('比上一次',
        U.el('span', {
          class: 'u-mono u-rc__stat' + (cmp.comparable ? (cmp.delta < 0 ? ' u-rc__stat--go' : ' u-rc__stat--over') : ' u-rc__stat--mute'),
          text: cmp.delta == null ? '—' : U.fmtSigned(cmp.delta)
        }),
        cmp.comparable ? '跟第 ' + cmp.other.n + ' 次比，同是' + diffName(run.difficulty) : cmp.why),
      tile('你的实际语速',
        U.el('span', { class: 'u-mono u-rc__stat' }, [
          mr ? String(Math.round(mr.en)) : '—', U.el('span', { class: 'u-rc__unit', text: ' 词/分' })
        ]),
        mr ? '存进来就用它重算全部估算' : '这一遍没有讲完任何一节')
    ]));

    /* 主图 */
    var tlc = timelineCard();
    body.appendChild(tlc.card);
    drawTimeline(tlc.host);

    /* 下半：逐节 + 发现/建议/趋势 */
    var right = U.el('div', { class: 'u-rc__right' });
    var finds = U.el('div', { class: 'u-rc__finds' }, [U.el('span', { class: 'u-lbl u-reh__lbl', text: '发现' })]);
    R.findings(run, list, p.beats).forEach(function (f) {
      finds.appendChild(U.el('div', { class: 'u-rc__find' }, [
        U.el('span', { class: 'u-rc__findtitle', text: f.title }),
        U.el('span', { class: 'u-rc__findbody', text: f.body })
      ]));
    });
    right.appendChild(finds);
    right.appendChild(adviceBlock());
    right.appendChild(trendBlock());

    body.appendChild(U.el('div', { class: 'u-rc__bottom' }, [beatTable(), right]));

    var keys = U.rehearsal.keybar('recap');
    if (keys) body.appendChild(keys);
  }

  U.keys.bind('recap', 'r', '再排一次', function () { U.views.show('rehearsal'); }, 10);
  U.keys.bind('recap', 'd', '讲后回填', function () { U.views.show('debrief'); }, 20);
  U.keys.bind('recap', 'c', '叠起来看', function () { compare = !compare; paint(); }, 30);

  U.views.register('recap', {
    mount: function (root) {
      selected = null; compare = false;
      root.appendChild(U.el('div', { class: 'u-reh__page' }, [
        U.chrome.topbar({
          crumb: '排练',
          actions: [
            U.el('button', {
              class: 'u-btn', text: '听整场录音',
              onclick: function () { if (U.audio) U.audio.playAll(); }
            }),
            U.el('button', { class: 'u-btn', text: '讲后回填', onclick: function () { U.views.show('debrief'); } }),
            U.el('button', { class: 'u-btn u-btn--primary', text: '再排一次', onclick: function () { U.views.show('rehearsal'); } })
          ]
        }),
        (body = U.el('div', { class: 'u-reh__body u-rc' }))
      ]));
      paint();
      if (typeof window !== 'undefined' && !U.recap._resize) {
        U.recap._resize = true;
        window.addEventListener('resize', function () {
          if (U.store.get().ui.view === 'recap') paint();
        });
      }
    },
    update: function () { paint(); }
  });
})();
