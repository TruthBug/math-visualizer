# 配套案例

先按理解障碍选择相近例子，打开实际页面与分析文件通读后再动手。案例全部为离线HTML，内含可读脚本；分析文件给出解题与教学判断。不要照搬题号、数值或答案。

| 来源与题号 | 学习障碍/表示 | 页面 | 分析 |
| --- | --- | --- | --- |
| 2022 第2题 | 复数与共轭；简短解答，无需绘图 | [打开](../assets/examples/2022-q2/index.html) | [解题与设计](../assets/examples/2022-q2/analysis.md) |
| 2022 第10题 | 极值、零点与切线；交互讲解 | [打开](../assets/examples/2022-q10/index.html) | [解题与设计](../assets/examples/2022-q10/analysis.md) |
| 2023 第13题 | 选课方案分类计数；静态分类表 | [打开](../assets/examples/2023-q13/index.html) | [解题与设计](../assets/examples/2023-q13/analysis.md) |
| 2023 第18题 | 二面角与垂直截面；交互讲解 | [打开](../assets/examples/2023-q18/index.html) | [解题与设计](../assets/examples/2023-q18/analysis.md) |
| 2024 第6题 | 分段函数在 R 上单调递增的条件；交互讲解 | [打开](../assets/examples/2024-q6/index.html) | [解题与设计](../assets/examples/2024-q6/analysis.md) |
| 2024 第19(1)题 | 等差数列的下标分组；交互讲解 | [打开](../assets/examples/2024-q19-1/index.html) | [解题与设计](../assets/examples/2024-q19-1/analysis.md) |
| 2025 第7题 | 圆上到已知直线距离为 1 的点；交互讲解（配置构建） | [打开](../assets/examples/2025-q7/index.html) | [解题与设计](../assets/examples/2025-q7/analysis.md) |
| 2025 第14题 | 出现过的球与期望；交互讲解 | [打开](../assets/examples/2025-q14/index.html) | [解题与设计](../assets/examples/2025-q14/analysis.md) |
| 2026 第1题 | 样本中位数；简短解答，无需绘图 | [打开](../assets/examples/2026-q1/index.html) | [解题与设计](../assets/examples/2026-q1/analysis.md) |
| 2026 第15题 | 空间中位线与线面距离；交互讲解 | [打开](../assets/examples/2026-q15/index.html) | [解题与设计](../assets/examples/2026-q15/analysis.md) |

输入缺失的门禁反例：[判定记录](../assets/examples/ambiguous-input/decision.md)。

案例构建路径：2025 第7题按配置路径构建（源：`assets/configs/gaokao-2025-q7.json`）；其余案例的现状与迁移状态见下面的迁移清单。

## 单一真源与同步

`tests/gaokao/` 是生成地，`assets/examples/` 是**分发快照**：只允许由 `tests/gaokao/finalize_package.py` 同步写入，**禁止手改**。先修改当前真源（配置案例改 `assets/configs/`；历史讲稿与手写页改 `tests/gaokao/`），完成当前源的独立教学审校，再正式构建；通过浏览器验收后同步，最后核验实际分发快照的内容、首屏、步骤与交互。同步脚本只复制文件，不替代审校或浏览器验收。

页面内嵌生成时的资产，`scripts/check_package.py` 对资产版本滞后发出警告而不阻止打包；这只是技术兼容策略，不是教学认可。讲稿少步骤、答案提前揭示等教学缺陷不能以“冻结快照”解释为合格。

定向维护可在仓库根目录运行 `node skills/math-visualizer/scripts/run_python.cjs tests/gaokao/build_cases.py --case 2024-q6 --case 2025-q7`，验收后再运行 `node skills/math-visualizer/scripts/run_python.cjs tests/gaokao/finalize_package.py --case 2024-q6 --case 2025-q7`。未选中的案例快照不改写；索引和画廊仍列出全部案例。空间手写页由各自真源构建，不由 `build_cases.py` 接管。

## 迁移清单：脚本壳 → 配置构建（本轮登记，不迁移）

路线已于 2026-09-19 收敛：配置路径（build_lesson + modules + player）是唯一演进路径，`lesson.js` 已冻结。历史脚本壳只作教学设计参考，不作为新课工程模板或当前工具行为的证据；当前配置样例是工程复用范本，但复用后仍须审校与验收。下表记录构建路径，不声明本轮审查全部通过；具体教学质量和验证范围见测试报告。

| 案例 | 现状 | 与配置路线的关系 |
| --- | --- | --- |
| 2025 第7题 | 配置构建 | 已完成，唯一按当前路线产出的案例，可作迁移范本 |
| 2022 第10题 | lesson.js 脚本壳 | 配置版已写成：`assets/configs/gaokao-2022-q10.json`（function-graph），未审校，快照未替换 |
| 2024 第6题 | lesson.js 脚本壳 | 配置版已写成：`assets/configs/gaokao-2024-q6.json`（function-graph），未审校，快照未替换 |
| 2024 第19(1)题 | lesson.js 脚本壳 | 待迁移 |
| 2025 第14题 | lesson.js 脚本壳 | 待迁移 |
| 2023 第18题 | 手写页 + MathViz 直用 | 待迁移；三维构型还没有对应模块 |
| 2026 第15题 | 手写页 + MathViz 直用 | 待迁移；三维构型还没有对应模块 |
| 2023 第13题 | 静态分类表 | 不涉及播放器，无需迁移 |
| 2022 第2题、2026 第1题 | none 决策页（纯解答） | 不涉及播放器 |

完整测试边界、失败修订与复测见 [测试报告](test-report.md)。

原二次函数案例的经验：答案揭示应同时约束标签、公式与caption；变式图文须同步；不可把近似系数当精确等式。这些规则已进入主流程，旧案例未被修改，也不作为可直接复用的合格模板。

试题来源与归属见 [来源说明](../assets/examples/SOURCES.md)。