'use strict';
/* Mount the current view, remount only when the view changes so a screen can
   hold live DOM (a contenteditable, a running clock) across state updates. */
(function () {
  var mounted = null;

  function render() {
    var root = document.getElementById('app');
    if (!root) return;
    var name = U.store.get().ui.view;
    var def = U.views.get(name);
    if (!def) { U.clear(root).appendChild(U.el('div', { class: 'u-lbl', style: { padding: '24px' } }, '没有这个界面：' + name)); return; }
    if (mounted !== name) {
      U.clear(root);
      mounted = name;
      def.mount(root);
    }
    if (def.update) def.update(U.store.get());
  }

  function boot() {
    /* An exported copy carries its production in the shell's script tag; it
       wins over anything in storage, because someone opening that file wants
       that talk, not whatever this browser last worked on. */
    var baked = null;
    try {
      var tag = document.getElementById('embedded-production');
      var raw = tag && tag.textContent.trim();
      if (raw && raw.charAt(0) === '{') baked = JSON.parse(raw);
    } catch (e) { /* a corrupt bake must not stop the app booting */ }
    U.store.load();
    if (baked) { U.store.put(baked); U.store.open(baked.id); }
    else if (!U.store.production() && U.sample) U.store.put(U.sample());
    U.store.applyBody();
    U.store.subscribe(render);
    document.addEventListener('keydown', function (e) { U.keys.handle(e); });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
