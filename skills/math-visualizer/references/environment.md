# 环境与分发

## 运行要求

| 使用方式 | 依赖 |
| --- | --- |
| 打开已生成的离线 HTML | 支持 JavaScript、SVG 的现代浏览器；不需要 Node、Python、联网或本地服务 |
| 列能力、配置构建、审校状态机 | Node.js 22+；只用内置模块，不需要 `npm install` |
| `bundle.py`、`check_package.py` | Python 3.10+ 标准库；不需要 pip 包 |
| 正式教学审校、浏览器验收 | 宿主 Agent 的独立 LLM 上下文及浏览器操作能力；缺少时如实报告，不伪造通过 |
| 宿主仓库数学测试 | 另需仓库声明的 SymPy；不是本 Skill 的运行依赖 |

环境声明使用 [Agent Skills specification](https://agentskills.io/specification) 的 `compatibility` 字段；Node 版本同时在 Skill 的 `package.json` 的 `engines` 中声明。目标系统为 Windows、macOS、Linux；CI 配置和某次本地测试不等于所有系统已经实测通过。

## 安装与自检

完整复制 `math-visualizer/` 目录到宿主支持的 Skill 目录，保留 `SKILL.md`、`package.json`、`scripts/`、`references/`、`assets/`。不需要原作者的仓库、用户名、盘符或某个 Agent 产品的私有运行时。不要包含 `.venv/`、`node_modules/`、缓存或凭据。更新时保留用户项目里的讲稿和审校记录，不拿示例审校记录覆盖用户记录。

进入安装后的 Skill 根目录执行（PowerShell、bash、zsh 均可；路径含空格时加引号）：

```text
node --version
node scripts/list_capabilities.cjs
npm test
npm run check:package
```

`npm test` 只运行随 Skill 分发的 Node 测试；`check:package` 另需 Python。不安装 Python 也可用 Node 配置路径生成页面。`check_package.py` 只检查结构与资源引用，不代替浏览器验收。历史案例快照滞后于当前资产会给出警告，不自动改写快照。

随包 `assets/configs/` 中的审校记录使用稳定来源标识，整体搬移 Skill 或更换工作目录不会使未改内容误判过期；修改讲稿或图文仍会阻止正式生成。把配置另存到用户项目后属于新的来源，需要按该项目的审校周期处理，不能靠复制旧记录冒用通过状态。

Python 统一入口：

```text
node scripts/run_python.cjs --version
node scripts/run_python.cjs scripts/check_package.py
node scripts/run_python.cjs scripts/bundle.py "输入源文件.html" "输出课件.html"
```

解释器选择顺序为 `MATHVIZ_PYTHON` 指定的可执行文件、已激活的 `VIRTUAL_ENV`、当前工作目录的 `.venv`，然后依次尝试 PATH 中的 `python`、`python3`、Windows 的 `py -3`。每次校验 Python 版本；显式选择或已有虚拟环境不可用时直接报错，不悄悄切换到另一个环境。`MATHVIZ_PYTHON` 只填可执行文件路径，不含额外参数或包裹引号。子进程强制使用 UTF-8，并原样返回脚本失败码。

## 文件路径与换机

文档示例默认从 Skill 根目录执行；也可以在用户工作目录使用脚本的绝对路径。用户输入路径相对当前工作目录，Skill 自带资产相对脚本定位。命令示例使用单行，避免依赖 bash 的反斜杠续行或 PowerShell 的反引号续行。

跨系统同步源文件时保留文件名大小写，使用 UTF-8 和 LF；不要复制虚拟环境，按目标机器重建。[Python venv 文档](https://docs.python.org/3/library/venv.html)说明了虚拟环境不可直接搬迁。浏览器字体与换行可能不同，交付到另一系统时检查必要文字、图形和按钮。

新课件将配置复制到用户项目后再开始审校。审校中的 `source-root`、源文件相对路径和工作目录应保持一致；搬迁历史审校项目后先执行 `gate`，失败时保留记录、按审校协议处理，不能删记录或绕过门禁来“修复兼容性”。配套案例的历史记录是证据，不保证脱离原生成仓库后仍可直接重新正式导出。
