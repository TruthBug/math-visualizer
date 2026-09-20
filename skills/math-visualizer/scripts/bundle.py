"""Inline explicitly marked local CSS/JS into a portable HTML file."""
import argparse
import re
from html.parser import HTMLParser
from pathlib import Path


class Tag(HTMLParser):
    def handle_starttag(self, tag, attrs):
        self.attrs = dict(attrs)


def bundle(source: Path, target: Path) -> None:
    source, target = source.resolve(), target.resolve()
    if source == target:
        raise ValueError('Keep the authoring source; choose a different output path')
    html = source.read_text(encoding='utf-8-sig')
    pattern = r'<script\b[^>]*>\s*</script\s*>|<link\b[^>]*>'

    def replace(match):
        tag = Tag()
        tag.feed(match.group())
        attrs = tag.attrs
        if 'data-bundle' not in attrs:
            return match.group()
        is_script = match.group().lower().startswith('<script')
        allowed = {'data-bundle', 'src'} if is_script else {'data-bundle', 'href', 'rel'}
        if set(attrs) - allowed:
            raise ValueError('Unsupported resource attributes: ' + ', '.join(sorted(set(attrs) - allowed)))
        if not is_script and attrs.get('rel', '').lower() != 'stylesheet':
            raise ValueError('Only stylesheet links can be bundled')
        path = attrs.get('src' if is_script else 'href', '')
        if not path or re.match(r'^(?:[a-z]+:|//)', path, re.I):
            raise ValueError(f'Expected local resource: {path}')
        content = (source.parent / path).resolve().read_text(encoding='utf-8-sig')
        if is_script and re.search(r'^\s*(?:import\b|export\b)|\bimport\s*\(', content, re.M):
            raise ValueError('Bundle module dependencies with a dedicated JS bundler first')
        if not is_script and re.search(r'@import\b|url\s*\(', content, re.I):
            raise ValueError('CSS dependencies must be embedded with a dedicated bundler first')
        closing = 'script' if is_script else 'style'
        if re.search(r'</' + closing, content, re.I):
            raise ValueError(f'Embedded closing tag in {path}')
        return f'<{closing}>\n{content}\n</{closing}>'

    result = re.sub(pattern, replace, html, flags=re.I)
    if re.search(r'<(?:script|link)\b[^>]*\bdata-bundle\b', result, re.I):
        raise ValueError('Unprocessed bundle marker; use an empty external script tag')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(result, encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    args = parser.parse_args()
    bundle(args.source, args.target)
    print(args.target)
