#!/usr/bin/env node
'use strict';
/* 审校任务周期：纯状态转移，不写磁盘、不调用模型。CLI（teaching_review.cjs）负责 I/O。
 *
 * 一个周期 = 一次任务（taskId 由任务执行者在任务开始时固定；改文案、改输出文件名都不换 ID）。
 * 预算：初审 1 次 + 定向复审最多 3 次；零阻止项即通过，不追加确认轮。
 * 状态：active（进行中）/ passed（当前输入已通过）/ exhausted（预算耗尽仍有阻止项）/ incomplete（调用失败或输出无效）。
 */
const SCHEMA_VERSION = 2;
const MAX_RECHECKS = 3;
const MAX_FAILURES_PER_REQUEST = 2; // 同一请求最多初次尝试 + 1 次重试

class SessionError extends Error {
  constructor(code, message) { super(`[${code}] ${message}`); this.name = 'SessionError'; this.code = code; }
}

const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
function assertTaskId(taskId) {
  if (typeof taskId !== 'string' || !TASK_ID_RE.test(taskId) || taskId.includes('..'))
    throw new SessionError('E_TASK_ID', `taskId 必须是可安全用作文件名片段的标识：${JSON.stringify(taskId)}`);
}
function assertHash(h, name) {
  if (typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h)) throw new SessionError('E_VALIDATION', `${name} 必须是 64 位十六进制 SHA256`);
}
const clone = s => structuredClone(s);
const now = () => new Date().toISOString();

/* 当前仍未关闭的阻止项：本周期 reviews 里的，加上从上一周期承接的（carriedBlocking）。
   处置以最近一次 dispositions 为准：resolved 后可被后来标回 unresolved（重新打开）。 */
function openBlocking(session) {
  const status = new Map(); // findingId -> 'resolved' | 'unresolved'
  for (const review of session.reviews) for (const d of review.dispositions || []) status.set(d.id, d.status);
  const open = [];
  for (const c of session.carriedBlocking || []) if (status.get(c.id) !== 'resolved') open.push({ ...c, carried: true });
  for (const review of session.reviews) for (const f of review.findings || []) if (f.blocking && status.get(f.id) !== 'resolved') open.push(f);
  return open;
}

function startSession({ taskId, targetId, scope, scopeRef, previousSession }) {
  assertTaskId(taskId);
  if (typeof targetId !== 'string' || !targetId.trim()) throw new SessionError('E_VALIDATION', 'targetId 不能为空');
  if (typeof scope !== 'string' || !scope.trim()) throw new SessionError('E_SCOPE', 'scope 不能为空：写清本次任务的目标与验收范围');
  if (typeof scopeRef !== 'string' || !scopeRef.trim()) throw new SessionError('E_SCOPE', 'scopeRef 不能为空：指向本次任务记录文件或对话来源');
  const carried = [];
  if (previousSession !== undefined) {
    if (!previousSession || typeof previousSession.taskId !== 'string') throw new SessionError('E_VALIDATION', 'previousSession 需要 taskId');
    let seq = 0;
    /* 承接项必须重新编号：本周期自身从 F1 起编号，沿用旧 id 会与新发现撞号，
       使"只处置本周期项"的 dispositions 意外匹配承接项。originalId 保留供追溯。 */
    for (const f of previousSession.carried || []) carried.push({ ...f, originalId: f.id || null, id: `C${++seq}`, carriedFrom: previousSession.taskId, resolved: false });
  }
  return {
    schemaVersion: SCHEMA_VERSION, taskId, targetId, scope, scopeRef,
    status: 'active', createdAt: now(),
    initialCompleted: false, rechecksCompleted: 0,
    activeRequest: null, passedInputHash: null, passedGeometryHash: null,
    carriedBlocking: carried,
    attempts: [], reviews: [], nextFindingSeq: 1,
  };
}

/* 发起一次审校请求（打包）。同一时刻最多一个在途请求。geometryHash 是可选的几何指纹（见 CLI），
   随请求固定，通过后写进周期，供门禁在内容指纹之外核对几何未变。 */
function issueRequest(session, { requestId, inputHash, packetPath, toolFix, geometryHash }) {
  assertHash(inputHash, 'inputHash');
  if (geometryHash !== undefined) assertHash(geometryHash, 'geometryHash');
  if (typeof requestId !== 'string' || !requestId.trim()) throw new SessionError('E_VALIDATION', 'requestId 不能为空');
  const s = clone(session);
  if (s.reviews.some(r => r.requestId === requestId) || s.attempts.some(a => a.requestId === requestId))
    throw new SessionError('E_VALIDATION', `requestId 已使用：${requestId}`);
  if (s.status === 'passed') {
    const sameContent = s.passedInputHash === inputHash;
    const sameGeometry = (s.passedGeometryHash || null) === (geometryHash || null);
    if (sameContent && sameGeometry) throw new SessionError('E_STATE', '审校已通过且输入未变：结束审校，不再启动确认性复审。');
    // 通过后内容或几何发生变化：在原周期内用剩余复审预算做定向复审
  }
  if (s.status === 'exhausted') throw new SessionError('E_BUDGET', '复审已达 3 次上限仍有阻止项：本周期已停止，不得改名重开。');
  if (s.activeRequest) throw new SessionError('E_STATE', `存在在途请求 ${s.activeRequest.requestId}：先接收响应或记录失败。`);
  if (s.status === 'incomplete') {
    if (typeof toolFix !== 'string' || !toolFix.trim())
      throw new SessionError('E_STATE', '上次请求以失败告终（incomplete）：重发同一输入必须用 toolFix 记录具体的工具修复。');
    s.attempts.push({ type: 'tool-fix', at: now(), detail: toolFix });
    s.status = 'active';
  }
  if (s.initialCompleted && s.rechecksCompleted >= MAX_RECHECKS) {
    s.status = 'exhausted';
    throw new SessionError('E_BUDGET', '复审已达 3 次上限：停止该目标导出，保存剩余问题；不得通过改文案或重试重置轮次。');
  }
  s.activeRequest = { requestId, inputHash, packetPath: packetPath || null, geometryHash: geometryHash || null, at: now(), failures: 0, recheck: s.initialCompleted };
  s.attempts.push({ type: 'issue', requestId, at: s.activeRequest.at, inputHash });
  return s;
}

/* 接收并校验响应归属与处置完整性，然后记账。结构字段校验（step/field/type 等）由 CLI 先做。 */
function acceptResponse(session, { taskId, requestId, inputHash, verdict, findings, dispositions, model, method }) {
  const s = clone(session);
  if (taskId !== s.taskId) throw new SessionError('E_BINDING', `响应 taskId 与本周期不符：${JSON.stringify(taskId)}`);
  if (!s.activeRequest) {
    if (s.reviews.some(r => r.requestId === requestId))
      throw new SessionError('E_BINDING', `请求 ${requestId} 的响应已接收过：重复消费不再计数、不覆盖状态。`);
    throw new SessionError('E_BINDING', '当前没有在途请求：这份响应不属于本周期。');
  }
  if (requestId !== s.activeRequest.requestId)
    throw new SessionError('E_BINDING', `响应 requestId 与在途请求不符：期望 ${s.activeRequest.requestId}，收到 ${JSON.stringify(requestId)}`);
  if (inputHash !== s.activeRequest.inputHash)
    throw new SessionError('E_BINDING', '响应回传的 inputHash 与请求包不一致：拒收，不按新哈希重新盖章。');
  if (!['pass', 'issues'].includes(verdict)) throw new SessionError('E_VALIDATION', 'verdict 必须是 pass|issues');
  const list = Array.isArray(findings) ? findings : [];
  const blocking = list.filter(f => f.blocking);
  if (verdict === 'pass' && blocking.length) throw new SessionError('E_VALIDATION', 'verdict=pass 与阻止项并存，响应自相矛盾');
  const isRecheck = s.activeRequest.recheck;
  const open = openBlocking(s);
  const disp = dispositions === undefined ? [] : dispositions;
  if (!Array.isArray(disp)) throw new SessionError('E_VALIDATION', 'dispositions 必须是数组');
  if (open.length) {
    const byId = new Map(disp.map(d => [d.id, d]));
    for (const f of open) {
      const d = byId.get(f.id);
      if (!d) throw new SessionError('E_VALIDATION', `复审必须逐项处置原阻止项：缺少 ${f.id} 的 resolved/unresolved 及依据`);
      if (!['resolved', 'unresolved'].includes(d.status)) throw new SessionError('E_VALIDATION', `disposition ${f.id} 的 status 必须是 resolved|unresolved`);
      if (typeof d.basis !== 'string' || !d.basis.trim()) throw new SessionError('E_VALIDATION', `disposition ${f.id} 必须给出非空依据`);
    }
    if (verdict === 'pass' && disp.some(d => d.status === 'unresolved'))
      throw new SessionError('E_VALIDATION', 'verdict=pass 但仍有原阻止项标为 unresolved，自相矛盾');
  }
  if (isRecheck) {
    for (const f of blocking) {
      if (!['change', 'missed'].includes(f.origin))
        throw new SessionError('E_VALIDATION', '复审新增的阻止项必须标注 origin：change（本次改动引入）或 missed（旧内容漏检）');
    }
  }
  // 记账：分配稳定 ID、应用处置、推进状态
  const stamped = list.map(f => ({ ...f, id: `F${s.nextFindingSeq++}`, resolved: false }));
  if (open.length) {
    const byId = new Map(disp.map(d => [d.id, d]));
    for (const review of s.reviews) for (const f of review.findings) {
      const d = byId.get(f.id);
      if (d) f.resolved = d.status === 'resolved'; // 以最近一次处置为准，支持重新打开
    }
    for (const c of s.carriedBlocking) {
      const d = byId.get(c.id);
      if (d) c.resolved = d.status === 'resolved';
    }
  }
  const review = {
    requestId, inputHash, geometryHash: s.activeRequest.geometryHash || null, at: now(), verdict,
    packetPath: s.activeRequest.packetPath,
    model: model || '未记录', method: method || '未记录',
    findings: stamped, dispositions: disp,
  };
  s.reviews.push(review);
  s.attempts.push({ type: 'accept', requestId, at: review.at, detail: `verdict=${verdict}，发现 ${stamped.length} 条（阻止 ${blocking.length} 条）` });
  s.activeRequest = null;
  if (!s.initialCompleted) s.initialCompleted = true;
  else s.rechecksCompleted += 1;
  /* 关闭条件：本轮无新增阻止项，且本周期与承接的全部阻止项都已处置为 resolved。
     承接项未处置就算本轮 findings 为空也不能通过——这是跨周期重开的主要防线。 */
  const stillBlocked = blocking.length > 0
    || disp.some(d => d.status === 'unresolved')
    || openBlocking(s).length > 0;
  if (!stillBlocked) { s.status = 'passed'; s.passedInputHash = inputHash; s.passedGeometryHash = review.geometryHash; }
  else { s.status = s.rechecksCompleted >= MAX_RECHECKS ? 'exhausted' : 'active'; s.passedGeometryHash = null; }
  return s;
}

/* 调用失败 / 超时 / 输出不合约：记录失败。同一请求最多 2 次尝试，之后记 incomplete（保留预算与原问题）。 */
function recordFailure(session, { requestId, reason }) {
  const s = clone(session);
  if (!s.activeRequest) throw new SessionError('E_STATE', '没有在途请求，无法记录失败。');
  if (requestId !== undefined && requestId !== s.activeRequest.requestId)
    throw new SessionError('E_BINDING', `失败记录的 requestId 与在途请求不符：期望 ${s.activeRequest.requestId}`);
  if (typeof reason !== 'string' || !reason.trim()) throw new SessionError('E_VALIDATION', '失败原因不能为空');
  s.activeRequest.failures += 1;
  s.attempts.push({ type: 'failure', requestId: s.activeRequest.requestId, at: now(), detail: reason });
  if (s.activeRequest.failures >= MAX_FAILURES_PER_REQUEST) {
    s.activeRequest = null;
    s.status = 'incomplete'; // 预算、历史与原问题全部保留；修复工具后可带 toolFix 重发
  }
  return s;
}

/* 取消在途请求：仅在打包后源内容已变化时使用（旧请求针对旧内容，不应再接收响应）。
   不消耗预算、不影响历史；必须有非空理由。 */
function cancelRequest(session, { reason }) {
  const s = clone(session);
  if (!s.activeRequest) throw new SessionError('E_STATE', '没有在途请求可取消。');
  if (typeof reason !== 'string' || !reason.trim()) throw new SessionError('E_VALIDATION', '取消理由不能为空');
  s.attempts.push({ type: 'cancel', requestId: s.activeRequest.requestId, at: now(), detail: reason });
  s.activeRequest = null;
  return s;
}

module.exports = {
  SCHEMA_VERSION, MAX_RECHECKS, MAX_FAILURES_PER_REQUEST, SessionError,
  startSession, issueRequest, acceptResponse, recordFailure, cancelRequest, openBlocking,
};
