'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { load, check } = require('./lesson_source.cjs');
const { build } = require('./build_lesson.cjs');
const review = require('./teaching_review.cjs');
const view = require('./review_view.cjs');
const fixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/configs/quadratic-level.json'), 'utf8'));

function temporary(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lesson-pipeline-'));
  try { run(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('build and review share modelRef resolution including BOM and preserve inputs', () => temporary(dir => {
  const config = fixture(), source = path.join(dir, 'lesson.json'), model = path.join(dir, 'model.json');
  fs.writeFileSync(model, '\uFEFF' + JSON.stringify(config.scenes[0].model));
  delete config.scenes[0].model; config.scenes[0].modelRef = 'model.json';
  fs.writeFileSync(source, '\uFEFF' + JSON.stringify(config));
  const loaded = load(source), packet = review.packConfig(source);
  assert.deepEqual(loaded.inputs, [source, model]);
  assert.deepEqual(packet.scenes[0].model, loaded.config.scenes[0].model);
  assert.throws(() => build(source, model, { review: 'preview' }), /overwrite input/);
  assert.ok(fs.readFileSync(model, 'utf8').startsWith('\uFEFF'));
}));

test('plain-text formatting failures are found before build/pack; math comparisons and equation markup survive', () => temporary(dir => {
  const config = fixture(), source = path.join(dir, 'lesson.json'), target = path.join(dir, 'out.html');
  config.scenes[0].steps[0].formula = 'x<sup>2</sup>';
  fs.writeFileSync(source, JSON.stringify(config));
  for (const run of [() => check(source), () => build(source, target, { review: 'preview' }), () => review.packConfig(source)]) {
    assert.throws(run, /scenes\[0\].steps\[0\].formula.*纯文本/);
  }
  assert.equal(fs.existsSync(target), false);
  config.scenes[0].steps[0].formula = 'x<1，a<b，b>c；x²';
  config.equation = 'y=x<sup>2</sup>';
  fs.writeFileSync(source, JSON.stringify(config));
  assert.equal(check(source).ok, true);
  assert.equal(review.packConfig(source).scenes[0].steps[0].branches[0].formulaText, config.scenes[0].steps[0].formula);
}));

test('preview and --check never call review gate, while formal build still does', () => temporary(dir => {
  const source = path.join(dir, 'lesson.json'), target = path.join(dir, 'preview.html');
  fs.writeFileSync(source, JSON.stringify(fixture()));
  const original = review.gateOne;
  let calls = 0;
  review.gateOne = () => { calls++; return { ok: false, reasons: ['sentinel'] }; };
  try {
    assert.equal(check(source).ok, true);
    build(source, target, { review: 'preview' });
    assert.equal(calls, 0);
    assert.match(fs.readFileSync(target, 'utf8'), /未审校预览/);
    const before = fs.readFileSync(target);
    assert.throws(() => build(source, target), /sentinel/);
    assert.equal(calls, 1);
    assert.deepEqual(fs.readFileSync(target), before);
  } finally { review.gateOne = original; }
  const result = spawnSync(process.execPath, [path.join(__dirname, 'build_lesson.cjs'), '--check', source], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
  assert.equal(fs.existsSync(path.join(dir, 'reviews')), false);
  const trailing = spawnSync(process.execPath, [path.join(__dirname, 'build_lesson.cjs'), source, target, '--preview'], { encoding: 'utf8' });
  assert.equal(trailing.status, 0, trailing.stderr);
  const config = fixture(); config.scenes[0].steps[0].body = 'x<sub>1</sub>';
  fs.writeFileSync(source, JSON.stringify(config));
  const bad = spawnSync(process.execPath, [path.join(__dirname, 'build_lesson.cjs'), '--check', source], { encoding: 'utf8' });
  assert.equal(bad.status, 1); assert.match(bad.stderr, /steps\[0\].body/);
}));

test('review reading view is lossless for both packet shapes, including numbers and omitted labels', () => {
  const figure = { labels: ['x<1', 'P'], labelEvidence: [{ id: 'P', importance: 'essential', status: 'omitted', anchor: [0.123456789, -2] }, { importance: 'decorative', text: '−5', status: 'omitted' }] };
  const steps = [{ index: 0, title: '原文', branches: [
    { representative: 1, values: [1, 2], bodyText: 'x<1', figure },
    { representative: 3, values: [3], bodyText: '不同文字', figure },
    { representative: 4, values: [4], figure: { ...figure, labels: ['Q'] } },
  ] }];
  for (const packet of [{ meta: { title: 'case' }, steps }, { meta: { title: 'config' }, scenes: [{ steps }] }]) {
    const before = JSON.stringify(packet), projected = view.project(packet);
    assert.equal(Object.keys(projected.figures).length, 2);
    for (const group of projected.content.scenes || [projected.content]) for (const step of group.steps) for (const branch of step.branches) {
      branch.figure = projected.figures[branch.figureRef]; delete branch.figureRef;
    }
    assert.deepEqual(projected.content, packet);
    assert.equal(JSON.stringify(packet), before, 'must not mutate evidence or hash input');
    const text = view.markdown(packet);
    assert.ok(text.includes('0.123456789') && text.includes('−5') && text.includes('不同文字'));
    assert.ok(text.includes('G1') && text.includes('G2'));
    const blocks = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]));
    const parsed = view.project(packet);
    assert.deepEqual(blocks, [parsed.content, ...Object.values(parsed.figures)], 'emitted Markdown preserves all JSON values');
  }
});
