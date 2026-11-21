#!/usr/bin/env python3
"""Import unencrypted MOBI text using mobi/KindleUnpack and the EPUB importer.

Requires the PyPI `mobi` package. Preserve an extracted EPUB for repeatable text
verification, and retain original MOBI provenance in meta_data/import.json.
"""
import argparse
import copy
import json
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlsplit
from lxml import etree as ET, html
import mobi
from import_books import ROOT, import_epub, normalized, sha, text, xml


def package_mobi7(folder, output, title):
    raw = (folder / 'book.html').read_bytes()
    body = html.fromstring(raw).find('body')
    original = normalized(text(body))
    toc = xml((folder / 'toc.ncx').read_bytes())
    labels = {}
    for point in toc.findall('.//{*}navPoint'):
        target = urlsplit(point.find('{*}content').get('src'))
        assert target.path == 'book.html' and target.fragment
        labels.setdefault(target.fragment, text(point.find('{*}navLabel/{*}text')))
    # This MOBI has flat body-level file-position anchors. Refuse to split nested
    # markup, which would risk losing surrounding paragraphs or note content.
    for anchor in labels:
        nodes = body.xpath('.//*[@id=$anchor]', anchor=anchor)
        assert len(nodes) == 1 and nodes[0].getparent() is body, anchor
    groups = [('原书目录', ET.Element('body'))]
    groups[0][1].text = body.text
    for child in body:
        if child.get('id') in labels:
            groups.append((labels[child.get('id')], ET.Element('body')))
        groups[-1][1].append(copy.deepcopy(child))
    assert ''.join(normalized(text(b)) for _, b in groups) == original
    anchors = {el.get('id'): f'part{i:03}.xhtml' for i, (_, b) in enumerate(groups)
               for el in b.iter() if el.get('id')}
    for _, b in groups:
        for el in b.iter():
            if el.tag == 'mbp:pagebreak':
                el.tag = 'br'
            if el.tag == 'font':
                el.tag = 'span'
            if el.tag == 'a' and el.get('href'):
                target = urlsplit(el.get('href'))
                if not target.scheme and target.path in ('', 'book.html'):
                    assert target.fragment in anchors, el.get('href')
                    el.set('href', anchors[target.fragment] + '#' + target.fragment)
    assert ''.join(normalized(text(b)) for _, b in groups) == original
    opf = xml((folder / 'content.opf').read_bytes())
    images = {i.get('id'): i for i in opf.findall('.//{*}item')
              if i.get('media-type', '').startswith('image/')}
    cover_id = opf.find('.//{*}meta[@name="cover"]').get('content')
    cover = ET.Element('body')
    ET.SubElement(cover, 'img', src=images[cover_id].get('href'), alt='封面')
    # Append cover to the package list without shifting the mapped text filenames.
    documents = [(f'part{i:03}.xhtml', label, b) for i, (label, b) in enumerate(groups)]
    documents.insert(0, ('cover.xhtml', '封面', cover))
    ns = 'http://www.idpf.org/2007/opf'
    package = ET.Element('{'+ns+'}package', nsmap={None:ns}, version='2.0')
    metadata = ET.SubElement(package, 'metadata')
    ET.SubElement(metadata, '{http://purl.org/dc/elements/1.1/}title').text = title
    manifest = ET.SubElement(package, 'manifest')
    spine = ET.SubElement(package, 'spine', toc='ncx')
    ncx = ET.Element('ncx', xmlns='http://www.daisy.org/z3986/2005/ncx/', version='2005-1')
    nav = ET.SubElement(ncx, 'navMap')
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('mimetype', 'application/epub+zip')
        z.writestr('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        for i, (name, label, b) in enumerate(documents):
            ET.SubElement(manifest, 'item', id=f'd{i}', href=name, **{'media-type':'application/xhtml+xml'})
            ET.SubElement(spine, 'itemref', idref=f'd{i}')
            point = ET.SubElement(nav, 'navPoint', id=f'n{i}', playOrder=str(i+1))
            ET.SubElement(ET.SubElement(point, 'navLabel'), 'text').text = label
            ET.SubElement(point, 'content', src=name)
            doc = ET.Element('html', xmlns='http://www.w3.org/1999/xhtml')
            ET.SubElement(ET.SubElement(doc, 'head'), 'title').text = label
            doc.append(b)
            z.writestr(name, ET.tostring(doc, encoding='utf-8', xml_declaration=True))
        for i, item in enumerate(images.values()):
            name = item.get('href')
            ET.SubElement(manifest, 'item', id=f'img{i}', href=name, **{'media-type':item.get('media-type')})
            z.writestr(name, (folder/name).read_bytes())
        ET.SubElement(manifest, 'item', id='ncx', href='toc.ncx', **{'media-type':'application/x-dtbncx+xml'})
        z.writestr('content.opf', ET.tostring(package, encoding='utf-8', xml_declaration=True))
        z.writestr('toc.ncx', ET.tostring(ncx, encoding='utf-8', xml_declaration=True))
    return {'extracted_html_sha256':sha(raw), 'extracted_text_sha256':sha(original.encode()),
            'characters_without_whitespace':len(original), 'split_text_equal':True}


def import_mobi(source, title):
    if (ROOT/title).exists():
        raise FileExistsError(ROOT/title)
    extracted_dir, extracted = mobi.extract(str(source))
    extracted = Path(extracted)
    with tempfile.TemporaryDirectory(prefix='boooo-mobi-') as temp:
        epub = Path(temp)/'extracted.epub'
        if extracted.suffix == '.epub':
            epub.write_bytes(extracted.read_bytes())
            checks = {}
        else:
            assert extracted.name == 'book.html', extracted
            checks = package_mobi7(extracted.parent, epub, title)
        import_epub(epub, title)
        metadata = ROOT/title/'meta_data'
        (metadata/'extracted.epub').write_bytes(epub.read_bytes())
        report_file = metadata/'import.json'
        report = json.loads(report_file.read_text())
        report.update(format='mobi', source=str(source), source_sha256=sha(source.read_bytes()),
                      extracted_epub='meta_data/extracted.epub', extracted_epub_sha256=sha(epub.read_bytes()),
                      method='MOBI decompression with mobi/KindleUnpack; split at original TOC anchors; exact text comparison; no OCR or paraphrasing', **checks)
        report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('title')
    args = parser.parse_args()
    import_mobi(args.source, args.title)
