# 配置示例

示例用于学习模型、图层、讲解步骤和控件声明。选择接近当前理解障碍的一份配置，不照搬题目条件或结论。配置不附历史审校记录，正式交付前须针对当前任务核验并独立审校。

| 配置 | 教学用途 |
| --- | --- |
| [quadratic-level.json](../assets/configs/quadratic-level.json) | 二次函数与水平直线的交点；支持画布拖动与键盘操作 |
| [gaokao-2025-q7.json](../assets/configs/gaokao-2025-q7.json) | 圆上到已知直线等距的点；配置构建示例 |
| [circle-concept.json](../assets/configs/circle-concept.json) | 从垂足和辅助三角形解释圆线交点判据，最后撤图检查理解 |
| [circle-worked-example.json](../assets/configs/circle-worked-example.json) | 从原题条件推导两条轨迹，计算垂距并给出完整结论 |
| [circle-2025-model.json](../assets/configs/circle-2025-model.json) | 上述概念课与原题课共享的数学参数，不能单独构建为课件 |

从 Skill 目录生成预览：

```sh
node scripts/build_lesson.cjs --preview assets/configs/quadratic-level.json output/preview.html
```

保持 `modelRef` 指向的参数文件与配置的相对位置。输出为单文件 HTML，浏览器直接打开即可。修改已有示例时保留源 JSON，数学、讲稿和图形同步调整；不要直接改生成页中的内嵌脚本。

预览不表示通过审校。正式导出流程见[独立教学审校](teaching-review.md)，圆题的材料来源见[来源与许可](../assets/examples/SOURCES.md)。
