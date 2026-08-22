'use strict';
/* AI 填充 — four steps, because v1 does not call an API.

   The prompt below is not scaffolding to be thrown away when it does. It *is*
   the system prompt: the same words go up to the model the day this screen
   collapses into one button, so tuning it now is banked work, not a detour.
   That is also why it is spelled out on screen instead of hidden — you can read
   it, edit it, and see exactly what is being asked on your behalf. */
(function () {

  var LANG = { en: '英文', zh: '中文', ja: '日文', ko: '韩文', fr: '法文', de: '德文', es: '西班牙文' };
  function langName(code) { return LANG[code] || String(code || '').toUpperCase() || '未定'; }

  function minutes(secs) {
    var s = Number(secs) || 0;
    if (!s) return '（时长待填）';
    return s % 60 === 0 ? (s / 60) + ' 分钟硬性' : U.fmt(s) + ' 硬性';
  }

  /* Everything the model needs to know about the room, pulled from the
     production so the two can never drift apart. */
  function occasionSlots(p) {
    var speak = (p.language && p.language.speak) || 'en';
    var notes = (p.language && p.language.notes) || 'zh';
    var rate = p.rate || U.DEFAULT_RATE;
    var head = [];
    if (p.occasion) head.push(p.occasion);
    head.push(p.title || '未命名');
    /* These land in a string that is written to innerHTML, so the title is
       escaped rather than trusted. Not only for what a title could carry: an
       unescaped < in "budget < 12:00" would silently eat the rest of the line
       out of the prompt you are about to hand to a model. */
    return {
      occasion: U.esc(head.join(' · ')),
      audience: Number(p.audience) ? Number(p.audience) + ' 人' : '（人数待填）',
      duration: minutes(p.target),
      language: speak === notes
        ? U.esc(langName(speak)) + '讲'
        : U.esc(langName(speak)) + '讲；我的母语是' + U.esc(langName(notes)),
      target: String(Number(p.target) || 0),
      pace: speak === 'zh'
        ? '按中文 <b>' + (rate.zh || U.DEFAULT_RATE.zh) + '</b> 字/分'
        : '按' + U.esc(langName(speak)) + ' <b>' + (rate.en || U.DEFAULT_RATE.en) + '</b> 词/分'
    };
  }

  /* Bold is markup, not content — the plain text handed to the model is this
     string with the tags taken out. */
  function promptHtml(p) {
    var s = occasionSlots(p);
    return '你是我的演讲排练助手。把随附的幻灯片做成一份演讲台本。\n' +
      '\n' +
      '<b>【场合】</b>\n' +
      '  ' + s.occasion + '\n' +
      '  听众：' + s.audience + '\n' +
      '  时长：<b>' + s.duration + '</b>，后面还有人讲，超时会占用别人的时间\n' +
      '  语言：' + s.language + '\n' +
      '\n' +
      '<b>【输出】</b>只输出 JSON，符合随附的 understudy.schema.json：\n' +
      '  { "beats": [ { "n", "title", "slideRef", "budget",\n' +
      '                 "cue": [ { "flag", "cols", "lead", "say" } ],\n' +
      '                 "script", "notes": [] } ] }\n' +
      '\n' +
      '<b>【每一节】</b>\n' +
      '1. <b>cue</b> = 上台扫一眼的要点。每条不超过 12 个词，能照着直接说。\n' +
      '   flag 只用 SAY / SLOW / PAUSE / ASK / OPEN，没有就留空。\n' +
      '   cols 填对应的表格列号（如 ["U","V"]），没有就留空。\n' +
      '   say = 一句可以原样念出口的话。\n' +
      '2. <b>script</b> = 逐字稿。口语、短句，不要书面语。\n' +
      '   需要重读的词用 **星号** 包起来。\n' +
      '3. <b>notes</b> = <b>中文</b>，写给我自己看的提醒：哪里说慢、哪里\n' +
      '   容易被追问、上次我在哪讲错。<b>这部分永远不会被念出来</b>。\n' +
      '4. <b>budget</b> = 这一节的秒数，全部相加必须 ≤ ' + s.target + '。\n' +
      '   ' + s.pace + '估算 script 的长度；对不上就<b>把 script 改短</b>。\n' +
      '\n' +
      '<b>【不要】</b>\n' +
      '  · 不要"大家好，今天很高兴"这类套话，第一句就进内容。\n' +
      '  · 不要把幻灯片上的字原样抄进 script，要讲人话。\n' +
      '  · 幻灯片上没有的事实不要编，不确定就写成 [待确认：xxx]。';
  }
  function promptText(p) { return U.textOf(promptHtml(p)); }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  /* file:// and older engines refuse the async clipboard; a hidden textarea and
     execCommand still work there, and this screen is useless without a copy. */
  function legacyCopy(text) {
    try {
      var ta = U.el('textarea', { style: { position: 'fixed', top: '-1000px', opacity: '0' } });
      ta.value = text;
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  function tick() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '10'); svg.setAttribute('height', '10');
    svg.setAttribute('viewBox', '0 0 12 12'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<path d="M2 6.4l2.8 2.8L10 3.6"></path>';
    return svg;
  }

  var STEPS = ['放进幻灯片', '交代场合', '复制指令', '粘回结果'];

  U.views.register('aifill', {
    mount: function (root) {
      var edited = null;      /* the prompt once the speaker has touched it */
      var filled = false;     /* step 4 cleared */
      var report = null;      /* last validation, shown next to the paste box */

      function p() { return U.store.production() || { beats: [] }; }
      function beats() { return (p().beats) || []; }
      function currentPrompt() { return edited == null ? promptText(p()) : edited; }
      function stepNow() {
        if (filled) return 5;
        if (!beats().length) return 1;
        var prod = p();
        if (!prod.title || !prod.target) return 2;
        return 3;
      }

      /* ---- step bar ---- */
      var stepBar = U.el('div', { class: 'u-ai__steps u-card' });
      function paintSteps() {
        var now = stepNow();
        U.clear(stepBar);
        STEPS.forEach(function (word, i) {
          var n = i + 1;
          var state = n < now ? 'done' : n === now ? 'now' : 'todo';
          if (i) stepBar.appendChild(U.el('div', { class: 'u-ai__steprule' }));
          stepBar.appendChild(U.el('div', { class: 'u-ai__step' }, [
            U.el('div', { class: 'u-ai__sn u-ai__sn--' + state }, state === 'done' ? tick() : String(n)),
            U.el('span', { class: 'u-ai__stepword u-ai__stepword--' + state, text: word })
          ]));
        });
      }

      /* ---- prompt ---- */
      var code = U.el('pre', { class: 'u-ai__code' });
      var editor = U.el('textarea', {
        class: 'u-ai__edit u-mono', spellcheck: 'false',
        oninput: function () { edited = editor.value; }
      });
      var copyNote = U.el('span', { class: 'u-mono u-ai__copynote' });
      var editBtn = U.el('button', {
        class: 'u-btn u-ai__mini',
        onclick: function () {
          var on = editor.style.display !== 'block';
          if (on) { editor.value = currentPrompt(); edited = editor.value; }
          editor.style.display = on ? 'block' : 'none';
          code.style.display = on ? 'none' : 'block';
          editBtn.textContent = on ? '完成' : '编辑';
        }
      }, '编辑');
      var copyBtn = U.el('button', {
        class: 'u-btn u-btn--primary u-ai__mini',
        onclick: function () {
          copyText(currentPrompt()).then(function (ok) {
            copyNote.textContent = ok ? '已复制 —— 连同幻灯片一起发给 AI' : '复制不了，手动全选这段文字';
            copyNote.className = 'u-mono u-ai__copynote' + (ok ? ' is-ok' : ' is-bad');
          });
        }
      }, '复制指令');

      editor.style.display = 'none';

      var attach = U.el('div', { class: 'u-ai__attach' });
      var promptCard = U.el('div', { class: 'u-card u-ai__promptcard' }, [
        U.el('div', { class: 'u-ai__promptbar' }, [
          U.el('span', { class: 'u-lbl u-ai__barlbl', text: '给 AI 的指令' }),
          U.el('span', { class: 'u-mono u-ai__barnote', text: '按你填的场合自动生成 · 可以改' }),
          U.el('div', { style: { flex: '1' } }),
          copyNote, editBtn, copyBtn
        ]),
        U.el('div', { class: 'u-ai__promptbody' }, [code, editor, U.el('div', { class: 'u-ai__fade' })]),
        attach
      ]);

      /* ---- preview ---- */
      var previewNote = U.el('span', { class: 'u-mono u-ai__prevnote' });
      var previewList = U.el('div', { class: 'u-ai__prev' });
      var slideCount = U.el('span', { class: 'u-mono u-ai__slides' });

      var preview = U.el('div', { class: 'u-ai__side' }, [
        U.el('div', { class: 'u-ai__sidehead' }, [
          U.el('span', { class: 'u-lbl u-ai__barlbl', text: '会填进这些位置' }), previewNote
        ]),
        previewList,
        U.el('div', { class: 'u-ai__later' }, [
          U.el('span', { class: 'u-lbl', text: '以后会怎样' }),
          U.el('span', {
            class: 'u-ai__latertext',
            text: '接上 API 之后这一屏只剩一个"生成"按钮。上面这段指令会原样搬过去当系统提示 —— 所以现在把它调好，就是在给以后攒资产。'
          })
        ])
      ]);

      /* ---- step 4 ---- */
      var paste = U.el('textarea', {
        class: 'u-ai__paste u-mono', spellcheck: 'false',
        placeholder: '粘到这里，或把 .json 拖进来…',
        ondragover: function (e) { e.preventDefault(); },
        ondrop: function (e) {
          var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (!f) return;
          e.preventDefault();
          var fr = new FileReader();
          fr.onload = function () { paste.value = String(fr.result || ''); };
          fr.readAsText(f);
        }
      });
      var verdict = U.el('div', { class: 'u-ai__verdict' });
      var fillBtn = U.el('button', {
        class: 'u-btn u-btn--primary u-ai__fill',
        onclick: function () {
          report = U.io.validateFill(paste.value, U.store.production());
          if (report.ok) {
            var done = U.io.applyFill(report, U.store.production());
            report.applied = done;
            filled = true;
            paste.value = '';
          }
          paintAll();
        }
      }, '校验并填充');

      var step4 = U.el('div', { class: 'u-ai__four u-card' }, [
        U.el('div', { class: 'u-ai__fourhead' }, [
          U.el('div', { class: 'u-ai__sn u-ai__sn--todo', text: '4' }),
          U.el('div', { class: 'u-ai__fourid' }, [
            U.el('span', { class: 'u-ai__fourtitle', text: '把结果粘回来' }),
            U.el('span', { class: 'u-mono u-ai__foursub', text: 'JSON 或整段回复都行' })
          ])
        ]),
        U.el('div', { class: 'u-ai__fourbody' }, [paste, verdict, fillBtn])
      ]);

      /* ---- shell ---- */
      var body = U.el('div', { class: 'u-ai__body' }, [
        U.el('div', { class: 'u-ai__head' }, [
          U.el('div', { class: 'u-ai__headid' }, [
            U.el('span', { class: 'u-ser u-ai__h1', text: '让替补先写一版' }),
            U.el('span', {
              class: 'u-ai__lede',
              text: '现在：复制指令，拿去任意一个 AI 里跑，再把结果粘回来。以后接上 API，这四步会合成一个按钮 —— 但指令本身不变，所以现在攒下来的都不白费。'
            })
          ]),
          U.el('div', { style: { flex: '1' } }),
          U.el('div', { class: 'u-ai__slidebox' }, [
            U.el('span', { class: 'u-lbl', text: '已放进来' }), slideCount
          ])
        ]),
        stepBar,
        U.el('div', { class: 'u-ai__grid' }, [promptCard, preview]),
        step4
      ]);

      root.appendChild(U.el('div', { class: 'u-ai' }, [
        U.chrome.topbar({
          crumb: 'AI 填充',
          actions: [U.el('button', { class: 'u-btn', onclick: function () { U.views.show('library'); } }, '取消')]
        }),
        body
      ]));

      function paintPrompt() {
        if (edited == null) code.innerHTML = promptHtml(p());
        else code.textContent = edited;
        var written = beats().filter(U.io.hasScript).length;
        U.clear(attach).appendChild(U.el('span', { class: 'u-lbl', text: '随指令一起给它' }));
        var slides = beats().filter(function (b) { return b.slideImage || b.slideRef; }).length;
        [slides ? slides + ' 张幻灯片' : '幻灯片（还没放）',
          'understudy.schema.json',
          written ? '我已写好的 ' + written + ' 节' : null
        ].forEach(function (t) {
          if (t) attach.appendChild(U.el('span', { class: 'u-pill u-ai__attachpill', text: t }));
        });
      }

      function paintPreview() {
        var list = beats();
        var written = list.filter(U.io.hasScript).length;
        previewNote.textContent = written
          ? '你已写的 ' + written + ' 节不会被覆盖'
          : '全部 ' + list.length + ' 节都等着填';
        var slides = list.filter(function (b) { return b.slideImage || b.slideRef; }).length;
        slideCount.textContent = slides ? slides + ' 张幻灯片' : list.length + ' 节';

        U.clear(previewList);
        list.forEach(function (b, i) {
          var done = U.io.hasScript(b);
          previewList.appendChild(U.el('div', { class: 'u-ai__prow' + (done ? '' : ' is-todo') }, [
            U.el('span', { class: 'u-mono u-ai__pn', text: b.n || String(i).padStart(2, '0') }),
            b.slideImage
              ? U.el('img', { class: 'u-ai__thumb', src: b.slideImage, alt: '' })
              : U.el('div', { class: 'u-ai__thumb u-ai__thumb--' + (done ? 'has' : 'none') }),
            U.el('span', { class: 'u-ai__ptitle', text: b.title || '（还没有名字）' }),
            U.el('span', { class: 'u-pill' + (done ? ' u-pill--go' : ' u-ai__pill--todo'), text: done ? '已写' : '待生成' })
          ]));
        });
      }

      function paintVerdict() {
        U.clear(verdict);
        if (!report) {
          verdict.appendChild(U.el('span', { class: 'u-mono u-ai__vline', text: '还没校验过' }));
          return;
        }
        if (report.ok) {
          var n = report.beats.length;
          var applied = report.applied || { filled: [], kept: [] };
          verdict.appendChild(U.el('span', {
            class: 'u-mono u-ai__vline is-ok',
            text: '上一次校验：' + n + ' 节全部通过，共 ' + U.fmt(report.total)
          }));
          if (applied.filled.length || applied.kept.length) {
            verdict.appendChild(U.el('span', {
              class: 'u-mono u-ai__vline',
              text: '填了 ' + applied.filled.length + ' 节' +
                (applied.kept.length ? ' · 你已写的 ' + applied.kept.length + ' 节原样保留' : '')
            }));
          }
        } else {
          report.errors.forEach(function (e) {
            verdict.appendChild(U.el('span', { class: 'u-mono u-ai__vline is-bad', text: e.text }));
          });
        }
        report.notices.forEach(function (n) {
          verdict.appendChild(U.el('span', { class: 'u-mono u-ai__vline is-warn', text: n.text }));
        });
      }

      function paintAll() { paintSteps(); paintPrompt(); paintPreview(); paintVerdict(); }

      this._paint = paintAll;
      paintAll();
    },
    update: function () { if (this._paint) this._paint(); }
  });
})();
