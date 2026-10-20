# 函数图像模块 function-graph

函数图像题（含参曲线、分段函数、切线、交点或零点个数、极值点）用这个模块：**只写 JSON，不写 JS**。

## 最快的做法

1. 从 `assets/configs/templates/` 里复制最接近的一份，改题目、表达式和讲稿：
   - `param-zero-count.json`：参变分离，数方程解（交点）的个数；
   - `tangent-through-origin.json`：动点切线，过定点求切线；
   - `piecewise-monotone.json`：分段函数单调，段内 + 跨段。
   完整例子：`assets/configs/gaokao-2022-q10.json`（极值、零点、对称、切线）、`assets/configs/gaokao-2024-q6.json`（含参分段函数）。
2. 运行 `node scripts/build_lesson.cjs --check 你的配置.json`。报错是中文，照着提示改，直到通过。
3. 运行 `node scripts/build_lesson.cjs --inspect 你的配置.json`：一次列出每一步在初始值和每个停靠点下的正文、被省略的标签、被挤掉的刻度、图下提示，以及图文一致性提醒（lint）和“domain 之外还有交点”的提醒。**提醒全部处理完再进入审校**，可以少跑审校轮次。只想看图文一致性提醒时用 `--lint`。
4. 用 `--preview` 生成预览，再运行 `node scripts/screenshot.cjs 预览.html 截图目录`：调用本机 Chrome 或 Edge，按 1366×768 截完每一步和每个停靠点、按 1440×900 截每一步，并用文字报告横向溢出和图下提示。看截图核对标签、遮挡和同屏，然后按审校流程正式构建。

**不要自己另写**核验脚本、截图脚本或检查脚本：数学结论用 `keypoint` 和 `checks` 交给构建器核对；渲染状态用 `--inspect`；截图用 `screenshot.cjs`。

## model 的写法

```json
"model": {
  "param": "a",
  "objects": [
    { "id": "f", "type": "curve", "expr": "x^3-3*x", "domain": [[-3, 3]], "label": "y=f(x)" },
    { "id": "level", "type": "hline", "y": "a", "label": "y=a" },
    { "id": "cross", "type": "intersections", "of": ["f", "level"] }
  ],
  "checks": [ { "at": 2, "expect": { "cross.count": 2 } } ]
}
```

- `param`：滑块参数名，1–3 个英文字母，不能是 `x`、`e`、`pi`，也不能和函数名（`sqrt`、`sin`、`ln` 等）重名。整个场景只有这一个参数。
- `objects`：图中对象，每个都要有唯一的 `id`（英文字母开头）。**步骤的 `layers` 直接写对象 id**，写了哪些就显示哪些。
- `checks`（可选，强烈建议写）：在指定参数值下核对结论，结论不符时构建失败。

## 表达式

- 可用：数字、`x`、参数名、`+ - * / ^`、括号、`pi`、`e`，以及 `sqrt` `cbrt` `abs` `exp` `ln` `lg` `sin` `cos` `tan` `log(底数, 真数)`。
- **乘号必须写**：`2*x`、`a*x`、`x*(x+1)`。写 `2x` 会报错。
- `-x^2` 表示 −(x²)；`2^3^2` 表示 2^(3²)。负数的立方根用 `cbrt(x)`，不要写 `x^(1/3)`。
- 无理数写精确式：`sqrt(3)/3`，不要写 `0.577`。

## 对象类型

| type | 必填字段 | 说明 | 可绑定字段 |
| --- | --- | --- | --- |
| `curve` | `expr`（含 x，可含参数）、`domain` | `domain` 是区间列表，如 `[[-3,3]]`；有竖直渐近线时拆开，如 `[[-4,-0.01],[0.01,4]]`；曲线向一侧贴近水平渐近线时（如 x·eˣ 在 x→−∞），这一侧要写宽，如 `[[-60,1.3]]`，否则远处的交点会被漏掉。`domain` 只决定交点搜索范围，画面范围由 `view` 决定 | — |
| `piecewise` | `pieces`：`[{expr, from, to, left, right}]` | 各段从左到右；`left`/`right` 取 `closed`（实心端点）、`open`（空心端点）、`none`（不画端点，默认）；同一分界点两侧不能都写 `closed` | — |
| `hline` | `y`（只含参数或常数） | 水平线；写 `"y": "a"` 时可在图上上下拖动 | — |
| `vline` | `x`（只含参数或常数） | 竖直虚线；写 `"x": "a"` 时可左右拖动 | — |
| `point` | `on`（curve/piecewise 的 id）、`x` | 曲线上的点；写 `"x": "a"` 时可左右拖动 | `id.x`、`id.y` |
| `tangent` | `of`、`at` | 在 x=at 处的切线（数值求导），两侧都要有定义 | `id.slope`、`id.x`、`id.y` |
| `intersections` | `of`：两个 id | 两对象的交点，只在曲线的 `domain` 内搜索；相切按 1 个计 | `id.count` |
| `keypoint` | `on`、`x`、`y`，可选 `kind` | 作者声明的关键点，构建时核验：点必须在曲线上；`kind` 为 `max`/`min` 时核验是极值，为 `zero` 时核验 y=0 | `id.x`、`id.y` |

通用可选字段：`label`（图中标签，可含 `{{字段}}`）、`labelAt`（曲线标签放在哪个 x 处）、`tone`（`main` 蓝、`accent` 橙、`relation` 青绿、`aux` 紫、`muted` 灰）、`dash`（虚线）。`keypoint` 可加 `open: true` 画空心点。

`optional: true`（point、tangent、keypoint 可用）：对象只在部分参数下存在（如只在 a>0 时才有的最高点），不存在时不画。它的字段不能写进正文，只能在它自己的 `label` 里用。

## 正文里的动态数值

`body`、`formula`、`question` 里写 `{{字段名}}`，字段名是参数名或上表中的可绑定字段，例如 `{{a}}`、`{{cross.count}}`、`{{tan.slope}}`。非整数会自动显示为 `≈ 1.385` 这样的近似值。还没讲到的结论不要提前绑定（例如第一步就写交点个数）。

## 核验到底保证什么

- `keypoint` 和 `checks` 用数值计算核对（相对误差 1e-6），能拦下抄错的极值、临界值和交点个数。
- 交点个数是数值求根的结果：只在 `domain` 内搜索；函数在跳跃点或渐近线处“穿过”直线不算交点；相切按 1 个计。两个根靠得非常近（小于采样步长的约百分之一）时，可能被当成一个切点。
- 构建时按滑块的 `step` 网格逐点试算（最多 2000 个点），某个参数值下对象没有定义（例如切点落在定义域的缺口里）会直接报错。网格之间的值由播放器兜底：图形无定义时保持原值并提示，不会卡死。会在部分参数下消失的对象请加 `optional: true`。
- 参数的临界值是无理数时，滑块按钮只能停在近似位置，交点个数按近似值算。**精确边界必须在讲稿里用代数说明**，不能用图代替证明。
