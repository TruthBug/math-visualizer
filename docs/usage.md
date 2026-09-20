# 环境与手动构建

安装时将仓库中的 `skills/math-visualizer` 整个目录放入所用 Agent 的 Skill 目录，入口是其中的 `SKILL.md`。

运行环境：Node.js 22 或更新版本；Python 3.10 或更新版本用于打包及包检查。运行时和构建工具仅使用标准库，无须 `npm install`。数学核验工具按题目需要选用。完整生成流程需要 Agent 具备文件操作、独立上下文审校及浏览器检查能力；仓库不包含模型服务或凭据。

## 快速生成预览

以下命令从仓库根目录运行：

```sh
node skills/math-visualizer/scripts/list_capabilities.cjs
node skills/math-visualizer/scripts/build_lesson.cjs --preview skills/math-visualizer/assets/configs/quadratic-level.json output/preview.html
python skills/math-visualizer/scripts/check_package.py
```

用浏览器打开 `output/preview.html`。预览带有明确的未审校标记，不能作为正式交付。示例配置未附带历史审校记录；复制、修改并完成当前任务的独立审校后，才能省略 `--preview` 正式构建。完整命令见[审校与导出](../skills/math-visualizer/references/teaching-review.md)。

已有模块不能覆盖的任务，可以组合低层绘图工具；这条路径仍需独立审校和浏览器检查，`bundle.py` 本身不执行自动审校门禁。
