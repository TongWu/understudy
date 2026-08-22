'use strict';
/* The editor: the running order on the left, the spread in the middle, one
   inspector on the right. The spread is the product — cue and script side by
   side, because the thing you will read on stage and the thing you wrote are
   two different documents and they have to be written against each other.

   Everything here paints from tokens. There is one DOM, and 纸/夜 · 紧凑/舒适
   are four evaluations of it, so nothing below may carry a colour or a type
   size that only looks right in one of them. */
(function () {
  var refs = {};
  var tab = 'beat';          /* 这一节 | 检查 — a view-local concern, not app state */
  var shownBeat = null;      /* which beat the live contenteditable is holding */
  var saveTimer = null, saving = false;
  var dismissed = {};        /* findings you waved off — this session only */
  var inline = null;         /* id of the one open inline input */
  var shownAnchor = null;    /* tab + beat the check list last scrolled for */

  /* ---------- small shared bits ---------- */
  function prod() { return U.store.production(); }
  function beatsOf() { return U.store.beats(); }
  function rateOf() { return U.store.rate(); }
  function at() {
    var b = beatsOf(), i = U.store.get().ui.beatIndex || 0;
    return Math.max(0, Math.min(b.length - 1, i));
  }
  function current() { return beatsOf()[at()] || null; }
  function spacer() { return U.el('div', { style: { flex: '1' } }); }

  /* estimate against budget: on plan, within a tenth, or past it */
  function pace(estimate, budget) {
    if (!budget || estimate <= budget) return 'go';
    return estimate <= budget * 1.1 ? 'tight' : 'over';
  }
  function pill(label, mod, extra) {
    return U.el('span', { class: 'u-pill' + (mod ? ' u-pill--' + mod : '') + (extra ? ' ' + extra : '') }, label);
  }
  function mini(label, opts) {
    opts = opts || {};
    return U.el('button', {
      class: 'u-btn u-ed__mini' + (opts.primary ? ' u-btn--primary' : '') + (opts.tone ? ' u-ed__mini--' + opts.tone : ''),
      disabled: opts.disabled ? 'disabled' : null, title: opts.title || null,
      onclick: opts.on || null
    }, label);
  }
  /* One inline field at a time, for the two places where the design offers to
     add a word: a marker, and the sentence a term is missing. */
  function field(id, placeholder, value, commit) {
    var input = U.el('input', {
      class: 'u-ed__field', type: 'text', placeholder: placeholder, value: value || '',
      onkeydown: function (e) {
        if (e.key === 'Enter') { e.preventDefault(); inline = null; commit(input.value.trim()); }
        else if (e.key === 'Escape') { e.preventDefault(); inline = null; paint(); }
        e.stopPropagation();
      },
      onblur: function () { if (inline === id) { inline = null; paint(); } }
    });
    setTimeout(function () { input.focus(); }, 0);
    return input;
  }
  function paint() { var d = U.views.get('editor'); if (d) d.update(U.store.get()); }

  /* ---------- top bar ---------- */
  /* The one number the whole product exists for, printed where you cannot
     avoid reading it: what the script actually takes against what the room
     gives you. */
  function paceReadout(p) {
    var t = U.totals(beatsOf(), rateOf());
    var target = Number(p.target) || 0;
    var over = t.estimate - target;
    var st = !target ? 'go' : over <= 0 ? 'go' : over <= target * 0.1 ? 'tight' : 'over';
    return U.el('div', { class: 'u-ed__pace' }, [
      U.el('span', { class: 'u-mono u-ed__pacebig' }, U.fmt(t.estimate)),
      U.el('span', { class: 'u-mono u-ed__pacesub' }, '估算 / ' + U.fmt(target) + ' 场地'),
      pill(Math.abs(over) < 5 ? '刚好' : (over > 0 ? '长 ' : '短 ') + U.fmt(Math.abs(over)), st)
    ]);
  }
  /* The other screens belong to other modules. Offer a door only once the room
     behind it exists, so the top bar never hands you a button that goes
     nowhere. */
  function doorway(label, names) {
    for (var i = 0; i < names.length; i++) {
      if (U.views.get(names[i])) {
        var name = names[i];
        return U.el('button', { class: 'u-btn' + (label === '上台' ? ' u-btn--primary' : ''), onclick: function () { U.views.show(name); } }, label);
      }
    }
    return null;
  }
  function header(p) {
    return U.chrome.topbar({
      crumb: '写稿',
      middle: paceReadout(p),
      actions: [
        doorway('AI 填充', ['aifill', 'ai-fill', 'ai', 'fill']),
        doorway('导出', ['export', 'share']) ||
          (U.io && U.io.exportHtml
            ? U.el('button', { class: 'u-btn', onclick: function () { U.io.exportHtml(); } }, '导出')
            : null),
        doorway('排练', ['rehearsal', 'rehearse', 'rehearsal-setup', 'setup']),
        doorway('上台', ['prompter', 'stage', 'live', 'present'])
      ].filter(Boolean)
    });
  }

  /* ---------- left: the running order ---------- */
  function railRow(beat, i, cur, rate) {
    var budget = Number(beat.budget) || 0;
    var estimate = U.estimate(beat.script, rate);
    var st = pace(estimate, budget);
    var over = estimate - budget;
    return U.el('button', {
      class: 'u-ed__beat' + (i === cur ? ' is-on' : ''),
      'aria-current': i === cur ? 'true' : null,
      title: beat.title || '',
      onclick: function () { U.store.ui({ beatIndex: i }); }
    }, [
      U.el('span', { class: 'u-ed__beatline' }, [
        U.el('span', { class: 'u-mono u-ed__n' }, beat.n == null ? String(i) : String(beat.n)),
        U.el('span', { class: 'u-ed__beattitle' }, beat.nav || beat.title || '未命名'),
        U.el('span', { class: 'u-mono u-ed__beatbudget' }, U.fmt(budget))
      ]),
      U.el('span', { class: 'u-ed__meter' }, [
        U.el('span', { class: 'u-ed__track' }, U.el('i', {
          class: 'u-ed__fill u-ed__fill--' + st,
          style: { width: (budget ? Math.min(100, Math.round(estimate / budget * 100)) : 0) + '%' }
        })),
        /* only where there is something to say — a signed number on every row
           is a number nobody reads */
        over >= 1 ? U.el('span', { class: 'u-mono u-ed__drift u-ed__drift--' + st }, U.fmtSigned(over)) : null
      ])
    ]);
  }
  function addBeat() {
    var beats = beatsOf();
    var beat = {
      id: 'beat-' + Date.now(), n: (beats.length < 10 ? '0' : '') + beats.length,
      title: '新的一节', nav: '新的一节', slideRef: '', budget: 60, importance: 2,
      tags: [], cue: [], script: '<p></p>', notes: []
    };
    U.store.update(function (s) { beats.push(beat); s.ui.beatIndex = beats.length - 1; });
  }
  function renderRail(p, beats, cur) {
    var rate = rateOf();
    U.clear(refs.railList);
    beats.forEach(function (b, i) { refs.railList.appendChild(railRow(b, i, cur, rate)); });
    refs.railList.appendChild(U.el('div', { class: 'u-ed__appendix' }, [
      U.el('span', { class: 'u-mono u-ed__n' }, '—'),
      U.el('span', { class: 'u-ed__beattitle' }, '附录 · Q&A 备用说法'),
      U.el('span', { class: 'u-lbl u-ed__tiny' }, '不计时')
    ]));

    var t = U.totals(beats, rate);
    var st = pace(t.estimate, t.budget);
    U.clear(refs.railFoot);
    [['预算合计', U.fmt(t.budget), null],
     ['语速估算', U.fmt(t.estimate), st],
     ['场地时间', U.fmt(Number(p.target) || 0), null]
    ].forEach(function (row) {
      refs.railFoot.appendChild(U.el('div', { class: 'u-ed__total' }, [
        U.el('span', { class: 'u-lbl' }, row[0]),
        U.el('span', { class: 'u-mono u-ed__totalv' + (row[2] && row[2] !== 'go' ? ' u-ed__totalv--' + row[2] : '') }, row[1])
      ]));
    });
    /* Bound but undiscoverable is the bug the read-through caught, so the keys
       print themselves from the registry. */
    var hints = U.keys.hints('editor');
    if (hints.length) {
      refs.railFoot.appendChild(U.el('div', { class: 'u-ed__keys' }, hints.map(function (h) {
        return U.el('span', { class: 'u-ed__key' }, [
          U.el('span', { class: 'u-mono u-ed__keycap' }, h.key === 'ArrowUp' ? '↑' : h.key === 'ArrowDown' ? '↓' : h.key),
          U.el('span', { class: 'u-lbl' }, h.label)
        ]);
      })));
    }
  }

  /* ---------- centre: the spread ---------- */
  function renderHead(beat, beats) {
    var longest = beats.reduce(function (a, b) { return Math.max(a, Number(b.budget) || 0); }, 0);
    U.clear(refs.eyebrow).appendChild(U.el('span', { class: 'u-mono u-ed__where' },
      [beat.n, beat.slideRef].filter(Boolean).join(' · ')));
    (beat.tags || []).forEach(function (t) {
      refs.eyebrow.appendChild(pill(t.label || t.kind, t.kind === 'yours' ? 'tight' : null));
    });
    if (longest && Number(beat.budget) === longest) refs.eyebrow.appendChild(pill('全场最长的一节', null, 'u-ed__pill--soft'));
    refs.title.textContent = beat.title || '未命名';
  }

  /* The frame, whatever beat.slideImage holds, and what this beat cost the
     last time you said it out loud. */
  function renderBand(p, beat) {
    var runs = p.runs || [];
    var last = runs.length ? runs[runs.length - 1] : null;
    var spent = last && lastSpent(last, beat);
    var budget = Number(beat.budget) || 0;
    U.clear(refs.band);
    refs.band.appendChild(U.el('div', { class: 'u-ed__slide' + (beat.slideImage ? '' : ' is-empty') },
      beat.slideImage
        ? U.el('img', { class: 'u-ed__slideimg', src: beat.slideImage, alt: beat.slideRef || '' })
        : U.el('div', { class: 'u-ed__slidebox' }, [
            U.el('span', { class: 'u-lbl' }, '幻灯片'),
            U.el('span', { class: 'u-mono u-ed__slideref' }, beat.slideRef || '还没指到哪一页')
          ])
    ));
    var meta = U.el('div', { class: 'u-ed__bandmeta' }, [
      U.el('div', { class: 'u-ed__metarow' }, [
        U.el('span', { class: 'u-lbl' }, '幻灯片'),
        U.el('span', { class: 'u-ed__metatext' }, beat.slideImage ? (beat.slideRef || '已放图') : '还没放图 · 占位')
      ])
    ]);
    if (spent != null) {
      meta.appendChild(U.el('div', { class: 'u-ed__metarow' }, [
        U.el('span', { class: 'u-lbl' }, '上次排练'),
        U.el('span', { class: 'u-ed__metatext' }, [
          U.el('b', { class: 'u-mono' }, U.fmt(spent)),
          budget ? ' · 比预算' + (spent > budget ? '多 ' : '少 ') : '',
          budget ? U.el('b', { class: 'u-mono' + (spent > budget ? ' u-ed__over' : '') }, U.fmt(Math.abs(spent - budget))) : null
        ])
      ]));
    }
    meta.appendChild(U.el('div', { class: 'u-ed__bandacts' }, [
      mini(beat.slideImage ? '替换' : '放一张图', { on: function () { pickSlide(beat); }, title: '一节一张图 —— 整副牌请用 AI 填充那一步' })
    ]));
    refs.band.appendChild(meta);
  }
  /* One picture for this beat. Importing a whole deck belongs to the module
     that makes a beat per slide; this only ever refills the frame you are
     looking at. */
  function pickSlide(beat) {
    var input = U.el('input', {
      type: 'file', accept: 'image/*',
      onchange: function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () { U.store.update(function () { beat.slideImage = String(reader.result); }); };
        reader.readAsDataURL(file);
      }
    });
    input.click();
  }
  function lastSpent(run, beat) {
    var row = (run.perBeat || []).filter(function (x) { return x.beat === beat.id; })[0];
    return row ? row.spent : null;
  }

  function renderCues(beat) {
    U.clear(refs.cues);
    var cue = beat.cue || [];
    if (!cue.length) {
      if (refs.cuenote) refs.cuenote.textContent = '';
      refs.cues.appendChild(U.el('div', { class: 'u-ed__empty' }, '这一节还没有提词 —— 上台只看这一列，先把它写出来'));
      return;
    }
    var curated = U.cueIsCurated(beat);
    if (refs.cuenote) {
      refs.cuenote.textContent = curated
        ? '上台看 ' + U.onstageCue(beat).length + ' / ' + cue.length + ' 条'
        : cue.length + ' 条全部会上台';
    }
    cue.forEach(function (c) {
      /* Marking is per item and takes effect only once at least one is marked,
         so nothing disappears from the stage the moment you touch the first. */
      var on = curated ? !!c.onstage : true;
      var mark = U.el('button', {
        class: 'u-ed__pick' + (c.onstage ? ' is-on' : '') + (curated && !c.onstage ? ' is-off' : ''),
        'aria-pressed': String(!!c.onstage),
        title: c.onstage ? '上台会看到这条 —— 点一下取消' : '标成上台要看的',
        onclick: function () { U.store.update(function () { c.onstage = !c.onstage; }); }
      });
      var head = U.el('div', { class: 'u-ed__cuetop' }, mark);
      if (c.flag) head.appendChild(pill(c.flag, c.flag === 'OPEN' ? 'over' : c.flag === 'SLOW' || c.flag === 'PAUSE' ? 'tight' : null));
      (c.cols || []).forEach(function (col) { head.appendChild(U.el('span', { class: 'u-chip' }, col)); });
      head.appendChild(U.el('span', { class: 'u-ed__lead', html: c.lead || '' }));
      var item = U.el('div', {
        class: 'u-ed__cue' + ((c.notes || []).length ? ' is-noted' : '') + (on ? '' : ' is-desk')
      }, head);
      (c.say || []).forEach(function (s) { item.appendChild(U.el('div', { class: 'u-read u-ed__say', html: s })); });
      (c.notes || []).forEach(function (n) {
        item.appendChild(U.el('div', { class: 'u-ed__note' }, [
          U.el('span', { class: 'u-lbl u-ed__notelbl' }, '旁批'),
          U.el('span', { class: 'u-ed__notetext' }, n)
        ]));
      });
      refs.cues.appendChild(item);
    });
  }

  /* The script element is built once and never re-created: it holds a caret. */
  function syncScript(beat) {
    var el = refs.script, html = beat.script || '';
    if (shownBeat !== beat.id) {
      if (document.activeElement === el) el.blur();
      el.innerHTML = html;
      shownBeat = beat.id;
    } else if (!saving && document.activeElement !== el && el.innerHTML !== html) {
      el.innerHTML = html;
    }
  }
  function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    var beat = current(); if (!beat || shownBeat !== beat.id) return;
    var html = refs.script.innerHTML;
    if (html === beat.script) return;
    saving = true;
    U.store.update(function () { beat.script = html; });
    saving = false;
  }
  function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 400); }

  function renderScriptFoot(beat) {
    var rate = rateOf();
    var estimate = U.estimate(beat.script, rate);
    var budget = Number(beat.budget) || 0;
    var st = pace(estimate, budget);
    var count = U.countWords(U.textOf(beat.script));
    var diff = Math.round(estimate - budget);
    U.clear(refs.scriptFoot);
    [
      U.el('span', { class: 'u-mono u-ed__footnote' },
        (count.zh ? count.en + ' 词 · ' + count.zh + ' 字' : count.en + ' 词') + ' · ' + rate.en + ' 词/分 →'),
      U.el('span', { class: 'u-mono u-ed__est u-ed__est--' + st }, '约 ' + U.fmt(estimate)),
      U.el('span', { class: 'u-mono u-ed__footnote' },
        '预算 ' + U.fmt(budget) + ' · ' + (diff > 0 ? '超 ' + U.fmt(diff) : diff < 0 ? '富余 ' + U.fmt(-diff) : '刚好')),
      spacer(),
      mini('按估算调预算', { on: function () { adopt(beat); } })
    ].forEach(function (n) { refs.scriptFoot.appendChild(n); });
  }
  /* Adopting the estimate makes the plan honest. It does not make the talk
     shorter — only cutting words does, and the screen says so rather than
     letting the button imply otherwise. */
  function adopt(beat) {
    var seconds = Math.round(U.estimate(beat.script, rateOf()));
    U.store.update(function () { beat.budget = seconds; });
  }

  /* ---------- right: this beat ---------- */
  function beatPanel(p, beat, beats) {
    var rate = rateOf();
    var estimate = U.estimate(beat.script, rate);
    var budget = Number(beat.budget) || 0;
    var st = pace(estimate, budget);
    var totalBudget = U.totals(beats, rate).budget;
    var body = U.el('div', { class: 'u-ed__panelbody' });

    /* budget */
    var stepper = U.el('div', { class: 'u-ed__stepper' }, [
      mini('−', { tone: 'step', on: function () { step(beat, -5); } }),
      U.el('span', { class: 'u-mono u-ed__budgetbig' }, U.fmt(budget)),
      mini('+', { tone: 'step', on: function () { step(beat, 5); } }),
      spacer(),
      U.el('span', { class: 'u-lbl u-ed__tiny' }, totalBudget ? '占全场 ' + Math.round(budget / totalBudget * 100) + '%' : '')
    ]);
    var hint = U.el('div', { class: 'u-ed__hint u-ed__hint--' + st }, [
      U.el('span', { class: 'u-ed__hinttext' }, [
        '按语速估算要 ', U.el('b', { class: 'u-mono' }, U.fmt(estimate)),
        estimate > budget ? '，超 ' + Math.round(estimate - budget) + ' 秒'
          : budget ? '，还余 ' + Math.round(budget - estimate) + ' 秒' : ''
      ]),
      mini('采用', { on: function () { adopt(beat); } })
    ]);
    body.appendChild(U.el('section', { class: 'u-ed__sec' }, [
      U.el('span', { class: 'u-lbl' }, '这一节 · 时间预算'),
      stepper, hint,
      estimate > budget ? U.el('span', { class: 'u-mono u-ed__tiny u-ed__caveat' }, '采用只是把计划写成实话 —— 要变短得删词') : null
    ]));

    /* markers — the two voices are deliberate, see DESIGN.md */
    var tags = U.el('div', { class: 'u-ed__tags' });
    (beat.tags || []).forEach(function (t, ti) {
      tags.appendChild(U.el('span', {
        class: 'u-pill' + (t.kind === 'yours' ? ' u-pill--tight' : '') + ' u-ed__tag',
        title: '点一下删掉这个标记',
        onclick: function () { U.store.update(function () { beat.tags.splice(ti, 1); }); }
      }, t.label || t.kind));
    });
    tags.appendChild(inline === 'tag'
      ? field('tag', '标记…', '', function (v) {
          if (!v) return paint();
          U.store.update(function () { (beat.tags = beat.tags || []).push({ kind: 'own', label: v }); });
        })
      : U.el('button', {
          class: 'u-pill u-ed__tag u-ed__tag--add',
          onclick: function () { inline = 'tag'; paint(); }
        }, '+ 加标记'));
    body.appendChild(U.el('section', { class: 'u-ed__sec' }, [
      U.el('div', { class: 'u-ed__sechead' }, [
        U.el('span', { class: 'u-lbl' }, '标记'),
        U.el('span', { class: 'u-mono u-ed__tiny' }, '节名跟着幻灯片走 · 标记是你自己的速记')
      ]),
      tags
    ]));

    /* notes — mother tongue, for you, never spoken */
    var notes = [];
    (beat.notes || []).forEach(function (n) { notes.push({ text: n, from: null }); });
    (beat.cue || []).forEach(function (c) {
      (c.notes || []).forEach(function (n) { notes.push({ text: n, from: (c.cols || []).join('') || c.flag || null }); });
    });
    body.appendChild(U.el('section', { class: 'u-ed__sec' }, [
      U.el('div', { class: 'u-ed__sechead' }, [
        U.el('span', { class: 'u-lbl u-ed__lbl--over' }, '旁批'),
        U.el('span', { class: 'u-mono u-ed__tiny' }, '只给自己看 · 不导出 · 不上台念')
      ]),
      notes.length
        ? U.el('div', { class: 'u-ed__notes' }, notes.map(function (n) {
            return U.el('div', { class: 'u-ed__panelnote' }, [
              n.from ? U.el('span', { class: 'u-mono u-ed__noteref' }, n.from) : null,
              U.el('span', {}, n.text)
            ]);
          }))
        : U.el('span', { class: 'u-ed__empty' }, '这一节还没有旁批')
    ]));

    /* what this beat actually cost, run by run */
    var runs = (p.runs || []).slice().reverse();
    body.appendChild(U.el('section', { class: 'u-ed__sec' }, [
      U.el('span', { class: 'u-lbl' }, '这一节的排练记录'),
      runs.length
        ? U.el('div', { class: 'u-ed__runs' }, runs.map(function (r, ri) {
            var spent = lastSpent(r, beat);
            if (spent == null) return null;
            var over = spent - budget;
            return U.el('div', { class: 'u-ed__run' }, [
              U.el('span', { class: 'u-mono u-ed__runn' }, '第 ' + (r.n || runs.length - ri) + ' 次'),
              U.el('span', { class: 'u-mono u-ed__runv' + (ri === 0 ? ' is-last' : '') }, U.fmt(spent)),
              budget ? U.el('span', { class: 'u-mono u-ed__rundiff' + (over > 0 && ri === 0 ? ' u-ed__over' : '') }, U.fmtSigned(over)) : null
            ]);
          }).filter(Boolean))
        : U.el('span', { class: 'u-ed__empty' }, '还没排练过这一节')
    ]));
    return body;
  }
  function step(beat, delta) {
    U.store.update(function () { beat.budget = Math.max(0, (Number(beat.budget) || 0) + delta); });
  }

  /* ---------- right: the check ---------- */
  var KIND = {
    long: { label: '太长', mod: 'tight' },
    term: { label: '术语', mod: null, chip: true },
    bookish: { label: '太书面', mod: 'tight' },
    over: { label: '超预算', mod: 'over' }
  };
  function keyOf(f) { return f.kind + '/' + f.beatIndex + '/' + (f.snippet || f.where); }

  function checkPanel(p, findings, cur) {
    var body = U.el('div', { class: 'u-ed__panelbody u-ed__panelbody--check' });
    if (!findings.length) {
      body.appendChild(U.el('span', { class: 'u-ed__empty' }, '没有要提的 —— 或者已经都忽略了'));
      return body;
    }
    findings.forEach(function (f) {
      var meta = KIND[f.kind] || { label: f.kind, mod: null };
      var card = U.el('div', {
        class: 'u-chk__item' + (f.beatIndex === cur ? ' is-here' : ''),
        role: 'button', tabindex: '0',
        onclick: function () { jump(f); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(f); } }
      }, [
        U.el('div', { class: 'u-chk__top' }, [
          pill(meta.label, meta.mod, meta.chip ? 'u-ed__pill--chip' : null),
          U.el('span', { class: 'u-mono u-chk__where' }, f.where)
        ]),
        U.el('div', { class: 'u-chk__msg' }, f.message)
      ]);
      var acts = U.el('div', { class: 'u-chk__acts' });
      if (inline === keyOf(f)) {
        acts.appendChild(field(keyOf(f), '上台要说的那一句解释…', '', function (v) {
          if (!v) return paint();
          U.store.update(function () {
            (p.terms || []).forEach(function (t) { if (t.term === f.snippet) t.say = v; });
          });
        }));
      } else {
        acts.appendChild(mini(f.fix.label, {
          primary: true,
          on: function (e) {
            e.stopPropagation();
            if (f.fix.action === 'adopt') adopt(beatsOf()[f.beatIndex]);
            else if (f.fix.action === 'glossary') { inline = keyOf(f); paint(); }
            else jump(f);
          }
        }));
        acts.appendChild(mini('忽略', {
          on: function (e) { e.stopPropagation(); dismissed[keyOf(f)] = true; paint(); }
        }));
      }
      card.appendChild(acts);
      body.appendChild(card);
    });
    return body;
  }
  /* Go to the beat, then put the sentence in front of the eye. The flash is an
     animation rather than a class, because this paragraph lives inside a
     contenteditable and anything written into it gets saved as your script. */
  function jump(f) {
    if (f.beatIndex !== at()) U.store.ui({ beatIndex: f.beatIndex });
    if (f.paraIndex == null) return;
    var p = refs.script.children[f.paraIndex];
    if (!p) return;
    var calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    p.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    if (calm || !p.animate) return;
    var wash = getComputedStyle(refs.wrap).getPropertyValue('--wash').trim() || 'transparent';
    p.animate([{ backgroundColor: wash }, { backgroundColor: 'transparent' }], { duration: 1100, easing: 'ease-out' });
  }

  function renderPanel(p, beats, beat, cur) {
    var findings = ((U.check && U.check.scan(p)) || []).filter(function (f) { return !dismissed[keyOf(f)]; });
    U.clear(refs.tabs);
    [['beat', '这一节'], ['check', '检查 ' + findings.length]].forEach(function (t) {
      refs.tabs.appendChild(U.el('button', {
        class: 'u-lbl u-ed__tab', role: 'tab', 'aria-selected': String(tab === t[0]),
        onclick: function () { tab = t[0]; inline = null; paint(); }
      }, t[1]));
    });
    var body = tab === 'check' ? checkPanel(p, findings, cur) : beatPanel(p, beat, beats);
    refs.panel.replaceChild(body, refs.panelBody);
    refs.panelBody = body;
    /* The list is the whole talk, but you are working on one beat: put its
       findings under the eye when you arrive, and leave the scroll alone
       afterwards so it does not twitch while you type. */
    var anchor = tab + ':' + cur;
    if (tab === 'check' && anchor !== shownAnchor) {
      var here = body.querySelector('.u-chk__item.is-here');
      if (here) here.scrollIntoView({ block: 'nearest' });
    }
    shownAnchor = anchor;

    var here = findings.filter(function (f) { return f.beatIndex === cur; }).length;
    var hidden = Object.keys(dismissed).length;
    U.clear(refs.panelFoot);
    refs.panelFoot.appendChild(U.el('span', { class: 'u-mono u-ed__tiny' },
      tab === 'check'
        ? '全稿 ' + findings.length + ' 处 · 这一节 ' + here + ' 处' + (hidden ? ' · 已忽略 ' + hidden : '')
        : ((p.runs || []).length ? '语速按你 ' + p.runs.length + ' 次排练校准：' : '语速还没校准，用的是默认值：') +
          '英文 ' + rateOf().en + ' 词/分 · 中文 ' + rateOf().zh + ' 字/分'));
  }

  /* ---------- assembly ---------- */
  U.views.register('editor', {
    mount: function (root) {
      refs = {};
      shownBeat = null;
      var wrap = U.el('div', { class: 'u-ed' });
      refs.wrap = wrap;

      refs.header = U.el('div');
      wrap.appendChild(refs.header);

      refs.railList = U.el('div', { class: 'u-ed__list' });
      refs.railFoot = U.el('div', { class: 'u-ed__railfoot' });
      var rail = U.el('div', { class: 'u-ed__rail' }, [
        U.el('div', { class: 'u-ed__railhead' }, [
          U.el('span', { class: 'u-lbl' }, '台本顺序'),
          spacer(),
          U.el('button', { class: 'u-lbl u-ed__add', onclick: addBeat }, '+ 加一节')
        ]),
        refs.railList, refs.railFoot
      ]);

      refs.eyebrow = U.el('div', { class: 'u-ed__eyebrow' });
      refs.title = U.el('div', { class: 'u-ser u-ed__bigtitle' });
      refs.band = U.el('div', { class: 'u-ed__band' });
      refs.cues = U.el('div', { class: 'u-ed__cuelist' });
      refs.script = U.el('div', {
        class: 'u-read u-ed__script', contenteditable: 'true', spellcheck: 'false',
        'aria-label': '讲稿', oninput: queueSave, onblur: flush
      });
      refs.scriptFoot = U.el('div', { class: 'u-ed__scriptfoot' });

      var main = U.el('div', { class: 'u-ed__main' }, [
        U.el('div', { class: 'u-ed__head' }, [refs.eyebrow, refs.title]),
        refs.band,
        U.el('div', { class: 'u-ed__spread' }, [
          U.el('div', { class: 'u-ed__col u-ed__col--cue' }, [
            U.el('div', { class: 'u-ed__colhead' }, [
              U.el('span', { class: 'u-lbl u-ed__colname' }, '提词 · CUE'),
              (refs.cuenote = U.el('span', { class: 'u-mono u-ed__colnote' }))
            ]),
            refs.cues
          ]),
          U.el('div', { class: 'u-ed__col' }, [
            U.el('div', { class: 'u-ed__colhead' }, [
              U.el('span', { class: 'u-lbl u-ed__colname' }, '讲稿 · SCRIPT'),
              U.el('span', { class: 'u-mono u-ed__colnote' }, '逐字，排练用')
            ]),
            U.el('div', { class: 'u-ed__scriptwrap' }, refs.script),
            refs.scriptFoot
          ])
        ])
      ]);

      refs.tabs = U.el('div', { class: 'u-ed__tabs', role: 'tablist' });
      refs.panelFoot = U.el('div', { class: 'u-ed__panelfoot' });
      refs.panelBody = U.el('div', { class: 'u-ed__panelbody' });
      refs.panel = U.el('div', { class: 'u-ed__panel' }, [refs.tabs, refs.panelBody, refs.panelFoot]);

      wrap.appendChild(U.el('div', { class: 'u-ed__body' }, [rail, main, refs.panel]));
      root.appendChild(wrap);
    },

    update: function (state) {
      var p = prod();
      if (!p || !(p.beats || []).length) {
        U.clear(refs.railList).appendChild(U.el('div', { class: 'u-ed__empty' }, '还没有演讲'));
        return;
      }
      var beats = p.beats, cur = at(), beat = beats[cur];
      var top = header(p);
      refs.wrap.replaceChild(top, refs.header);
      refs.header = top;
      renderRail(p, beats, cur);
      renderHead(beat, beats);
      renderBand(p, beat);
      renderCues(beat);
      syncScript(beat);
      renderScriptFoot(beat);
      renderPanel(p, beats, beat, cur);
    }
  });

  /* Two keys, and they print themselves at the foot of the running order. */
  U.keys.bind('editor', 'ArrowUp', '上一节', function () { U.store.ui({ beatIndex: Math.max(0, at() - 1) }); }, 10);
  U.keys.bind('editor', 'ArrowDown', '下一节', function () { U.store.ui({ beatIndex: Math.min(beatsOf().length - 1, at() + 1) }); }, 20);
})();
