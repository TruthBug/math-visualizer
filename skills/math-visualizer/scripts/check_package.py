"""Check skill references and portable HTML resource dependencies, not pedagogy.

只在 errors 非空时以非零码退出；可选示例 HTML 内嵌资产的版本差异仅作为警告。
"""
import re
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
errors = []
warnings = []
for page in root.rglob('*.md'):
    for target in re.findall(r'\]\(([^)]+)\)', page.read_text(encoding='utf-8-sig')):
        if '://' in target or target.startswith('#'):
            continue
        if not (page.parent / target.split('#')[0]).exists():
            errors.append(f'{page.relative_to(root)}: missing {target}')
for page in root.rglob('*.html'):
    if page.name.endswith('.source.html'):
        continue
    text = page.read_text(encoding='utf-8-sig')
    if re.search(r'<script\b[^>]*\bsrc\s*=', text, re.I):
        errors.append(f'{page.relative_to(root)}: external code/style dependency')
    if re.search(r'<link\b[^>]*\bhref\s*=\s*["\x27](?!data:)', text, re.I):
        errors.append(f'{page.relative_to(root)}: external code/style dependency')
    if re.search(r'<(?:img|audio|video|iframe|source)\b[^>]*(?:src|srcset)\s*=[\"\x27](?!data:)', text, re.I):
        errors.append(f'{page.relative_to(root)}: non-embedded media dependency')
    if re.search(r'@import\b|url\s*\((?![\"\x27]?(?:data:|#))|\bimport\s*\(', text, re.I):
        errors.append(f'{page.relative_to(root)}: dependency requires manual inspection')

# 可选示例页内嵌的是构建时的资产；与当前资产不同仅作警告。
# 探针只用来判断"本页确实内嵌了该资产"，命中探针但找不到当前全文即视为滞后；命中不了就不报（不臆测）。
SNAPSHOT_ASSETS = {
    'classroom.css': r'\.range-wrap\b',
    'lesson.js': r'统一课堂壳的步骤播放器',
    'mathviz.js': r'\bMathViz\b',
    'modules.js': r'\bMathModules\b',
    'player.js': r"""getElementById\(\s*['"]lesson-data['"]\s*\)""",
}


def normalize(text):
    return text.replace('\r\n', '\n').replace('\r', '\n').lstrip('\ufeff').strip()


examples = root / 'assets' / 'examples'
current = {name: normalize((root / 'assets' / name).read_text(encoding='utf-8-sig')) for name in SNAPSHOT_ASSETS}
for page in sorted(examples.rglob('*.html')) if examples.is_dir() else []:
    if page.parent == examples:  # 画廊页不是案例页，自带样式不内嵌资产
        continue
    text = normalize(page.read_text(encoding='utf-8-sig'))
    stale = [name for name, probe in SNAPSHOT_ASSETS.items() if re.search(probe, text) and current[name] not in text]
    if stale:
        warnings.append(f'{page.relative_to(root)}: 内嵌快照滞后于 assets/（' + '、'.join(stale) + '）')
if warnings:
    warnings.insert(0, 'WARNING: assets/examples 内嵌资产与当前版本不同；如需更新，请修改课件源文件并完成审校与构建，不要直接编辑生成页。')

if errors:
    print('\n'.join(errors))
else:
    print('Package references and declared HTML resource dependencies: PASS (not a network/runtime test)')
if warnings:
    print('\n'.join(warnings))
sys.exit(bool(errors))
