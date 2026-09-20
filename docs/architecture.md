# 架构

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `skills/math-visualizer/SKILL.md` 与 `references/` | 解题、教学表示、实现选择、独立审校与验收流程 |
| `assets/mathviz.js` | SVG、坐标变换、标签放置和基础几何工具 |
| `assets/modules.js` | 模型校验、数学派生、图层与模块渲染契约 |
| `assets/player.js` | 配置课件的步骤、参数、拖动和键盘操作 |
| `assets/classroom.css` | 课堂页面样式 |
| `assets/lesson.js` | 兼容用的脚本步骤壳，不再新增能力 |
| `scripts/lesson_source.cjs` | 配置读取、共享模型解析和预检 |
| `scripts/build_lesson.cjs` | 审校门禁检查与单文件 HTML 构建 |
| `scripts/teaching_review.cjs`、`review_session.cjs`、`review_view.cjs` | 审校命令、状态机、输入绑定和审查稿生成 |
| `scripts/bundle.py` | 嵌入显式标记的本地样式和脚本 |
| `scripts/check_package.py` | 文档链接与 HTML 资源依赖检查 |

除首行外，路径相对 Skill 目录。配置只包含 JSON 数据，不执行题目表达式；数学派生不访问 DOM，图形和动态文字使用同一次派生结果。

## 生成流程

解题与必要核验 → 教学表示选择 → 讲稿与关键图文试作 → 独立审校 → 正式构建 → 浏览器验收。

已有模块覆盖教学需要时使用配置。已有低层工具可以表达时，可在课件内组合；具有跨任务用途的能力缺口才扩展共享模块。

配置正式构建默认检查当前输入的审校状态。预览必须显式传 `--preview`，带未审校标记且不能写入受保护的正式目录。使用 `--formal-root` 可追加自己的正式交付目录。

审校记录在配置旁的 `reviews/` 目录生成，绑定当前输入；历史通过不会自动授权已修改的讲稿。内容和几何指纹覆盖审校包中的文字、对象及标签位置，不能替代实际页面的样式、布局和交互验收。详见[审校协议](../skills/math-visualizer/references/teaching-review.md)。

低层 HTML 组合使用 `bundle.py` 打包，不经过配置自动门禁。调用方需保留独立审校和产物同源依据，并检查最终 HTML。

## 离线与依赖

配置构建将样式、脚本和解析后的模型内嵌到 HTML。课件播放不需要服务器；构建工具使用 Node.js/Python 标准库。外部库只有在实际需要时引入，须固定版本、本地打包并保留许可。
