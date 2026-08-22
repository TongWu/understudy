'use strict';
/* Writing feedback. A script is not an essay: the sentence that reads well on
   a page is the one you run out of breath saying. Everything here is a pure
   function of the production so it can be tested under node and called again
   on every keystroke without touching the DOM.

   Four kinds, and each one says the number it found rather than a vague
   "consider shortening" — a hint you cannot check is a hint you learn to
   ignore. */
var U = (typeof globalThis !== 'undefined' && globalThis.U) || {};
if (typeof globalThis !== 'undefined') globalThis.U = U;

U.check = (function () {
  /* A sentence past this many English words stops being sayable in one
     breath. 35 ≈ 16 seconds at a normal rate. */
  var LONG_WORDS = 35;
  /* Two semicolons in one sentence is where written syntax stops surviving
     being read aloud. */
  var MANY_SEMIS = 2;

  var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#039': "'" };

  /* Deliberately not U.textOf: that one hands the string to the browser when
     there is one, so node and Chromium disagree about whitespace around tags.
     The checks have to give the same answer in a unit test and on screen. */
  function plain(html) {
    return String(html == null ? '' : html)
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(#0?39|amp|lt|gt|quot|apos|nbsp);/gi, function (m, name) {
        return ENTITIES[String(name).toLowerCase()] || m;
      })
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* One entry per paragraph of the script, in document order, so a finding can
     say "第 3 段" and the editor can scroll to it. */
  function paragraphs(html) {
    return String(html == null ? '' : html)
      .split(/<\/p\s*>|<br\s*\/?>|<\/div\s*>|\n{2,}/i)
      .map(plain)
      .filter(function (s) { return s.length > 0; });
  }

  /* Split on terminal punctuation followed by a space or the end of the text.
     "1.5" and "U.S" survive because the character after the dot is not a
     space; "e.g. this" does not, which is a miss we accept — the cost is one
     spurious short sentence, never a missed long one. */
  function sentences(text) {
    var t = plain(text), out = [], start = 0, i, j, next;
    for (i = 0; i < t.length; i++) {
      if ('.?!。？！'.indexOf(t.charAt(i)) < 0) continue;
      j = i;
      while (j + 1 < t.length && '.?!。？！"”’\')]»'.indexOf(t.charAt(j + 1)) >= 0) j++;
      next = t.charAt(j + 1);
      if (next === '' || next === ' ') {
        if (t.slice(start, j + 1).trim()) out.push(t.slice(start, j + 1).trim());
        start = j + 1;
        i = j;
      }
    }
    if (t.slice(start).trim()) out.push(t.slice(start).trim());
    return out;
  }

  /* The English channel only — the same tokens U.countWords bills at the
     English rate, so "45 words" here and "20 seconds" over there agree. */
  function enWords(text) {
    var m = plain(text).match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g);
    return m ? m.length : 0;
  }
  function semicolons(text) {
    var m = String(text || '').match(/[;；]/g);
    return m ? m.length : 0;
  }
  /* Whole-token match so "Fieldbase" does not fire on "FieldbaseX" and "survey window"
     matches across the space. */
  function mentions(text, term) {
    if (!term) return false;
    var esc = String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^A-Za-z0-9])' + esc + '($|[^A-Za-z0-9])', 'i').test(text);
  }

  function words(html) {
    var c = U.countWords ? U.countWords(plain(html)) : { en: enWords(html), zh: 0 };
    return c.zh ? c.en + ' 词 · ' + c.zh + ' 字' : c.en + ' 词';
  }

  /* [{ kind, beatIndex, where, message, fix }] in reading order — the editor
     lists them as they come and the counter at the foot is just the length. */
  function scan(production) {
    var out = [];
    var beats = (production && production.beats) || [];
    var terms = (production && production.terms) || [];
    var rate = (production && production.rate) || U.DEFAULT_RATE || { en: 130, zh: 200 };
    var claimed = {};

    beats.forEach(function (beat, bi) {
      var n = beat.n == null ? String(bi) : String(beat.n);
      var script = beat.script || '';
      var paras = paragraphs(script);

      paras.forEach(function (para, pi) {
        sentences(para).forEach(function (sentence) {
          var count = enWords(sentence);
          if (count > LONG_WORDS) {
            out.push({
              kind: 'long', beatIndex: bi, paraIndex: pi, snippet: sentence,
              where: n + ' · 讲稿第 ' + (pi + 1) + ' 段',
              message: '一句 ' + count + ' 个词，念出来 ' + Math.round(count / (rate.en || 130) * 60) +
                ' 秒不换气。写的时候顺，念的时候会缺氧。',
              fix: { action: 'locate', label: '跳到这句' }
            });
          }
          var semis = semicolons(sentence);
          if (semis >= MANY_SEMIS) {
            out.push({
              kind: 'bookish', beatIndex: bi, paraIndex: pi, snippet: sentence,
              where: n + ' · 讲稿第 ' + (pi + 1) + ' 段',
              message: semis + ' 个分号串成一句，口语里没人这么说 —— 听众听到第二个分号就掉队了。',
              fix: { action: 'locate', label: '跳到这句' }
            });
          }
        });
      });

      /* First use wins, walking the beats in running order: that is the one
         place where explaining the term costs you nothing later. */
      terms.forEach(function (t) {
        var term = t && t.term;
        if (!term || claimed[term.toLowerCase()]) return;
        var hit = -1;
        paras.forEach(function (para, pi) { if (hit < 0 && mentions(para, term)) hit = pi; });
        if (hit < 0) return;
        claimed[term.toLowerCase()] = true;
        out.push({
          kind: 'term', beatIndex: bi, paraIndex: hit, snippet: term,
          where: n + ' · ' + term,
          message: t.say
            ? '第一次出现，前面没解释过。术语表里有一句：“' + t.say + '”'
            : '第一次出现，前面没解释过 —— 术语表里还没写解释。',
          fix: t.say ? { action: 'locate', label: '跳到这句' } : { action: 'glossary', label: '写一句解释' }
        });
      });

      /* Too many cue items to read at stage type size. Only raised while the
         beat is uncurated, because once the speaker has picked, the count they
         picked is the answer — the tool does not get a second opinion. */
      var cue = beat.cue || [];
      if (!U.cueIsCurated(beat) && cue.length > U.CUE_ONSTAGE_MAX) {
        out.push({
          kind: 'cueload', beatIndex: bi, paraIndex: null, snippet: null,
          where: n + ' · 提词',
          message: cue.length + ' 条提词，台上一屏大约放得下 ' + U.CUE_ONSTAGE_MAX +
            ' 条，其余要滚 —— 边讲边滚很难。挑出真正要看的那几条。',
          fix: { action: 'pickcue', label: '去挑' }
        });
      }

      /* Over budget is a writing problem, not a scheduling one — the message
         says so, because the tempting fix is the one that does not work. */
      var budget = Number(beat.budget) || 0;
      var estimate = U.estimate ? U.estimate(script, rate) : 0;
      if (budget > 0 && estimate - budget >= 1) {
        out.push({
          kind: 'over', beatIndex: bi, paraIndex: null, snippet: null,
          where: n + ' · 整节',
          message: words(script) + ' ≈ ' + U.fmt(estimate) + '，预算 ' + U.fmt(budget) +
            '，超 ' + U.fmt(estimate - budget) + '。挪预算不会让它变短，只有删词会。',
          fix: { action: 'adopt', label: '采用估算' }
        });
      }
    });

    return out;
  }

  return {
    scan: scan,
    plain: plain, paragraphs: paragraphs, sentences: sentences,
    enWords: enWords, semicolons: semicolons, mentions: mentions, words: words,
    LONG_WORDS: LONG_WORDS, MANY_SEMIS: MANY_SEMIS
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = U.check;
