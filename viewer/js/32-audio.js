'use strict';
/* 录音 —— 只在这台设备上。

   MediaRecorder 跟着 run.beatIndex 走：换节就把当前这段收掉、开一段新的，
   于是每一节天然有一段能独立播放的音频（webm 的后续分片单独拿出来是放不了的，
   所以这里是真的停一次再起一次，不是切 chunk）。

   一条硬规则：音频不出这台设备。不上传、不发第三方、不做转写。波形是录的时候
   用 AnalyserNode 真量出来的振幅，没量到就说没量到 —— 不画假波形骗人。

   还有一条软规则：拿不到麦克风不是错误，是没录上。排练不能因为录音失败而中断，
   所以这里所有的失败都变成一句「这次没录上」，不往外抛。 */

U.audio = (function () {

  var st = {
    state: 'off',          /* off | recording | stopped | unavailable */
    reason: '',
    runId: null,
    stream: null,
    rec: null,
    current: null,         /* {beatId, chunks, startedAt, samples} */
    segments: [],          /* {beat, index, blob, url, seconds, peaks, at} */
    unsub: null,
    ctx: null, analyser: null, meter: null,
    player: null, queue: null
  };

  function supported() {
    return typeof window !== 'undefined' &&
      !!(navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
      typeof window.MediaRecorder === 'function';
  }
  function mime() {
    var want = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < want.length; i++) {
      try { if (window.MediaRecorder.isTypeSupported(want[i])) return want[i]; } catch (e) { /* older impls */ }
    }
    return '';
  }
  function beatIdAt(i) {
    var b = U.store.beats()[i];
    return b ? b.id : null;
  }

  /* ---------- 振幅采样：波形必须是量出来的 ---------- */
  function openMeter(stream) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      st.ctx = new AC();
      var src = st.ctx.createMediaStreamSource(stream);
      st.analyser = st.ctx.createAnalyser();
      st.analyser.fftSize = 1024;
      src.connect(st.analyser);
      var buf = new Uint8Array(st.analyser.fftSize);
      st.meter = setInterval(function () {
        if (!st.analyser || !st.current) return;
        try {
          st.analyser.getByteTimeDomainData(buf);
          var sum = 0;
          for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
          st.current.samples.push(Math.sqrt(sum / buf.length));
        } catch (e) { /* context died mid-take */ }
      }, 100);
    } catch (e) { /* 没有 Web Audio 就没有波形，录音本身照常 */ }
  }
  function closeMeter() {
    if (st.meter) { clearInterval(st.meter); st.meter = null; }
    try { if (st.ctx && st.ctx.close) st.ctx.close(); } catch (e) { /* already closed */ }
    st.ctx = null; st.analyser = null;
  }
  /* 把一串采样压成 n 根柱子，归一到本段自己的最大值 —— 比的是这一节内部的起伏。 */
  function condense(samples, n) {
    if (!samples || !samples.length) return null;
    var out = [], step = samples.length / n, max = 0;
    for (var i = 0; i < n; i++) {
      var a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step)), peak = 0;
      for (var j = a; j < b && j < samples.length; j++) peak = Math.max(peak, samples[j]);
      out.push(peak); max = Math.max(max, peak);
    }
    return max > 0 ? out.map(function (v) { return v / max; }) : null;
  }

  /* ---------- 一段 ---------- */
  function begin(beatId) {
    if (st.state !== 'recording' || !st.stream) return;
    var chunks = [];
    var take = { beatId: beatId, chunks: chunks, startedAt: Date.now(), samples: [] };
    var rec;
    try {
      var m = mime();
      rec = m ? new window.MediaRecorder(st.stream, { mimeType: m }) : new window.MediaRecorder(st.stream);
    } catch (e) { fail('这台机器的浏览器不让录'); return; }
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      var seconds = (Date.now() - take.startedAt) / 1000;
      var blob = null;
      try { blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); } catch (e) { blob = null; }
      if (blob && blob.size) keep(take.beatId, blob, seconds, condense(take.samples, 48));
    };
    try { rec.start(); } catch (e) { fail('录音起不来'); return; }
    st.rec = rec; st.current = take;
  }
  function endTake() {
    var rec = st.rec;
    st.rec = null; st.current = null;
    if (!rec) return;
    try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { /* already stopped */ }
  }
  function keep(beatId, blob, seconds, peaks) {
    var url = null;
    try { url = URL.createObjectURL(blob); } catch (e) { url = null; }
    var seg = { beat: beatId, index: st.segments.length, blob: blob, url: url, seconds: seconds, peaks: peaks, at: Date.now() };
    st.segments.push(seg);
    save(seg);
  }
  function fail(why) {
    st.state = 'unavailable'; st.reason = why || '这次没录上';
    endTake(); closeMeter(); release();
  }
  function release() {
    try { (st.stream ? st.stream.getTracks() : []).forEach(function (t) { t.stop(); }); } catch (e) { /* gone */ }
    st.stream = null;
    if (st.unsub) { try { st.unsub(); } catch (e) { /* gone */ } st.unsub = null; }
  }

  /* ---------- IndexedDB：可选、失败就算了 ---------- */
  var DB = 'understudy.audio', STORE = 'segments';
  function db() {
    return new Promise(function (res) {
      try {
        if (typeof indexedDB === 'undefined') return res(null);
        var req = indexedDB.open(DB, 1);
        req.onupgradeneeded = function () {
          try { req.result.createObjectStore(STORE); } catch (e) { /* exists */ }
        };
        req.onsuccess = function () { res(req.result); };
        req.onerror = function () { res(null); };
      } catch (e) { res(null); }   /* file:// 下 Chrome 直接不给用 */
    });
  }
  function save(seg) {
    if (!seg.blob) return;
    db().then(function (d) {
      if (!d) return;
      try {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ beat: seg.beat, seconds: seg.seconds, peaks: seg.peaks, blob: seg.blob, at: seg.at },
          String(st.runId) + ':' + seg.beat + ':' + seg.index);
      } catch (e) { /* quota, private window — 内存里那份还在 */ }
    }).catch(function () { /* never surfaces to the rehearsal */ });
  }
  function restore(runId) {
    return db().then(function (d) {
      if (!d) return [];
      return new Promise(function (res) {
        try {
          var tx = d.transaction(STORE, 'readonly'), store = tx.objectStore(STORE), out = [];
          var cur = store.openCursor();
          cur.onsuccess = function () {
            var c = cur.result;
            if (!c) { res(out); return; }
            if (String(c.key).indexOf(String(runId) + ':') === 0) out.push(c.value);
            c.continue();
          };
          cur.onerror = function () { res([]); };
        } catch (e) { res([]); }
      });
    }).then(function (list) {
      list.forEach(function (v) {
        if (!v || !v.blob) return;
        var url = null;
        try { url = URL.createObjectURL(v.blob); } catch (e) { url = null; }
        st.segments.push({ beat: v.beat, index: st.segments.length, blob: v.blob, url: url, seconds: v.seconds, peaks: v.peaks, at: v.at });
      });
      return st.segments.slice();
    }).catch(function () { return []; });
  }

  /* ---------- 播放 ---------- */
  function player() {
    if (!st.player && typeof document !== 'undefined') {
      st.player = document.createElement('audio');
      st.player.preload = 'none';
    }
    return st.player;
  }

  return {
    /* 开始录。永远 resolve —— 失败也只是「没录上」。 */
    start: function (opts) {
      opts = opts || {};
      st.runId = opts.runId == null ? Date.now() : opts.runId;
      st.segments = [];
      if (!supported()) {
        st.state = 'unavailable';
        st.reason = '这个浏览器不支持录音';
        return Promise.resolve(this.status());
      }
      var self = this;
      return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        st.stream = stream; st.state = 'recording'; st.reason = '';
        openMeter(stream);
        var at = (U.store.get().run || {}).beatIndex || 0;
        begin(beatIdAt(at));
        /* 换节就切段 —— 节的时间边界本来就有，不用另外定义什么是一段。
           一场结束（U.run.finish()）就自己收摊：没人记得手动停录音，而一直开着
           麦克风的排练工具是会吓到人的。 */
        st.unsub = U.store.subscribe(function (s) {
          if (st.state !== 'recording') return;
          if (s.run && s.run.finished) { self.stop(); return; }
          var i = (s.run || {}).beatIndex || 0;
          var id = beatIdAt(i);
          if (st.current && id !== st.current.beatId) { endTake(); begin(id); }
        });
        return self.status();
      }).catch(function () {
        st.state = 'unavailable';
        st.reason = '没给麦克风权限，这次没录上';
        return self.status();
      });
    },

    stop: function () {
      if (st.state === 'recording') { endTake(); st.state = 'stopped'; }
      closeMeter(); release();
      return this.status();
    },

    segments: function () { return st.segments.slice(); },
    segmentFor: function (beatId) {
      for (var i = st.segments.length - 1; i >= 0; i--) if (st.segments[i].beat === beatId) return st.segments[i];
      return null;
    },
    urlFor: function (beatId) { var s = this.segmentFor(beatId); return s ? s.url : null; },
    peaks: function (beatId) { var s = this.segmentFor(beatId); return s ? s.peaks : null; },
    seconds: function () { return st.segments.reduce(function (a, s) { return a + (s.seconds || 0); }, 0); },
    status: function () {
      return { state: st.state, reason: st.reason, count: st.segments.length, seconds: this.seconds() };
    },
    /* 界面上照实说的那一句 */
    note: function () {
      if (st.state === 'unavailable') return st.reason || '这次没录上';
      if (!st.segments.length) return '这次没录上';
      return U.fmt(this.seconds()) + ' · ' + st.segments.length + ' 段';
    },

    play: function (beatId, offset) {
      var url = this.urlFor(beatId), el = player();
      if (!url || !el) return false;
      st.queue = null;
      try {
        el.src = url;
        el.currentTime = Number(offset) || 0;
        var p = el.play();
        if (p && p.catch) p.catch(function () { /* autoplay policy — 用户再点一次就行 */ });
        el.onseeked = null;
        el.onloadedmetadata = function () { try { el.currentTime = Number(offset) || 0; } catch (e) { /* not seekable yet */ } };
      } catch (e) { return false; }
      return true;
    },
    playAll: function () {
      var el = player();
      if (!el || !st.segments.length) return false;
      var i = 0, list = st.segments.slice();
      st.queue = list;
      function next() {
        if (st.queue !== list || i >= list.length) return;
        var s = list[i++];
        if (!s.url) return next();
        el.src = s.url;
        var p = el.play(); if (p && p.catch) p.catch(function () { /* blocked */ });
      }
      el.onended = next;
      next();
      return true;
    },
    pause: function () { var el = player(); if (el) { st.queue = null; try { el.pause(); } catch (e) { /* fine */ } } },

    restore: restore,
    _state: st
  };
})();
