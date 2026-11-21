#!/usr/bin/env python3
"""Import local EPUBs and the existing Nine Transitions editions, without rewriting text.

EPUB body text is compared character-for-character (excluding whitespace) before
and after conversion. XHTML blocks live inside Markdown files so tables, notes,
paragraphs, and inline punctuation do not pass through a lossy text converter.
"""
import argparse
import copy
import hashlib
import json
import posixpath
import re
import shutil
import zipfile
from pathlib import Path
from urllib.parse import unquote, quote, urlsplit
from lxml import etree as ET

ROOT = Path(__file__).resolve().parents[2]
CLOUD = Path.home() / 'Library/Mobile Documents/com~apple~CloudDocs'

def normalized(text):
    return re.sub(r'\s+', '', text)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def slug(text):
    return re.sub(r'[\x00-\x1f/\\:*?"<>|]', '-', text).strip(' .')[:90] or '正文'

def local(base, href):
    return posixpath.normpath(posixpath.join(posixpath.dirname(base), unquote(href)))

def xml(data):
    return ET.fromstring(data, ET.XMLParser(resolve_entities=False, no_network=True))

def text(el):
    return ''.join(el.itertext()) if el is not None else ''

def report(out, data):
    d = out / 'meta_data'
    d.mkdir(exist_ok=True)
    (d / 'import.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

def import_epub(src, title):
    out = ROOT / title
    if out.exists():
        raise FileExistsError(out)
    out.mkdir()
    z = zipfile.ZipFile(src)
    container = xml(z.read('META-INF/container.xml'))
    opf = container.find('.//{*}rootfile').get('full-path')
    package = xml(z.read(opf))
    manifest = {e.get('id'): e for e in package.findall('.//{*}item')}
    spine = [local(opf, manifest[r.get('idref')].get('href')) for r in package.findall('.//{*}itemref')]
    docs = list(spine)
    for item in manifest.values():
        name = local(opf, item.get('href'))
        if item.get('media-type') in ('application/xhtml+xml', 'text/html') and name not in docs:
            docs.append(name)  # retain non-spine notes/appendices/navigation too
    labels = {}
    for item in manifest.values():
        if item.get('media-type') == 'application/x-dtbncx+xml':
            name = local(opf, item.get('href'))
            for point in xml(z.read(name)).findall('.//{*}navPoint'):
                c, lab = point.find('{*}content'), point.find('{*}navLabel/{*}text')
                if c is not None:
                    labels.setdefault(local(name, c.get('src').split('#')[0]), text(lab).strip())
    parsed, titles = {}, {}
    for name in docs:
        root = xml(z.read(name))
        body = root.find('{*}body')
        if body is None:
            raise ValueError(f'No body: {name}')
        parsed[name] = body
        heading = next(iter(body.findall('.//{*}h1') + body.findall('.//{*}h2')), None)
        lab = labels.get(name) or text(root.find('.//{*}title')).strip() or text(heading).strip()
        if not lab or lab.lower() == 'cover' or 'cover' in Path(name).stem.lower():
            lab = '封面' if body.findall('.//{*}img') or body.findall('.//{*}image') else '献词'
        titles[name] = re.sub(r'\s+', ' ', lab)
    # Keep illustrated chapter-opening pages with their corresponding chapter.
    groups = []
    i = 0
    while i < len(docs):
        name = docs[i]
        group = [name]
        if not normalized(text(parsed[name])) and i + 1 < len(docs) and titles[name] == titles[docs[i+1]]:
            i += 1
            group.append(docs[i])
        groups.append(group)
        i += 1
    mapped = {}
    for i, group in enumerate(groups, 1):
        filename = f'{i:02d}-{slug(titles[group[-1]])}.md'
        for name in group:
            mapped[name] = filename
    image_map = {}
    for item in manifest.values():
        if item.get('media-type', '').startswith('image/'):
            name = local(opf, item.get('href'))
            ext = Path(name).suffix.lower()
            dest = 'images/' + sha(name.encode())[:10] + '-' + Path(name).name
            (out / 'images').mkdir(exist_ok=True)
            if ext == '.svg':
                # Current source files use raster images; fail visibly if new SVGs occur.
                raise ValueError(f'SVG needs conversion: {name}')
            (out / dest).write_bytes(z.read(name))
            image_map[name] = dest
    checks, missing = [], []
    for group in groups:
        pieces = []
        for name in group:
            body = copy.deepcopy(parsed[name])
            original = normalized(text(body))
            for el in body.iter():
                if not isinstance(el.tag, str):
                    continue
                tag = ET.QName(el).localname
                el.tag = tag
                attrs = dict(el.attrib)
                el.attrib.clear()
                for key in ('id', 'name', 'lang', 'title', 'alt', 'colspan', 'rowspan'):
                    if key in attrs:
                        el.set(key, attrs[key])
                if tag == 'image':
                    el.tag = 'img'
                    attrs['src'] = attrs.get('{http://www.w3.org/1999/xlink}href', attrs.get('href', ''))
                key = 'src' if el.tag == 'img' else 'href' if el.tag == 'a' else None
                if key and attrs.get(key):
                    value = attrs[key]
                    parts = urlsplit(value)
                    if parts.scheme or value.startswith('//'):
                        el.set(key, value)
                    elif not parts.path:
                        el.set(key, value)
                    else:
                        target = local(name, parts.path)
                        dest = (image_map if key == 'src' else {**mapped, **image_map}).get(target)
                        if dest is None:
                            missing.append({'source': name, 'target': target})
                        else:
                            el.set(key, quote(dest, safe='/') + ('#' + parts.fragment if parts.fragment else ''))
            ET.cleanup_namespaces(body)
            converted = normalized(text(body))
            assert original == converted, name
            if '\ufffd' in original:
                raise ValueError(f'Replacement character in source: {name}')
            body.tag = 'div'
            rendered = ET.tostring(body, encoding='unicode', method='html')
            # Blank lines inside raw HTML can trigger Markdown parsing mid-block.
            rendered = re.sub(r'\n[ \t]*\n+', '\n', rendered)
            assert normalized(text(ET.fromstring(rendered.encode(), ET.HTMLParser(encoding="utf-8")))) == original
            pieces.append(rendered)
            checks.append({'source': name, 'output': mapped[name], 'characters_without_whitespace': len(original), 'text_sha256': sha(original.encode()), 'text_equal': True})
        label = titles[group[-1]]
        (out / mapped[group[0]]).write_text('# ' + label + '\n\n' + '\n\n'.join(pieces) + '\n')
    if missing:
        raise ValueError(f'Unresolved links: {missing[:10]}')
    contents = '# ' + title + '\n\n' + '\n'.join(f'- [{titles[g[-1]]}]({quote(mapped[g[0]])})' for g in groups) + '\n'
    (out / '00-目录.md').write_text(contents)
    report(out, {'format': 'epub', 'source': str(src), 'source_sha256': sha(src.read_bytes()), 'method': 'Original XHTML text and paragraph/table/footnote structure; no paraphrasing or OCR', 'spine_documents':len(spine), 'documents_imported':len(docs), 'chapters':len(groups), 'images':len(image_map), 'all_text_equal':True, 'unresolved_links':missing, 'documents': checks})
    print(title, len(groups), 'chapters;',len(image_map),'images; all text matches', flush=True)


def import_nine(lang):
    title = '九种转换（中文版）' if lang == 'zh' else 'Nine Transitions（英文版）'
    source = CLOUD / 'nine' / ('nine-' + lang)
    out = ROOT / title
    if out.exists():
        raise FileExistsError(out)
    out.mkdir()
    files = sorted(source.glob('*.md'))
    chapters = [p for p in files if p.name != '00-contents.md']
    names = {}
    for i,p in enumerate(chapters,1):
        label = (p.stem if lang == 'en' else p.stem.split('-',2)[-1]) if re.match(r'^20\d\d-\d\d', p.stem) else p.stem.split('-',1)[-1]
        names[p.name] = f'{i:02d}-{label}.md'
    names['00-contents.md'] = '00-目录.md'
    used, checks = set(), []
    for p in files:
        raw = p.read_text()
        body = re.sub(r'\A---\n.*?\n---\n', '', raw, count=1, flags=re.S)
        for old, new in names.items():
            body = body.replace('('+old, '('+new)
        for image in re.findall(r'!\[[^\]]*\]\(\.\./assets/charts/([^\s)]+)', body):
            used.add(image)
        body = body.replace('../assets/charts/', 'images/')
        body = re.sub(r'(?<!!)\[([^\]]+)\]\((\[[^\]]+\])\)', lambda m: r'\['+m[1]+r'\]('+m[2].replace('[',r'\[').replace(']',r'\]')+')', body)
        (out/names[p.name]).write_text(body)
        checks.append({'source':p.name,'output':names[p.name], 'source_sha256':sha(raw.encode()), 'output_sha256':sha(body.encode())})
    (out/'images').mkdir()
    for name in sorted(used):
        shutil.copy2(CLOUD/'nine/assets/charts'/name,out/'images'/name)
    report(out, {'format':'existing-markdown','source':str(source),'method':'Preserved supplied Markdown; removed YAML front matter and remapped navigation/image paths only. Existing source conversion was not retranslated.', 'chapters':len(chapters),'images':len(used),'documents':checks})
    print(title,len(chapters),'chapters;',len(used),'images',flush=True)

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--kind',choices=['epub','nine'],required=True)
    args=parser.parse_args()
    if args.kind=='epub':
        for folder,prefix,title in [('文学小说','日瓦戈医生','日瓦戈医生（上下册）'),('中国思想文化','介绍我自己的思想','介绍我自己的思想'),('健康医学','免疫功能90天','免疫功能90天复原方案'),('健康医学','免疫革命','免疫革命')]:
            src=next((CLOUD/'studio-books'/folder).glob(prefix+'*.epub'))
            import_epub(src,title)
    else:
        for lang in ['zh','en']: import_nine(lang)
