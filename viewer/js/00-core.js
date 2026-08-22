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
