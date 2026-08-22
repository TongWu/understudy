'use strict';
/* The gate for markup this session did not write. Everything else in the
   product renders scripts and cue leads as HTML on the assumption that this
   function has already been through them, so these are the assertions that
   assumption rests on. */
const test = require('node:test');
const assert = require('node:assert');

function load() {
  delete require.cache[require.resolve('../../viewer/js/00-core.js')];
  globalThis.U = undefined;
  return require('../../viewer/js/00-core.js');
}

test('the tags a script is made of survive', () => {
  const U = load();
  assert.equal(U.safeHtml('<p>One <b>two</b><br>three</p>'), '<p>One <b>two</b><br>three</p>');
  assert.equal(U.safeHtml('<ul><li>a</li></ul>'), '<ul><li>a</li></ul>');
});

test('an attribute never survives — that is where every hole is', () => {
  const U = load();
  assert.equal(U.safeHtml('<p onclick="steal()">hi</p>'), '<p>hi</p>');
  assert.equal(U.safeHtml('<span style="color:red" class="x">hi</span>'), '<span>hi</span>');
  assert.equal(U.safeHtml('<img src=x onerror=alert(1)>'), '');
});

test('a tag off the list is unwrapped; a tag that is not prose loses its contents too', () => {
  const U = load();
  assert.equal(U.safeHtml('<article>kept</article>'), 'kept');
  assert.equal(U.safeHtml('<p>a</p><script>alert(1)</script><p>b</p>'), '<p>a</p><p>b</p>');
  assert.equal(U.safeHtml('<html><head><style>p{color:red}</style></head><p>hi</p></html>'), '<p>hi</p>');
});

/* The output can only be text runs with their brackets escaped plus bare tags
   from the list, so a half-written tag cannot be completed by whatever this
   string is later joined to. */
test('what is left over is text, and stays text', () => {
  const U = load();
  assert.equal(U.safeHtml('a < b'), 'a &lt; b');
  assert.equal(U.safeHtml('foo <img src=x onerror=y'), 'foo &lt;img src=x onerror=y');
  assert.ok(!/<(?!\/?(p|br|b|strong|i|em|u|s|span|div|ul|ol|li|blockquote)>)/.test(
    U.safeHtml('<a href="x>y" onclick=z>t</a><scr<script>ipt>')));
});

test('running it twice changes nothing — it is applied at more than one door', () => {
  const U = load();
  const dirty = '<p onclick=x>a<img src=y onerror=z><style>q</style></p>';
  assert.equal(U.safeHtml(U.safeHtml(dirty)), U.safeHtml(dirty));
});

test('entities already in the script are left alone', () => {
  const U = load();
  assert.equal(U.safeHtml('<p>a &amp; b&nbsp;c</p>'), '<p>a &amp; b&nbsp;c</p>');
});

/* U.esc is the other half: text going into a string of HTML, not markup. */
test('esc is for text, and escapes the ampersand too', () => {
  const U = load();
  assert.equal(U.esc('budget < 12:00 & rising'), 'budget &lt; 12:00 &amp; rising');
  assert.equal(U.esc(null), '');
});
