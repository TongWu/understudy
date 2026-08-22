# Understudy — 实现契约

写代码前先读这一份。它定义所有模块共享的东西；**除了自己名下的文件，别改任何东西**。

界面现状：`docs/screenshots/`（真实应用跑在合成样例上的截图）。
产品决策：`../../DESIGN.md`（v1 范围、对象模型、四个系统、按键表、用词约定）。

---

## 1. 交付物

**一个 HTML 文件**：`dist/understudy.html`。无服务端、无安装、`file://` 双击即用。
仓库里是模块化的源码；`viewer/build_template.py` 把它们拼成那一个文件。

```
viewer/shell.html          外壳，含 <!--__CSS__--> 与 <!--__JS__--> 两个标记
viewer/css/NN-*.css        按文件名排序拼接
viewer/js/NN-*.js          按文件名排序拼接 —— 编号就是加载顺序
viewer/build_template.py   拼装
dist/understudy.html       产物（提交进仓库）
tools/make_sample.mjs      生成样例演讲（合成内容，不含任何真实材料）
tests/unit/*.test.js       node --test
tests/e2e-*.js             playwright-core 驱动真实产物
```

**编号即依赖**：你可以用编号比自己小的一切，不能用比自己大的。

```
00-core      命名空间 / DOM / 时间 / 语速估算 / 配速数学
01-store     状态 + 持久化 + 订阅
02-sample    样例演讲（由 tools/ 生成，别手改）
03-views     视图注册表 + 按键表
04-chrome    共享顶栏与「纸/夜」「紧凑/舒适」开关
10-19        编辑器            ← A
20-29        台上五屏          ← B
30-39        排练设置 / 计时 / 复盘  ← C
40-49        后台 / AI 填充 / 导入导出 ← D
99-boot      启动与路由
```

验证时**构建到临时路径**，别写 `dist/`（会和别人打架）：

```sh
python3 viewer/build_template.py --output /tmp/check-<你的名字>.html
node --test tests/unit/*.test.js
node tests/e2e-boot.js
```

---

## 2. API

### `U.el(tag, attrs, kids)`
`attrs`：`class` `text` `html` `style`(对象) `on<Event>`(函数) `data-*` `aria-*`，其余当属性。
`kids`：节点、字符串、数组；`null`/`false` 跳过。

### 时间与估算（`00-core.js`）
```js
U.fmt(745)              // "12:25"，负数带 −
U.fmtSigned(21)         // "+0:21"
U.parseTime("12:25")    // 745
U.estimate(html, rate)  // 这段稿子念出来要几秒
U.totals(beats, rate)   // {budget, estimate}
U.driftAt(elapsed, beats, i)  // 只在换节时变，讲的过程中不跳
U.squeeze(beats, seconds)     // [{beat, from, to, skip}]，按 importance 砍
```

### 状态（`01-store.js`）
```js
U.store.production()  U.store.beats()  U.store.beat()  U.store.rate()
U.store.ui({ view, beatIndex, theme, density })   // 会写到 body dataset
U.store.update(fn)                                // 改完自动存盘并通知
U.store.subscribe(fn)
```
**一切改动走 `ui()` 或 `update()`** —— 直接改 state 不会存盘也不会重绘。

### 视图（`03-views.js`）
```js
U.views.register('editor', {
  mount: function (root) { /* 建 DOM，只在进入这个视图时调一次 */ },
  update: function (state) { /* 可选：状态变化时原地更新，不重建 */ }
});
U.views.show('editor');
```
`mount` 只调一次，是为了 contenteditable 和正在跑的计时器不被冲掉。

### 按键（`03-views.js`）
```js
U.keys.bind('prompter', 'ArrowRight', '换节', fn, 10);   // 最后一个是排序权重
U.keys.hints('prompter')   // → [{key,label}]，底栏直接拿它渲染
```
**每个键都必须给 label，底栏必须渲染 `U.keys.hints()`。**
不要自己写死键位提示 —— 通读时发现的真实 bug 就是「键绑了但没写进底栏」。
输入框和 contenteditable 里不派发，已处理。

### 跑一场（`05-run.js`）——排练和上台共用同一个时钟
```js
U.run.start({ mode:'rehearse'|'live', difficulty:1..4, target, recording })
U.run.toggle(on)      U.run.go(i)   U.run.next()   U.run.prev()
U.run.remaining()     // 本节预算还剩几秒，超了为负
U.run.drift()         // 快(负) / 慢(正)，只在换节时变
U.run.scriptFraction()// 你大概讲到稿子的百分之几 —— ↓ 键落点
U.run.finish()        // 追加一条 run 记录，复盘读它
U.run.current()       // = state.run
```
`go()` 同时更新 `run.beatIndex` 和 `ui.beatIndex`，两者永远不会各说各话。
时钟只在浏览器里跑；node 下测试自己调 `U.run._tick()`。

### 导出自包含副本
运行中的页面本身就是完整的应用。导出 = 取 `document.documentElement.outerHTML`，
把演讲的 JSON 塞进 `#embedded-production` 的内容里。启动时若发现内嵌 JSON，
它优先于 localStorage —— 打开那个文件的人要的是那一场。

```js
U.io.exportHtml()                 // 工作副本：全量，含旁批
U.io.exportHtml({ share: true })  // 给别人：U.io.strip() 去掉 beat.notes 与 cue.notes
```
**旁批只出现在工作副本里。** 打印和纯文本导出从来不带它；`{ share: true }`
也不带。加新字段时想清楚它属于哪一边，并在 `strip()` 里体现。

### 外来 HTML 只有一道门
台上把 `script`、`cue.lead`、`cue.say` 当 HTML 渲染，所以这三样只要不是本次
会话自己写的，就得先过 `U.safeHtml()`：白名单标签、去掉全部属性、非正文标签
（`<script>`/`<style>`/…）连内容一起丢、剩下的尖括号转义。

进门的地方一共三处，别在渲染处补：

| 入口 | 在哪过门 |
|---|---|
| AI 填充粘进来的 JSON | `42-io.js` `validateFill()` |
| 往讲稿里粘网页内容 | `10-editor.js` `paste()` |
| 拼进 HTML 字符串的纯文本（标题、场合、补回的那句） | `U.esc()` |

`U.esc()` 是给**文本**用的，`U.safeHtml()` 是给**已经是标记**的东西用的；
拿反了会把 `&amp;` 显示出来。

### 顶栏（`04-chrome.js`）
```js
U.chrome.topbar({ crumb:'排练', middle: node, actions:[node,...] })
U.chrome.segmented(options, current, onPick)
```

---

## 3. 视觉规则

**永远不要写死颜色、字号、行距、间距。** 全部从 `00-tokens.css` 的变量取。
这是「纸/夜」「紧凑/舒适」两个开关能成立的唯一原因 —— 写死一个 `#221E19`
就等于在夜间模式下挖了一个洞。

**永远从令牌取值**，对照表：

| 设计稿里 | 用 |
|---|---|
| `#FAF7F2` `#221E19` `#8C8375` `#DDD4C5` | `var(--paper)` `var(--ink)` `var(--ink-3)` `var(--rule)` |
| `#17804F` `#C08717` `#B33121` | `var(--go)` `var(--tight)` `var(--over)` |
| 字号 14 / 16 / 13.5，行距 1.55 / 1.78 | `var(--fs-ui)` `var(--fs-script)` `var(--fs-say)` `var(--lh-*)` |
| 提词条内边距 12px、台本行 8px | `var(--pad-cue)` `var(--pad-beat)` |

已有工具类：`u-lbl` `u-mono` `u-ser` `u-read` `u-pill`(`--go/--tight/--over`) `u-btn`(`--primary`) `u-card` `u-chip`。
你自己的类一律 `u-<模块>__<元素>` 前缀，写进你自己的 css 文件。

**台上的屏**：根元素加 `class="u-stage"`，它会就地覆写成舞台配色（比夜间更暖更深），
不依赖用户选的桌面主题 —— 台下是暗的，亮屏会打在脸上。

> ⚠️ `.u-stage` 是**整屏容器**，不是可借用的调色板。它带着 `height:100%` 和一整套
> 组件覆写；桌面屏里想要一块深色（比如后台的「下一场」卡片），用 `data-theme="night"`
> 挂在那个元素上 —— `00-tokens.css` 用属性选择器定义了这套配色，就地生效，不依赖任何模块。

**图标一律 inline SVG**，不要 emoji、不要 ▲ ✓ ▸ 这类字形。

---

## 4. 用词（别再长出第五种叫法）

| 用 | 不用 |
|---|---|
| 场地时间 | 目标、场地给的时间 |
| 弹药库 | 查询抽屉 |
| 节 | 段、章节、section |
| 旁批 | 备注、note |
| 提词 / 讲稿 | 大纲 / 全文 |

**人称是两层，故意不统一**：节名跟着幻灯片走（听众视角），标记是讲者自己的速记。
界面上已经写明，别「修正」它。

## 5. 台上按键（已定，别改）

`← →` 换节 · `空格` 计时 · `↓` 看讲稿（定在估计位置）· `Q` 弹药库 ·
`T` 只剩 N 分钟 · `B` 黑屏 · `M` 标记被问到 · `/` 搜 · `Esc` 退出当前层 ·
`P` 切提词卡 · `⌘⇧F` 交换两块屏

`Esc` 和 `↑↓` 在不同层里含义不同，这是分层语义，不是冲突。

## 6. 已知待办（不归任何人，先记着）

- 只读分享视图 / 卡片式导出（方向 C 的归宿）尚未设计。
