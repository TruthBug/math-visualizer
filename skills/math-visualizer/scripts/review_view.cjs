'use strict';

/* 无损阅读投影：仅完全相同的 figure 共用引用；原始 packet 与哈希不变。 */
function project(packet) {
  const content = JSON.parse(JSON.stringify(packet));
  const figures = {}, seen = new Map();
  const groups = content.scenes || [content];
  for (const group of groups) for (const step of group.steps) {
    for (const branch of step.branches) {
      if (!branch.figure) continue;
      const key = JSON.stringify(branch.figure);
      let ref = seen.get(key);
      if (!ref) {
        ref = `G${seen.size + 1}`;
        seen.set(key, ref);
        figures[ref] = branch.figure;
      }
      delete branch.figure;
      branch.figureRef = ref;
    }
  }
  return { content, figures };
}

function markdown(packet) {
  const { content, figures } = project(packet);
  const lines = [
    '## 讲稿包（无损阅读版）',
    '正文与参数分支在下面逐项列出。`figureRef: G编号` 指向随后同编号的完整图形证据；引用相同才表示证据完全相同，不能把不同编号当作相同状态。每个引用都必须结合对应文字检查。',
    '图形证据仅减少缩进与完全相同的重复项，保留全部标签、坐标、importance、放置/省略记录及其他字段。没有过滤装饰项或舍入数值。原始完整 `.packet.json` 与本 brief 同名同目录，可用于追溯；响应 inputHash 仍绑定原始包。',
    '```json', JSON.stringify(content, null, 2), '```',
    '## 图形证据（按 figureRef 查阅）',
  ];
  for (const [id, figure] of Object.entries(figures)) {
    // 证据每项一行，避免缩成一条无法定位的超长行。
    const fields = Object.entries(figure).map(([key, value]) => {
      const encoded = key === 'labelEvidence' && Array.isArray(value)
        ? `[\n${value.map(item => '    ' + JSON.stringify(item)).join(',\n')}\n  ]`
        : JSON.stringify(value);
      return `  ${JSON.stringify(key)}: ${encoded}`;
    });
    lines.push(`### ${id}`, '```json', `{\n${fields.join(',\n')}\n}`, '```');
  }
  return lines.join('\n');
}
module.exports = { project, markdown };
