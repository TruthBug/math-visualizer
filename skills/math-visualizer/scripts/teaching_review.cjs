#!/usr/bin/env node
/* 前置教学审校：打包讲稿与图文输入、校验独立 LLM 响应、维护审校任务周期、为正式导出把门。
 *
 * 审校以**任务周期**为单位（状态机见 review_session.cjs，本文件负责 I/O）：
 * 一个周期由 taskId 标识，初审 1 次 + 定向复审最多 3 次，零阻止项即结束；
 * 响应必须回传 taskId/requestId/inputHash，旧响应不能登记成新输入的通过。
 *
 * 子命令（目标与路径参数由调用方注入，本脚本不内置任何宿主仓库路径）：
 *   begin  --case <id> | --config <file.json> --task <id> --scope-file <file> [--previous <taskId>]
 *                                                         开始一个任务周期；scope-file 给出本次任务目标与验收范围
 *   pack   --case <id> | --config <file.json> --task <id> [--out dir] [--tool-fix <说明>]
 *                                                         生成审校输入包（.<requestId>.packet.json + .brief.md）并登记在途请求
 *   verify-response --case <id> | --config <file.json> --task <id> --response <file.json> [--model m] [--method m]
 *                                                         校验独立审校响应并写入周期
 *   fail-review --case <id> | --config <file.json> --task <id> --reason <text>
 *                                                         LLM 调用失败/超时/输出无效时记一次失败；同一请求失败 2 次记 incomplete
 *   gate  --case <id>... | --config <file.json>...
 *                                                         正式导出门禁：无记录/未完成/有未解决阻止项/输入已变 → 退出码 1
 *   status                                                列出 case 目标当前周期与历史记录的对应关系（需注入参数）
 *
 * 调用方注入参数（case 目标必填；缺失即报错退出，绝不回退猜测路径）：
 *   --cases-module <file>       脚本讲稿模块（case 源，在 vm 中求值后取其案例集合）
 *   --cases-meta <file>         案例元数据 JSON（题面/解答/呈现判断）
 *   --records-dir <dir>         case 目标审校记录目录
 *   --source-label <text>       写入审校包 source 的文案模板（{id} 替换为案例 id；参与内容指纹，必须与既有记录一致）
 *   --verification-label <text> 写入审校包 meta.verification 的文案（同上参与内容指纹）
 *   --source-root <dir>         外部 config 的 packet.source 及 scopeRef/packetPath 相对化基准（缺省为当前工作目录）；随包 assets/configs 使用稳定逻辑标识
 *
 * 记录位置（跟随讲稿源，不集中）：
 *   case 目标   → <records-dir>/<case>.review.json（索引）+ <case>.sessions/<taskId>.json（周期详情）
 *   配置目标    → <配置所在目录>/reviews/<配置名>.review.json + <配置名>.sessions/<taskId>.json
 *   历史 v1 记录原样嵌入索引的 legacy 字段，可继续核验旧输入，不自动折算成新周期。
 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const RS = require('./review_session.cjs');
const SKILL = path.resolve(__dirname, '..');
const PACKET_VERSION = 1;
const REVIEW_TYPES = ['语言', '推理', '图文', '数学'];
const FINDING_FIELDS = ['title', 'body', 'formula', 'question', 'figure', 'meta'];

/* ---------- 调用方注入（P1-4：skill 不引用父仓库，宿主布局由调用方提供） ---------- */
const CASE_INJECTION = [
  ['--cases-module', 'casesModule'], ['--cases-meta', 'casesMeta'], ['--records-dir', 'recordsDir'],
  ['--source-label', 'sourceLabel'], ['--verification-label', 'verificationLabel'],
];
let INJ = { casesModule: null, casesMeta: null, recordsDir: null, sourceLabel: null, verificationLabel: null, sourceRoot: process.cwd() };
function parseInjection(args) {
  const get = flag => { const i = args.indexOf(flag); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
  const inj = { sourceRoot: get('--source-root') || process.cwd() };
  for (const [flag, key] of CASE_INJECTION) inj[key] = get(flag);
  return inj;
}
function requireCaseInjection() {
  const missing = CASE_INJECTION.filter(([, key]) => !INJ[key]).map(([flag]) => flag);
  if (missing.length)
    throw new Error(`case 目标缺少调用方注入参数：${missing.join(' ')}。本 Skill 不内置任何宿主仓库路径，这些值必须由调用方（宿主仓库的适配脚本）显式提供。`);
}
const relFromSourceRoot = p => path.relative(INJ.sourceRoot, path.resolve(p));

const CHECKLIST = [
  '按下附数学教材语言规范检查相应学段的术语、句法搭配、对象指代、量词逻辑、符号及推理语体；可定位的语言错误不能因答案正确降为偏好；',
  '主语、指代、条件、符号含义是否明确；',
  '每个关键结论是否有必要理由；',
  '新对象为什么引入，下一步为什么发生；',
  '同一符号是否始终指向同一对象（正文、公式、图中标签不得同名异物）；',
  '图形、公式、正文和当前参数是否一致（标签数值、对象显隐与文字所述一致）；',
  '是否把教师备注或内部设计说明混入学生正文；',
  '是否因重复内容或过多关系造成阅读负担（不因此一律缩短；必要条件和推理理由必须保留）。',
];

/* ---------- 基础工具 ---------- */
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}
const hashPacket = p => crypto.createHash('sha256').update(stableStringify(p)).digest('hex');
/* 版本指纹只覆盖学生可见内容与教学文字。不参与指纹的字段：
   - labelEvidence：同一渲染产物的诊断复述，可见内容变化会先改变 labels/elements/strokes/fills；
   - moduleVersion：渲染器依赖版本（构建依赖由 build.json 记录），模块加能力但渲染结果不变时
     不应使既有审校失效。
   packetVersion 不剥离：它标记指纹所覆盖字段的结构版本，指纹结构不变则版本不变（纯诊断性
   附加字段不升版本）。 */
function stripDiagnostics(v) {
  if (Array.isArray(v)) return v.map(stripDiagnostics);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (!['labelEvidence', 'moduleVersion'].includes(k)) o[k] = stripDiagnostics(v[k]);
    return o;
  }
  return v;
}
const hashContent = p => crypto.createHash('sha256').update(stableStringify(stripDiagnostics(p))).digest('hex');
/* 几何指纹：内容指纹之外单独记录"图上对象实际画在哪里"。labelEvidence 的 anchor 是包内唯一的
   坐标载体（labels 是文本、elements 是计数、strokes/fills 是颜色集），所以这里只剥渲染器版本，
   保留 labelEvidence——否则整体平移、纯样式改动、注解对象身份翻转都会漏检。
   模块版本升级但渲染结果不变时不应触发复审，故 moduleVersion 仍剥离。 */
function stripRendererVersion(v) {
  if (Array.isArray(v)) return v.map(stripRendererVersion);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (k !== 'moduleVersion') o[k] = stripRendererVersion(v[k]);
    return o;
  }
  return v;
}
const hashGeometry = p => crypto.createHash('sha256').update(stableStringify(stripRendererVersion(p))).digest('hex');
function htmlToText(h) {
  return String(h)
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|table|tr)>/gi, '\n')
    .replace(/<div class="formula">/gi, '\n【公式】').replace(/<(?:td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function unescapeAttr(s) {
  return String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function svgInfo(svg) {
  const labels = [];
  for (const m of String(svg).matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g))
    labels.push(htmlToText(m[1]).replace(/\s+/g, ' ').trim());
  const count = tag => (String(svg).match(new RegExp('<' + tag + '\\b', 'g')) || []).length;
  const strokes = [...new Set([...String(svg).matchAll(/stroke="(#[0-9a-fA-F]{3,6})"/g)].map(m => m[1]))];
  const fills = [...new Set([...String(svg).matchAll(/fill="(#[0-9a-fA-F]{3,6})"/g)].map(m => m[1]))];
  /* 标签证据来自绘图产物内嵌的 metadata（同源、含被省略项），不从可见文本反推。 */
  let labelEvidence = [];
  const meta = String(svg).match(/<metadata data-mathviz-label-evidence="([\s\S]*?)"><\/metadata>/);
  if (meta) try { const parsed = JSON.parse(unescapeAttr(meta[1])); if (Array.isArray(parsed)) labelEvidence = parsed; } catch { labelEvidence = []; }
  return { labels, elements: { path: count('path'), circle: count('circle'), line: count('line'), text: count('text') }, strokes, fills, labelEvidence };
}
function sweepValues(c) {
  /* 只取滑块步进网格上真实可达的值：中点用于发现分支，但必须吸附到网格，
     否则审校包会出现页面上不可能出现的状态（如 step=0.1 时取 a=0.25）。 */
  const step = c.step > 0 ? c.step : 1;
  const snap = v => {
    const k = Math.round((v - c.min) / step);
    return Math.min(c.max, Math.max(c.min, +(c.min + k * step).toPrecision(12)));
  };
  const pts = new Set([c.min, c.max, c.initial, ...(c.stops || [])].map(snap));
  const sorted = [...pts].sort((a, b) => a - b), out = new Set(sorted);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const mid = snap((sorted[i] + sorted[i + 1]) / 2);
    if (mid > c.min && mid < c.max) out.add(mid);
  }
  return [...out].sort((a, b) => a - b);
}
/* 分支归组：文字与标签的数值回显占位化；对象个数保持原值——交点/对象数量变化是不同状态。 */
const NUM = /[-−]?\d+(?:\.\d+)?/g;
const normalize = s => String(s).replace(NUM, '#');
function branchKey(bodyText, formulaText, figure) {
  return normalize(bodyText) + '¦' + normalize(formulaText || '') + '¦' + normalize((figure.labels || []).join('|')) + '¦' + JSON.stringify(figure.elements || {});
}

/* ---------- 脚本讲稿（case）路径打包：源与元数据由调用方注入 ---------- */
function scriptCases() {
  requireCaseInjection();
  const source = fs.readFileSync(INJ.casesModule, 'utf8');
  const ctx = vm.createContext({ MathViz: require(path.join(SKILL, 'assets', 'mathviz.js')) });
  vm.runInContext(source, ctx);
  return ctx.GaokaoLessons;
}
function packScriptCase(caseId) {
  const { lessons } = scriptCases();
  const lesson = lessons[caseId];
  if (!lesson) throw new Error(`讲稿模块中不存在案例 ${caseId}`);
  const cases = JSON.parse(fs.readFileSync(INJ.casesMeta, 'utf8'));
  const meta = cases.find(c => c.id === caseId);
  if (!meta) throw new Error(`案例元数据中不存在案例 ${caseId}`);
  const control = (lesson.controls || [])[0] || null;
  const values = control ? sweepValues({ min: control.min, max: control.max, step: control.step, initial: lesson.initial[control.key], stops: control.stops || [] }) : [0];
  const steps = lesson.steps.map((s, i) => {
    const branches = [];
    for (const v of values) {
      const state = { ...lesson.initial, step: i };
      if (control) state[control.key] = v;
      const bodyText = htmlToText(s.body(state));
      const questionText = typeof s.question === 'function' ? String(s.question(state)) : (s.question || '');
      const figure = svgInfo(lesson.draw(state));
      const key = branchKey(bodyText + ' ' + questionText, '', figure);
      const same = branches.find(b => b.key === key);
      if (same) same.values.push(v);
      else branches.push({ key, param: control ? control.key : null, values: [v], representative: v, bodyText, questionText, figure });
    }
    for (const b of branches) delete b.key;
    const stepOut = {
      index: i, title: s.title, tab: s.tab || '',
      branches,
      prevTitle: i ? lesson.steps[i - 1].title : null, nextTitle: i + 1 < lesson.steps.length ? lesson.steps[i + 1].title : null,
    };
    /* 函数型提问没有统一文本，只给各分支的 questionText，不写占位说明——占位文字会被当成学生正文审。 */
    if (typeof s.question !== 'function') stepOut.question = s.question || '';
    return stepOut;
  });
  return {
    packetVersion: PACKET_VERSION, id: caseId, path: 'lessons.js',
    source: INJ.sourceLabel.replace('{id}', caseId),
    meta: {
      title: meta.title, year: meta.year, question: meta.question, problem: meta.problem,
      solution: meta.solution, key: meta.key, decisionReason: meta.reason,
      prerequisites: meta.prerequisites || '对应章节基本定义及题中运算；主要障碍是关键句指出的关系。（本案例未在 cases.json 单独维护 prerequisites，此行来自 build_cases.py 的 analysis 模板）',
      verification: INJ.verificationLabel,
    },
    control: control ? { key: control.key, label: control.label, min: control.min, max: control.max, step: control.step, initial: lesson.initial[control.key], stops: control.stops || [] } : null,
    sweptValues: control ? values : [],
    steps,
  };
}

/* ---------- 配置 JSON 路径打包 ---------- */
function configSourceLabel(source) {
  const bundled = path.join(SKILL, 'assets', 'configs');
  if (fs.existsSync(bundled)) {
    // 用实际文件位置判断随包归属，不能仅凭同名文件或路径片段复用内置标识。
    const relative = path.relative(fs.realpathSync(bundled), fs.realpathSync(source));
    if (relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) {
      // 保留既有 v1/v2 审校包的 source 字节：这是逻辑标识，不用于查找宿主仓库。
      return 'skills/math-visualizer/assets/configs/' + relative.split(path.sep).join('/');
    }
  }
  // 用户项目配置继续遵守调用方 source-root 契约，不继承同名随包案例的身份。
  return path.relative(INJ.sourceRoot, source).split(path.sep).join('/');
}
function packConfig(configPath) {
  const modules = require(path.join(SKILL, 'assets', 'modules.js'));
  const source = path.resolve(configPath);
  const { config } = require('./lesson_source.cjs').load(source);
  const scenes = config.scenes.map(scene => {
    const values = sweepValues({ min: scene.control.min, max: scene.control.max, step: scene.control.step, initial: scene.control.initial, stops: scene.control.stops });
    const steps = scene.steps.map((step, i) => {
      const branches = [];
      for (const v of values) {
        const out = modules.render(scene, v, i);
        /* 配置路径直接采用 render 的标签诊断（同源于 SVG metadata），不从可见文本猜测遗漏。 */
        const figure = { plotTitle: scene.view.title, ...svgInfo(out.svg), omittedLabels: out.collisions.map(c => c.text), labelEvidence: out.labelEvidence || [] };
        /* 配置路径的正文/公式是纯文本（播放器以 textContent 呈现），不能按 HTML 剥标签——会把 r<1 等比较式吃掉。 */
        const bodyText = String(out.body).trim(), formulaText = String(out.formula).trim();
        const data = {};
        for (const k of (modules.definitions[scene.module].schema ? modules.capabilities(scene).fields : ['r', 'k', 'count', 'distanceLow', 'distanceHigh', 'nearCount', 'farCount', 'critical'])) if (out.data && out.data[k] !== undefined) data[k] = out.data[k];
        const key = branchKey(bodyText, formulaText, figure);
        const same = branches.find(b => b.key === key);
        if (same) same.values.push(v);
        else branches.push({ key, param: modules.capabilities(scene).parameter, values: [v], representative: v, bodyText, formulaText, figure, modelData: data, notice: out.notice || '' });
      }
      for (const b of branches) delete b.key;
      return {
        index: i, title: step.title, tab: step.tab || '', question: step.question || '',
        layers: step.layers, interactive: step.interactive, showVisual: step.showVisual !== false, branches,
        prevTitle: i ? scene.steps[i - 1].title : null, nextTitle: i + 1 < scene.steps.length ? scene.steps[i + 1].title : null,
      };
    });
    const dragRejections = [];
    if (scene.control.type === 'drag') {
      const cap = modules.capabilities(scene).drag, view = scene.view;
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
        const point = { x: view.xMin + (view.xMax - view.xMin) * x / 4, y: view.yMin + (view.yMax - view.yMin) * y / 4 };
        if (!Number.isFinite(cap.fromPoint(scene.model, point)))
          dragRejections.push({ point, explanation: cap.explain ? cap.explain(scene.model, point) : '' });
      }
    }
    return {
      module: scene.module, moduleVersion: modules.definitions[scene.module].version,
      model: scene.model, view: scene.view, control: scene.control, sweptValues: values, steps,
      ...(scene.control.type === 'drag' ? { dragRejections } : {}),
    };
  });
  return {
    packetVersion: scenes.some(scene => Object.hasOwn(scene, 'dragRejections')) ? PACKET_VERSION + 1 : PACKET_VERSION,
    id: 'config:' + path.basename(source, '.json'), path: 'config-json',
    source: configSourceLabel(source),
    meta: {
      title: config.title, problem: config.problem, teacher: config.teacher, sourceNote: config.source,
      equation: config.equation || '', teaching: config.teaching || null, ...(config.prep ? { prep: config.prep } : {}),
      verification: 'modules.js 结构校验 + 边界派生有限值检查（build_lesson.cjs）；教学文字未被程序核验。',
    },
    scenes,
  };
}

/* ---------- 审校要点说明（brief） ---------- */
function briefMarkdown(packet, session, requestId, inputHash) {
  const L = [];
  L.push(`# 独立教学审校任务 · ${packet.id}`);
  L.push('');
  L.push('## 本次请求标识（你的响应 JSON 必须原样回传这三个字段）');
  L.push(`- taskId: ${session.taskId}`);
  L.push(`- requestId: ${requestId}`);
  L.push(`- inputHash: ${inputHash}`);
  L.push('');
  L.push('你是**独立教学审校员**。你没有参与这份课件的写作，不继承作者的任何自我评价与"已通过"结论。');
  L.push('下面按讲解顺序给出实际将用于生成的全部学生可见内容（讲稿、公式、提问、操作提示、图中标签、不同参数下的动态分支）。');
  L.push('请只依据本包内容审查，不要脑补页面效果，也不要另写一份"更好的讲稿"。');
  L.push('');
  L.push('## 审校要点');
  CHECKLIST.forEach((c, i) => L.push(`${i + 1}. ${c}`));
  L.push('');
  // 按需读取的写作参考在实际审校请求中完整提供，避免独立上下文漏读判定依据。
  L.push(fs.readFileSync(path.join(SKILL, 'references', 'math-language.md'), 'utf8').trim());
  L.push('');
  L.push('## 判定与输出约定');
  L.push('- 问题类型四选一：`语言`（可给替换文本）/ `推理`（需回讲稿补理由）/ `图文`（需改对象、标签或呈现方案）/ `数学`（需重新核验，不能靠改句子处理）。');
  L.push('- `blocking=true` 包括数学错误、必要条件或推理缺失、对象/图文矛盾，以及上附规范中可定位的语言错误。必须给出非空 basis，引用原句并说明句法、术语、逻辑或已核实的教材依据；不以“答案仍正确”为由放过病句。');
  L.push('- 准确自然的合格表达之间的偏好、非必要扩写和布局优化为非阻止建议，默认登记。不能仅凭“不像教材”、未经查证的版本印象或禁词表阻止交付。零阻止项即结束，不追求零意见。');
  L.push('- 不要求为了凑数必须提出问题；没有实质问题就 `"verdict":"pass"`。不能用总分或禁词名单代替具体定位。');
  L.push('- 对动态分支：每个分支都是学生实际会看到的状态，逐分支检查；临界值两侧都已给出代表状态。');
  L.push('- 每个分支的 `figure.labelEvidence` 是绘图产物实际放置/省略标签的证据（含被省略项，不是从可见文本反推）。`status=omitted` 且 `importance=essential` 表示一个被标记为必要的身份未被放置：若该对象已有图例、方程标注或文字说明等等价可辨认方式，可以判通过；若正文引用的对象因此在图上无法辨认，必须判阻止。`importance=decorative` 的普通刻度省略不算缺口。证据只说明放置事实，对象选择是否正确仍需你判断。');
  L.push('- 每条发现必须给出：步骤号、字段（title/body/formula/question/figure/meta）、原文或对象、问题类型、具体问题及依据、建议修改、是否阻止导出。');
  if ((packet.scenes || []).some(scene => Object.hasOwn(scene, 'dragRejections')))
    L.push('- `scenes[].dragRejections` 记录视窗内 5×5 指针采样的拒绝点位与模块解释，请审查 explanation 的数学语义；空表仅表示这些采样点全通过，不代表穷举所有无定义位置。未声明 explain 时为空文本，页面使用播放器的通用提示。');
  L.push('');
  L.push('## 输出 JSON 格式（写入指定文件，不要输出多余文字）');
  L.push('```json');
  L.push(JSON.stringify({
    taskId: session.taskId, requestId, inputHash,
    verdict: 'pass 或 issues',
    findings: [{ step: 0, field: 'body', branch: '参数代表值或 all', type: '语言|推理|图文|数学', original: '原文或对象', problem: '具体问题', basis: '依据（引用包中内容）', suggestion: '建议修改', blocking: true, origin: 'change|missed（仅复审中新增的阻止项必填：change=本次改动引入，missed=旧内容漏检）' }],
    dispositions: [{ id: 'F1（复审时必填：逐项处置原阻止项）', status: 'resolved|unresolved', basis: '非空依据' }],
    notes: '总体说明，可空',
  }, null, 2));
  L.push('```');
  L.push('');
  if (session.carriedBlocking && session.carriedBlocking.length) {
    L.push('## 承接自上一任务周期的未解决阻止项（仍是本任务的检查义务）');
    L.push(JSON.stringify(session.carriedBlocking, null, 2));
    L.push('');
  }
  if (session.initialCompleted) {
    const open = RS.openBlocking(session);
    const last = session.reviews[session.reviews.length - 1];
    L.push('## 定向复审范围');
    L.push('本次为定向复审：只核对下列原阻止项是否解决，以及改动是否引入关联错误；不重新开展全面润色。原文已有但本轮才提出的建议直接登记。确实漏掉的阻止项仍需报告，但必须符合相同标准并给出证据。审查历史是事实输入，不是要求你认同前次结论。');
    L.push('**复审时必须用 `dispositions` 逐项处置下列原阻止项**（resolved/unresolved + 非空依据）；不能只回 findings=[]。复审中新增的阻止项必须标注 `origin`。');
    L.push(JSON.stringify({ previousBlocking: open, previousPacket: last && last.packetPath || '（旧记录无包快照路径，按原问题定位核对，不得声称已核对完整改动差异）' }, null, 2));
    L.push('');
  }
  L.push(require('./review_view.cjs').markdown(packet));
  return L.join('\n');
}

/* ---------- 记录读写 ---------- */
function recordPathFor(target) {
  if (target.kind === 'case') { requireCaseInjection(); return path.join(INJ.recordsDir, `${target.id}.review.json`); }
  const dir = path.dirname(path.resolve(target.id));
  return path.join(dir, 'reviews', path.basename(target.id, '.json') + '.review.json');
}
function sessionDirFor(target) { return recordPathFor(target).replace(/\.review\.json$/, '.sessions'); }
function sessionPathFor(target, taskId) { return path.join(sessionDirFor(target), `${taskId}.json`); }
function readRecord(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function writeRecord(file, rec) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(rec, null, 2) + '\n'); }
function loadSession(target, taskId) { return readRecord(sessionPathFor(target, taskId)); }
function listSessions(target) {
  const dir = sessionDirFor(target);
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter(n => n.endsWith('.json')).map(n => readRecord(path.join(dir, n))).filter(Boolean)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
function saveSession(target, session) { writeRecord(sessionPathFor(target, session.taskId), session); }
function touchIndex(target, taskId) {
  const idx = readRecord(recordPathFor(target));
  if (idx && idx.schemaVersion === RS.SCHEMA_VERSION) writeRecord(recordPathFor(target), { ...idx, activeTaskId: taskId, updatedAt: new Date().toISOString() });
}

function resolveTarget(args) {
  const cases = [], configs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--case') cases.push(args[++i]);
    else if (args[i] === '--config') configs.push(args[++i]);
    else if (args[i] === '--all-gaokao')
      throw new Error('--all-gaokao 是宿主仓库的清单概念，本 Skill 不再接受：由仓库侧包装脚本把它展开为 --case 并注入所需参数。');
  }
  if (cases.length) requireCaseInjection();
  return { cases, configs };
}
function packetFor(kind, id) { return kind === 'case' ? packScriptCase(id) : packConfig(id); }
const targetLabel = t => (t.kind === 'case' ? `case:${t.id}` : `config:${path.basename(t.id, '.json')}`);

/* ---------- 子命令 ---------- */
function cmdBegin(args) {
  const { cases, configs } = resolveTarget(args);
  const get = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const taskId = get('--task'), scopeFile = get('--scope-file'), previous = get('--previous');
  if (!taskId) throw new Error('begin 需要 --task <任务ID>（任务开始时固定，之后改文案/改输出名都不换 ID）');
  if (!scopeFile) throw new Error('begin 需要 --scope-file <本次任务目标与验收范围文件>');
  const targets = [...cases.map(id => ({ kind: 'case', id })), ...configs.map(id => ({ kind: 'config', id }))];
  if (targets.length !== 1) throw new Error('begin 一次只处理一个目标');
  const t = targets[0];
  const scopePath = path.resolve(scopeFile);
  const raw = fs.readFileSync(scopePath, 'utf8');
  let scope, scopeRef;
  try { const j = JSON.parse(raw); scope = j.scope; scopeRef = j.scopeRef || relFromSourceRoot(scopePath); }
  catch { scope = raw.trim(); scopeRef = relFromSourceRoot(scopePath); }
  if (loadSession(t, taskId)) { console.log(`BEGIN ${taskId}：周期已存在，幂等返回（不清零、不重置预算）`); return; }
  /* 承接检查不依赖索引文件（索引可缺失/可被删）：直接扫描本目标的全部周期文件，
     取最近一个未通过（active/incomplete/exhausted）的周期作为必须承接对象；v1 blocked 记录同样必须承接。 */
  const idx = readRecord(recordPathFor(t));
  const openSessions = listSessions(t).filter(s => s.taskId !== taskId && ['active', 'incomplete', 'exhausted'].includes(s.status));
  let previousSession;
  if (openSessions.length) {
    const cur = openSessions[0]; // listSessions 按 createdAt 倒序
    if (previous !== cur.taskId)
      throw new Error(`目标已有 ${cur.status} 周期 ${cur.taskId}：新周期必须用 --previous ${cur.taskId} 显式引用并承接未解决项；达上限不能把同一目标改名重开`);
    previousSession = { taskId: cur.taskId, carried: RS.openBlocking(cur) };
  } else if (idx && idx.schemaVersion !== RS.SCHEMA_VERSION && idx.status === 'blocked') {
    const legacyOpen = (idx.findings || []).filter(f => f.blocking && !f.resolved);
    if (legacyOpen.length) {
      const lid = `v1-legacy:${t.kind === 'case' ? t.id : path.basename(t.id, '.json')}`;
      if (previous !== lid)
        throw new Error(`目标存在 v1 blocked 记录（未解决阻止项 ${legacyOpen.length} 条）：新周期必须用 --previous ${lid} 显式引用并承接`);
      previousSession = { taskId: lid, carried: legacyOpen.map(f => ({ ...f, id: f.id || undefined })) };
    }
  }
  const targetId = t.kind === 'case' ? `case:${t.id}` : `config:${path.resolve(t.id)}`;
  const session = RS.startSession({ taskId, targetId, scope, scopeRef, previousSession });
  saveSession(t, session);
  const legacy = idx && idx.schemaVersion !== RS.SCHEMA_VERSION ? idx : (idx && idx.legacy) || null;
  writeRecord(recordPathFor(t), { schemaVersion: RS.SCHEMA_VERSION, activeTaskId: taskId, updatedAt: new Date().toISOString(), ...(legacy ? { legacy } : {}) });
  console.log(`BEGIN ${taskId} → ${targetId}（承接阻止项 ${session.carriedBlocking.length} 条；scopeRef=${scopeRef}）`);
}

function cmdPack(args) {
  const { cases, configs } = resolveTarget(args);
  const get = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const taskId = get('--task'), toolFix = get('--tool-fix');
  if (!taskId) throw new Error('pack 需要 --task <任务ID>（先 begin 创建任务周期）');
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.resolve('review-packets');
  const targets = [...cases.map(id => ({ kind: 'case', id })), ...configs.map(id => ({ kind: 'config', id }))];
  if (!targets.length) throw new Error('pack 需要 --case <id> 或 --config <file.json>');
  fs.mkdirSync(outDir, { recursive: true });
  for (const t of targets) {
    let session = loadSession(t, taskId);
    if (!session) throw new Error(`目标 ${targetLabel(t)} 没有任务周期 ${taskId}：先 begin`);
    const packet = packetFor(t.kind, t.id);
    const h = hashContent(packet), gh = hashGeometry(packet);
    if (session.activeRequest && session.activeRequest.inputHash !== h)
      session = RS.cancelRequest(session, { reason: '打包后源内容已变化，旧请求作废' });
    const seq = session.attempts.filter(a => a.type === 'issue').length + 1;
    const requestId = `r${seq}`;
    const base = path.join(outDir, `${packet.id.replace(':', '-')}.${session.taskId}.${requestId}`);
    if (fs.existsSync(base + '.packet.json') && hashContent(JSON.parse(fs.readFileSync(base + '.packet.json', 'utf8'))) !== h)
      throw new Error(`审校包路径已被其他内容占用，拒绝覆盖：${base}.packet.json`);
    session = RS.issueRequest(session, { requestId, inputHash: h, packetPath: relFromSourceRoot(base + '.packet.json'), toolFix, geometryHash: gh });
    fs.writeFileSync(base + '.packet.json', JSON.stringify(packet, null, 2) + '\n');
    fs.writeFileSync(base + '.brief.md', briefMarkdown(packet, session, requestId, h));
    saveSession(t, session);
    touchIndex(t, taskId);
    const stepCount = t.kind === 'case' ? packet.steps.length : packet.scenes.reduce((n, s) => n + s.steps.length, 0);
    console.log(`PACK ${packet.id} task=${taskId} ${requestId} steps=${stepCount} sha256=${h.slice(0, 16)}… → ${base}.packet.json / .brief.md`);
  }
}

function cmdVerifyResponse(args) {
  const { cases, configs } = resolveTarget(args);
  const get = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const responseFile = get('--response'), taskId = get('--task');
  if (!responseFile) throw new Error('verify-response 需要 --response <file.json>');
  if (!taskId) throw new Error('verify-response 需要 --task <任务ID>');
  const targets = [...cases.map(id => ({ kind: 'case', id })), ...configs.map(id => ({ kind: 'config', id }))];
  if (targets.length !== 1) throw new Error('verify-response 一次只处理一个目标');
  const t = targets[0];
  const session = loadSession(t, taskId);
  if (!session) throw new Error(`目标 ${targetLabel(t)} 没有任务周期 ${taskId}`);
  if (!session.activeRequest) throw new Error(`周期 ${taskId} 没有在途请求（可能已通过或尚未 pack）：拒收响应`);
  const packet = packetFor(t.kind, t.id);
  const h = hashContent(packet);
  if (h !== session.activeRequest.inputHash)
    throw new Error('包发出后讲稿源已变化：本响应对应旧输入，拒收；如需继续请重新 pack 发起新请求');
  const fail = detail => {
    const s1 = RS.recordFailure(session, { reason: detail });
    saveSession(t, s1); touchIndex(t, taskId);
    console.log(`INCOMPLETE-ATTEMPT ${packet.id}：${detail}（该请求第 ${s1.attempts.filter(a => a.type === 'failure').length} 次失败）`);
    process.exitCode = 2;
  };
  let response;
  try { response = JSON.parse(fs.readFileSync(path.resolve(responseFile), 'utf8').replace(/^﻿/, '')); }
  catch (e) { fail(`响应不是合法 JSON：${e.message}`); return; }
  const problems = [];
  for (const k of ['taskId', 'requestId', 'inputHash'])
    if (typeof response[k] !== 'string' || !response[k]) problems.push(`响应必须原样回传 ${k}`);
  if (!['pass', 'issues'].includes(response.verdict)) problems.push('verdict 必须是 pass|issues');
  const stepCount = t.kind === 'case' ? packet.steps.length : packet.scenes.reduce((n, s) => n + s.steps.length, 0);
  if (!Array.isArray(response.findings)) problems.push('findings 必须是数组');
  else response.findings.forEach((f, i) => {
    if (!Number.isInteger(f.step) || f.step < 0 || f.step >= stepCount) problems.push(`findings[${i}].step 超出范围（0..${stepCount - 1}）`);
    if (!FINDING_FIELDS.includes(f.field)) problems.push(`findings[${i}].field 不支持：${f.field}`);
    if (!REVIEW_TYPES.includes(f.type)) problems.push(`findings[${i}].type 必须是 ${REVIEW_TYPES.join('/')}`);
    for (const k of ['original', 'problem', 'suggestion']) if (typeof f[k] !== 'string' || !f[k].trim()) problems.push(`findings[${i}].${k} 不能为空`);
    if (typeof f.blocking !== 'boolean') problems.push(`findings[${i}].blocking 必须是布尔值`);
    if (f.blocking && (typeof f.basis !== 'string' || !f.basis.trim())) problems.push(`findings[${i}].basis 阻止项必须有具体依据`);
    if (f.blocking && session.activeRequest.recheck && !['change', 'missed'].includes(f.origin))
      problems.push(`findings[${i}].origin 复审新增阻止项必须标注 change|missed`);
  });
  if (response.dispositions !== undefined) {
    if (!Array.isArray(response.dispositions)) problems.push('dispositions 必须是数组');
    else response.dispositions.forEach((d, i) => {
      if (typeof d.id !== 'string' || !d.id) problems.push(`dispositions[${i}].id 不能为空`);
      if (!['resolved', 'unresolved'].includes(d.status)) problems.push(`dispositions[${i}].status 必须是 resolved|unresolved`);
      if (typeof d.basis !== 'string' || !d.basis.trim()) problems.push(`dispositions[${i}].basis 必须非空`);
    });
  }
  if (problems.length) { fail(problems.join('；')); return; }
  let next;
  try {
    next = RS.acceptResponse(session, {
      taskId: response.taskId, requestId: response.requestId, inputHash: response.inputHash,
      verdict: response.verdict, findings: response.findings, dispositions: response.dispositions,
      model: get('--model') || '未记录', method: get('--method') || '未记录',
    });
  } catch (e) {
    if (e instanceof RS.SessionError) { console.error(`REJECTED ${packet.id}：${e.message}`); process.exitCode = 2; return; }
    throw e;
  }
  saveSession(t, next);
  touchIndex(t, taskId);
  const open = RS.openBlocking(next);
  const last = next.reviews[next.reviews.length - 1];
  if (next.status === 'passed') console.log(`PASS ${packet.id}：零阻止项，本周期审校结束（不追加确认轮）。记录 → ${relFromSourceRoot(sessionPathFor(t, taskId))}`);
  else console.log(`BLOCKED ${packet.id}：未解决阻止项 ${open.length} 条（本轮新增 ${last.findings.filter(f => f.blocking).length} 条）；已用复审 ${next.rechecksCompleted}/3${next.status === 'exhausted' ? '，预算耗尽，停止导出' : ''}。记录 → ${relFromSourceRoot(sessionPathFor(t, taskId))}`);
}

function cmdFailReview(args) {
  const { cases, configs } = resolveTarget(args);
  const get = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  const reason = get('--reason') || 'LLM 调用失败或超时';
  const taskId = get('--task');
  if (!taskId) throw new Error('fail-review 需要 --task <任务ID>');
  const targets = [...cases.map(id => ({ kind: 'case', id })), ...configs.map(id => ({ kind: 'config', id }))];
  if (targets.length !== 1) throw new Error('fail-review 一次只处理一个目标');
  const t = targets[0];
  const session = loadSession(t, taskId);
  if (!session) throw new Error(`目标 ${targetLabel(t)} 没有任务周期 ${taskId}`);
  let next;
  try { next = RS.recordFailure(session, { reason }); }
  catch (e) {
    if (e instanceof RS.SessionError) { console.error(e.message); process.exitCode = 1; return; }
    throw e;
  }
  saveSession(t, next);
  touchIndex(t, taskId);
  console.log(`FAIL-RECORDED ${targetLabel(t)}：${reason}（周期状态 ${next.status}，预算与原问题保留）`);
  process.exitCode = 2;
}

function gateOne(kind, id) {
  const packet = packetFor(kind, id);
  const h = hashContent(packet), gh = hashGeometry(packet);
  const target = { kind, id };
  const idx = readRecord(recordPathFor(target));
  const reasons = [];
  let record = null;
  if (!idx) reasons.push('缺少审校记录');
  else if (idx.schemaVersion === RS.SCHEMA_VERSION && idx.activeTaskId) {
    const s = loadSession(target, idx.activeTaskId);
    if (!s) reasons.push(`任务周期文件缺失：${idx.activeTaskId}`);
    else {
      const last = s.reviews[s.reviews.length - 1];
      record = { status: s.status, taskId: s.taskId, model: last ? last.model : null, reviewedAt: last ? last.at : null, round: s.reviews.length, legacy: !!idx.legacy };
      if (s.status === 'passed') {
        if (s.passedInputHash !== h) reasons.push('讲稿或图文输入已变化，审校记录失效，需要在原任务周期内复审');
        else if (!s.passedGeometryHash) reasons.push('审校记录缺少几何指纹（旧版记录）：无法确认图上对象位置未变，需要在该周期内复审');
        else if (s.passedGeometryHash !== gh) reasons.push('图中对象的位置或身份已变化（几何指纹不符），审校记录失效，需要在原任务周期内复审');
      } else if (s.status === 'incomplete') reasons.push('审校未完成（调用失败或输出无效）');
      else if (s.status === 'exhausted') reasons.push('复审已达 3 次上限仍有阻止项，本任务周期已停止导出');
      else {
        if (s.activeRequest) reasons.push(`审校未完成（请求 ${s.activeRequest.requestId} 待接收响应）`);
        const open = RS.openBlocking(s);
        if (open.length) reasons.push(`存在 ${open.length} 条未解决的阻止项`);
        if (!s.activeRequest && !open.length) reasons.push('审校未完成（周期进行中）');
      }
    }
  } else {
    /* 历史 v1 记录：保留原判定路径，不折算成新周期 */
    record = { status: idx.status, model: idx.model, reviewedAt: idx.reviewedAt, round: idx.round, legacy: true };
    if (idx.inputHash !== h) reasons.push('讲稿或图文输入已变化，旧审校记录失效，需要复审');
    if (idx.status === 'incomplete') reasons.push('审校未完成（调用失败或输出无效）');
    if (idx.status === 'blocked') reasons.push(`存在 ${(idx.findings || []).filter(f => f.blocking && !f.resolved).length} 条未解决的阻止项`);
    if (!['passed', 'blocked', 'incomplete'].includes(idx.status)) reasons.push(`未知记录状态 ${idx.status}`);
  }
  return { id: packet.id, ok: reasons.length === 0, reasons, record };
}
function cmdGate(args) {
  const { cases, configs } = resolveTarget(args);
  if (!cases.length && !configs.length) throw new Error('gate 需要 --case <id> 或 --config <file.json>（case 目标还须由调用方注入参数，见文件头说明）');
  let blocked = 0;
  for (const [kind, id] of [...cases.map(x => ['case', x]), ...configs.map(x => ['config', x])]) {
    const r = gateOne(kind, id);
    if (r.ok) console.log(`OK ${r.id}（审校通过，记录对应当前输入${r.record && r.record.taskId ? `，周期 ${r.record.taskId}` : ''}${r.record && r.record.round > 1 ? `，第 ${r.record.round} 轮` : ''}${r.record && r.record.legacy ? '，v1 历史记录' : ''}）`);
    else { blocked++; console.log(`BLOCK ${r.id}：${r.reasons.join('；')}`); }
  }
  process.exitCode = blocked ? 1 : 0;
}
function cmdStatus() {
  if (!INJ.casesModule || !INJ.casesMeta || !INJ.recordsDir) {
    console.log('status：未注入 case 目标参数（--cases-module/--cases-meta/--records-dir），跳过 case 目标；配置目标用 gate --config 查看。');
    return;
  }
  const { lessons } = scriptCases();
  const cases = JSON.parse(fs.readFileSync(INJ.casesMeta, 'utf8'));
  for (const c of cases.filter(c => c.decision === 'interactive' && lessons[c.id])) {
    const r = gateOne('case', c.id);
    console.log(`${r.ok ? 'OK   ' : 'BLOCK'} ${c.id}  ${r.ok ? `status=${r.record.status}${r.record.taskId ? ` task=${r.record.taskId}` : ''}${r.record.legacy ? '（v1 历史记录）' : ''} model=${r.record.model}` : r.reasons.join('；')}`);
  }
}

if (require.main === module) {
  try {
    const [cmd, ...args] = process.argv.slice(2);
    INJ = parseInjection(args);
    if (cmd === 'begin') cmdBegin(args);
    else if (cmd === 'pack') cmdPack(args);
    else if (cmd === 'verify-response') cmdVerifyResponse(args);
    else if (cmd === 'fail-review') cmdFailReview(args);
    else if (cmd === 'gate') cmdGate(args);
    else if (cmd === 'status') cmdStatus();
    else throw new Error('用法：teaching_review.cjs begin|pack|verify-response|fail-review|gate|status …');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { packScriptCase, packConfig, hashPacket, hashContent, hashGeometry, gateOne, recordPathFor, CHECKLIST, parseInjection, requireCaseInjection };
