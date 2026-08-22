'use strict';
/* Getting a talk in and out of the file.

   Export is the product's whole distribution story: the running page *is* the
   application, so a self-contained copy is this document's own markup with the
   production baked into `#embedded-production`. Boot prefers that bake over
   storage, so double-clicking the copy opens that talk and nothing else.

   The validator lives here rather than in 41-aifill because it is the one part
   of the AI round-trip with real rules — beat counts, budgets, the venue slot —
   and rules deserve to be pure functions a test can hammer without a browser. */
U.io = (function () {

  /* ---------- helpers ---------- */

  /* Paragraph-by-paragraph plain text. `U.textOf` flattens a whole script into
     one line; a printed or pasted 台本 needs the breaks back. */
  function blockText(html) {
    return String(html == null ? '' : html)
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|li|h[1-6]|blockquote)\s*>/gi, '\n')
      .split('\n')
      .map(function (chunk) { return U.textOf(chunk).replace(/\s+/g, ' ').trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function hasScript(beat) { return blockText(beat && beat.script).length > 0; }
  function hasCue(beat) { return !!(beat && beat.cue && beat.cue.length); }

  function label(beat, i) {
    if (beat && beat.n) return String(beat.n);
    return String(i).padStart(2, '0');
  }

  function safeName(title, ext) {
    var base = String(title || 'understudy').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return (base || 'understudy') + ext;
  }

  /* A download is the only way out of a file:// page. */
  function download(name, text, mime) {
    if (typeof document === 'undefined') return false;
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = U.el('a', { href: url, download: name, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
    return true;
  }

  /* ---------- self-contained copy ---------- */

  /* JSON goes inside a <script> element, so the one sequence that could end it
     early has to leave as an escape. `<` never occurs in JSON outside a string,
     where < is exactly equivalent — the parse on the far side is lossless. */
  function bakeable(production) {
    return JSON.stringify(production).replace(/</g, '\\u003c');
  }

  function exportHtml(opts) {
    opts = opts || {};
    if (typeof document === 'undefined') return '';
    var p = opts.production || U.store.production();
    if (!p) return '';
    var tag = document.getElementById('embedded-production');
    var html;
    if (tag) {
      var before = tag.textContent;
      tag.textContent = bakeable(p);
      html = '<!doctype html>\n' + document.documentElement.outerHTML + '\n';
      tag.textContent = before;
    } else {
      html = '<!doctype html>\n' + document.documentElement.outerHTML + '\n';
    }
    if (opts.download !== false) download(safeName(p.title, '.html'), html, 'text/html');
    return html;
  }

  /* ---------- plain text ---------- */

  /* Everything except 旁批. Notes are the one layer written in the speaker's
     own language for the speaker alone — DESIGN.md keeps them out of anything
     that leaves the app, and that includes the paste buffer and the printer. */
  function plainText(production) {
    var p = production || U.store.production();
    if (!p) return '';
    var beats = p.beats || [];
    var out = [];
    out.push(p.title || '未命名');
    var head = [];
    if (p.occasion) head.push(p.occasion);
    if (p.date) head.push(String(p.date).replace('T', ' '));
    head.push('场地时间 ' + U.fmt(Number(p.target) || 0));
    head.push(beats.length + ' 节');
    out.push(head.join(' · '));

    beats.forEach(function (b, i) {
      out.push('');
      out.push(label(b, i) + '  ' + (b.title || ''));
      var meta = [];
      if (b.slideRef) meta.push(b.slideRef);
      meta.push('预算 ' + U.fmt(Number(b.budget) || 0));
      out.push('    ' + meta.join(' · '));
      if (hasCue(b)) {
        out.push('    提词');
        b.cue.forEach(function (c) {
          var bits = [];
          if (c.flag) bits.push('[' + c.flag + ']');
          if (c.cols && c.cols.length) bits.push('(' + c.cols.join(' ') + ')');
          var lead = U.textOf(c.lead).replace(/\s+/g, ' ').trim();
          if (lead) bits.push(lead);
          out.push('      · ' + bits.join(' '));
          (c.say || []).forEach(function (s) {
            var say = U.textOf(s).replace(/\s+/g, ' ').trim();
            if (say) out.push('        ' + say);
          });
        });
      }
      var script = blockText(b.script);
      if (script.length) {
        out.push('    讲稿');
        script.forEach(function (line) { out.push('      ' + line); });
      }
    });
    return out.join('\n') + '\n';
  }

  function exportText(opts) {
    opts = opts || {};
    var p = opts.production || U.store.production();
    var text = plainText(p);
    if (opts.download !== false && text) download(safeName(p && p.title, '.txt'), text, 'text/plain');
    return text;
  }

  /* ---------- print ---------- */

  /* A print sheet is built on demand rather than styled out of the editor: the
     editor's DOM belongs to another screen, and one beat per page is a shape
     no live layout has. */
  function printSheets(production) {
    var p = production || U.store.production();
    var beats = (p && p.beats) || [];
    var head = [];
    if (p.occasion) head.push(p.occasion);
    if (p.date) head.push(String(p.date).replace('T', ' '));
    head.push('场地时间 ' + U.fmt(Number(p.target) || 0));
    head.push(beats.length + ' 节');

    var sheets = [U.el('section', { class: 'u-print__sheet u-print__cover' }, [
      U.el('div', { class: 'u-ser u-print__title', text: p.title || '未命名' }),
      U.el('div', { class: 'u-mono u-print__meta', text: head.join(' · ') })
    ])];

    beats.forEach(function (b, i) {
      var kids = [
        U.el('div', { class: 'u-print__head' }, [
          U.el('span', { class: 'u-mono u-print__n', text: label(b, i) }),
          U.el('span', { class: 'u-ser u-print__beat', text: b.title || '' }),
          U.el('span', { class: 'u-mono u-print__budget', text: U.fmt(Number(b.budget) || 0) })
        ])
      ];
      if (b.slideRef) kids.push(U.el('div', { class: 'u-mono u-print__slide', text: b.slideRef }));
      if (hasCue(b)) {
        kids.push(U.el('div', { class: 'u-lbl u-print__lbl', text: '提词' }));
        kids.push(U.el('ul', { class: 'u-print__cue' }, b.cue.map(function (c) {
          return U.el('li', {}, [
            c.flag ? U.el('span', { class: 'u-pill u-print__flag', text: c.flag }) : null,
            (c.cols && c.cols.length) ? U.el('span', { class: 'u-chip', text: c.cols.join(' ') }) : null,
            U.el('span', { class: 'u-print__lead', html: String(c.lead || '') }),
            (c.say || []).length ? U.el('div', { class: 'u-read u-print__say' },
              (c.say || []).map(function (s) { return U.el('div', { html: String(s) }); })) : null
          ]);
        })));
      }
      var script = blockText(b.script);
      if (script.length) {
        kids.push(U.el('div', { class: 'u-lbl u-print__lbl', text: '讲稿' }));
        kids.push(U.el('div', { class: 'u-read u-print__script' },
          script.map(function (line) { return U.el('p', { text: line }); })));
      }
      sheets.push(U.el('section', { class: 'u-print__sheet' }, kids));
    });
    return U.el('div', { class: 'u-print', id: 'u-print', 'aria-hidden': 'true' }, sheets);
  }

  function print(opts) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return false;
    opts = opts || {};
    var host = printSheets(opts.production);
    var old = document.getElementById('u-print');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    document.body.appendChild(host);

    /* Ink on paper is paper, whichever desk theme you happen to be sitting in. */
    var wasNight = U.store.get().ui.theme === 'night';
    if (wasNight) U.store.ui({ theme: 'paper' });

    var done = false;
    function restore() {
      if (done) return;
      done = true;
      window.removeEventListener('afterprint', restore);
      if (host.parentNode) host.parentNode.removeChild(host);
      if (wasNight) U.store.ui({ theme: 'night' });
    }
    window.addEventListener('afterprint', restore);
    try { window.print(); } catch (e) { /* a blocked print must not strand the page */ }
    setTimeout(restore, 1500);
    return true;
  }

  /* ---------- import ---------- */

  var IMAGE_RE = /\.(png|jpe?g|gif|webp|avif)$/i;
  var DECK_RE = /\.(pptx?|pdf|key)$/i;

  function readDataUrl(file) {
    return new Promise(function (resolve) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { resolve(''); };
      fr.readAsDataURL(file);
    });
  }

  /* A phone photo or a retina screen-grab is several megabytes as a data URL,
     and ten of them do not fit in localStorage at all. Slides are read at slide
     size, so 1600px wide is plenty and costs about a tenth. */
  var MAX_W = 1600, QUALITY = 0.82;
  function downscale(dataUrl) {
    return new Promise(function (resolve) {
      /* Vectors are already small and rasterising one would only lose. */
      if (/^data:image\/svg/.test(dataUrl) || typeof document === 'undefined') return resolve(dataUrl);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h || w <= MAX_W) return resolve(dataUrl);
        var c = document.createElement('canvas');
        c.width = MAX_W; c.height = Math.round(h * MAX_W / w);
        var ctx = c.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        var out = c.toDataURL('image/webp', QUALITY);
        if (out.indexOf('data:image/webp') !== 0) out = c.toDataURL('image/jpeg', QUALITY);
        resolve(out.length < dataUrl.length ? out : dataUrl);
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  function beatFromImage(name, dataUrl, index) {
    return {
      id: 'b' + Date.now().toString(36) + '-' + index,
      n: String(index).padStart(2, '0'),
      title: String(name || '').replace(/\.[^.]+$/, '') || ('第 ' + (index + 1) + ' 张'),
      nav: '', slideRef: String(name || ''), slideImage: dataUrl,
      budget: 0, importance: 2, tags: [], cue: [], script: '', notes: []
    };
  }

  /* One slide, one beat — the deck already decided where the seams are. Names
     come from the files so the list is recognisable before anything is written. */
  function importImages(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) {
      return (f.type && f.type.indexOf('image/') === 0) || IMAGE_RE.test(f.name || '');
    });
    list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), undefined, { numeric: true }); });
    if (!list.length) return Promise.resolve({ added: 0, beats: [] });
    return Promise.all(list.map(readDataUrl)).then(function (urls) {
      return Promise.all(urls.map(function (u) { return u ? downscale(u) : Promise.resolve(''); }));
    }).then(function (urls) {
      var p = U.store.production();
      if (!p) return { added: 0, beats: [] };
      var start = (p.beats || []).length;
      var made = [];
      urls.forEach(function (url, i) {
        if (!url) return;
        made.push(beatFromImage(list[i].name, url, start + made.length));
      });
      if (!made.length) return { added: 0, beats: [] };
      U.store.update(function () { p.beats = (p.beats || []).concat(made); });
      /* Whether it actually persisted, so the caller can say so rather than
         reporting a success the next reload would contradict. */
      return { added: made.length, beats: made, stored: U.store.get().storage !== 'full' };
    });
  }

  /* v1 does not open .pptx or .pdf. Saying so is the feature: a half-working
     parser that silently drops the speaker notes is worse than a sentence. */
  function importDeck(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) { return DECK_RE.test(f.name || ''); });
    return {
      ok: false, files: list.length,
      reason: 'v1 还不能拆 .pptx / .pdf —— 先把每页导成图片（.png / .jpg）拖进来，一张一节。'
    };
  }

  function sortFiles(files) {
    var all = Array.prototype.slice.call(files || []);
    return {
      images: all.filter(function (f) { return (f.type && f.type.indexOf('image/') === 0) || IMAGE_RE.test(f.name || ''); }),
      decks: all.filter(function (f) { return DECK_RE.test(f.name || ''); })
    };
  }

  /* ---------- the AI round-trip ---------- */

  /* People paste the whole reply, fences and pleasantries included. Take the
     outermost braces and try again rather than making them tidy it up. */
  function parseLoose(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { /* fall through */ }
    var fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
    if (fenced) { try { return JSON.parse(fenced[1]); } catch (e) { /* fall through */ } }
    var a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(raw.slice(a, b + 1)); } catch (e) { /* fall through */ } }
    a = raw.indexOf('['); b = raw.lastIndexOf(']');
    if (a >= 0 && b > a) { try { return JSON.parse(raw.slice(a, b + 1)); } catch (e) { /* fall through */ } }
    return null;
  }

  var CN = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];
  function cn(n) { return (n >= 0 && n <= 10) ? CN[n] : String(n); }

  /* Pure on purpose: everything the fill step can refuse to do, decided without
     a DOM. `beats` comes back normalised, so applyFill has nothing left to judge. */
  function validateFill(input, production) {
    var res = { ok: false, errors: [], notices: [], beats: [], total: 0 };
    function err(code, text) { res.errors.push({ code: code, text: text }); }
    function note(code, text) { res.notices.push({ code: code, text: text }); }

    var data = (typeof input === 'string') ? parseLoose(input) : input;
    if (!data || typeof data !== 'object') {
      err('parse', '这段读不出 JSON —— 把 AI 回复里从 { 到 } 的部分整段粘进来就行。');
      return res;
    }
    var incoming = Array.isArray(data) ? data : data.beats;
    if (!Array.isArray(incoming)) {
      err('shape', '里面没有 beats 数组 —— 顶层要么是 { "beats": [...] }，要么直接是一个数组。');
      return res;
    }

    var beats = (production && production.beats) || [];
    if (beats.length && incoming.length !== beats.length) {
      err('count', '节数对不上：这边有 ' + beats.length + ' 节，这份给了 ' + incoming.length + ' 节。');
    }

    var rate = (production && production.rate) || U.DEFAULT_RATE;
    var target = Number(production && production.target) || 0;
    var noCue = [], noScript = [], guessed = [], sum = 0;

    res.beats = incoming.map(function (raw, i) {
      var b = raw || {};
      var mine = beats[i] || {};
      var tag = b.n ? String(b.n) : label(mine, i);
      var cue = Array.isArray(b.cue) ? b.cue.filter(function (c) { return c && (c.lead || (c.say && c.say.length)); }) : [];
      var script = typeof b.script === 'string' ? b.script : '';
      if (!cue.length) noCue.push(tag);
      if (!blockText(script).length) noScript.push(tag);

      var budget = Number(b.budget);
      if (!isFinite(budget) || budget <= 0) {
        budget = Math.round(U.estimate(script, rate));
        guessed.push(tag);
      }
      sum += budget;

      return {
        n: tag,
        title: b.title != null ? String(b.title) : (mine.title || ''),
        slideRef: b.slideRef != null ? String(b.slideRef) : (mine.slideRef || ''),
        budget: budget,
        importance: Number(b.importance) || mine.importance || 2,
        cue: cue.map(function (c) {
          return {
            flag: c.flag ? String(c.flag) : '',
            cols: Array.isArray(c.cols) ? c.cols.map(String) : [],
            lead: String(c.lead == null ? '' : c.lead),
            say: Array.isArray(c.say) ? c.say.map(String) : (c.say ? [String(c.say)] : []),
            notes: Array.isArray(c.notes) ? c.notes.map(String) : []
          };
        }),
        script: script,
        notes: Array.isArray(b.notes) ? b.notes.map(String) : []
      };
    });

    if (noCue.length) err('cue', noCue.length + ' 节没有提词（' + noCue.join(' ') + '）—— 提词是上台唯一会看的东西，不能空。');
    if (noScript.length) err('script', noScript.length + ' 节没有讲稿（' + noScript.join(' ') + '）。');
    if (target && sum > target) {
      err('over', 'budget 加起来 ' + U.fmt(sum) + '，比场地时间 ' + U.fmt(target) + ' 长 ' + U.fmt(sum - target) +
        ' —— 挪预算不会让演讲变短，让它把 script 改短再来一次。');
    }
    if (guessed.length) {
      note('budget', guessed.length + ' 节没给 budget（' + guessed.join(' ') + '），已按 ' +
        (rate.en || U.DEFAULT_RATE.en) + ' 词/分 · ' + (rate.zh || U.DEFAULT_RATE.zh) + ' 字/分 估算补上。');
    }

    res.total = sum;
    res.ok = res.errors.length === 0;
    return res;
  }

  /* Fill the blanks and only the blanks. Anything already written is the
     speaker's own sentence and outranks anything a model produced. */
  function applyFill(result, production) {
    var p = production || U.store.production();
    var report = { filled: [], kept: [] };
    if (!p || !result || !result.ok) return report;
    var beats = p.beats || [];
    U.store.update(function () {
      result.beats.forEach(function (incoming, i) {
        var mine = beats[i];
        if (!mine) {
          beats.push(Object.assign({ id: 'b' + Date.now().toString(36) + '-' + i }, incoming));
          report.filled.push(incoming.n);
          return;
        }
        if (hasScript(mine)) { report.kept.push(label(mine, i)); return; }
        mine.title = incoming.title || mine.title;
        mine.slideRef = incoming.slideRef || mine.slideRef;
        mine.budget = incoming.budget;
        mine.importance = incoming.importance;
        mine.cue = incoming.cue;
        mine.script = incoming.script;
        mine.notes = incoming.notes.length ? incoming.notes : (mine.notes || []);
        report.filled.push(label(mine, i));
      });
      p.beats = beats;
    });
    return report;
  }

  return {
    exportHtml: exportHtml,
    exportText: exportText,
    plainText: plainText,
    print: print,
    printSheets: printSheets,
    importImages: importImages,
    importDeck: importDeck,
    sortFiles: sortFiles,
    validateFill: validateFill,
    applyFill: applyFill,
    parseLoose: parseLoose,
    blockText: blockText,
    hasScript: hasScript,
    hasCue: hasCue,
    download: download,
    cn: cn
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = U.io;
