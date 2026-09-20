# Math Visualizer · 数学单题可视化

给 AI Agent 使用的数学讲解 Skill。输入一道题或一个教学目标，先解题并判断学生需要看清的关系，再选择纯文字、静态图或教师可控制的交互课件。需要页面时，生成可离线打开的单文件 HTML。

## 能做什么

- 按理解顺序组织中文讲解，让图形、公式与当前参数保持一致。
- 用已有模块生成二次函数、圆线关系等课件，也可组合 SVG 工具处理其他题目。
- 支持分步推进、参数调节、关键位置、恢复参数、重新讲解和键盘操作。
- 在正式导出前执行独立教学审校，之后检查实际页面的数学、视觉和交互表现。
- 简短解答足够时直接给出文字，不强制生成图形或动画。

## 安装与使用

将 [skills/math-visualizer](skills/math-visualizer) 整个目录复制到所用 Agent 的 Skill 目录。入口是 [SKILL.md](skills/math-visualizer/SKILL.md)，`agents/openai.yaml` 提供界面名称和默认提示词。支持 Skill 的环境应加载该目录；其他环境可明确要求 Agent 读取入口文件并遵循其中流程。

例如：

> 使用 math-visualizer 讲解 y=−(x+2)²+3 与 y=k 的交点个数。学生已学过二次函数，请说明为什么有零个、一个或两个交点。

修改已有课件时，说明具体教学问题：

> 学生来回拖动时记不住前一个状态。请把两个代表状态并排保留，解释它们的共同点，保留最后的一般证明。

运行环境：Node.js 22 或更新版本；Python 3.10 或更新版本用于打包及包检查。运行时和构建工具仅使用标准库，无须 `npm install`。数学核验工具按题目需要选用。完整生成流程需要 Agent 具备文件操作、独立上下文审校及浏览器检查能力；仓库不包含模型服务或凭据。

## 快速生成预览

以下命令从仓库根目录运行：

```sh
node skills/math-visualizer/scripts/list_capabilities.cjs
node skills/math-visualizer/scripts/build_lesson.cjs --preview skills/math-visualizer/assets/configs/quadratic-level.json output/preview.html
python skills/math-visualizer/scripts/check_package.py
```

用浏览器打开 `output/preview.html`。预览带有明确的未审校标记，不能作为正式交付。示例配置未附带历史审校记录；复制、修改并完成当前任务的独立审校后，才能省略 `--preview` 正式构建。完整命令见[审校与导出](skills/math-visualizer/references/teaching-review.md)。

已有模块不能覆盖的任务，可以组合低层绘图工具；这条路径仍需独立审校和浏览器检查，`bundle.py` 本身不执行自动审校门禁。

## 使用文档

- [配置示例](skills/math-visualizer/references/examples.md)：模型、讲解目的与预览方法。
- [复用与配置契约](skills/math-visualizer/references/reuse-and-extension.md)：模块、图层、参数与扩展边界。
- [绘图 API](skills/math-visualizer/references/toolkit-api.md)：SVG、坐标、标签和步骤壳。
- [课件验收](skills/math-visualizer/references/validation.md)：检查必要信息、边界和实际操作。
- [架构](docs/architecture.md)：文件职责及构建流程。

默认面向教师备课与课堂演示，不包含账户、云端课程管理或学生端。模型审校通过不等于学生已经理解；复杂三维和第三方公式库须另外集成并验证离线资源。

## 许可

项目原创代码与文档采用 [MIT](LICENSE)。圆线关系配置中的第三方试题材料保留其原有来源和许可，不受本项目 MIT 授权替代，见[来源说明](skills/math-visualizer/assets/examples/SOURCES.md)。
