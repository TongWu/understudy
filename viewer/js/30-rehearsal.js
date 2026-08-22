'use strict';
/* 排练设置 —— 难度是一个梯度，不是四个功能。

   每一级用「看得到 / 按键才出来 / 藏起来」三种标签直接画出来：四行标签比四行
   说明文字快得多，而且四级之间的差别一眼就能对齐着看。难度写进 run.difficulty，
   台上模块据此决定提词卡显示什么，复盘据此决定这次能跟谁比 —— 不同难度之间
   「快了 39 秒」不是进步，是换了张难度不同的卷子。 */

U.rehearsal = (function () {

  var SHOWN = 'shown', KEY = 'key', HIDDEN = 'hidden';

  /* 台本顺序 · 提词 · 讲稿 · 打断 —— 一级比一级少给你看一样东西。
     提词永远看得到：它是台上唯一会看的东西，藏了就不是排练是背诵。 */
  var LEVELS = [
    { id: 1, name: '照读',     desc: '讲稿全文摊开，先顺一遍嘴',           when: '刚写完的时候',
      order: SHOWN,  cue: SHOWN, script: SHOWN, interrupt: false },
    { id: 2, name: '只看提词', desc: '讲稿收起来，要按 ↓ 才出来',          when: '稿子基本记住了',
      order: SHOWN,  cue: SHOWN, script: KEY,   interrupt: false },
    { id: 3, name: '冷启动',   desc: '台本顺序也藏起来，测你记不记得结构', when: '上台前两三天',
      order: HIDDEN, cue: SHOWN, script: KEY,   interrupt: false },
    { id: 4, name: '有人打断', desc: '冷启动 + 随机弹 2 个弹药库里的问题', when: '上台前最后一遍',
      order: HIDDEN, cue: SHOWN, script: KEY,   interrupt: true }
  ];

  function level(id) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === Number(id)) return LEVELS[i];
    return LEVELS[0];
  }
  function levelName(id) { return level(id).name; }

  /* 这一场里可比的：同难度。复盘和这一屏底部都用它。 */
  function sameDifficulty(runs, difficulty) {
    return (runs || []).filter(function (r) { return (r.difficulty || 1) === Number(difficulty); });
  }

  /* 上一次是几级，就默认再上一级 —— 梯度是拿来爬的。 */
  function suggested(runs) {
    var last = (runs || [])[(runs || []).length - 1];
    return last ? Math.min(4, (last.difficulty || 1) + 1) : 1;
  }

  /* 这次相对前几次难还是易，写成一句人话。数字本身不会告诉你它不可比。 */
  function stance(difficulty, recent) {
    var name = levelName(difficulty), n = recent.length;
    if (!n) return '这次是 ' + name + ' —— 第一次排，之后的复盘只会拿它跟同难度比。';
    var same = sameDifficulty(recent, difficulty).length;
    var harder = recent.filter(function (r) { return (r.difficulty || 1) < difficulty; }).length;
    var easier = recent.filter(function (r) { return (r.difficulty || 1) > difficulty; }).length;
    if (same === n) return '这次跟前 ' + n + ' 次一样是 ' + name + ' —— 可以直接比。';
    if (harder === n) return '这次是 ' + name + '，比前 ' + n + ' 次都难 —— 慢一点是正常的，复盘只会拿它跟同难度比。';
    if (easier === n) return '这次是 ' + name + '，比前 ' + n + ' 次都容易 —— 快是应该的，复盘只会拿它跟同难度比。';
    return '这次是 ' + name + '，前 ' + n + ' 次里有 ' + same + ' 次同难度 —— 复盘只会拿它跟那 ' + same + ' 次比。';
  }

  /* 上一次哪几节超了 —— 「只练超时的几节」用它，复盘的建议也用它。 */
  function overran(run, beats) {
    if (!run) return [];
    return (beats || []).filter(function (b, i) {
      var slot = (run.perBeat || [])[i];
      return slot && slot.spent > (Number(b.budget) || 0);
    });
  }

  /* ---------- 键位提示条：绑了什么就印什么，三块屏共用 ---------- */
  var KEYCAP = { Enter: '⏎', Space: '空格', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc' };
  function keybar(view) {
    var hints = U.keys.hints(view);
    if (!hints.length) return null;
    return U.el('div', { class: 'u-reh__keys' }, hints.map(function (h) {
      return U.el('span', { class: 'u-reh__key' }, [
        U.el('kbd', { class: 'u-mono u-reh__cap', text: KEYCAP[h.key] || h.key }),
        U.el('span', { text: h.label })
      ]);
    }));
  }

  return {
    LEVELS: LEVELS, level: level, levelName: levelName,
    sameDifficulty: sameDifficulty, suggested: suggested, stance: stance,
    overran: overran, keybar: keybar
  };
})();

/* ================= 视图 ================= */
(function () {
  var R = U.rehearsal;
  var pick = null;          /* 本屏的临时选择，不进 store —— 没按开始就不算数 */
  var body = null;

  function defaults() {
    var p = U.store.production() || { beats: [], runs: [] };
    var runs = p.runs || [];
    return {
      difficulty: R.suggested(runs),
      recording: true,
      transcribe: false,      /* 默认关。理由写在界面上，不埋在设置里。 */
      target: 'venue',
      scope: 'all',
      only: null
    };
  }
  function ensure() { if (!pick) pick = defaults(); return pick; }

  function svg(markup, cls) { return U.el('span', { class: cls || 'u-reh__ico', html: markup }); }

  /* 三态标签：实线 = 看得到 · 灰框 = 按键才出来 · 划掉 = 藏起来 */
  function vis(text, state) {
    return U.el('span', { class: 'u-mono u-reh__vis u-reh__vis--' + state, text: text });
  }

  function levelRow(lv) {
    var on = ensure().difficulty === lv.id;
    return U.el('button', {
      class: 'u-reh__lv' + (on ? ' is-on' : ''), 'aria-pressed': String(on),
      onclick: function () { pick.difficulty = lv.id; paint(); }
    }, [
      U.el('span', { class: 'u-reh__radio' }, on ? U.el('span', { class: 'u-reh__dot' }) : null),
      U.el('span', { class: 'u-reh__lvname' }, [
        U.el('span', { class: 'u-reh__lvtitle' }, [
          U.el('span', { class: 'u-mono u-reh__lvn', text: String(lv.id) }),
          U.el('span', { class: 'u-reh__lvlabel', text: lv.name })
        ]),
        U.el('span', { class: 'u-reh__lvdesc', text: lv.desc })
      ]),
      U.el('span', { class: 'u-reh__vislist' }, [
        vis('台本顺序', lv.order), vis('提词', lv.cue), vis('讲稿', lv.script),
        lv.interrupt ? vis('打断', 'shown') : null
      ]),
      U.el('span', { class: 'u-mono u-reh__when', text: lv.when })
    ]);
  }

  function toggle(on) {
    return U.el('span', { class: 'u-reh__sw' + (on ? ' is-on' : ''), 'aria-hidden': 'true' },
      U.el('span', { class: 'u-reh__knob' }));
  }

  function chip(text, on, onclick, disabled) {
    return U.el('button', {
      class: 'u-pill u-reh__chip' + (on ? ' is-on' : '') + (disabled ? ' is-off' : ''),
      'aria-pressed': String(!!on), disabled: disabled ? 'disabled' : null,
      onclick: disabled ? null : onclick, text: text
    });
  }

  function begin() {
    var p = U.store.production(); if (!p) return;
    var s = ensure();
    var beats = p.beats || [];
    var budget = U.totals(beats, U.store.rate()).budget;
    var only = null, jump = 0;
    if (s.scope === 'one' && s.only) { only = [s.only]; }
    else if (s.scope === 'over') {
      var last = (p.runs || [])[(p.runs || []).length - 1];
      only = R.overran(last, beats).map(function (b) { return b.id; });
      if (!only.length) only = null;
    }
    if (only && only.length) {
      for (var i = 0; i < beats.length; i++) if (beats[i].id === only[0]) { jump = i; break; }
    }
    U.run.start({
      mode: 'rehearse', difficulty: s.difficulty, recording: s.recording,
      target: s.target === 'venue' ? (p.target || budget) : budget
    });
    /* 台上模块只认 run 里的字段，所以练哪些也写进 run。 */
    U.store.update(function (st) {
      if (!st.run) return;
      st.run.scope = s.scope;
      st.run.only = only;
      st.run.targetKind = s.target;
      st.run.transcribe = false;
    });
    if (jump) U.run.go(jump);
    /* 录音是尽力而为：拿不到麦克风也照排不误，界面事后照实说没录上。 */
    if (s.recording && U.audio) U.audio.start({ runId: (p.runs || []).length + 1 });
    U.views.show('prompter');
  }

  function paint() {
    if (!body) return;
    var p = U.store.production() || { beats: [], runs: [], target: 0 };
    var beats = p.beats || [], runs = p.runs || [];
    var s = ensure();
    var budget = U.totals(beats, U.store.rate()).budget;
    var recent = runs.slice(-3);
    var lastRun = runs[runs.length - 1] || null;
    var overs = R.overran(lastRun, beats);
    if (!s.only) {
      var worst = null, worstBy = 0;
      overs.forEach(function (b) {
        var idx = beats.indexOf(b), slot = (lastRun.perBeat || [])[idx];
        var by = slot ? slot.spent - (b.budget || 0) : 0;
        if (by > worstBy) { worstBy = by; worst = b; }
      });
      s.only = (worst || beats[U.store.get().ui.beatIndex] || beats[0] || {}).id || null;
    }
    var onlyBeat = null;
    beats.forEach(function (b) { if (b.id === s.only) onlyBeat = b; });

    U.clear(body);

    body.appendChild(U.el('div', { class: 'u-reh__head' }, [
      U.el('div', { class: 'u-reh__title' }, [
        U.el('span', { class: 'u-ser u-reh__h1', text: '排练设置' }),
        U.el('span', { class: 'u-reh__sub', html: '难度会记进这次的记录 —— <b>同难度之间才好比</b>，不然「这次快了 39 秒」没有意义。' })
      ])
    ]));

    var levels = U.el('div', { class: 'u-reh__levels' }, [U.el('span', { class: 'u-lbl u-reh__lbl', text: '难度' })]);
    R.LEVELS.forEach(function (lv) { levels.appendChild(levelRow(lv)); });
    levels.appendChild(U.el('span', { class: 'u-mono u-reh__legend', text: '实线 = 看得到 · 灰框 = 按键才出来 · 划掉 = 藏起来' }));

    var side = U.el('div', { class: 'u-reh__side' }, [
      U.el('div', { class: 'u-reh__group' }, [
        U.el('span', { class: 'u-lbl u-reh__lbl', text: '录音' }),
        U.el('button', {
          class: 'u-reh__rec' + (s.recording ? ' is-on' : ''), 'aria-pressed': String(s.recording),
          onclick: function () { pick.recording = !pick.recording; paint(); }
        }, [
          toggle(s.recording),
          U.el('span', { class: 'u-reh__rectext' }, [
            U.el('span', { class: 'u-reh__recline', text: s.recording ? '开着，按节自动切分' : '关着，这次不录' }),
            U.el('span', { class: 'u-mono u-reh__recnote', text: '只存在这台设备上，不上传' })
          ])
        ]),
        U.el('div', { class: 'u-reh__note' }, [
          U.el('span', { class: 'u-lbl u-reh__notelbl', text: '转写' }),
          U.el('span', {
            class: 'u-reh__notetext',
            html: '关着。打开的话音频要送去第三方转写 —— <b>内容会离开这台设备</b>。讲的是内部材料就别开。'
          })
        ])
      ]),
      U.el('div', { class: 'u-reh__group' }, [
        U.el('span', { class: 'u-lbl u-reh__lbl', text: '对着哪个时间练' }),
        U.el('div', { class: 'u-reh__chips' }, [
          chip(U.fmt(p.target || budget) + ' 场地', s.target === 'venue', function () { pick.target = 'venue'; paint(); }),
          chip(U.fmt(budget) + ' 预算', s.target === 'budget', function () { pick.target = 'budget'; paint(); })
        ])
      ]),
      U.el('div', { class: 'u-reh__group' }, [
        U.el('span', { class: 'u-lbl u-reh__lbl', text: '练哪些' }),
        U.el('div', { class: 'u-reh__chips' }, [
          chip('全场 ' + beats.length + ' 节', s.scope === 'all', function () { pick.scope = 'all'; paint(); }),
          chip(onlyBeat ? '只练 ' + onlyBeat.n : '只练一节', s.scope === 'one', function () { pick.scope = 'one'; paint(); }, !onlyBeat),
          chip(overs.length ? '超时的 ' + overs.length + ' 节' : '上次没有超时的节', s.scope === 'over',
            function () { pick.scope = 'over'; paint(); }, !overs.length)
        ])
      ]),
      U.el('button', {
        class: 'u-btn u-btn--primary u-reh__go', onclick: begin,
        text: '开始排练 · ' + R.levelName(s.difficulty)
      })
    ]);

    body.appendChild(U.el('div', { class: 'u-reh__grid' }, [levels, side]));

    var foot = U.el('div', { class: 'u-reh__foot' }, [U.el('span', { class: 'u-lbl', text: recent.length ? '前 ' + recent.length + ' 次' : '还没排过' })]);
    recent.forEach(function (r) {
      foot.appendChild(U.el('div', { class: 'u-reh__prev' }, [
        U.el('span', { class: 'u-mono u-reh__prevn', text: '第 ' + r.n + ' 次' }),
        U.el('span', { class: 'u-mono u-reh__prevt', text: U.fmt(r.total) }),
        U.el('span', { class: 'u-pill', text: R.levelName(r.difficulty) })
      ]));
    });
    foot.appendChild(U.el('div', { style: { flex: '1' } }));
    foot.appendChild(U.el('span', { class: 'u-reh__stance', text: R.stance(s.difficulty, recent) }));
    body.appendChild(foot);

    var keys = R.keybar('rehearsal');
    if (keys) body.appendChild(keys);
  }

  U.keys.bind('rehearsal', 'Enter', '开始排练', function () { begin(); }, 10);
  U.keys.bind('rehearsal', 'ArrowDown', '难度 +', function () { ensure().difficulty = Math.min(4, pick.difficulty + 1); paint(); }, 20);
  U.keys.bind('rehearsal', 'ArrowUp', '难度 −', function () { ensure().difficulty = Math.max(1, pick.difficulty - 1); paint(); }, 21);
  U.keys.bind('rehearsal', 'r', '录音开关', function () { ensure().recording = !pick.recording; paint(); }, 30);

  U.views.register('rehearsal', {
    mount: function (root) {
      var runs = (U.store.production() || {}).runs || [];
      pick = defaults();
      root.appendChild(U.el('div', { class: 'u-reh__page' }, [
        U.chrome.topbar({ crumb: '排练 · 第 ' + (runs.length + 1) + ' 次' }),
        (body = U.el('div', { class: 'u-reh__body u-reh' }))
      ]));
      paint();
    },
    update: function () { paint(); }
  });
})();
