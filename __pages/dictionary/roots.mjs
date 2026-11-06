import {readFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import MarkdownIt from 'markdown-it';
import sanitize from 'sanitize-html';
import {normalizeWord} from './word.js';
import {lookup} from './service.mjs';

const directory=fileURLToPath(new URL('./word_root/英语词根资料库/',import.meta.url));
const md=new MarkdownIt({html:true,linkify:false});
let pendingIndex;
const pages=new Map();
async function index() {
  if(!pendingIndex) pendingIndex=(async()=>{
    const data=JSON.parse(await readFile(path.join(directory,'data/条目清单.json'),'utf8'));
    const words=new Map(),ids=new Map();
    for(const entry of data) {
      const item={id:entry.id,root:entry.root,meaning:entry.meaning_zh || entry.meaning,group:entry.group,file:entry.file,anchors:entry.word_anchors || {}};
      ids.set(item.id,item);
      for(const spelling of Object.keys(item.anchors)) {
        const word=normalizeWord(spelling);if(!word) continue;
        const matches=words.get(word) || [];
        matches.push({...item,anchor:item.anchors[spelling]});words.set(word,matches);
      }
    }
    return {words,ids};
  })().catch(error=>{pendingIndex=null;throw error;});
  return pendingIndex;
}
async function libraryFile(relative,extensions) {
  if(typeof relative!=='string' || !extensions.includes(path.extname(relative).toLowerCase())) throw Object.assign(new Error('Not found'),{status:404});
  const base=await realpath(directory),file=await realpath(path.resolve(base,relative));
  if(!file.startsWith(base+path.sep)) throw Object.assign(new Error('Not found'),{status:404});
  if((await stat(file)).size>4*1024*1024) throw Object.assign(new Error('Document too large'),{status:413});
  return file;
}
async function page(file) {
  if(pages.has(file)) return pages.get(file);
  const text=await readFile(await libraryFile(file,['.md']),'utf8');
  if(pages.size>=24) pages.delete(pages.keys().next().value);
  pages.set(file,text);return text;
}
export function extractLesson(text,anchor) {
  const marker=new RegExp('<a\\s+id=["\']w-'+Number(anchor)+'["\']\\s*>\\s*</a>');
  const match=marker.exec(text);if(!match) return '';
  const rest=text.slice(match.index+match[0].length);
  const end=rest.search(/<a\s+id=["']w-\d+["']\s*>\s*<\/a>|\n## /);
  return (end<0?rest:rest.slice(0,end)).trim();
}
function localLink(value,file,image=false) {
  if(!value || /^(?:[a-z]+:|\/\/)/i.test(value)) return value;
  const hashAt=value.indexOf('#'),fragment=hashAt<0?'':value.slice(hashAt);
  const name=hashAt<0?value:value.slice(0,hashAt);
  let decoded;try{decoded=decodeURIComponent(name);}catch{return '';}
  const relative=name?path.posix.normalize(path.posix.join(path.posix.dirname(file),decoded)):file;
  return (image?'/dictionary/root-asset?path=':'/dictionary/root-doc?path=')+encodeURIComponent(relative)+fragment;
}
export function renderRootMarkdown(text,file) {
  return sanitize(md.render(text),{
    allowedTags:[...sanitize.defaults.allowedTags,'img'],
    allowedAttributes:{a:['href','id','target','rel'],img:['src','alt','title','loading'],th:['align'],td:['align']},
    allowedSchemes:['http','https'],allowProtocolRelative:false,
    transformTags:{
      a:(tag,attrs)=>({tagName:tag,attribs:attrs.href?{...attrs,href:localLink(attrs.href,file),target:'_blank',rel:'noopener noreferrer'}:attrs}),
      img:(tag,attrs)=>({tagName:tag,attribs:{...attrs,src:localLink(attrs.src,file,true),loading:'lazy'}}),
    },
  });
}
export async function lookupRoots(input) {
  const word=normalizeWord(input);if(!word) throw Object.assign(new Error('请选择一个完整的英文单词'),{status:400});
  const {words}=await index();let matched=word,entries=words.get(word);
  if(!entries?.length) {
    try {
      const local=lookup(word);
      for(const base of [local?.entry?.word,...(local?.roots || []).map(entry=>entry.word)]) {
        const normalized=normalizeWord(base);
        if(normalized && words.has(normalized)) {matched=normalized;entries=words.get(normalized);break;}
      }
    }catch{}
  }
  return {query:word,matched,entries:(entries || []).slice().sort((a,b)=>a.group.localeCompare(b.group)).map(entry=>({id:entry.id,root:entry.root,meaning:entry.meaning,group:entry.group,word:matched,anchor:entry.anchor,url:'/dictionary/root-doc?'+new URLSearchParams({id:entry.id})+'#w-'+entry.anchor}))};
}
function json(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(data));}
export async function serveRoots(url,res) {
  try {
    if(url.pathname==='/dictionary/roots') {
      const data=await lookupRoots(url.searchParams.get('word'));
      const id=url.searchParams.get('id');
      if(id) {
        const selected=data.entries.find(entry=>entry.id===id);
        if(!selected) return json(res,404,{error:'未找到词根条目'});
        const {ids}=await index(),entry=ids.get(id);
        const text=extractLesson(await page(entry.file),selected.anchor);
        return json(res,200,{...selected,html:renderRootMarkdown(text,entry.file)});
      }
      return json(res,200,data);
    }
    if(url.pathname==='/dictionary/root-asset') {
      const file=await libraryFile(url.searchParams.get('path'),['.svg','.png','.jpg','.jpeg','.webp']);
      const type={'.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[path.extname(file).toLowerCase()];
      res.writeHead(200,{'Content-Type':type,'Content-Security-Policy':"default-src 'none'; sandbox"}).end(await readFile(file));return;
    }
    let file=url.searchParams.get('path');
    if(url.searchParams.has('id')) file=(await index()).ids.get(url.searchParams.get('id'))?.file;
    if(!file) return json(res,404,{error:'未找到词根条目'});
    const html=renderRootMarkdown(await page(file),file);
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; img-src 'self' https:; style-src 'self'; base-uri 'none'"}).end('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>词根与词源 · 词根阅读室</title><link rel="stylesheet" href="/reader.css"></head><body class="root-document"><main><nav><a href="/">返回书架</a> · <a href="/dictionary/root-doc?path='+encodeURIComponent('来源与许可.md')+'">来源与许可</a></nav><div class="root-lesson">'+html+'</div></main></body></html>');
  }catch(error) {
    json(res,error.status || (error.code==='ENOENT'?503:500),{error:error.status===400?error.message:error.status===404?'未找到词根条目':'词根资料未就绪，请初始化 word_root 子模块后重试。'});
  }
}
