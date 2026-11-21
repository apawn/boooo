import json,re,zipfile,hashlib
from pathlib import Path
from urllib.request import urlopen,Request
from urllib.parse import urlencode,urlsplit,unquote,parse_qs
from lxml import html,etree
root=Path(__file__).resolve().parents[2];base='http://127.0.0.1:4317'
books=[p.parent.parent for p in root.glob('*/meta_data/import.json')]
cache={};links=[];images=set();count=0;epubcount=0
norm=lambda t:re.sub(r'\s+','',t)
for book in books:
 report=json.loads((book/'meta_data/import.json').read_text())
 expected={}
 if report['format'] in ('epub','mobi'):
  source=book/report['extracted_epub'] if report['format']=='mobi' else report['source']
  with zipfile.ZipFile(source) as z:
   for d in report['documents']:
    doc=etree.fromstring(z.read(d['source']),etree.XMLParser(resolve_entities=False,no_network=True));body=doc.find('{*}body')
    expected[d['output']]=expected.get(d['output'],'')+norm(''.join(body.itertext()))
 for f in sorted(book.glob('*.md')):
  if f.name.startswith('00-'):continue
  url=base+'/?'+urlencode({'book':book.name,'chapter':f.name})
  with urlopen(url,timeout=20) as res:assert res.status==200;doc=html.fromstring(res.read().decode())
  article=doc.xpath('//article')[0];cache[(book.name,f.name)]=set(article.xpath('.//@id')+article.xpath('.//a/@name'))
  if f.name in expected:
   actual=norm(''.join(''.join(div.itertext()) for div in article.xpath('./div')))
   assert actual==expected[f.name],('rendered_text_mismatch',book.name,f.name,len(actual),len(expected[f.name]))
   epubcount+=1
  for link in article.xpath('.//a[@href]'):
   href=link.get('href');u=urlsplit(href)
   if u.scheme or href.startswith('//') or href=='#chapters':continue
   if u.path=='/':
    qs=parse_qs(u.query)
    if 'chapter' in qs:links.append((qs['book'][0],qs['chapter'][0],unquote(u.fragment)))
   elif not u.path and u.fragment and u.fragment!='chapters':links.append((book.name,f.name,unquote(u.fragment)))
   elif u.path.startswith('/media/'):images.add(u.path)
   else:raise AssertionError(('unresolved_local_link',book.name,f.name,href))
  for image in article.xpath('.//img[@src]'):
   src=image.get('src');assert src.startswith('/media/'),src;images.add(src)
  count+=1
 print(book.name,'pages OK',flush=True)
for b,f,a in links:
 assert (b,f) in cache,('missing_chapter',b,f)
 assert not a or a in cache[(b,f)],('missing_anchor',b,f,a)
for i,path in enumerate(images):
 with urlopen(Request(base+path,method='HEAD'),timeout=20) as res:assert res.status==200 and res.headers['Content-Type'].startswith('image/'),path
print(json.dumps({'chapters_http_ok':count,'epub_rendered_text_equal':epubcount,'local_links_and_anchors_ok':len(links),'image_urls_ok':len(images)},ensure_ascii=False))
