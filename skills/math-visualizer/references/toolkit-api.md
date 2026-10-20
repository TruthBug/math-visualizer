# 本地可视化工具 API

加载 `assets/mathviz.js` 后使用全局 `MathViz`；Node 中可 `require` 同一文件。无网络、无构建步骤。样式文件为 `assets/classroom.css`。

```js
const p = MathViz.createPlot({xMin:-2,xMax:6,yMin:-2,yMax:7,title:'配方与顶点'});
p.axes({step:1});
p.curve(x=>(x-2)**2-1);
p.point([2,-1]).label([2,-1],'顶点 (2, −1)');
document.querySelector('.visual').innerHTML = p.svg();
```

只在应揭示顶点的步骤调用对应 `point/label`。`svg()` 返回完整 SVG 字符串；每次状态变化创建新图。对讲义中受信任的内部绘图代码开放 SVG 属性，禁止把用户给定的属性名、事件属性或 URL 直接传入 `style`。

## 绘图

`createPlot({width=680,height=470,xMin=-5,xMax=5,yMin=-3,yMax=4,padding=38,title})` 保持 x/y 等比例；范围较短的一侧留白，不拉伸图像。`scale` 为每数学单位对应的 SVG 单位；`map([x,y])` 返回屏幕坐标；`inside([x,y])` 判断是否在数学视窗中。

方法均返回同一 plot，可链式调用：

- `axes({step=1,grid=true})`：网格、刻度、x/y 和原点 O（轴在视野内时）；刻度默认 20。轴标签使用固定小偏移，拥挤时省略并记录，不能挪到其他刻度。O、x/y 优先于刻度放置。
- `curve(fn,{segments=[[xMin,xMax]],domain=x=>true,samples=400,maxJump=height,...style})`：逐个闭区间独立采样。每个 segment 必须有有限且递增的两端；`domain` 返回 false 或函数返回非有限值时断开；大跳跃断开。
- `line(a,b,style)`、`arrow(a,b,style)`：数学坐标端点。
- `point(p,{r=5,...style})`：半径为 SVG 单位。
- `circle(center,r,style)`：半径为数学单位。
- `polygon(points,style)`：至少三个数学坐标点。
- `label(p,text,{fontSize=22,dx=12,dy=-12,fixed=false,id=null,importance='supporting',...style})`：尝试六个位置，钳制在画布内；`fixed:true` 只尝试指定偏移，拥挤时省略，适合刻度等位置具有数学语义的标签。无法避让时省略并记录在 `collisions`。标签边缘离锚点超过 24 个 SVG 单位时自动加引导线。已放置标签矩形及 `point/fixed/leader` 元数据在 `labels`。关键标签应先于普通刻度放置；每幅图必须检查 `collisions`，不能让核心结论被省略。极长文字应放图旁正文。
  - `id`：该图内稳定、唯一的对象标识（如 `boundary.left`、`locus.minus`）；不用中文标签文本充当 ID，重复 ID 会抛错。
  - `importance`：`essential`（必要身份：正文/结论引用它）/ `supporting`（默认，辅助）/ `decorative`（普通刻度等装饰信息）。不自动认定所有文字都必要。
  - `labelEvidence`：每次 `label` 调用产生一条 `{id, text, importance, anchor, status, reason}`，`status` 为 `rendered`/`omitted`。这是审校与验收消费的事实依据：断言基于实际输出，不以调用成功推断可见。必要标签放不下时会被记录为 omitted，不会静默丢失、挪动数学对象或缩成小字。
  - `svg()` 输出的 `<metadata data-mathviz-label-evidence="…">` 以转义 JSON 带出同一份证据（非显示元素），供只拿到 SVG 字符串的路径读取；重复调用 `svg()` 不重复追加。metadata 不进学生可见内容。`id`/`importance` 不下传为 SVG 属性。
  - 本轮不做全局最优避让：作者可优先绘制必要标识、用候选位置/引线，或改用图例、分步等表达。
- `svg()`：输出字符串，几何裁切在数学视窗内，标签位于裁切层外。

`style` 使用 SVG 属性名，如 `{stroke:'#b65410','stroke-dasharray':'7 5','stroke-width':3}`。函数绘图不是符号连续性判定器：已知渐近线必须明确拆分，例如 `segments:[[-4,-0.03],[0.03,4]]` 画 `1/x`。不能依靠有限采样找出所有断点、孤立点或极值；孤立点单独画 `point`。`maxJump` 只是额外防护，不能代替定义域分析。

## 空间与数值

- `project3([x,y,z],{azimuth=Math.PI/4,elevation=Math.PI/6})`：正交投影到二维数学坐标；角参数为弧度。隐藏边需要作者按几何关系选择虚线，工具不做消隐。投影不保角、不保所有长度；真实角度、距离由原始三维数据计算，标注“投影示意”。
- `vector.dot(a,b)`、`vector.cross(a,b)`（三维）、`vector.norm(a)`。
- `fraction(n,d=1)`：仅接收安全整数，返回约分后的 `{n,d,text,value}`；`text` 是精确有理数，`value` 是浮点近似。不得把任意小数输入自动宣称为精确分数。
- `approximate(value,digits=3)`：返回包含 `≈` 的字符串。根式等精确表达由题目推导给出；工具不执行符号代数。

## 课堂布局

使用 `main > header + .problem + .stage`；`.stage` 内含 `.visual` 和 `.explanation`，关键式放 `.formula`，提示放 `.note`，按钮放 `nav` 或 `.controls`。默认目标是 1366×768 投屏、单题单步讲解，默认正文字号 20px、关键公式 26px 起——判断依据是"必须共同查看的信息是否在同一视野"：需要同时观察比较的图、式、结论应并置；可以按顺序阅读的内容允许滚动，长内容优先拆步。不得靠缩小字号、删去理由或隐藏正文换取同屏。图内字体需检查 SVG 缩放后的实际大小。移动设备自动改单栏，窄屏另行检查可读性。

在本 Skill 根目录验证：`node --test scripts/toolkit.test.cjs`。项目根目录可运行 `node --test tests/toolkit.test.cjs` 包装入口；测试正文随 Skill 分发。
