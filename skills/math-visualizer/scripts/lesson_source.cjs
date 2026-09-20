'use strict';
/* 构建与审校共用同一入口；只做可确定的配置检查，不替代数学/教学审校。 */
const fs = require('node:fs');
const path = require('node:path');
const modules = require('../assets/modules.js');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

function checkPlainText(config) {
  const errors = [];
  for (const [s, scene] of config.scenes.entries()) {
    for (const [i, step] of scene.steps.entries()) {
      for (const field of ['body', 'formula', 'question']) {
        // 仅检查明确的排版标签；x<1、a<b 等数学比较式不是 HTML。
        if (/<\/?(?:sup|sub)\s*>|<br\s*\/?>/i.test(step[field] || '')) {
          errors.push(`scenes[${s}].steps[${i}].${field} 按纯文本显示，不解析 HTML 排版标签；请改用纯文本（如 x²），仅顶层 equation 支持 sup/sub`);
        }
      }
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}

function load(source) {
  source = path.resolve(source);
  const inputs = [source], config = readJSON(source);
  for (const scene of config.scenes || []) {
    if (scene.modelRef === undefined) continue;
    if (scene.model !== undefined || typeof scene.modelRef !== 'string' || !scene.modelRef.trim()) throw new Error('Use exactly one of model/modelRef');
    if (path.isAbsolute(scene.modelRef) || scene.modelRef.includes(':')) throw new Error('modelRef must be a relative local JSON path');
    const file = path.resolve(path.dirname(source), scene.modelRef);
    if (path.extname(file) !== '.json') throw new Error('modelRef must reference JSON');
    scene.model = readJSON(file);
    delete scene.modelRef;
    inputs.push(file);
  }
  modules.validate(config);
  checkPlainText(config);
  return { config, inputs };
}

function check(source) {
  const { config, inputs } = load(source);
  return { ok: true, inputs, scenes: config.scenes.length,
    steps: config.scenes.reduce((n, scene) => n + scene.steps.length, 0),
    scope: '配置结构、模型边界、文本绑定与正文排版标签；未做教学审校或浏览器验收' };
}
module.exports = { load, check };
