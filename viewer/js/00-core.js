'use strict';
/* Namespace, DOM helpers, and the two bits of arithmetic the whole product
   rests on: how long a script takes to say, and how far off the plan you are. */
var U = (typeof globalThis !== 'undefined' && globalThis.U) || {};
if (typeof globalThis !== 'undefined') globalThis.U = U;   /* in a browser globalThis === window */
U.version = '__UNDERSTUDY_VERSION__';

/* ---------- dom ---------- */
U.el = function (tag, attrs, kids) {
  var node = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    var v = attrs[k];
    if (v == null || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k.slice(0, 5) === 'data-' || k.slice(0, 5) === 'aria-') node.setAttribute(k, v);
    else node.setAttribute(k, v);
  });
  (Array.isArray(kids) ? kids : kids == null ? [] : [kids]).forEach(function (kid) {
    if (kid == null || kid === false) return;
    node.appendChild(typeof kid === 'string' || typeof kid === 'number'
      ? document.createTextNode(String(kid)) : kid);
  });
  return node;
};
U.clear = function (node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; };

/* ---------- foreign markup ---------- */
/* Text going into a string of HTML. Only ever for values that are text —
   a title, an occasion — never for markup that is already markup. */
U.esc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

/* The tags a script is allowed to be made of. Everything a person writes in
   the editor, and everything the browser produces when they paste, fits in
   here; nothing else in this product needs more. */
U.HTML_TAGS = {
  p: 1, br: 1, b: 1, strong: 1, i: 1, em: 1, u: 1, s: 1,
  span: 1, div: 1, ul: 1, ol: 1, li: 1, blockquote: 1
};

/* Tags whose text is not prose either. Unwrapping these would spill a
   stylesheet into the middle of the script — which is what a browser hands
   over when you copy a paragraph off a web page. */
U.HTML_DROP = {
  script: 1, style: 1, head: 1, title: 1, template: 1,
  noscript: 1, iframe: 1, object: 1, svg: 1, math: 1
};

/* The one gate for markup this session did not write: an AI reply, a
   paragraph pasted off the web, someone else's exported file. The stage
   renders scripts and cue leads as HTML, so a string arriving from outside is
   a string that can run — and this page holds every talk you have written.

   Rewritten rather than filtered: what comes out is text runs with their
   angle brackets escaped, plus bare tags from the list above. No attribute
   survives, because there is no formatting here that needs one and every way
   this goes wrong is an attribute. A tag that is not on the list is unwrapped
   and its text kept, which is what you want when a model wraps a paragraph in
   something ornamental. Escaping the leftover brackets also means the result
   stays safe when it is later joined to another string. */
U.safeHtml = function (html) {
  function text(s) { return s.replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var src = String(html == null ? '' : html), out = '', i = 0;
  while (i < src.length) {
    var lt = src.indexOf('<', i);
    if (lt < 0) { out += text(src.slice(i)); break; }
    out += text(src.slice(i, lt));

    /* A comment can carry a > of its own, so it ends where it says it ends. */
    if (src.substr(lt, 4) === '<!--') {
      var close = src.indexOf('-->', lt);
      i = close < 0 ? src.length : close + 3;
      continue;
    }
    var gt = src.indexOf('>', lt);
    if (gt < 0) { out += text(src.slice(lt)); break; }          /* an unfinished tag is text */
    var span = src.slice(lt, gt + 1);
    i = gt + 1;
    if (/^<[!?]/.test(span)) continue;                          /* a doctype is not prose */

    /* The name has to sit right against the bracket. Allowing a space made
       "a < b > c" — a comparison somebody wrote — parse as a bold tag and eat
       the words around it. What is not a tag is text, and is kept as text:
       "a < 3 > b" belongs to the speaker, not to the parser. */
    var m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(span);
    if (!m) { out += text(span); continue; }
    var name = m[2].toLowerCase();
    if (!m[1] && U.HTML_DROP[name]) {                           /* skip what it wraps, too */
      var end = src.toLowerCase().indexOf('</' + name, i);
      i = end < 0 ? src.length : (src.indexOf('>', end) < 0 ? src.length : src.indexOf('>', end) + 1);
      continue;
    }
    if (U.HTML_TAGS[name]) out += '<' + m[1] + name + '>';
  }
  return out;
};

/* ---------- time ---------- */
U.fmt = function (secs) {
  var s = Math.round(Math.abs(Number(secs) || 0));
  return (secs < 0 ? '−' : '') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
U.fmtSigned = function (secs) {
  var n = Math.round(Number(secs) || 0);
  return (n > 0 ? '+' : n < 0 ? '−' : '') + U.fmt(Math.abs(n));
};
U.parseTime = function (str) {
  var m = /^\s*(\d+)\s*:\s*([0-5]?\d)\s*$/.exec(String(str || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/* ---------- how long will this take to say ---------- */
U.DEFAULT_RATE = { en: 130, zh: 200 };   /* words per minute · 字 per minute */

U.textOf = function (html) {
  if (html == null) return '';
  if (typeof document === 'undefined') return String(html).replace(/<[^>]*>/g, ' ');
  var d = document.createElement('div');
  d.innerHTML = String(html);
  return d.textContent || '';
};
U.countWords = function (text) {
  var t = String(text || '');
  var zh = t.match(/[㐀-䶿一-鿿]/g);
  var en = t.replace(/[㐀-䶿一-鿿]/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g);
  return { zh: zh ? zh.length : 0, en: en ? en.length : 0 };
};
/* Seconds this script takes to say aloud at the given rate. Mixed-language
   scripts add the two channels: you speak the English words at the English
   rate and the Chinese characters at the Chinese rate. */
U.estimate = function (html, rate) {
  var r = rate || U.DEFAULT_RATE;
  var c = U.countWords(U.textOf(html));
  return c.en / (r.en || U.DEFAULT_RATE.en) * 60 + c.zh / (r.zh || U.DEFAULT_RATE.zh) * 60;
};

/* ---------- what the stage actually shows ---------- */
/* Cue items are written for writing: a beat can end up with seven while the
   card holds about four at stage type size. Marking is opt-in per beat — a
   beat with nothing marked shows all of it, so an imported or half-written
   talk is never silently truncated. Once anything is marked the stage shows
   only that: the card is the distilled version, and only the speaker can
   decide what distils. */
U.CUE_ONSTAGE_MAX = 4;
U.cueIsCurated = function (beat) {
  return ((beat && beat.cue) || []).some(function (c) { return c.onstage; });
};
U.onstageCue = function (beat) {
  var cue = (beat && beat.cue) || [];
  return U.cueIsCurated(beat) ? cue.filter(function (c) { return c.onstage; }) : cue;
};

/* ---------- pacing ---------- */
U.totals = function (beats, rate) {
  return (beats || []).reduce(function (acc, b) {
    acc.budget += Number(b.budget) || 0;
    acc.estimate += U.estimate(b.script, rate);
    return acc;
  }, { budget: 0, estimate: 0 });
};
/* How far off plan you are, measured only at beat boundaries so the number
   does not twitch while you are mid-sentence: elapsed minus the budgets of
   every beat you have finished. Negative = ahead. */
U.driftAt = function (elapsed, beats, index) {
  var planned = 0;
  for (var i = 0; i < index && i < beats.length; i++) planned += Number(beats[i].budget) || 0;
  return (Number(elapsed) || 0) - planned;
};
/* Cut the remaining beats down to `available` seconds by importance: 3 barely
   moves, 2 gives up a third, 1 is dropped whole. Returns one row per beat. */
U.squeeze = function (beats, available) {
  var rows = beats.map(function (b) { return { beat: b, from: Number(b.budget) || 0, to: Number(b.budget) || 0, skip: false }; });
  var total = rows.reduce(function (a, r) { return a + r.from; }, 0);
  var need = total - available;
  if (need <= 0) return rows;
  [1, 2, 3].forEach(function (lvl) {
    rows.forEach(function (r) {
      if (need <= 0 || (r.beat.importance || 2) !== lvl) return;
      var floor = lvl === 1 ? 0 : Math.round(r.from * (lvl === 2 ? 0.6 : 0.9));
      var give = Math.min(need, r.from - floor);
      r.to = r.from - give; r.skip = r.to === 0; need -= give;
    });
  });
  return rows;
};

if (typeof module !== 'undefined' && module.exports) module.exports = U;
