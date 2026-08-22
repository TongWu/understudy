'use strict';
/* View registry + the shared key map.
   Keys live here rather than in each screen so a footer can print exactly what
   is bound and nothing can be bound-but-undiscoverable — the failure the
   design read-through actually caught. */
U.views = (function () {
  var reg = {};
  return {
    register: function (name, def) { reg[name] = def; },
    get: function (name) { return reg[name]; },
    names: function () { return Object.keys(reg); },
    show: function (name) { U.store.ui({ view: name }); }
  };
})();

U.keys = (function () {
  var binds = [];      /* {view, key, label, fn, order} */
  function norm(e) {
    var k = e.key;
    if (k === ' ') return 'Space';
    if (k.length === 1) return k.toLowerCase();
    return k;
  }
  return {
    bind: function (view, key, label, fn, order) {
      binds.push({ view: view, key: String(key), label: label, fn: fn, order: order == null ? 50 : order });
    },
    /* What this view should print in its footer, in declared order. */
    hints: function (view) {
      return binds.filter(function (b) { return b.view === view && b.label; })
        .sort(function (a, b) { return a.order - b.order; })
        .map(function (b) { return { key: b.key, label: b.label }; });
    },
    handle: function (e) {
      if (e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return false;
      var view = U.store.get().ui.view, k = norm(e);
      var hit = binds.filter(function (b) { return b.view === view && b.key === k; });
      if (!hit.length) return false;
      e.preventDefault();
      hit.forEach(function (b) { b.fn(e); });
      return true;
    },
    all: function () { return binds.slice(); }
  };
})();
