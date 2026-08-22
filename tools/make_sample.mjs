/* Builds the sample talk that ships inside the product.
 *
 * It is invented, on purpose. An earlier version lifted a real internal
 * walkthrough out of the author's prototype, which was excellent for proving
 * the object model against real material — mixed-language notes, uneven beats,
 * a section that overruns every time — and completely wrong to commit: the
 * built file is published to GitHub Pages, so the sample is public whatever
 * the repository's visibility.
 *
 * So this keeps the shape and throws away the content. The scenario is a
 * volunteer field-survey workbook: three sheets, colour-coded ownership,
 * columns you fill and columns someone else fills, a deadline, and one
 * section that is written longer than its budget. Nothing here refers to any
 * real organisation, system or dataset.
 *
 * Run: node tools/make_sample.mjs
 */
import fs from 'fs';

/* Slide images are generated too, for the same reason. A flat SVG of a
   spreadsheet with the ownership colours reads instantly as "a screenshot of
   the workbook" and costs about a kilobyte. */
const GROUPS = [
  [8, '#DDE8EF', '#B9CFDC'],   // ours, informational
  [5, '#E7E5E0', '#C9C5BD'],   // the lab fills it
  [2, '#DFEBE2', '#B5CFBE'],   // carried over from last season
  [3, '#F6E3C6', '#E3C289'],   // yours
];
function slide(title, sub, highlight) {
  const W = 640, H = 360, x0 = 26, y0 = 84, cw = 32, ch = 19, cols = 18, rows = 11;
  let cells = '', c = 0;
  for (const [n, fill, head] of GROUPS) {
    for (let k = 0; k < n; k++, c++) {
      for (let r = 0; r < rows; r++) {
        cells += `<rect x="${x0 + c * cw}" y="${y0 + r * ch}" width="${cw - 2}" height="${ch - 2}" fill="${r ? fill : head}"/>`;
      }
    }
  }
  const hi = highlight
    ? `<rect x="${x0 + (cols - 3) * cw - 3}" y="${y0 - 5}" width="${3 * cw + 4}" height="${rows * ch + 6}" fill="none" stroke="#B33121" stroke-width="2" rx="2"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
    + `<rect width="${W}" height="${H}" fill="#FBFAF7"/>`
    + `<text x="${x0}" y="42" font-family="IBM Plex Sans, sans-serif" font-size="20" font-weight="600" fill="#221E19">${title}</text>`
    + `<text x="${x0}" y="64" font-family="IBM Plex Mono, monospace" font-size="11" fill="#8C8375">${sub}</text>`
    + cells + hi + '</svg>';
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

const zh = (...xs) => xs;                         /* margin notes — never spoken */
const cue = (flag, cols, lead, say, notes) => ({ flag, cols: cols || [], lead, say: say || [], notes: notes || [] });

const BEATS = [
  {
    id: 'open', n: '00', nav: '开场 Opening', title: 'Opening — the shape of the workbook',
    slideRef: 'Before slide 1', budget: 45, importance: 2, slide: null,
    cue: [
      cue('', [], '<em>"Thanks. Now let me walk you through the workbook you will actually be filling in."</em>'),
      cue('SAY', [], '<b>Three sheets:</b> Site Results · Sample Results · Volunteer Uploads.',
        ['"I will cover all three — you fill in something on each of them."']),
      cue('SAY', [], '<b>Same rhythm every sheet:</b> information → the lookups we prepared → our reference → the columns you fill.'),
      cue('SAY', [], '<b>Colour tells you who owns what.</b> Blue is from us. Grey is the lab. Green carried over from last season. <b>Orange is yours.</b>',
        ['"If a block is orange, it is waiting for you."'], zh('开场就把颜色口诀立起来，后面每页省时间')),
    ],
    script: `<p>Thanks. You have heard what the survey season looks like and what we are asking of you. Now let me walk you through the workbook you will actually be filling in.</p>
<p>Before the details, the shape of it. There are three sheets along the bottom: Site Results, Sample Results, and Volunteer Uploads. I will cover all three, because you fill in something on each of them.</p>
<p>All three follow the same rhythm: site information first, then the lookups we have prepared for you, then reference data from the lab, and finally the columns you fill in.</p>
<p>One thing that will save you time all the way through: <b>the colour tells you who owns what.</b> Blue is information from us. Grey is what the lab fills in. Green is carried over from last season. And orange is yours. If a block is orange, it is waiting for you.</p>`,
  },
  {
    id: 's1', n: '01', nav: 'Site Information', title: 'Site Information',
    slideRef: 'Site Results · col A–H', budget: 90, importance: 3,
    slide: ['Site Information', 'Site Results · columns A–H', false],
    tags: [{ kind: 'info', label: '我们填的' }],
    cue: [
      cue('SAY', ['A', 'D'], '<b>Region + Surveyor</b> — pre-filled by us',
        ['"Please check both by <b>24 April</b>."', '"Filter column A for your region, column D for what is under your name."']),
      cue('', ['B'], '<b>Priority</b> — 1 to 3',
        ['"Use it to sequence your work — start with the ones marked 1."']),
      cue('SAY', ['C'], '<b>Survey Window</b> — spring or autumn',
        ['"Check this by the 24th as well. If a window looks wrong, we would rather hear it now than in September."']),
      cue('', ['E', 'F'], '<b>Site Code + Site Name</b> — the Fieldbase names',
        ['"That is what you search with — code first, then name."']),
      cue('', ['G'], '<b>Old Form Number</b> — from the paper era',
        ['"So you can compare against last season. Blank means the site is new."']),
      cue('SAY', ['H'], '<b>Ready to Visit</b> — <b>we</b> fill this',
        ['"Filter column H and only start on the ones marked Yes, or you will survey twice."'],
        zh('停顿，重复一次 —— 这一列最容易导致白跑一趟')),
    ],
    script: `<p>Let us start with the Site Results sheet, and the first block: Site Information, columns A through H. This is all context for you, but there are three things I need you to check by the twenty-fourth of April.</p>
<p>Column A is your Region and column D is the Surveyor. We have pre-filled both. <b>Please verify them by the twenty-fourth.</b> The quickest way in is to filter column A for your region, then filter column D for the sites under your name.</p>
<p>Column B is Priority, one to three. It is a ranking we have assigned and it is there to help you sequence your work. If you have thirty sites, start with the ones marked one.</p>
<p>Column C is the Survey Window — whether the site is walked in spring or autumn. Please check this one by the twenty-fourth as well. If the window looks wrong for your site, we would much rather hear it now than in September.</p>
<p>Columns E and F are the Site Code and Site Name as they appear in Fieldbase. That is what you search with. Column G is the old paper form number, for the sites that had one; if it is blank, the site is new this season.</p>
<p>Column H is Ready to Visit, and <b>we</b> fill it in. Filter on it and only start on the sites marked Yes. Otherwise the access permission may not be through yet and you will have made the trip for nothing.</p>`,
  },
  {
    id: 's2', n: '02', nav: 'Site Queries', title: 'Site Queries',
    slideRef: 'Site Results · col J–M', budget: 75, importance: 2,
    slide: ['Site Queries', 'Site Results · columns J–M', false],
    tags: [{ kind: 'info', label: '我们填的' }],
    cue: [
      cue('SAY', ['J', 'K'], '<b>Coordinator / Backup coordinator</b>',
        ['"Question about one specific site? Go to the coordinator on that row, not to the group. Much faster."']),
      cue('', ['L', 'M'], '<b>Map link / Access notes</b>',
        ['"The map link opens the plot boundary. Access notes are gates, parking, and who to phone."']),
      cue('SAY', [], '<b>Read the access notes before you set off</b>',
        ['"Half of the failed visits last season were a locked gate nobody had mentioned."'],
        zh('这句每次都有人点头 —— 别省')),
      cue('', [], '<b>It is a starting point</b>',
        ['"If you find something the notes do not mention, add it. The next person gets it."']),
    ],
    script: `<p>Next block: Site Queries, columns J through M. This is everything you need to actually get to the site.</p>
<p>Columns J and K are the coordinator and the backup coordinator for that site. If you have a question about one specific site, go to the coordinator named on that row rather than to the group — it is much faster, and the backup is there for when they are away.</p>
<p>Columns L and M are the map link and the access notes. The map link opens the plot boundary. The access notes are the practical things: which gate, where to park, who to phone if it is locked.</p>
<p>One request. <b>Please read the access notes before you set off</b>, not when you arrive. About half the failed visits last season were a locked gate that nobody had written down. And if you find something the notes do not mention, add it — the next person to walk that site gets it.</p>`,
  },
  {
    id: 's3', n: '03', nav: '实验室参考区', title: 'Lab reference — we fill this',
    slideRef: 'Site Results · col N–T', budget: 90, importance: 2,
    slide: ['Lab Reference', 'Site Results · columns N–T', false],
    tags: [{ kind: 'lab', label: '实验室填' }, { kind: 'carry', label: '上季带过来' }],
    cue: [
      cue('OPEN', [], '<b>Lead with the good news</b>',
        ['"This whole block is filled in by the lab. There is nothing for you to do in N through T."']),
      cue('', ['N'], '<b>Last season’s count</b>'),
      cue('', ['O', 'P', 'Q'], '<b>Water sample / Soil pH / Weather on the day</b>',
        ['"The measurements already taken. Read them before you go — if something looked odd, it is flagged here."'],
        zh('⚠️ 用大白话解释一句 baseline drift，别用实验室的说法')),
      cue('SAY', ['S', 'T'], '<b>Carried over from last season (green)</b>',
        ['"S: did the method change. T: anything left unresolved last season."',
         '"<b>If anything is written in S or T, that is where to focus.</b> It is the part we already know was uncertain."']),
    ],
    script: `<p>Now, this next block looks intimidating, so let me start with the good news: <b>all of it is filled in by the lab.</b> There is nothing for you to do in columns N through T. It is context, to make your visit quicker.</p>
<p>Column N is last season's count for that site. Columns O, P and Q are the measurements already taken — the water sample, the soil pH, and the weather recorded on the day of sampling. Please read them before you go. If something looked odd to the lab, it is flagged right here.</p>
<p>Column R lists the neighbouring sites, one step out, so you can see what else is nearby if you want to trace a pattern.</p>
<p>Columns S and T are green, which means they were carried over from last season. S says whether the method changed. T is anything that was left unresolved. <b>If there is anything written in S or T, that is where to focus your attention.</b> It is the part we already know was uncertain.</p>`,
  },
  {
    id: 's4', n: '04', nav: '你要填的橙色区', title: 'Site checks — for you to fill',
    slideRef: 'Site Results · col U–Z', budget: 150, importance: 3,
    slide: ['Site Checks — for you to fill', 'Site Results · columns U–Z', true],
    tags: [{ kind: 'yours', label: '橙色区：他们填' }],
    cue: [
      cue('OPEN', [], '<b>橙色 —— 这一块是他们的</b>',
        ['"U through Y take Pass, Fail or a remark. <b>Column Z only accepts Pass or Fail.</b>"']),
      cue('', ['U'], '<b>Access check</b>',
        ['"Could you get in, was the boundary as mapped, was the gate as described."']),
      cue('', ['V'], '<b>Habitat check</b>',
        ['"Is the habitat what the record says it is. This is where your judgement matters most — you are standing in it and we are not."']),
      cue('SLOW', ['W'], '<b>Repeat-visit check (only where it applies)</b>',
        ['"Same transect, same direction, same time of day as the first visit."',
         '"<b>We have already put NA on every single-visit site. You only fill this where the cell is blank.</b>"'],
        zh('说慢，重复一次 —— 三次排练这里都被追问')),
      cue('', ['X'], '<b>Protected species</b> — all NA, stays NA',
        ['"Recorded on the sample sheet instead — that is the next one."']),
      cue('SAY', ['Z'], '<b>Final result</b>',
        ['"Just Pass or Fail. No pending, no blanks."']),
    ],
    script: `<p>And now the orange block. This is yours.</p>
<p>Columns U through Y are where you record what you checked, and column Z is the final result. In U through Y you can write Pass, Fail, or a remark — whatever you need. <b>Column Z only accepts Pass or Fail.</b></p>
<p>Column U is the access check. Could you actually get in, was the boundary where the map said it was, and was the gate as the notes described it.</p>
<p>Column V is the habitat check. Is the habitat what the record claims it is. This is where your judgement matters most, because you are standing in it and we are not. If it has changed since last season, say so here rather than only in the final result.</p>
<p>Column W is the repeat-visit check, and this one only applies where the site is visited twice. Same transect, same direction, same time of day as the first visit. <b>We have already put NA on every single-visit site. You only fill this in where the cell is blank.</b></p>
<p>Column X is protected species. This one is all NA and it stays NA — those are recorded on the sample sheet, which is the next one I will show you. Column Y is anything else you checked that does not fit the categories above; write it there so we have a record of what was covered.</p>
<p>And column Z is the final result. Just Pass or Fail, for every site, within your window. Anything you want to explain goes in the remarks of the earlier columns.</p>`,
  },
  {
    id: 's5', n: '05', nav: 'Sample 表信息与查询', title: 'Sample Sheet — information and lookups',
    slideRef: 'Sample Results · col A–I', budget: 75, importance: 2,
    slide: ['Sample Sheet', 'Sample Results · columns A–I', false],
    tags: [{ kind: 'info', label: '我们填的' }],
    cue: [
      cue('DON’T RUSH', [], '<b>看着像重复页 —— 它不是</b>'),
      cue('SAY', [], '<b>One sample can cover several sites</b>',
        ['"Which means one row can involve more than one region — and more than one of you."']),
      cue('', ['A', 'B'], '<b>Region / Surveyor — several per row</b>',
        ['"Column A can list several regions on one row, and column B lists a surveyor for each. You will see your name next to other people’s."']),
      cue('SAY', [], '<b>Coordination ask</b>',
        ['"If you share a sample with another region, talk to them before you write a result. We do not want the same row filled two different ways."'],
        zh('这一条最容易被跳过，但它是这一节存在的理由')),
    ],
    script: `<p>Second sheet: Sample Results. The layout should look familiar — information on the left, lookups on the right, same as before.</p>
<p>But there is one real difference here, and it is important. <b>One sample usually covers several sites.</b> Which means a single row can involve more than one region, and more than one of you.</p>
<p>So look at column A: it can list several regions on a single row. And column B lists a surveyor for each of those regions. You will see your name alongside other people's names on the same row.</p>
<p>What that means in practice is: please coordinate. If you share a sample with another region, talk to them before you write a result. We do not want two people filling in the same row with different answers.</p>
<p>The rest is what you would expect. Column C is the sample code, D is the collection date, E is the storage location, and F through I are the coordinator, the backup, and the two lookups — same format as the site sheet.</p>`,
  },
  {
    id: 's6', n: '06', nav: 'Sample 表校验 · 保护物种', title: 'Sample checks — protected species',
    slideRef: 'Sample Results · col J–L', budget: 60, importance: 3,
    slide: ['Sample Checks', 'Sample Results · columns J–L', true],
    tags: [{ kind: 'yours', label: '橙色区：他们填' }],
    cue: [
      cue('BRIDGE', [], '<b>接上 04 页</b>',
        ['"On the site sheet, protected species was NA. <b>This is where it actually gets recorded.</b>"']),
      cue('', ['J'], '<b>Species expected here</b> — we fill it',
        ['"It depends on the designation of each site, so it is row by row. Some rows being empty is correct, not a mistake."']),
      cue('SAY', ['K'], '<b>Your observation</b> — Pass / Fail / remark',
        ['"Go through each species listed in J. If one is absent, <b>name it</b> — that is what lets us follow it up quickly."']),
      cue('', ['L'], '<b>Final result</b> — Pass or Fail'),
    ],
    script: `<p>And here is the check block for samples. Remember on the site sheet, protected species was marked NA? <b>This is where it actually gets recorded.</b></p>
<p>Column J lists the species expected at that site, and we fill it in. It depends on the designation of each individual site, so it really is row by row — do not expect the whole column to be populated. Some rows being empty is correct.</p>
<p>Column K is your observation. Go through each species listed in J and record what you found. Pass, Fail, or a remark. And if one is absent, please name it specifically — that is what lets us follow it up quickly instead of re-walking the whole site.</p>
<p>Column L is the final result for that sample: Pass or Fail.</p>`,
  },
  {
    id: 's7', n: '07', nav: 'Uploads 信息与查询', title: 'Volunteer Uploads — information and lookups',
    slideRef: 'Volunteer Uploads · col A–G', budget: 70, importance: 2,
    slide: ['Volunteer Uploads', 'Volunteer Uploads · columns A–G', true],
    tags: [{ kind: 'info', label: '我们填的' }, { kind: 'yours', label: '两列是他们的' }],
    cue: [
      cue('FRAME IT', [], '<b>这一页不一样 —— 数据是他们提供的</b>',
        ['"On the other two sheets you only check. Here you also supply the file we load."']),
      cue('DON’T ASSUME', ['A', 'B'], '<b>Region + Uploader — orange</b>',
        ['"Photo sets are uploaded by one named person per region, so tell us who that is. <b>Confirm both by 24 April</b>."'],
        zh('05 页说「不用再核对」，这页要说「要核对」—— 别让他们套用')),
      cue('NEW', ['D'], '<b>File name — you prepare and upload</b>',
        ['"This is the naming pattern for the folder you send us. Follow the example exactly."'],
        zh('⚠️ 确认一下命名规则的准确说法')),
      cue('SAY', [], '<b>D and E are a pair</b>',
        ['"D is the folder you send, E is what it becomes once we load it."']),
    ],
    script: `<p>Third and last sheet: Volunteer Uploads. Same rhythm again — information, then lookups. But this sheet asks a bit more of you, because here you are not only checking: you are also supplying the photos we load.</p>
<p>Columns A and B are orange. Column A is your region and column B is the uploader — the one named person in each region who sends us the photo set. <b>Please confirm both by the twenty-fourth of April</b>, the same deadline as the first sheet.</p>
<p>Column C is the site code, as before. Column D is the file name, and this one is yours to prepare: it is the naming pattern for the folder you send us. Please follow the example exactly — same prefix, same site code, same date suffix.</p>
<p>Column E is the other half of that pair: what the folder becomes once we have loaded it, and the name you will use when you look it up. So D is what you send and E is what it becomes. Keep both in view, because on the next slide you will be comparing one against the other. Columns F and G are the two lookups, in the same format as everywhere else.</p>`,
  },
  {
    id: 's8', n: '08', nav: 'Uploads 校验', title: 'Volunteer Uploads — checks',
    slideRef: 'Volunteer Uploads · col H–J', budget: 45, importance: 1,
    slide: ['Uploads Checks', 'Volunteer Uploads · columns H–J', true],
    tags: [{ kind: 'yours', label: '橙色区：他们填' }],
    cue: [
      cue('', [], '<b>三个 sheet 里最简单的一页 —— 三列</b>'),
      cue('', ['H'], '<b>Count check</b>',
        ['"Does the number of photos loaded match the number you sent."']),
      cue('SAY', ['I'], '<b>Content check</b>',
        ['"Compare against the folder you uploaded — <b>the one named in column D</b>. That folder is your source of truth."']),
      cue('', ['J'], '<b>Final result</b> — Pass or Fail'),
    ],
    script: `<p>And the check block for uploads is the simplest of the three — just three columns.</p>
<p>Column H is the count check: does the number of photos that loaded match the number you sent. Column I is the content check, and this is a direct comparison — compare against the folder you uploaded, <b>the one named in column D</b>. That folder is your source of truth.</p>
<p>And column J is the final result. Pass or Fail.</p>`,
  },
  {
    id: 'close', n: '09', nav: '收尾 Closing', title: 'Closing — three takeaways',
    slideRef: 'After slide 8', budget: 45, importance: 3, slide: null,
    cue: [
      cue('', [], '<b>Recap the shape</b>',
        ['"Three sheets, same rhythm every time: information, lookups, lab reference, and then the orange columns that are yours."']),
      cue('1', [], '<b>By 24 April</b>',
        ['"Check region, surveyor and survey window on the site sheet, and confirm the uploader on the uploads sheet."']),
      cue('2', [], '<b>Filter on Ready to Visit</b>',
        ['"If it is not Yes, access is not through and you would be making the trip twice."']),
      cue('3', [], '<b>A clear Pass or Fail</b>',
        ['"Every site, in the final result column, within your window."']),
      cue('', [], '<b>Hand-off</b>',
        ['"Stuck on one site? The coordinator is named on the row — go to them directly. Any questions on the workbook?"']),
    ],
    script: `<p>So that is the whole workbook. Three sheets, and the same rhythm every time: information, lookups, lab reference, and then the orange columns that belong to you.</p>
<p>Three things to take away. <b>First</b>, by the twenty-fourth of April: check your region, surveyor and survey window on the site sheet, and confirm the uploader on the uploads sheet.</p>
<p><b>Second</b>, before you set off for any site, filter on Ready to Visit. If it is not marked Yes, access is not through yet, and you would be making that trip twice.</p>
<p><b>Third</b>, every site needs a clear Pass or Fail in the final result column, within your survey window.</p>
<p>And if you get stuck on a specific site, the coordinator's name is right there on the row — please go to them directly. That is everything from me. Any questions on the workbook before we move on?</p>`,
  },
];

const FALLBACKS = [
  ['这列不用他们填', '"This one is on us, not on you."'],
  ['这列必须填', '"This is the one column we cannot sign the season off without."'],
  ['快速跳过', '"Same structure as before, so I will keep this one short."'],
  ['答不上来', '"Good question — let me take that away and come back with a proper answer."'],
  ['超出你的范围', '"That is covered in the next session."'],
  ['时间不够', '"I will move faster — the rest follows the same pattern, and the header row of each block has the instructions."'],
  ['需要重讲一句', '"Let me put that another way —"'],
  ['有人问 window', '"Column C tells you which window your site falls into."'],
];
const QA = [
  ['What if access is not granted before my window closes?', 'Flag it as soon as you notice. Column H is how we track readiness, and we will move the window rather than have you rush it.', ['01', 'H 列']],
  ['Do I have to fill the repeat-visit column?', 'Only where it is blank. If we have put NA there, that site is visited once.', ['04', 'W 列']],
  ['Three regions share a sample — who fills the row?', 'Please agree it among the surveyors listed in column B. We want one agreed result per row, not three.', ['05', '协调']],
  ['Can I record something the categories do not cover?', 'Yes — column Y is exactly for that. Write it down rather than leaving it out.', ['04', 'Y 列']],
  ['What counts as a Fail rather than a remark?', 'If the site cannot be surveyed as recorded, it is a Fail. If it can, but there is something we should know, it is a Pass with a remark.', ['04', 'Z 列']],
  ['Some rows in the species column are empty.', 'That is expected. It follows each site’s designation, so it is row by row rather than the whole column.', ['06', '保护物种']],
  ['Why is protected species NA on the site sheet?', 'Because it is recorded once, on the sample sheet. Recording it twice would just duplicate the same observation.', ['04', 'X 列']],
  ['Does the folder name really have to match?', 'Yes — please follow the example in column D exactly. That is how we match your photos to the right site.', ['07', '命名']],
  ['Who uploads the photos — me or the coordinator?', 'The named uploader for your region prepares and sends them. We load them, and you check the loaded set against your own folder.', ['07', '上传']],
];
/* Two are left without a line on purpose: a glossary that starts half-empty is
   the state the editor's check is there to catch, and the sample should show
   the product doing its job rather than a tidied-up version of it. */
const TERMS = [
  ['Fieldbase', 'the system the workbook feeds into — where the site records live once we load them'],
  ['transect', 'the fixed line you walk across the site, so two visits count the same ground'],
  ['baseline drift', ''],
  ['designation', ''],
  ['survey window', 'the weeks a site can be walked in, so the counts stay comparable across the season'],
];

/* Rehearsal history. Three runs, getting faster and getting closer to the
   slot; the beat that overruns keeps overrunning, which is the pattern the
   recap exists to make visible. */
const RUNS = [
  { n: 1, at: '2026-04-08T21:10', difficulty: 1, perBeat: [52, 108, 88, 104, 196, 98, 80, 70, 42, 42] },
  { n: 2, at: '2026-04-10T20:40', difficulty: 1, perBeat: [46, 101, 82, 98, 182, 92, 76, 66, 43, 45] },
  { n: 3, at: '2026-04-12T21:40', difficulty: 2, perBeat: [41, 96, 78, 94, 171, 88, 72, 62, 44, 46] },
];

const beats = BEATS.map((b) => ({
  id: b.id, n: b.n, title: b.title, nav: b.nav, slideRef: b.slideRef,
  budget: b.budget, importance: b.importance, tags: b.tags || [],
  slideImage: b.slide ? slide(b.slide[0], b.slide[1], b.slide[2]) : null,
  cue: b.cue, script: b.script.replace(/\n\s*/g, ' ').trim(), notes: [],
}));

/* The rate is derived, not chosen: the product's claim is that it recalibrates
   from what you actually did, so the sample had better be its own arithmetic.
   Words in the scripts, divided by the most recent run. */
const words = beats.reduce((a, b) =>
  a + (b.script.replace(/<[^>]*>/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length, 0);
const last = RUNS[RUNS.length - 1].perBeat.reduce((a, b) => a + b, 0);
const rateEn = Math.round(words / last * 60);

const production = {
  id: 'field-survey-workbook',
  title: 'Field Survey Workbook',
  occasion: '志愿者培训',
  date: '2026-04-16T14:00',
  audience: 32,
  language: { speak: 'en', notes: 'zh' },
  target: 720,
  rate: { en: rateEn, zh: 200 },
  beats,
  fallbacks: FALLBACKS.map(([when, say]) => ({ when, say })),
  qa: QA.map(([q, a, tags]) => ({ q, a, tags, askedIn: [] })),
  terms: TERMS.map(([term, say]) => ({ term, say, note: '' })),
  runs: RUNS.map((r) => ({
    n: r.n, at: r.at, difficulty: r.difficulty, mode: 'rehearse',
    perBeat: r.perBeat.map((spent, i) => ({ beat: beats[i].id, spent })),
    total: r.perBeat.reduce((a, b) => a + b, 0),
  })),
};

fs.writeFileSync('viewer/js/02-sample.js', `'use strict';
/* Generated by tools/make_sample.mjs — do not edit by hand.
   Invented content: the built file is published, so the sample is public
   whatever the repository's visibility. See the generator's header. */
U.sample = function () { return ${JSON.stringify(production, null, 2)}; };
`);
const budget = beats.reduce((a, b) => a + b.budget, 0);
const fmt = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
console.log(`beats ${beats.length} · budget ${fmt(budget)} · target ${fmt(production.target)} · words ${words} · rate ${rateEn} wpm`
  + ` · estimate ${fmt(Math.round(words / rateEn * 60))} · last run ${fmt(last)}`);
console.log(`cue ${beats.reduce((a, b) => a + b.cue.length, 0)} · qa ${QA.length} · fallbacks ${FALLBACKS.length}`
  + ` · terms ${TERMS.length} (${TERMS.filter((t) => t[1]).length} explained) · slides ${beats.filter((b) => b.slideImage).length}`);
