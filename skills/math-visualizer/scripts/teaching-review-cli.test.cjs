'use strict';
/* CLI 注入契约测试（P1-4）：--case 缺注入参数必须报错退出，不得回退猜测任何路径；
   清单展开（--all-gaokao）是仓库侧包装脚本的职责，直连 skill 必须被拒绝。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const CLI = path.join(__dirname, 'teaching_review.cjs');

test('drag 配置的审校包包含空拒绝探针，结构版本升级且探针参与内容指纹', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mathviz-drag-pack-'));
  try {
    const source = path.join(temp, 'lesson.json');
    fs.copyFileSync(path.join(__dirname, '../assets/configs/quadratic-level.json'), source);
    const { packConfig, hashContent } = require('./teaching_review.cjs');
    const packet = packConfig(source);
    assert.equal(packet.packetVersion, 2);
    assert.deepEqual(packet.scenes[0].dragRejections, [], '现有水平线映射全通过，拒绝探针为空表');
    const withoutProbe = structuredClone(packet);
    delete withoutProbe.scenes[0].dragRejections;
    assert.notEqual(hashContent(packet), hashContent(withoutProbe), '探针段在内容指纹的覆盖范围内');
    const plain = JSON.parse(fs.readFileSync(source, 'utf8'));
    plain.scenes[0].control.type = 'range';
    fs.writeFileSync(source, JSON.stringify(plain));
    const rangePacket = packConfig(source);
    assert.equal(rangePacket.packetVersion, 1);
    assert.equal(Object.hasOwn(rangePacket.scenes[0], 'dragRejections'), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('独立审校包携带完整语言规范，语言阻止项实际拦截门禁和正式构建', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mathviz 语言门禁 '));
  try {
    const source = path.join(temp, 'lesson.json'), scope = path.join(temp, 'scope.md');
    fs.copyFileSync(path.join(__dirname, '../assets/configs/quadratic-level.json'), source);
    fs.writeFileSync(scope, '机械契约测试：模拟语言阻止响应；不代表真实课件的教学判定。');
    const run = (args, status = 0) => {
      const r = spawnSync(process.execPath, args, { cwd: temp, encoding: 'utf8' });
      assert.equal(r.status, status, r.stdout + r.stderr);
      return r;
    };
    const task = 'language-contract';
    run([CLI, 'begin', '--config', source, '--task', task, '--scope-file', scope]);
    const out = path.join(temp, 'packets');
    run([CLI, 'pack', '--config', source, '--task', task, '--out', out]);
    const brief = fs.readFileSync(path.join(out, fs.readdirSync(out).find(n => n.endsWith('.brief.md'))), 'utf8');
    const standard = fs.readFileSync(path.join(__dirname, '../references/math-language.md'), 'utf8').trim();
    assert.ok(brief.includes(standard), '独立上下文必须拿到完整依据，不能只有不可用的相对链接');
    const session = JSON.parse(fs.readFileSync(path.join(temp, 'reviews/lesson.sessions', task + '.json'), 'utf8'));
    const response = path.join(temp, 'response.json');
    fs.writeFileSync(response, JSON.stringify({
      taskId: task, requestId: session.activeRequest.requestId, inputHash: session.activeRequest.inputHash,
      verdict: 'issues', findings: [{ step: 0, field: 'body', type: '语言',
        original: '机械测试的模拟原句', problem: '模拟审校员确认的句法问题',
        basis: '仅测试语言类型的 blocking 能否阻断流程，不评判夹具文本的语法。',
        suggestion: '按独立审校意见修复原句。', blocking: true }], dispositions: [],
    }));
    run([CLI, 'verify-response', '--config', source, '--task', task, '--response', response,
      '--model', 'mechanical-test-fixture', '--method', 'synthetic response, not an LLM review']);
    run([CLI, 'gate', '--config', source], 1);
    const target = path.join(temp, 'formal.html');
    run([path.join(__dirname, 'build_lesson.cjs'), source, target], 1);
    assert.equal(fs.existsSync(target), false);
    const saved = JSON.parse(fs.readFileSync(path.join(temp, 'reviews/lesson.sessions', task + '.json'), 'utf8'));
    assert.equal(saved.status, 'active');
    assert.equal(saved.reviews[0].findings[0].type, '语言');
    assert.equal(saved.reviews[0].findings[0].blocking, true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('gate --case 无注入参数：报错退出并列出全部缺失参数，不猜测宿主仓库路径', () => {
  const r = spawnSync(process.execPath, [CLI, 'gate', '--case', '2024-q6'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0, '缺注入参数必须非零退出');
  const out = (r.stdout || '') + (r.stderr || '');
  for (const flag of ['--cases-module', '--cases-meta', '--records-dir', '--source-label', '--verification-label'])
    assert.ok(out.includes(flag), `错误信息应点名 ${flag}`);
  assert.doesNotMatch(out, /tests[\/\\]gaokao/, '报错文案不得出现宿主仓库路径');
});

test('直连 --all-gaokao 被拒绝（展开是仓库侧包装的职责）', () => {
  const r = spawnSync(process.execPath, [CLI, 'gate', '--all-gaokao'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match((r.stderr || '') + (r.stdout || ''), /--all-gaokao/);
});

test('随包配置的历史来源标识及双指纹不随 cwd 改变，外部同名配置保留 source-root 语义', () => {
  const skill = path.resolve(__dirname, '..');
  const config = path.join(skill, 'assets/configs/circle-concept.json');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mathviz 来源 '));
  const packetSummary = (file, cwd) => {
    const code = 'const t=require(process.argv[1]),p=t.packConfig(process.argv[2]);process.stdout.write(JSON.stringify({source:p.source,content:t.hashContent(p),geometry:t.hashGeometry(p)}));';
    const result = spawnSync(process.execPath, ['-e', code, CLI, file], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  try {
    const fromSkill = packetSummary(config, skill);
    assert.equal(fromSkill.source, 'skills/math-visualizer/assets/configs/circle-concept.json');
    assert.deepEqual(packetSummary(config, temp), fromSkill);
    const external = path.join(temp, 'circle-concept.json');
    fs.copyFileSync(config, external);
    fs.copyFileSync(path.join(skill, 'assets/configs/circle-2025-model.json'), path.join(temp, 'circle-2025-model.json'));
    const fromOutside = packetSummary(external, temp);
    assert.equal(fromOutside.source, 'circle-concept.json');
    assert.notEqual(fromOutside.content, fromSkill.content);
    assert.notEqual(fromOutside.geometry, fromSkill.geometry);
    assert.equal(packetSummary(external, skill).source, path.relative(skill, external).split(path.sep).join('/'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
