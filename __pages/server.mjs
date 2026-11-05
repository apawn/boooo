import http from 'node:http';
import { serveSpeech, warmSpeech } from './speech/engine.mjs';
import { tocLabels, chapterLabel } from './labels.mjs';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import sanitize from 'sanitize-html';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const port = Number(process.env.PORT || 4317);
const md = new MarkdownIt({html: true, linkify: false});
const escape = md.utils.escapeHtml;
const titles = {
  '国家为什么会失败（英汉短段对照版）': ['国家为什么会失败','英汉对照版','nations','terracotta'],
  '自由的窄廊（英汉对照版）': ['自由的窄廊','英汉对照版','corridor','olive'],
  '爱这个世界': ['爱这个世界','阿伦特与布鲁希尔书信集','letters','plum'],
  'Why Nations Fail (English)': ['Why Nations Fail','英文版','nations','slate'],
  '国家为什么会失败（中文版）': ['国家为什么会失败','中文版','nations','ochre'],
};
const files = await readdir(root,{withFileTypes:true});
const books = new Map();
for (const entry of files.filter(d=>d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))) {
  const dir = path.join(root,entry.name);
  const chapters = (await readdir(dir,{withFileTypes:true})).filter(f=>f.isFile() && f.name.endsWith('.md')).map(f=>f.name).sort();
  if (!chapters.length) continue;
  const [title, edition, motif, color] = titles[entry.name] || [entry.name,'','letters','olive'];
  const items = chapters.map(file => {
    const label = file.replace(/^[\d]+[a-z]?-/, '').replace(/\.md$/, '');
    const chapter = /^(?:第(\d+)章-|Chapter-(\d+)-)(.+)$/.exec(label);
    return {file, name:chapter ? chapter[3].replaceAll('-',' ') : label.replaceAll('-',' '), number:chapter ? String(Number(chapter[1]||chapter[2])).padStart(2,'0') : ''};
  }).filter(c=>!/^00-/.test(c.file));
  if (items.length) books.set(entry.name, {id:entry.name,dir,title,edition,motif,color,items,contents:chapters.find(c=>c.startsWith('00-'))});
}
const order=[...new Set([...Object.keys(titles),...books.keys()])].filter(k=>books.has(k));
const englishTitles = {nations:'Why Nations Fail', corridor:'The Narrow Corridor', letters:'Within Four Walls'};
const themeLabels = new Map();
for (const b of books.values()) {
  if (b.edition === '英汉对照版' && b.contents) {
    themeLabels.set(b.motif, tocLabels(await readFile(path.join(b.dir,b.contents),'utf8')));
  }
}
function subtitle(text) { return text ? '<small class="nav-english" lang="en">'+escape(text)+'</small>' : ''; }
function url(book,chapter) {
  return '/?'+new URLSearchParams({book:book.id,chapter:chapter.file}).toString();
}
function asset(book,rel) {
  return '/media/'+[book.id,...rel.split('/')].map(encodeURIComponent).join('/');
}
const symbols={
  shelf:'<path d="M3 5h4v14H3zM10 4h3v15h-3zM15 6l3-1 4 13-3 1z"/>',
  panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m7-11-3 3 3 3"/>',
  book:'<path d="M12 6c-3-2-6-2-9-1v13c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v13"/>',
  previous:'<path d="m14 6-6 6 6 6"/>',next:'<path d="m10 6 6 6-6 6"/>',
};
function icon(name){return '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">'+symbols[name]+'</svg>';}
const patterns={
  nations:'<path d="M1 48 18 28l8 9 10-15 18 23M-4 48l21-8 15 7 22-9M6 51l14-6 18 6 16-7"/>',
  corridor:'<path d="M5 55V32a19 19 0 0 1 38 0v23M11 55V32a13 13 0 0 1 26 0v23M17 55V32a7 7 0 0 1 14 0v23"/>',
  letters:'<path d="M24 51V23m0 19q-11 0-12-10 9 0 12 10Zm0-6q10-1 12-11-11 2-12 11Zm0-5q-6-5-4-13 6 5 4 13Z"/>'
};
function cover(b){return '<span aria-hidden="true" class="cover '+b.color+'"><svg viewBox="0 0 48 60"><path d="M11 10h24m-20 3h16"/>'+patterns[b.motif]+'</svg></span>';}
function start(b){return b.items.find(c=>/Preface|序言/.test(c.name)) || b.items[0];}
function chapterBody(source,b,c) {
  const cleaned=source.replace(/^# (.+)$/m,(line,txt)=>{
    const parts=txt.split(' · ');
    if(parts.length!==2) return line;
    return '<header class="chapter-heading"><h1>'+escape(parts[1])+'</h1><p class="en-title" lang="en">'+escape(parts[0])+'</p></header>';
  });
  function transform(tag,attrs) {
    const key=tag==='img'?'src':'href';
    const value=attrs[key] || '';
    if (value && !value.startsWith('#') && !/^[\w+.-]+:/.test(value)) {
      try {
        const [raw,anchor]=value.split('#');
        const rel=path.posix.normalize(decodeURIComponent(raw));
        const target=b.items.find(v=>v.file===rel);
        if (tag==='a' && target) attrs[key]=url(b,target)+(anchor?'#'+anchor:'');
        else if(tag==='a' && rel===b.contents) attrs[key]='#chapters';
        else if(rel.startsWith('images/')) attrs[key]=asset(b,rel);
      } catch { delete attrs[key]; }
    }
    if(tag==='img') attrs.loading='lazy';
    return {tagName:tag,attribs:attrs};
  }
  return sanitize(md.render(cleaned),{allowedTags:[...sanitize.defaults.allowedTags,'img','header','h1','sup','sub','figure','figcaption'],allowedAttributes:{'*':['id','lang'],a:['href','name','title'],img:['src','alt','title','loading'],header:['class'],p:['class']},transformTags:{a:transform,img:transform}});
}
function twig(){return '<svg viewBox="0 0 62 62" class="twig" aria-hidden="true"><path d="M3 49C3 22 7 7 43 4M7 24C11 15 14 13 23 10M8 17C12 19 16 18 19 14 15 14 11 15 8 17ZM15 10C15 6 17 3 22 2 21 6 19 8 15 10ZM6 27C1 23 1 19 2 16 5 18 7 22 6 27ZM24 7C29 12 33 11 36 8 31 7 29 6 24 7Z"/><circle cx="42" cy="4" r="1.2"/></svg>';}
function borderDecor() {
  const sprig='<svg class="sprig" aria-hidden="true" viewBox="0 0 120 12"><g fill="none" stroke="currentColor" stroke-width=".85"><path d="M2 7q15-4 33 0t33 0 38-1l12 1M27 6q-5-6-12-4 2 5 12 4Zm15 2q5 5 12 2-4-4-12-2Zm24-1q-4-6-12-5 3 5 12 5Zm18 0q5 6 13 3-4-5-13-3Z"/></g></svg>';
  return [0,1,2,3].map(n=>'<i aria-hidden="true" class="corner c'+n+'">'+twig()+'</i>').join('') +
    ['top','bottom','left','right'].map(side=>'<div aria-hidden="true" class="vine '+side+'">'+sprig.repeat(3)+'</div>').join('');
}
const typeControls='<div class="type-controls" aria-label="正文字号"><button type="button" id="smaller" aria-label="减小字号" title="减小字号">A<span>−</span></button><button type="button" id="larger" aria-label="增大字号" title="增大字号">A<span>+</span></button></div>';
async function render(b,c) {
  const i=b.items.indexOf(c), shelf=order.map(id=>{
    const book=books.get(id);
    return '<a class="book-item" '+(id===b.id?'aria-current="true" ':'')+'href="'+escape(url(book,start(book)))+'">'+cover(book)+'<span><strong>'+escape(book.id==='Why Nations Fail (English)'?'国家为什么会失败':book.title)+'</strong>'+subtitle(englishTitles[book.motif])+'<small>'+escape(book.edition)+'</small></span></a>';
  }).join('');
  const chapters=b.items.map((x,j)=>{
    const [name,en]=chapterLabel(x,themeLabels.get(b.motif));
    return '<a class="chapter-item" '+(j===i?'aria-current="page" ':'')+'href="'+escape(url(b,x))+'"><span class="num">'+(x.number||'·')+'</span><span>'+escape(name)+subtitle(en)+'</span></a>';
  }).join('');
  const paging=[[-1,'上一章','previous'],[1,'下一章','next']].map(([d,label,arrow])=>b.items[i+d]?'<a href="'+escape(url(b,b.items[i+d]))+'">'+(d<0?icon(arrow):'')+label+(d>0?icon(arrow):'')+'</a>':'<span></span>').join('');
  const body=chapterBody(await readFile(path.join(b.dir,c.file),'utf8'),b,c);
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(c.name+' · '+b.title)+'</title><link rel="stylesheet" href="/reader.css"><script src="/reader.js"></script><script src="/read-aloud.js" defer></script></head><body><div class="frame">'+borderDecor()+'<aside id="shelf"><header class="side-head"><span class="brand">'+icon('book')+'<span>藏书架'+subtitle('Bookshelf')+'</span></span><button class="toggle" aria-controls="book-list" aria-expanded="true" title="收起书架">'+icon('panel')+'</button></header><nav id="book-list" aria-label="所有书籍">'+shelf+'</nav></aside><aside id="chapters"><header class="side-head"><span><strong>章节</strong>'+subtitle('Chapters')+'</span><span class="total">'+b.items.length+'</span></header><nav id="chapter-list" aria-label="章节目录">'+chapters+'</nav></aside><main id="reader"><header class="reader-bar"><span class="crumb">'+icon('book')+escape(b.title)+'<span class="edition">'+escape(b.edition)+'</span></span>'+typeControls+'</header><div class="scroll" id="scroll" tabindex="-1"><article class="'+(b.edition==='英汉对照版'?'parallel':'')+'">'+body+'<nav class="paging" aria-label="翻章">'+paging+'</nav></article></div></main></div></body></html>';
}
const staticFiles={'/read-aloud.js':'text/javascript; charset=utf-8','/reader.js':'text/javascript; charset=utf-8','/reader.css':'text/css; charset=utf-8'};
const mediaTypes={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp'};
http.createServer(async(req,res)=>{
  try {
    if(req.url==='/speech') { await serveSpeech(req,res); return; }
    if(req.method!=='GET' && req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    const u=new URL(req.url,'http://localhost');
    res.setHeader('X-Content-Type-Options','nosniff');
    if(u.pathname in staticFiles){res.writeHead(200,{'Content-Type':staticFiles[u.pathname]});res.end(await readFile(path.join(here,u.pathname.slice(1))));return;}
    if(u.pathname.startsWith('/media/')){
      const parts=u.pathname.slice(7).split('/').map(decodeURIComponent);
      const b=books.get(parts.shift());
      if(b && parts[0]==='images' && parts.every(p=>p && p!=='.' && p!=='..' && !p.includes('/') && !p.includes('\\'))){
        const p=await realpath(path.join(b.dir,...parts));const type=mediaTypes[path.extname(p).toLowerCase()];
        if(p.startsWith(b.dir+path.sep+'images'+path.sep) && type && (await stat(p)).isFile()){
          res.writeHead(200,{'Content-Type':type});if(req.method==='HEAD')res.end();else createReadStream(p).on('error',()=>res.destroy()).pipe(res);return;
        }
      }
    }else if(u.pathname==='/'){
      const b=books.get(u.searchParams.get('book')??order[0]);const c=b && (u.searchParams.has('chapter')?b.items.find(c=>c.file===u.searchParams.get('chapter')):start(b));
      if(c){const page=await render(b,c);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}).end(page);return;}
    }
    res.writeHead(404).end('Not found');
  }catch(e){if(e.code!=='ENOENT')console.error(e);res.writeHead(e.code==='ENOENT'?404:500).end();}
}).listen(port,'127.0.0.1',()=>{console.log('Reader: http://127.0.0.1:'+port);warmSpeech();});
