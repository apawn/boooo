#!/usr/bin/env python3
"""Build the Roland edition from page scans, layout-aware Vision OCR and reviewed fixes.

Keep original scans and OCR observations in the imported book for future proofing.
This is an OCR transcription, not a claim of exhaustive manual proofreading.
"""
import argparse, collections, hashlib, html, json, re, shutil
from pathlib import Path
from urllib.parse import quote
from scan_paragraphs import join_page_continuations

TITLE='法兰西第一女杰：罗兰夫人传'
SECTIONS=[(1,'封面与版权'),(5,'译者序'),(10,'原书目录'),(12,'第一章-童年时代'),(25,'第二章-少女时代'),(40,'第三章-青年时代'),(55,'第四章-婚姻生活'),(71,'第五章-国民议会'),(86,'第六章-罗兰内阁'),(101,'第七章-罗兰夫人和雅各宾派'),(115,'第八章-吉伦特派的最后斗争'),(129,'第九章-罗兰夫人的被捕'),(143,'第十章-吉伦特派的命运'),(161,'第十一章-狱中生活'),(194,'附录-人名译名对照表')]
DATES={12:'1754—1767年',25:'1768—1769年',40:'1770—1775年',55:'1776—1785年',86:'1792年',101:'1792年',115:'1792—1793年',129:'1793年',143:'1793年',161:'1793年'}
# Image-only matter retains the original, rather than unreliable decorative-text OCR.
ILLUSTRATIONS={1,2,3,4,10,11,31,66,79,96,159,167,192}

def esc(s): return html.escape(s)

def join_lines(lines):
    out=''
    for s in lines:
        s=s.strip()
        if out and re.search(r'[A-Za-z0-9]$',out) and re.match(r'[A-Za-z0-9]',s):out+=' '
        out+=s
    return out

def paragraphs(rows):
    if not rows:return []
    rows=sorted(rows,key=lambda r:-(r['y']+r['h']/2))
    # The left edge of full text lines is the paragraph margin; indents start paragraphs.
    wide=[r['x'] for r in rows if r['w']>.45]
    margin=min(wide or [r['x'] for r in rows])
    parts=[]; current=[];last=None
    for r in rows:
        gap=(last['y']-r['y']-r['h']) if last else 0
        if current and (r['x']>margin+.035 or gap>.026 or (last['w']<.5 and r['x']<=margin+.02)):
            parts.append(join_lines(current));current=[]
        current.append(r['text']);last=r
    if current:parts.append(join_lines(current))
    return parts

def table(rows, page):
    verified=json.loads(Path(__file__).with_name('roland_verified_tables.json').read_text())
    if str(page) in verified:
        return '<table><thead><tr><th>原文姓名</th><th>原书译名</th></tr></thead><tbody>'+''.join('<tr><td>'+esc(a)+'</td><td>'+esc(b)+'</td></tr>' for a,b in verified[str(page)])+'</tbody></table>'
    # Match the original two parallel bilingual columns, line by line.
    rows=[r for r in rows if .09<r['y']<.90 and not ('附录' in r['text'] or '对照表' in r['text'])]
    result=[]
    for lo,hi in [(0,.5),(.5,1)]:
        col=sorted([r for r in rows if lo<=r['x']<hi],key=lambda r:-r['y'])
        groups=[]
        for r in col:
            group=next((g for g in groups if abs(g[0]['y']-r['y'])<.012),None)
            if group is None:groups.append([r])
            else:group.append(r)
        for g in groups:
            g.sort(key=lambda r:r['x'])
            val=' '.join(r['text'] for r in g)
            m=re.search(r'[\u3400-\u9fff]',val)
            if m:result.append((val[:m.start()].strip(),val[m.start():].strip()))
            else:result.append((val,''))
    return '<table><thead><tr><th>原文姓名</th><th>原书译名</th></tr></thead><tbody>'+''.join('<tr><td>'+esc(a)+'</td><td>'+esc(b)+'</td></tr>' for a,b in result)+'</tbody></table>'

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    for name in ['scans','ocr','layout','corrections','source']:ap.add_argument('--'+name,type=Path,required=True)
    args=ap.parse_args()
    out=Path(__file__).resolve().parents[2]/TITLE
    if out.exists():raise FileExistsError(out)
    images=out/'images/pages';images.mkdir(parents=True)
    data=out/'meta_data';data.mkdir();ocrout=data/'ocr';ocrout.mkdir()
    layout={r['page']:r for r in json.loads(args.layout.read_text())}
    fixes=json.loads(args.corrections.read_text())
    bypage=collections.defaultdict(list)
    for fix in fixes:bypage[fix['page']].append(fix)
    chapters=[];pages=[]
    for j,(start,label) in enumerate(SECTIONS):
        end=SECTIONS[j+1][0]-1 if j+1<len(SECTIONS) else 195
        filename=f'{j+1:02d}-{label}.md';chapters.append((label,filename))
        content=['# '+label.replace('-',' '),'']
        if start==1:content+=['本书正文由扫描页识别，并对重点疑点作原图核对，尚未逐字人工校完。原页、插图与旁注均保留供对照。第五章扉页（PDF 第71页）在源文件中已损坏。','']
        for n in range(start,end+1):
            image=f'images/pages/{n:03d}.png';shutil.copy2(args.scans/f'{n:03d}.png',out/image)
            rows=json.loads((args.ocr/f'{n:03d}.json').read_text())
            (ocrout/f'{n:03d}.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
            for f in bypage[n]:
                assert rows[f['index']]['text']==f['before'],(n,f)
                rows[f['index']]['text']=f['after']
            page_label=(f'原书第{n-11}页 · ' if n>=12 else '')+f'PDF 第{n}页'
            content += [f'<div id="page-{n}"><small><a href="{image}">{page_label} · 查看原页</a></small></div>','']
            if n in ILLUSTRATIONS:
                content += [f'![{page_label}]({image})','']
                mode='original-image'
            elif n==71:
                content += ['> 原文件此页已损坏。章节名据原书目录保留；无法辨认的扉页内容未作猜补。','',f'![源文件损坏页]({image})','']
                mode='damaged-source'
            elif n in DATES:
                content += [DATES[n],''];mode='chapter-title'
            elif n>=194:
                content += [table(rows,n),''];mode='ocr-table'
            else:
                rows=[r for r in rows if r['y']>.09 and r['w']>.025 and r['text'].strip()]
                # Separate small, full-width footnotes from the main narrative.
                candidates=[r for r in rows if r['y']<.25 and r['h']<.019 and (r['w']>.76 or re.match(r'^[①②③④⑤⑥]',r['text']))]
                note_top=max((r['y']+r['h'] for r in candidates),default=0)
                notes=[r for r in rows if note_top and r['y']<note_top]
                main=[r for r in rows if r not in notes]
                texts=paragraphs(main)
                for s in texts:content += ['<p>'+esc(s)+'</p>','']
                if notes:
                    content += ['<blockquote><p>'+esc(join_lines([r['text'] for r in sorted(notes,key=lambda r:-r['y'])]))+'</p></blockquote>','']
                mode='ocr-body'
            content += [f'<details><summary>原页对照（含插图与旁注）</summary><img src="{image}" alt="{page_label}"></details>',''] if mode not in ['original-image','damaged-source'] else []
            pages.append({'pdf_page':n,'mode':mode,'original_image':image,'sidebar_present':bool(layout[n]['separator']),'ocr_lines':len(rows)})
        (out/filename).write_text('\n'.join(content))
    (out/'00-目录.md').write_text('# '+TITLE+'\n\n'+ '\n'.join(f'- [{label.replace("-"," ")}]({quote(file)})' for label,file in chapters)+'\n')
    (data/'ocr-corrections.json').write_text(json.dumps(fixes,ensure_ascii=False,indent=2)+'\n')
    (data/'ocr-layout.json').write_text(args.layout.read_text())
    joins=join_page_continuations(out)
    report={'cross_page_paragraph_joins':joins,'format':'scanned-pdf','source':str(args.source),'source_sha256':hashlib.sha256(args.source.read_bytes()).hexdigest(),'pages':195,'chapters':len(chapters),'method':'Apple Vision accurate zh-Hans/en-US; body OCR separated from vertical marginalia; footnotes separated; original scans preserved; selected OCR ambiguities checked visually','manual_corrections':len(fixes),'manually_verified_appendix_rows':70,'fully_manually_proofread':False,'known_source_damage':[71],'marginalia':'Preserved in original-page images, not mixed into narrative text','page_coverage':pages}
    (data/'import.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(TITLE,len(chapters),'chapters,',len(pages),'pages preserved')
