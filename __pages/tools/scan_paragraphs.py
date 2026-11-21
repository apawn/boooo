"""Rejoin narrative paragraphs continued across scanned pages, preserving page anchors."""
import json
import re


def join_page_continuations(folder):
    pattern = re.compile(r'<p>([^<>]+)</p>(\s*<details>.*?</details>\s*<div id="page-(\d+)">.*?</div>\s*)<p>([^<>]+)</p>', re.S)
    counts = {}
    for path in folder.glob('*.md'):
        source = path.read_text()
        count = [0]
        def merge(match):
            page = int(match[3])
            rows = json.loads((folder/'meta_data/ocr'/f'{page:03d}.json').read_text())
            body = sorted([r for r in rows if r['w'] > .3 and r['y'] > .09], key=lambda r: -r['y'])
            if not body or body[0]['x'] > min(r['x'] for r in body) + .035:
                return match[0]
            count[0] += 1
            return '<p>' + match[1] + '<span id="page-' + match[3] + '"></span>' + match[4] + '</p>' + match[2].replace(' id="page-' + match[3] + '"', '')
        while True:
            updated = pattern.sub(merge, source)
            if updated == source:
                break
            source = updated
        if count[0]:
            path.write_text(source)
            counts[path.name] = count[0]
    return counts
