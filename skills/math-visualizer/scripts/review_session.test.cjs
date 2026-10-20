'use strict';
/* review_session 纯状态机测试：预算、绑定、处置、失败处理。不写磁盘。 */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./review_session.cjs');

const H = n => String(n).padStart(64, 'a').slice(0, 64); // 合法形态的假哈希
const base = () => S.startSession({ taskId: 'task-1', targetId: 'config:/tmp/x.json', scope: '讲解某题，验收范围见任务记录', scopeRef: 'tests/skill-upgrade/evaluation.md' });
const blocker = { step: 0, field: 'body', type: '推理', original: '结论', problem: '缺依据', basis: '由前置知识推不出', suggestion: '补理由', blocking: true };

test('taskId 必须安全且 scope/scopeRef 必填', () => {
  assert.throws(() => S.startSession({ taskId: '../etc', targetId: 'x', scope: 'a', scopeRef: 'b' }), /E_TASK_ID/);
  assert.throws(() => S.startSession({ taskId: 'ok', targetId: 'x', scope: '', scopeRef: 'b' }), /E_SCOPE/);
  assert.throws(() => S.startSession({ taskId: 'ok', targetId: 'x', scope: 'a', scopeRef: '' }), /E_SCOPE/);
});

test('初审不计入复审；第三次复审解决仍通过；未解决则第四次请求被拒且 exhausted', () => {
  let s = base();
  s = S.issueRequest(s, { requestId: 'r1', inputHash: H(1) });
  s = S.acceptResponse(s, { taskId: 'task-1', requestId: 'r1', inputHash: H(1), verdict: 'issues', findings: [blocker], dispositions: [] });
  assert.equal(s.initialCompleted, true);
  assert.equal(s.rechecksCompleted, 0, '初审不计入复审');
  assert.equal(s.status, 'active');
  // 三次复审都仍有阻止项（不新增发现，只把原项标为未解决）
  for (let i = 2; i <= 4; i++) {
    s = S.issueRequest(s, { requestId: `r${i}`, inputHash: H(i) });
    s = S.acceptResponse(s, {
      taskId: 'task-1', requestId: `r${i}`, inputHash: H(i), verdict: 'issues', findings: [],
      dispositions: [{ id: 'F1', status: 'unresolved', basis: '仍未给出依据' }],
    });
    assert.equal(s.status, i < 4 ? 'active' : 'exhausted', '空 findings + unresolved 处置不得判通过');
  }
  assert.equal(s.rechecksCompleted, 3);
  assert.equal(s.status, 'exhausted');
  assert.throws(() => S.issueRequest(s, { requestId: 'r5', inputHash: H(5) }), /E_BUDGET|E_STATE/);

  // 另一周期：第三次复审解决 → 通过
  let t = base();
  t = S.issueRequest(t, { requestId: 'r1', inputHash: H(1) });
  t = S.acceptResponse(t, { taskId: 'task-1', requestId: 'r1', inputHash: H(1), verdict: 'issues', findings: [blocker], dispositions: [] });
  for (let i = 2; i <= 3; i++) {
    t = S.issueRequest(t, { requestId: `r${i}`, inputHash: H(i) });
    t = S.acceptResponse(t, { taskId: 'task-1', requestId: `r${i}`, inputHash: H(i), verdict: 'issues', findings: [], dispositions: [{ id: 'F1', status: 'unresolved', basis: '还没改' }] });
  }
  t = S.issueRequest(t, { requestId: 'r4', inputHash: H(4) });
  t = S.acceptResponse(t, { taskId: 'task-1', requestId: 'r4', inputHash: H(4), verdict: 'pass', findings: [], dispositions: [{ id: 'F1', status: 'resolved', basis: '已补依据' }] });
  assert.equal(t.status, 'passed');
  assert.equal(t.rechecksCompleted, 3);
});

test('响应绑定：错 taskId / 错 requestId / 错 inputHash / 重复消费均拒收且不计数', () => {
  let s = base();
  s = S.issueRequest(s, { requestId: 'r1', inputHash: H(1) });
  assert.throws(() => S.acceptResponse(s, { taskId: 'other', requestId: 'r1', inputHash: H(1), verdict: 'pass', findings: [] }), /E_BINDING/);
  assert.throws(() => S.acceptResponse(s, { taskId: 'task-1', requestId: 'r9', inputHash: H(1), verdict: 'pass', findings: [] }), /E_BINDING/);
  assert.throws(() => S.acceptResponse(s, { taskId: 'task-1', requestId: 'r1', inputHash: H(2), verdict: 'pass', findings: [] }), /E_BINDING/);
  assert.equal(s.reviews.length, 0, '被拒的响应不计数');
  assert.ok(s.activeRequest, '在途请求保留');
  s = S.acceptResponse(s, { taskId: 'task-1', requestId: 'r1', inputHash: H(1), verdict: 'pass', findings: [] });
  assert.equal(s.status, 'passed');
  assert.throws(() => S.acceptResponse(s, { taskId: 'task-1', requestId: 'r1', inputHash: H(1), verdict: 'pass', findings: [] }), /E_BINDING|重复消费/);
  assert.equal(s.reviews.length, 1, '重复消费不覆盖状态');
});

test('已通过且输入未变拒绝再打包；内容变化在原周期消耗复审预算；非阻止建议不触发新请求', () => {
  let s = base();
  s = S.issueRequest(s, { requestId: 'r1', inputHash: H(1) });
  s = S.acceptResponse(s, { taskId: 'task-1', requestId: 'r1', inputHash: H(1), verdict: 'issues', findings: [{ ...blocker, blocking: false, basis: '' }], dispositions: [] });
  assert.equal(s.status, 'passed', '仅非阻止建议即通过');
  assert.throws(() => S.issueRequest(s, { requestId: 'r2', inputHash: H(1) }), /E_STATE|已通过/);
  // 语义内容变化（哈希不同）：允许在原周期发起定向复审，消耗预算
  s = S.issueRequest(s, { requestId: 'r2', inputHash: H(2) });
  assert.equal(s.activeRequest.recheck, true);
  s = S.acceptResponse(s, { taskId: 'task-1', requestId: 'r2', inputHash: H(2), verdict: 'pass', findings: [], dispositions: [] });
  assert.equal(s.status, 'passed');
  assert.equal(s.rechecksCompleted, 1, '通过后的内容复审计入复审预算');
});

test('复审必须逐项处置原阻止项；新阻止项须标 origin；pass 与 unresolved 矛盾拒收', () => {
  let s = base();
  s = S.issueRequest(s, { requestId: 'r1', inputHash: H(1) });
  s = S.acceptResponse(s, { taskId: 'task-1', requestId: 'r1', inputHash: H(1), verdict: 'issues', findings: [blocker], dispositions: [] });
  const fid = s.reviews[0].findings[0].id;
  s = S.issueRequest(s, { requestId: 'r2', inputHash: H(2) });
  // 只回 findings=[] 想默默忘掉原问题 → 拒
  assert.throws(() => S.acceptResponse(s, { taskId: 'task-1', requestId: 'r2', inputHash: H(2), verdict: 'pass', findings: [], dispositions: [] }), /逐项处置/);
  // 处置缺依据 → 拒
  assert.throws(() => S.acceptResponse(s, { taskId: 'task-1', requestId: 'r2', inputHash: H(2), verdict: 'pass', findings: [], dispositions: [{ id: fid, status: 'resolved', basis: '' }] }), /非空依据/);
  // 复审新阻止项缺 origin → 拒
  assert.throws(() => S.acceptResponse(s, { taskId: 'task-1', requestId: 'r2', inputHash: H(2), verdict: 'issues', findings: [{ ...blocker }], dispositions: [{ id: fid, status: 'resolved', basis: '已改' }] }), /origin/);
  // pass 但处置为 unresolved → 拒
  assert.throws(() => S.acceptResponse(s, { taskId: 'task-1', requestId: 'r2', inputHash: H(2), verdict: 'pass', findings: [], dispositions: [{ id: fid, status: 'unresolved', basis: '没改' }] }), /矛盾/);
  // 合规：解决旧项 + 新增一条标明漏检的阻止项
  s = S.acceptResponse(s, {
    taskId: 'task-1', requestId: 'r2', inputHash: H(2), verdict: 'issues',
    findings: [{ ...blocker, origin: 'missed', problem: '另一处缺依据' }],
    dispositions: [{ id: fid, status: 'resolved', basis: '第二轮已补依据' }],
  });
  assert.equal(S.openBlocking(s).length, 1, '旧项关闭、新项开启');
  assert.equal(s.reviews[0].findings[0].resolved, true);
});

test('失败重试限一次；到达上限记 incomplete 并保留预算与原问题；修复记录后可重发', () => {
  let s = base();
  s = S.issueRequest(s, { requestId: 'r1', inputHash: H(1) });
  s = S.acceptResponse(s, { taskId: 'task-1', requestId: 'r1', inputHash: H(1), verdict: 'issues', findings: [blocker], dispositions: [] });
  s = S.issueRequest(s, { requestId: 'r2', inputHash: H(2) });
  s = S.recordFailure(s, { requestId: 'r2', reason: 'LLM 超时' });
  assert.equal(s.status, 'active', '第一次失败保留重试机会');
  assert.ok(s.activeRequest, '在途请求保留以重试');
  s = S.recordFailure(s, { requestId: 'r2', reason: '输出不是合法 JSON' });
  assert.equal(s.status, 'incomplete', '同一请求两次失败 → incomplete');
  assert.equal(s.activeRequest, null);
  assert.equal(s.rechecksCompleted, 0, '失败不消耗复审预算');
  assert.equal(S.openBlocking(s).length, 1, '原阻止项保留');
  // 无 toolFix 不能重发；有修复记录可重发同一输入
  assert.throws(() => S.issueRequest(s, { requestId: 'r3', inputHash: H(2) }), /E_STATE|toolFix/);
  s = S.issueRequest(s, { requestId: 'r3', inputHash: H(2), toolFix: '审校调用脚本修复超时参数' });
  assert.equal(s.status, 'active');
});

test('改输出路径不重置预算；requestId 不得复用；exhausted 后新周期显式承接旧问题', () => {
  let s = base();
  s = S.issueRequest(s, { requestId: 'r1', inputHash: H(1), packetPath: 'a/packet.json' });
  s = S.acceptResponse(s, { taskId: 'task-1', requestId: 'r1', inputHash: H(1), verdict: 'issues', findings: [blocker], dispositions: [] });
  s = S.issueRequest(s, { requestId: 'r2', inputHash: H(2), packetPath: 'b/packet.json' }); // 换输出路径
  s = S.acceptResponse(s, { taskId: 'task-1', requestId: 'r2', inputHash: H(2), verdict: 'issues', findings: [], dispositions: [{ id: 'F1', status: 'unresolved', basis: '仍在' }] });
  assert.equal(s.rechecksCompleted, 1, '换输出路径不重置预算');
  assert.throws(() => S.issueRequest(s, { requestId: 'r2', inputHash: H(3) }), /E_VALIDATION|已使用/);
  // 新周期：引用旧周期并承接未解决项，旧周期记录不动
  const open = S.openBlocking(s);
  const next = S.startSession({
    taskId: 'task-2', targetId: s.targetId, scope: '新的教学目标', scopeRef: '对话记录 2026-09-18',
    previousSession: { taskId: s.taskId, carried: open },
  });
  assert.equal(next.carriedBlocking.length, 1);
  assert.equal(next.carriedBlocking[0].carriedFrom, 'task-1');
  assert.equal(s.reviews.length, 2, '旧周期不被清零');
});

test('承接的阻止项进入新周期判定：空 findings 或只处置本周期项都不能通过', () => {
  // 前一周期：1 条阻止项未解决（exhausted 场景）
  let prev = base();
  prev = S.issueRequest(prev, { requestId: 'r1', inputHash: H(1) });
  prev = S.acceptResponse(prev, { taskId: 'task-1', requestId: 'r1', inputHash: H(1), verdict: 'issues', findings: [blocker], dispositions: [] });
  for (let i = 2; i <= 4; i++) {
    prev = S.issueRequest(prev, { requestId: `r${i}`, inputHash: H(i) });
    prev = S.acceptResponse(prev, { taskId: 'task-1', requestId: `r${i}`, inputHash: H(i), verdict: 'issues', findings: [], dispositions: [{ id: 'F1', status: 'unresolved', basis: '没改' }] });
  }
  assert.equal(prev.status, 'exhausted');
  const carried = S.openBlocking(prev);
  assert.equal(carried.length, 1);
  let s = S.startSession({ taskId: 'task-2', targetId: prev.targetId, scope: '重开', scopeRef: 'x', previousSession: { taskId: 'task-1', carried } });
  assert.equal(S.openBlocking(s).length, 1, '承接项在未处置前属于未关闭阻止项');
  // 内容一字未改、只回 findings=[] → 不能 passed
  s = S.issueRequest(s, { requestId: 'n1', inputHash: H(9) });
  assert.throws(() => S.acceptResponse(s, { taskId: 'task-2', requestId: 'n1', inputHash: H(9), verdict: 'pass', findings: [], dispositions: [] }), /逐项处置/);
  // 未处置承接项时，连"带新发现"的响应也被拒（复审范围含承接项）
  assert.throws(() => S.acceptResponse(s, { taskId: 'task-2', requestId: 'n1', inputHash: H(9), verdict: 'issues', findings: [{ ...blocker, origin: 'change' }], dispositions: [] }), /逐项处置/);
  const carriedId0 = s.carriedBlocking[0].id;
  s = S.acceptResponse(s, {
    taskId: 'task-2', requestId: 'n1', inputHash: H(9), verdict: 'issues', findings: [{ ...blocker, origin: 'change' }],
    dispositions: [{ id: carriedId0, status: 'unresolved', basis: '本轮仍未修复' }],
  });
  s = S.issueRequest(s, { requestId: 'n2', inputHash: H(10) });
  const carriedId = s.carriedBlocking[0].id;
  assert.throws(() => S.acceptResponse(s, {
    taskId: 'task-2', requestId: 'n2', inputHash: H(10), verdict: 'pass', findings: [],
    dispositions: s.reviews[0].findings.map(f => ({ id: f.id, status: 'resolved', basis: '已改' })), // 只处置本周期项
  }), /逐项处置/, '承接项也必须逐项处置');
  // 全部处置为 resolved 才可通过
  s = S.acceptResponse(s, {
    taskId: 'task-2', requestId: 'n2', inputHash: H(10), verdict: 'pass', findings: [],
    dispositions: [...s.reviews[0].findings.map(f => ({ id: f.id, status: 'resolved', basis: '已改' })), { id: carriedId, status: 'resolved', basis: '连同承接项一并修复' }],
  });
  assert.equal(s.status, 'passed');
  assert.equal(S.openBlocking(s).length, 0);
});

test('几何指纹参与通过判定：内容未变但几何变化仍需复审；resolved 可被标回 unresolved', () => {
  let s = base();
  const G1 = H(11), G2 = H(12);
  s = S.issueRequest(s, { requestId: 'r1', inputHash: H(1), geometryHash: G1 });
  s = S.acceptResponse(s, { taskId: 'task-1', requestId: 'r1', inputHash: H(1), verdict: 'pass', findings: [] });
  assert.equal(s.passedGeometryHash, G1, '通过时记录几何指纹');
  assert.throws(() => S.issueRequest(s, { requestId: 'r2', inputHash: H(1), geometryHash: G1 }), /已通过/, '内容与几何都未变：拒绝确认性复审');
  s = S.issueRequest(s, { requestId: 'r2', inputHash: H(1), geometryHash: G2 }); // 内容未变、几何变了
  assert.equal(s.activeRequest.recheck, true, '几何变化必须复审');
  s = S.acceptResponse(s, { taskId: 'task-1', requestId: 'r2', inputHash: H(1), verdict: 'pass', findings: [] });
  assert.equal(s.passedGeometryHash, G2);

  // resolved 后重新标 unresolved：该项重新进入未关闭集合
  let t = base();
  t = S.issueRequest(t, { requestId: 'r1', inputHash: H(1) });
  t = S.acceptResponse(t, { taskId: 'task-1', requestId: 'r1', inputHash: H(1), verdict: 'issues', findings: [blocker], dispositions: [] });
  t = S.issueRequest(t, { requestId: 'r2', inputHash: H(2) });
  t = S.acceptResponse(t, { taskId: 'task-1', requestId: 'r2', inputHash: H(2), verdict: 'pass', findings: [], dispositions: [{ id: 'F1', status: 'resolved', basis: '已补' }] });
  assert.equal(S.openBlocking(t).length, 0);
  t = S.issueRequest(t, { requestId: 'r3', inputHash: H(3) });
  t = S.acceptResponse(t, { taskId: 'task-1', requestId: 'r3', inputHash: H(3), verdict: 'issues', findings: [], dispositions: [{ id: 'F1', status: 'unresolved', basis: '改动把它弄回去了' }] });
  assert.equal(t.status, 'active');
  assert.equal(S.openBlocking(t).length, 1, '标回 unresolved 必须重新打开该项');
});
