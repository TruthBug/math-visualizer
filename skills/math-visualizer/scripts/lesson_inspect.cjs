'use strict';
/* 审校前的自查：lint 找出能用规则确定的图文不一致，inspect 把每一步在关键参数下的实际渲染结果列出来。
   两者都只给提醒、不阻止构建；它们替代 agent 临时写的检查脚本，不替代独立审校与浏览器验收。 */
const modules = require('../assets/modules.js');

const norm = s => String(s || '').replace(/\s+/g, '').replace(/−/g, '-');
const bindings = s => [...String(s || '').matchAll(/\{\{([^{}]+)\}\}/g)].map(m => m[1]);
const stepName = (s, i, step) => `场景 ${s + 1} 第 ${i + 1} 步「${step.title}」`;

function lint(config) {
  const warnings = [];
  const add = (where, message) => warnings.push({ where, message });
  const controls = config.scenes.filter(s => s.steps.some(st => st.interactive)).map(s => s.control);
  /* 规则 1：scope 里写的数值区间与滑块范围不一致（实测中审校员会把它判为阻止项）。 */
  const scope = config.teaching && config.teaching.scope;
  if (scope && controls.length) {
    const text = String(scope).replace(/−/g, '-');
    for (const m of text.matchAll(/[\[(]\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*[\])]/g)) {
      const lo = Number(m[1]), hi = Number(m[2]);
      /* 只看说的是滑块的区间：紧跟“内可调/拖动”等，或同一分句前面提到滑块；数学结论里的区间不提醒。 */
      const before = text.slice(0, m.index), after = text.slice(m.index + m[0].length);
      const aboutSlider = /^\s*(内|之间|范围内)?\s*(可调|拖动|滑动|调节|变化)/.test(after) || /(滑块|滑杆|拖动|可调|演示范围)[^。；;，,]{0,12}$/.test(before);
      if (aboutSlider && !controls.some(c => c.min === lo && c.max === hi))
        add('teaching.scope', `scope 写了区间 ${m[0]}，但滑块范围是 ${controls.map(c => `[${c.min}, ${c.max}]`).join('、')}。如果这里说的是滑块范围，请改成一致；如果说的是数学结论，可以忽略这条提醒。`);
    }
  }
  for (const [s, scene] of config.scenes.entries()) {
    const objects = scene.module === 'function-graph' ? scene.model.objects : null;
    for (const [i, step] of scene.steps.entries()) {
      const where = stepName(s, i, step), text = norm([step.body, step.formula, step.question].join(' '));
      const visible = step.showVisual !== false;
      /* 规则 2：正文提到的对象，这一步图上却没有画。 */
      if (objects && visible) {
        for (const o of objects) {
          if (step.layers.includes(o.id)) continue;
          /* 只按对象标签原文匹配（如 y=a）；“切线”“水平线”这类泛称常作概念出现，按词匹配误报太多。 */
          if (o.label && !/\{\{/.test(o.label) && norm(o.label).length >= 3 && text.includes(norm(o.label)))
            add(where, `正文提到了「${o.label}」，但这一步的 layers 里没有对象 ${o.id}（${o.type}），图上看不到它。把 ${o.id} 加进 layers，或改写正文。`);
        }
      }
      /* 规则 3：正文绑定了某个对象的数值，图上却没有这个对象。 */
      for (const b of bindings([step.body, step.formula, step.question].join(' '))) {
        const id = b.includes('.') ? b.split('.')[0] : null;
        if (objects && id && !step.layers.includes(id)) add(where, `正文绑定了 {{${b}}}，但这一步图上没有对象 ${id}；学生看到数值却看不到对应的图形。`);
        if (i === 0 && /(^|\.)count$/.test(b)) add(where, `第 1 步就绑定了 {{${b}}}，可能在讲到之前提前揭示答案。`);
      }
    }
    /* 规则 4：有交点计数却没写 checks。 */
    if (objects && objects.some(o => o.type === 'intersections') && !(scene.model.checks || []).length)
      add(`场景 ${s + 1}`, '有 intersections 对象但没有写 checks。请在关键参数下写出交点个数，让构建时核对。');
  }
  return warnings;
}

function inspectValues(scene) {
  const c = scene.control, vals = [c.initial, ...c.stops];
  return [...new Set(vals)].sort((a, b) => a - b);
}

function inspect(config) {
  const scenes = config.scenes.map((scene, s) => {
    const def = modules.definitions[scene.module], P = modules.capabilities(scene).parameter;
    const values = inspectValues(scene), hints = [];
    if (typeof def.inspect === 'function') {
      const c = scene.control, n = Math.round((c.max - c.min) / c.step);
      const grid = n <= 400 ? Array.from({ length: n + 1 }, (_, k) => Number((c.min + k * c.step).toFixed(12))) : [];
      for (const v of [...new Set([...values, c.min, c.max, ...grid])]) for (const h of def.inspect(scene.model, v)) hints.push(h);
    }
    const steps = scene.steps.map((step, i) => ({
      name: stepName(s, i, step), layers: step.layers, interactive: step.interactive, showVisual: step.showVisual !== false,
      states: (step.interactive ? values : [scene.control.initial]).map(v => {
        const out = modules.render(scene, v, i), ev = out.labelEvidence || [];
        const omitted = ev.filter(e => e.status === 'omitted');
        return {
          value: v, initial: v === scene.control.initial, body: out.body, formula: out.formula, question: out.question,
          /* anchor 为空表示对象此时不存在或不在视窗内（不画是对的）；有 anchor 却省略的才是被挤掉。 */
          omittedLabels: omitted.filter(e => e.importance !== 'decorative' && e.anchor).map(e => e.text),
          absentLabels: omitted.filter(e => !e.anchor).map(e => e.text),
          omittedTicks: omitted.filter(e => e.importance === 'decorative').map(e => e.text),
          notice: out.notice || '',
        };
      }),
    }));
    return { index: s, module: scene.module, title: scene.view.title, parameter: P, values, hints: [...new Set(hints)], steps };
  });
  return { lint: lint(config), scenes };
}

function formatReport(report) {
  const L = [];
  L.push(`# 自查报告（lint ${report.lint.length} 条提醒）`, '');
  if (report.lint.length) { L.push('## 图文一致性提醒（审校前先处理）'); for (const w of report.lint) L.push(`- ${w.where}：${w.message}`); L.push(''); }
  for (const sc of report.scenes) {
    L.push(`## 场景 ${sc.index + 1}：${sc.title}（${sc.module}，参数 ${sc.parameter}；检查值 ${sc.values.join('、')}）`);
    for (const h of sc.hints) L.push(`- ⚠ ${h}`);
    for (const st of sc.steps) {
      L.push(`### ${st.name}${st.showVisual ? '' : '（撤图）'}　layers：${st.layers.join('、') || '无'}${st.interactive ? '' : '　（非交互，只列初始值）'}`);
      for (const x of st.states) {
        const issues = [];
        if (x.omittedLabels.length) issues.push(`被省略的标签：${x.omittedLabels.join('、')}`);
        if (x.omittedTicks.length) issues.push(`被挤掉的刻度：${x.omittedTicks.join('、')}`);
        if (x.absentLabels.length) issues.push(`此时不在画面内（不画）：${x.absentLabels.join('、')}`);
        if (x.notice) issues.push(`提示：${x.notice}`);
        L.push(`- ${sc.parameter}=${x.value}${x.initial ? '（初始）' : ''}：${issues.join('；') || '无省略、无提示'}`);
        if (x.formula) L.push(`  公式：${x.formula}`);
      }
      const bodies = [...new Set(st.states.map(x => x.body))];
      L.push(bodies.length === 1 ? `  正文：${bodies[0]}` : `  正文随参数变化，共 ${bodies.length} 种：${bodies.map(b => `\n    · ${b}`).join('')}`);
    }
    L.push('');
  }
  L.push('说明：只列出初始值与停靠点（非交互步骤只列初始值）；这不是浏览器验收，排版与溢出仍需截图检查。');
  return L.join('\n');
}

module.exports = { lint, inspect, formatReport };
