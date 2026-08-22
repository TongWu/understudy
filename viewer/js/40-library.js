'use strict';
/* 后台 — the shelf every talk sits on, and the first thing the app shows.

   It answers two questions and refuses to answer any others: **will it fit in
   the slot**, and **have you rehearsed it**. There is deliberately no "修改于 3
   天前" column. A talk you touched yesterday and a talk you touched last month
   are the same talk; what differs is whether the script still runs long and
   whether you have said it out loud. Those are the two columns that survived. */
(function () {

  /* ---------- derivations ---------- */

  function parseDate(str) {
    if (!str) return null;
    var d = new Date(String(str));
    return isNaN(d.getTime()) ? null : d;
  }
  /* Whole calendar days, so "还有 4 天" does not flip at lunchtime. */
  function dayDelta(str) {
    var d = parseDate(str);
    if (!d) return null;
    var then = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((then - today) / 86400000);
  }
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function shortDate(str) {
    var d = parseDate(str);
    return d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : '日期待定';
  }
  function longDate(str) {
    var d = parseDate(str);
    if (!d) return '日期待定';
    var hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return shortDate(str) + ' ' + WEEK[d.getDay()] + (hh === '00:00' ? '' : ' ' + hh);
  }
  function countdown(str) {
    var n = dayDelta(str);
    if (n == null) return '日期待定';
    if (n === 0) return '就是今天';
    if (n === 1) return '就在明天';
    if (n > 1) return '还有 ' + n + ' 天';
    if (n === -1) return '昨天讲的';
    return (-n) + ' 天前';
  }
  function ago(str) {
    var n = dayDelta(str);
    if (n == null) return '';
    if (n >= 0) return '今天';
    if (n === -1) return '昨天';
    if (n >= -6) return (-n) + ' 天前';
    if (n >= -13) return '上周';
    if (n >= -30) return Math.round(-n / 7) + ' 周前';
    return shortDate(str);
  }

  var STATUS = {
    draft: { key: 'draft', word: '草稿', color: 'var(--ink-3)' },
    writing: { key: 'writing', word: '在写', color: 'var(--chip)' },
    rehearsing: { key: 'rehearsing', word: '排练中', color: 'var(--tight)' },
    done: { key: 'done', word: '讲过了', color: 'var(--go)' }
  };

  function statusOf(p) {
    var beats = p.beats || [], runs = p.runs || [];
    var delta = dayDelta(p.date);
    if (runs.some(function (r) { return r.mode === 'live'; }) || (delta != null && delta < 0)) return STATUS.done;
    if (runs.length) return STATUS.rehearsing;
    var written = beats.filter(U.io.hasScript).length;
    if (beats.length && written * 2 >= beats.length) return STATUS.writing;
    return STATUS.draft;
  }

  /* 稿齐 / 只有提词 / 空 — the only completeness that matters is whether there
     are words to say, so the script decides and the cue is the consolation. */
  function completeness(p) {
    var out = { full: 0, cueOnly: 0, empty: 0, cells: [] };
    (p.beats || []).forEach(function (b) {
      if (U.io.hasScript(b)) { out.full++; out.cells.push('full'); }
      else if (U.io.hasCue(b)) { out.cueOnly++; out.cells.push('cue'); }
      else { out.empty++; out.cells.push('empty'); }
    });
    return out;
  }

  /* Estimate against the venue slot. A little over is 偏紧; a lot over means
     the script has to lose sentences, and no amount of budget-shuffling helps. */
  function fitOf(p) {
    var t = U.totals(p.beats || [], p.rate || U.DEFAULT_RATE);
    var target = Number(p.target) || 0;
    var tone = 'var(--go)';
    if (!t.estimate) tone = 'var(--ink-3)';
    else if (target && t.estimate > target * 1.05) tone = 'var(--over)';
    else if (target && t.estimate > target) tone = 'var(--tight)';
    return { estimate: t.estimate, target: target, tone: tone, over: target ? t.estimate - target : 0 };
  }

  /* Which beat leaks the time. Ranked by seconds lost across every rehearsal,
     not by how often — one beat that runs 46 seconds long is the problem, five
     that run three seconds long are rounding. */
  function leak(p) {
    var runs = p.runs || [], beats = p.beats || [];
    if (!runs.length || !beats.length) return null;
    var best = null;
    beats.forEach(function (b) {
      var lost = 0, times = 0;
      runs.forEach(function (r) {
        var slot = (r.perBeat || []).filter(function (x) { return x.beat === b.id; })[0];
        if (!slot) return;
        var over = (Number(slot.spent) || 0) - (Number(b.budget) || 0);
        if (over > 0) { lost += over; times++; }
      });
      if (times && (!best || lost > best.lost)) best = { beat: b, lost: lost, times: times, runs: runs.length };
    });
    return best;
  }

  function pickView(names) {
    for (var i = 0; i < names.length; i++) if (U.views.get(names[i])) return names[i];
    return names[0];
  }
  function openIn(id, names) {
    U.store.open(id);
    U.views.show(pickView(names));
  }

  function newProduction() {
    var stamp = Date.now().toString(36);
    return {
      id: 'p-' + stamp,
      title: '未命名演讲', occasion: '', date: '', audience: 0,
      language: { speak: 'en', notes: 'zh' },
      target: 900, rate: Object.assign({}, U.DEFAULT_RATE),
      beats: [{
        id: 'b-' + stamp, n: '00', title: '开场', nav: '', slideRef: '',
        budget: 60, importance: 2, tags: [], cue: [], script: '', notes: []
      }],
      fallbacks: [], qa: [], terms: [], runs: []
    };
  }

  /* ---------- pieces ---------- */

  function icon(paths, size, stroke) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', stroke || 'currentColor'); svg.setAttribute('stroke-width', '1.4');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = paths;
    return svg;
  }
  var CHEVRON = '<path d="M7.5 3.8l6.2 6.2-6.2 6.2"></path>';
  var UPLOAD = '<path d="M10 14V4"></path><path d="M6 8l4-4 4 4"></path><path d="M3 15v2h14v-2"></path>';

  function nextUpCard(p) {
    var fit = fitOf(p);
    var lk = leak(p);
    var hints = [];

    if (!fit.estimate) {
      hints.push(U.el('span', { class: 'u-lib__hint', text: '还没有讲稿 —— 估算不出来讲不讲得完' }));
    } else if (fit.target && fit.over > 0) {
      hints.push(U.el('span', {
        class: 'u-lib__hint u-lib__hint--bad',
        text: '估算 ' + U.fmt(fit.estimate) + '，比场地时间 ' + U.fmt(fit.target) + ' 长 ' + U.fmt(fit.over)
      }));
    } else if (fit.target) {
      hints.push(U.el('span', {
        class: 'u-lib__hint u-lib__hint--ok',
        text: '估算 ' + U.fmt(fit.estimate) + '，场地时间 ' + U.fmt(fit.target) + '，还余 ' + U.fmt(-fit.over)
      }));
    }

    if (lk && lk.times >= 2) {
      hints.push(U.el('span', {
        class: 'u-lib__hint',
        text: lk.beat.n + ' 节' + (lk.times === lk.runs ? U.io.cn(lk.times) + '次排练都超时' : U.io.cn(lk.times) + ' 次排练超时') +
          '，平均多 ' + U.fmt(lk.lost / lk.times)
      }));
    } else if (lk) {
      hints.push(U.el('span', { class: 'u-lib__hint', text: lk.beat.n + ' 节上次排练超了 ' + U.fmt(lk.lost) }));
    } else {
      hints.push(U.el('span', { class: 'u-lib__hint', text: '还没排练过 —— 排一次才知道时间会漏在哪一节' }));
    }

    /* The one dark block on a paper screen. It carries data-theme="night"
       rather than a palette class of its own: 00-tokens.css already defines
       that token set on the attribute, so the card is warm-dark under both
       desk themes without naming a single colour. */
    return U.el('div', { class: 'u-lib__next', 'data-theme': 'night' }, [
      U.el('div', { class: 'u-lib__when' }, [
        U.el('span', { class: 'u-lbl', text: '下一场' }),
        U.el('span', { class: 'u-mono u-lib__count', text: countdown(p.date) }),
        U.el('span', { class: 'u-mono u-lib__date', text: longDate(p.date) })
      ]),
      U.el('div', { class: 'u-lib__nextbody' }, [
        U.el('span', { class: 'u-ser u-lib__nexttitle', text: p.title || '未命名' }),
        U.el('div', { class: 'u-lib__hints' }, hints)
      ]),
      U.el('div', { class: 'u-lib__nextact' }, [
        U.el('button', {
          class: 'u-btn u-lib__ghost', onclick: function () { openIn(p.id, ['editor']); }
        }, '继续写'),
        U.el('button', {
          class: 'u-btn u-lib__solid', onclick: function () { openIn(p.id, ['rehearse', 'rehearsal', 'setup', 'prompter']); }
        }, '排练')
      ])
    ]);
  }

  function row(p) {
    var st = statusOf(p);
    var fit = fitOf(p);
    var done = completeness(p);
    var runs = p.runs || [];
    var last = runs.length ? runs[runs.length - 1] : null;

    var when = [];
    if (p.occasion) when.push(p.occasion);
    when.push(shortDate(p.date));

    var rehearsal = !runs.length ? '还没排'
      : runs.length + ' 次 · ' + (st.key === 'done' ? '已结束' : ago(last.at));

    return U.el('button', {
      class: 'u-lib__row' + (st.key === 'done' ? ' u-lib__row--done' : ''),
      'aria-label': (p.title || '未命名') + ' —— ' + st.word,
      onclick: function () { openIn(p.id, ['editor']); }
    }, [
      U.el('div', { class: 'u-lib__status' }, [
        U.el('span', { class: 'u-lib__dot', style: { background: st.color } }),
        U.el('span', { class: 'u-lbl u-lib__statusword', text: st.word })
      ]),
      U.el('div', { class: 'u-lib__ident' }, [
        U.el('span', { class: 'u-ser u-lib__title', text: p.title || '未命名' }),
        U.el('span', { class: 'u-mono u-lib__where', text: when.join(' · ') })
      ]),
      U.el('span', { class: 'u-mono u-lib__beats', text: (p.beats || []).length + ' 节' }),
      U.el('div', { class: 'u-lib__fit' }, [
        U.el('span', {
          class: 'u-mono u-lib__est', style: { color: fit.tone },
          text: fit.estimate ? U.fmt(fit.estimate) : '—'
        }),
        U.el('span', { class: 'u-mono u-lib__target', text: '/ ' + (fit.target ? U.fmt(fit.target) : '—') })
      ]),
      U.el('span', { class: 'u-mono u-lib__runs', text: rehearsal }),
      U.el('div', { class: 'u-lib__done' }, [
        U.el('div', { class: 'u-lib__segs' }, done.cells.map(function (kind) {
          return U.el('div', { class: 'u-lib__seg u-lib__seg--' + kind });
        })),
        U.el('span', {
          class: 'u-mono u-lib__donetext',
          text: done.full + ' 节稿齐 · ' + done.cueOnly + ' 只有提词 · ' + done.empty + ' 空'
        })
      ]),
      icon(CHEVRON, 14, 'var(--ink-4)')
    ]);
  }

  /* ---------- the view ---------- */

  U.views.register('library', {
    mount: function (root) {
      var filter = 'all';
      var notice = null;

      var body = U.el('div', { class: 'u-lib__body' });
      var page = U.el('div', { class: 'u-lib' }, [U.chrome.topbar({ crumb: false }), body]);
      root.appendChild(page);

      function say(text) { notice = text; paint(); }

      function takeFiles(files) {
        var sorted = U.io.sortFiles(files);
        if (sorted.decks.length) { say(U.io.importDeck(sorted.decks).reason); return; }
        if (!sorted.images.length) { say('只认得 .png / .jpg 这样的图片 —— 把每页幻灯片导成图片再拖进来。'); return; }
        U.io.importImages(sorted.images).then(function (r) {
          say(r.added ? ('放进来 ' + r.added + ' 张 —— 已经切成 ' + r.added + ' 节，接着让 AI 补提词和讲稿。') : '这些图片读不出来。');
          if (r.added) U.views.show('aifill');
        });
      }

      function chooseFiles() {
        var input = U.el('input', {
          type: 'file', multiple: 'multiple', accept: '.png,.jpg,.jpeg,.gif,.webp,.pptx,.ppt,.pdf',
          style: { display: 'none' },
          onchange: function () { takeFiles(input.files); if (input.parentNode) input.parentNode.removeChild(input); }
        });
        page.appendChild(input);
        input.click();
      }

      function dropZone() {
        var zone = U.el('div', {
          class: 'u-lib__drop',
          onclick: chooseFiles,
          ondragover: function (e) { e.preventDefault(); zone.classList.add('is-over'); },
          ondragleave: function () { zone.classList.remove('is-over'); },
          ondrop: function (e) {
            e.preventDefault(); zone.classList.remove('is-over');
            takeFiles(e.dataTransfer && e.dataTransfer.files);
          }
        }, [
          icon(UPLOAD, 17, 'var(--ink-3)'),
          U.el('span', {
            class: 'u-lib__droptext',
            html: '把 <b>.pptx</b> 或幻灯片截图拖进来 —— 自动切成一节一节，再让 AI 补上提词和讲稿'
          }),
          U.el('div', { style: { flex: '1' } }),
          notice ? U.el('span', { class: 'u-mono u-lib__notice', text: notice }) : null,
          U.el('button', {
            class: 'u-btn u-lib__aibtn',
            onclick: function (e) { e.stopPropagation(); U.views.show('aifill'); }
          }, 'AI 填充'),
          U.el('span', { class: 'u-mono u-lib__formats', text: '.pptx · .pdf · .png · .jpg' })
        ]);
        return zone;
      }

      function paint() {
        var all = U.store.get().productions;
        var list = Object.keys(all).map(function (k) { return all[k]; });
        var prepping = list.filter(function (p) { return statusOf(p).key !== 'done'; });
        var over = list.length - prepping.length;

        var upcoming = prepping.filter(function (p) { return dayDelta(p.date) != null; })
          .sort(function (a, b) { return dayDelta(a.date) - dayDelta(b.date); });
        var next = upcoming[0] || prepping[0] || null;

        var shown = list.filter(function (p) {
          var k = statusOf(p).key;
          if (filter === 'all') return true;
          if (filter === 'writing') return k === 'writing' || k === 'draft';
          return k === filter;
        }).sort(function (a, b) {
          var x = dayDelta(a.date), y = dayDelta(b.date);
          if (x == null) return 1;
          if (y == null) return -1;
          return x - y;
        });

        var tabs = [
          { key: 'all', label: '全部' }, { key: 'writing', label: '在写' },
          { key: 'rehearsing', label: '排练中' }, { key: 'done', label: '讲过了' }
        ];

        U.clear(body);
        body.appendChild(U.el('div', { class: 'u-lib__head' }, [
          U.el('div', { class: 'u-lib__headid' }, [
            U.el('span', { class: 'u-ser u-lib__h1', text: '后台' }),
            U.el('span', { class: 'u-lib__tally', text: prepping.length + ' 场在准备 · ' + over + ' 场讲过了' })
          ]),
          U.el('div', { style: { flex: '1' } }),
          U.el('button', { class: 'u-btn u-lib__headbtn', onclick: chooseFiles }, '导入 PPT · 截图'),
          U.el('button', {
            class: 'u-btn u-btn--primary u-lib__headbtn',
            onclick: function () {
              var p = newProduction();
              U.store.put(p);
              openIn(p.id, ['editor']);
            }
          }, '新建演讲')
        ]));

        if (next) body.appendChild(nextUpCard(next));

        var table = U.el('div', { class: 'u-lib__table' });
        table.appendChild(U.el('div', { class: 'u-lib__tabs' }, tabs.map(function (t) {
          return U.el('button', {
            class: 'u-pill u-lib__tab' + (filter === t.key ? ' is-on' : ''),
            'aria-pressed': String(filter === t.key),
            onclick: function () { filter = t.key; paint(); }
          }, t.label);
        }).concat([
          U.el('div', { style: { flex: '1' } }),
          U.el('span', { class: 'u-mono u-lib__sort', text: '按日期排' })
        ])));

        table.appendChild(U.el('div', { class: 'u-lib__row u-lib__row--head' }, [
          U.el('span', { class: 'u-lbl', text: '状态' }),
          U.el('span', { class: 'u-lbl', text: '演讲' }),
          U.el('span', { class: 'u-lbl', style: { textAlign: 'right' }, text: '节数' }),
          U.el('span', { class: 'u-lbl', style: { textAlign: 'right' }, text: '估算 / 场地时间' }),
          U.el('span', { class: 'u-lbl', text: '排练' }),
          U.el('span', { class: 'u-lbl', text: '写完了多少' }),
          U.el('span', {})
        ]));

        if (shown.length) shown.forEach(function (p) { table.appendChild(row(p)); });
        else table.appendChild(U.el('div', { class: 'u-lib__none', text: '这一类里还没有演讲。' }));

        table.appendChild(dropZone());
        body.appendChild(table);
      }

      this._paint = paint;
      paint();
    },
    update: function () { if (this._paint) this._paint(); }
  });
})();
