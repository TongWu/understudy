'use strict';
/* Chrome shared by every desk screen. It lives here rather than in each view
   so the wordmark, the crumb and above all the two theme switches are
   byte-identical everywhere — the switches are the whole reason the token
   sets exist, and a screen that painted its own would drift out of sync. */
U.chrome = (function () {
  function mark() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '20'); svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<circle cx="12.4" cy="8" r="5.1" fill="currentColor"></circle>' +
      '<circle cx="7.4" cy="11.6" r="5.1" fill="var(--card)" stroke="currentColor" stroke-width="1.3"></circle>';
    return svg;
  }
  function segmented(options, current, onPick) {
    return U.el('div', { class: 'u-seg' }, options.map(function (o) {
      return U.el('button', {
        class: 'u-lbl u-seg__b', 'aria-pressed': String(o.value === current),
        onclick: function () { onPick(o.value); }
      }, o.label);
    }));
  }
  function switches() {
    var ui = U.store.get().ui;
    return U.el('div', { class: 'u-switches' }, [
      segmented([{ value: 'paper', label: '纸' }, { value: 'night', label: '夜' }], ui.theme,
        function (v) { U.store.ui({ theme: v }); }),
      segmented([{ value: 'compact', label: '紧凑' }, { value: 'roomy', label: '舒适' }], ui.density,
        function (v) { U.store.ui({ density: v }); })
    ]);
  }
  function topbar(opts) {
    opts = opts || {};
    var p = U.store.production();
    return U.el('header', { class: 'u-top' }, [
      U.el('button', {
        class: 'u-top__brand', title: '回到后台',
        onclick: function () { U.views.show('library'); }
      }, [mark(), U.el('span', { class: 'u-ser', style: { fontSize: '20px', lineHeight: '1' } }, 'Understudy')]),
      opts.crumb === false ? null : U.el('div', { class: 'u-top__rule' }),
      opts.crumb === false ? null : U.el('div', { class: 'u-top__id' }, [
        U.el('span', { style: { fontWeight: '500' } }, (p && p.title) || '未命名'),
        opts.crumb ? U.el('span', { class: 'u-mono u-top__crumb' }, '/ ' + opts.crumb) : null
      ]),
      U.el('div', { style: { flex: '1' } }),
      /* Not a toast. If the browser cannot hold the work, that has to stay on
         screen until the user has a file in hand. */
      U.store.get().storage === 'full' ? U.el('button', {
        class: 'u-top__warn', title: '浏览器存不下了 —— 导出一份带走',
        onclick: function () { if (U.io) U.io.exportHtml(); }
      }, '浏览器存不下了 · 导出一份带走') : null,
      opts.middle || null,
      opts.switches === false ? null : switches(),
      U.el('div', { class: 'u-top__actions' }, opts.actions || [])
    ]);
  }
  return { mark: mark, topbar: topbar, switches: switches, segmented: segmented };
})();
