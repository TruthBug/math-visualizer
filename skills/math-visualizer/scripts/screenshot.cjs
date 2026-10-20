#!/usr/bin/env node
'use strict';
/* 一条命令截完课件的关键状态，并给出文字结论（横向溢出、图下提示），不必逐张看图就知道哪一步有问题。
   用本机的 Chrome 或 Edge 无头模式，不安装任何依赖。无头窗口的尺寸含边框，宽度最小 500，直接截图得不到准确的
   手机视口；所以把课件放进一个尺寸精确的 iframe 再截。网址 #step=N&v=值 定位状态，#audit=1 让播放器写出布局检查。 */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const USAGE = 'Usage: node scripts/screenshot.cjs 课件.html 输出目录 [--sizes 1366x768,1440x900] [--browser 浏览器路径]\n' +
  '第一个尺寸截“每一步 + 交互步骤的每个停靠点”，其余尺寸只截每一步的初始状态；每个尺寸都检查每一步有没有横向溢出。';

function readConfig(html) {
  const m = /<script id="lesson-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('这个 HTML 不是 build_lesson.cjs 生成的课件（找不到 lesson-data），无法确定有哪些步骤。');
  return JSON.parse(m[1]);
}

/* 状态清单：全局步骤号从 1 开始；v 为 null 表示按初始值打开。 */
function plan(config, sizes) {
  const steps = config.scenes.flatMap(scene => scene.steps.map(step => ({ scene, step })));
  const shots = [], audits = [];
  sizes.forEach((size, k) => {
    steps.forEach(({ scene, step }, i) => {
      const n = i + 1;
      audits.push({ step: n, v: null, size });
      shots.push({ step: n, v: null, size });
      const values = k === 0 && step.interactive && step.showVisual !== false ? [...new Set(scene.control.stops)] : [];
      for (const v of values) if (v !== scene.control.initial) shots.push({ step: n, v, size });
    });
  });
  return { shots, audits };
}

function findBrowser(explicit, env = process.env, platform = process.platform, exists = fs.existsSync) {
  if (explicit) { if (!exists(explicit)) throw new Error(`--browser 指定的浏览器不存在：${explicit}`); return explicit; }
  if (env.MATHVIZ_BROWSER) { if (!exists(env.MATHVIZ_BROWSER)) throw new Error(`MATHVIZ_BROWSER 指向的浏览器不存在：${env.MATHVIZ_BROWSER}`); return env.MATHVIZ_BROWSER; }
  const candidates = [];
  if (platform === 'win32') {
    for (const base of [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean))
      candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  } else if (platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    for (const dir of String(env.PATH || '').split(path.delimiter).filter(Boolean))
      for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) candidates.push(path.join(dir, name));
  }
  const found = candidates.find(p => exists(p));
  if (!found) throw new Error('没找到 Chrome 或 Edge。请设置环境变量 MATHVIZ_BROWSER 指向浏览器可执行文件，或加 --browser 参数；也可以改为手动截图。');
  return found;
}

function stateUrl(file, { step, v }, audit) {
  const q = [`step=${step}`]; if (v !== null) q.push(`v=${v}`); if (audit) q.push('audit=1');
  return pathToFileURL(file).href + '#' + q.join('&');
}

/* 外层页面：iframe 给出精确视口；加载后把 iframe 里播放器写的检查结果抄到外层 body 上，供 --dump-dom 读取。 */
function wrapperHtml(src, w, h) {
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}iframe{border:0;display:block}</style>` +
    `<iframe id="f" width="${w}" height="${h}" src="${src.replace(/"/g, '&quot;')}"></iframe>` +
    `<script>document.getElementById('f').onload=()=>setTimeout(()=>{try{document.body.setAttribute('data-mathviz-audit',document.getElementById('f').contentDocument.body.getAttribute('data-mathviz-audit')||'')}catch(e){document.body.setAttribute('data-mathviz-audit-error',String(e))}},300);</script>`;
}

function run(browser, work, size, extra, src) {
  const [w, h] = size.split('x').map(Number), wrapper = path.join(work, 'frame.html');
  fs.writeFileSync(wrapper, wrapperHtml(src, w, h));
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files',
    `--user-data-dir=${path.join(work, 'profile')}`, `--window-size=${Math.max(w, 500) + 40},${h + 140}`, '--virtual-time-budget=3000', ...extra, pathToFileURL(wrapper).href];
  return spawnSync(browser, args, { encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
}

function main(argv) {
  const files = [], opts = { sizes: '1366x768,1440x900', browser: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sizes') opts.sizes = argv[++i];
    else if (argv[i] === '--browser') opts.browser = argv[++i];
    else files.push(argv[i]);
  }
  if (files.length !== 2 || files.some(f => !f || f.startsWith('--'))) throw new Error(USAGE);
  const html = path.resolve(files[0]), outDir = path.resolve(files[1]);
  const sizes = String(opts.sizes).split(',').map(s => s.trim());
  if (!sizes.length || sizes.some(s => !/^\d{3,4}x\d{3,4}$/.test(s))) throw new Error(`--sizes 写成 宽x高，多个用逗号分隔，例如 1366x768 或 1366x768,1440x900（现在是 ${opts.sizes}）`);
  const config = readConfig(fs.readFileSync(html, 'utf8'));
  const browser = findBrowser(opts.browser);
  fs.mkdirSync(outDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mathviz-shot-'));
  const { shots, audits } = plan(config, sizes), saved = [], failed = [], problems = [], notices = {};
  try {
    for (const s of shots) {
      const name = `s${String(s.step).padStart(2, '0')}${s.v === null ? '' : `_v${s.v}`}_${s.size}.png`, out = path.join(outDir, name);
      const r = run(browser, work, s.size, [`--screenshot=${out}`], stateUrl(html, s, false));
      if (fs.existsSync(out)) saved.push(name); else failed.push(`${name}：${(r.error && r.error.message) || r.stderr || '浏览器没有输出图片'}`.slice(0, 300));
    }
    for (const a of audits) {
      const r = run(browser, work, a.size, ['--dump-dom'], stateUrl(html, a, true));
      const m = /data-mathviz-audit="([^"]+)"/.exec(r.stdout || '');
      if (!m) { failed.push(`第 ${a.step} 步 ${a.size} 的布局检查没有结果（课件可能是旧版 player 生成的，或浏览器运行失败）`); continue; }
      const info = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      if (info.overflowX) problems.push(`第 ${a.step} 步在 ${a.size} 下有横向溢出：页面宽 ${info.scrollWidth}px，视口 ${info.viewport}`);
      if (info.notice) (notices[info.notice] = notices[info.notice] || []).push(`${a.size} 第 ${a.step} 步`);
    }
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
  /* 同一条提示（常见的是刻度被挤掉）合并成一行，不逐步重复。 */
  for (const [text, where] of Object.entries(notices)) problems.push(`图下提示「${text}」出现在：${where.join('、')}`);
  const L = [`浏览器：${browser}`, `截图 ${saved.length} 张 → ${outDir}（图片右侧和下方的空白是截图画布，不是页面内容）`, ...saved.map(n => `  ${n}`)];
  L.push(problems.length ? `布局检查（${audits.length} 项）发现：` : `布局检查（${audits.length} 项）：没有横向溢出，也没有图下提示。`, ...problems.map(p => `  - ${p}`));
  if (failed.length) L.push('失败：', ...failed.map(f => `  - ${f}`));
  L.push('说明：布局检查只覆盖横向溢出和图下提示；文字是否好读、标签是否压线，仍要看截图。');
  console.log(L.join('\n'));
  if (failed.length) process.exitCode = 1;
}

if (require.main === module) { try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { readConfig, plan, findBrowser, stateUrl, wrapperHtml };
