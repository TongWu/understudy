'use strict';
/* One mutable state object, one subscribe list, and localStorage that is
   allowed to fail silently — the product is expected to run from file://,
   where storage can be denied outright. */
U.store = (function () {
  var KEY = 'understudy.v1';
  var state = {
    productions: {},
    currentId: null,
    ui: { view: 'library', beatIndex: 0, theme: 'paper', density: 'compact' },
    run: null,           /* set while rehearsing or on stage; see 30-* */
    storage: null        /* 'full' once a write was refused for quota */
  };
  var subs = [];

  /* One bad subscriber must not stop the rest — but it must not vanish
     either. Rethrowing on a later turn keeps the broadcast going and still
     surfaces the failure as an uncaught error, which is how it reaches the
     console and the end-to-end suites. Swallowing it outright hid a screen
     that mounted empty behind a clean pageerror log. */
  function emit() {
    subs.slice().forEach(function (fn) {
      try { fn(state); }
      catch (e) { setTimeout(function () { throw e; }, 0); }
    });
  }
  function applyBody() {
    if (typeof document === 'undefined') return;
    var b = document.body; if (!b) return;
    b.dataset.theme = state.ui.theme;
    b.dataset.density = state.ui.density;
    b.dataset.view = state.ui.view;
  }
  /* Returns whether the write landed. Swallowing the failure was the worst of
     both worlds: the screen said the slides were added, the user kept working,
     and a reload threw all of it away. The product's real save is the exported
     file, so the honest thing is to say storage is full and point at it. */
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ productions: state.productions, currentId: state.currentId, ui: state.ui }));
      if (state.storage) { state.storage = null; }
      return true;
    } catch (e) {
      /* A private window or file:// with storage denied is not the same as a
         full quota: nothing was ever going to persist, so there is nothing to
         warn about. Only a quota failure means work is at risk. */
      state.storage = /quota|exceed/i.test(String(e && (e.name + ' ' + e.message))) ? 'full' : 'off';
      return false;
    }
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY); if (!raw) return false;
      var d = JSON.parse(raw);
      if (d && d.productions) { state.productions = d.productions; state.currentId = d.currentId; Object.assign(state.ui, d.ui || {}); }
      return true;
    } catch (e) { return false; }
  }

  return {
    get: function () { return state; },
    production: function () { return state.productions[state.currentId] || null; },
    beats: function () { var p = this.production(); return p ? p.beats : []; },
    beat: function () { return this.beats()[state.ui.beatIndex] || null; },
    rate: function () { var p = this.production(); return (p && p.rate) || U.DEFAULT_RATE; },

    put: function (production) { state.productions[production.id] = production; if (!state.currentId) state.currentId = production.id; save(); emit(); },
    open: function (id) { state.currentId = id; state.ui.beatIndex = 0; applyBody(); save(); emit(); },
    ui: function (patch) { Object.assign(state.ui, patch); applyBody(); save(); emit(); },
    /* Mutate through here so every screen repaints and nothing is lost on reload. */
    update: function (fn) { fn(state); save(); emit(); },
    subscribe: function (fn) { subs.push(fn); return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
    load: load, save: save, applyBody: applyBody
  };
})();
