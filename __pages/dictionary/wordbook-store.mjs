import {mkdir,readFile,writeFile,rename,unlink,realpath,lstat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {normalizeWord} from './word.js';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function createWordbookStore(books,{isLocked=()=>false}={}) {
  const queues=new Map();
  function bookFor(id) {const book=books.get(id);if(!book) throw fail('没有找到这本书',404);return book;}
  async function directory(book) {
    const base=await realpath(book.dir),dir=path.join(base,'meta_data');await mkdir(dir,{recursive:true});
    if(await realpath(dir)!==dir) throw fail('书籍数据目录不能是符号链接',400);
    return dir;
  }
  async function safeFile(book,name) {
    const file=path.join(await directory(book),name);
    try {if((await lstat(file)).isSymbolicLink()) throw fail('书籍数据文件不能是符号链接');}catch(error){if(error.code!=='ENOENT')throw error;}
    return file;
  }
  async function create(file,data) {
    try{await writeFile(file,JSON.stringify(data,null,2)+'\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
  }
  async function initialize() {
    for(const book of books.values()) {
      await create(await safeFile(book,'book.json'),{version:1,id:book.id,title:book.title,edition:book.edition,chapters:book.items.map(chapter=>({file:chapter.file,title:chapter.name}))});
      await create(await safeFile(book,'words.json'),{version:1,book:book.id,words:[]});
      await create(await safeFile(book,'highlights.json'),{version:1,book:book.id,highlights:[]});
      await create(await safeFile(book,'reading.json'),{version:1,book:book.id,position:null});
    }
  }
  function cleanEntry(book,entry) {
    const word=normalizeWord(entry?.word);if(!word) throw fail('请输入一个完整英文单词');
    let source=null;
    if(entry.source!=null) {
      const s=entry.source;
      if(typeof s.url!=='string' || !s.url.startsWith('/?')) throw fail('收藏的正文地址不正确');
      const url=new URL(s.url,'http://localhost'),chapter=url.searchParams.get('chapter');
      if(url.searchParams.get('book')!==book.id || !book.items.some(item=>item.file===chapter)) throw fail('收藏位置不属于这本书');
      if(typeof s.text!=='string' || s.text.length>120000 || !Number.isInteger(s.offset) || s.offset<0 || s.offset>s.text.length || !Number.isInteger(s.block) || s.block<0) throw fail('收藏的原文位置不正确');
      source={url:'/?'+new URLSearchParams({book:book.id,chapter}),book:book.title,chapter:book.items.find(item=>item.file===chapter).name,block:s.block,text:s.text,offset:s.offset};
    }
    return {word,source};
  }
  async function list(id) {
    const book=bookFor(id),file=await safeFile(book,'words.json');
    await create(file,{version:1,book:id,words:[]});
    const data=JSON.parse(await readFile(file,'utf8'));
    if(data.version!==1 || data.book!==id || !Array.isArray(data.words)) throw fail('words.json 格式不正确，请检查文件；原文件未修改',409);
    return {version:1,book:id,words:data.words.map(entry=>({...cleanEntry(book,entry),...(typeof entry.createdAt==='string'?{createdAt:entry.createdAt}:{})}))};
  }
  function mutate(id,action,items) {
    if(isLocked())throw fail('正在同步，请完成后再保存单词本',409);
    const book=bookFor(id);
    const run=(queues.get(id) || Promise.resolve()).catch(()=>{}).then(async()=>{
      if(!['add','remove','import'].includes(action))throw fail('未知的收藏操作');
      if(!Array.isArray(items) || items.length>10000) throw fail('收藏数据过多');
      const incoming=items.map(item=>action==='remove'?{word:normalizeWord(item?.word)}:cleanEntry(book,item));
      if(incoming.some(entry=>!entry.word))throw fail('请输入一个完整英文单词');
      const data=await list(id),byWord=new Map(data.words.map(entry=>[entry.word,entry]));
      for(const item of incoming) {
        if(action==='remove') byWord.delete(item.word);
        else if(!byWord.has(item.word)) byWord.set(item.word,{...item,createdAt:new Date().toISOString()});
        else if(action==='add' && item.source) byWord.set(item.word,{...byWord.get(item.word),source:item.source});
      }
      data.words=[...byWord.values()];
      const file=await safeFile(book,'words.json'),temporary=file+'.'+randomUUID()+'.tmp';
      try {await writeFile(temporary,JSON.stringify(data,null,2)+'\n',{flag:'wx'});await rename(temporary,file);} finally {await unlink(temporary).catch(()=>{});}
      return data;
    });
    queues.set(id,run);run.finally(()=>{if(queues.get(id)===run)queues.delete(id);}).catch(()=>{});return run;
  }
  function cleanHighlight(book,item) {
    if(!book.items.some(chapter=>chapter.file===item?.chapter))throw fail('标记章节不正确');
    if(!['yellow','green','blue','pink','purple'].includes(item.color))throw fail('标记颜色不正确');
    if(!Array.isArray(item.segments) || !item.segments.length || item.segments.length>1000)throw fail('标记范围不正确');
    const segments=item.segments.map(s=>{
      if(!Number.isInteger(s.block) || s.block<0 || typeof s.text!=='string' || s.text.length>120000 || !Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start<0 || s.end<=s.start || s.end>s.text.length)throw fail('标记位置不正确');
      return {block:s.block,text:s.text,start:s.start,end:s.end};
    });
    return {chapter:item.chapter,color:item.color,segments};
  }
  async function listHighlights(id) {
    const book=bookFor(id),file=await safeFile(book,'highlights.json');
    await create(file,{version:1,book:id,highlights:[]});
    const data=JSON.parse(await readFile(file,'utf8'));
    if(data.version!==1 || data.book!==id || !Array.isArray(data.highlights))throw fail('highlights.json 格式不正确；原文件未修改',409);
    for(const item of data.highlights)cleanHighlight(book,item);
    return data;
  }
  function mutateHighlights(id,action,item) {
    if(isLocked())throw fail('正在同步，请完成后再保存标记',409);
    const book=bookFor(id);
    const run=(queues.get(id)||Promise.resolve()).catch(()=>{}).then(async()=>{
      if(!['paint','remove'].includes(action))throw fail('未知标记操作');
      const clean=cleanHighlight(book,item),data=await listHighlights(id);
      // Replace overlapping portions, retaining the untouched parts of earlier marks.
      data.highlights=data.highlights.flatMap(mark=>{
        if(mark.chapter!==clean.chapter)return [mark];
        const segments=mark.segments.flatMap(old=>{
          let parts=[old];
          for(const selected of clean.segments) {
            if(selected.block!==old.block || selected.text!==old.text)continue;
            parts=parts.flatMap(part=>{
              if(selected.end<=part.start || selected.start>=part.end)return [part];
              return [...(selected.start>part.start?[{...part,end:selected.start}]:[]),...(selected.end<part.end?[{...part,start:selected.end}]:[])];
            });
          }
          return parts;
        });
        return segments.length?[{...mark,segments}]:[];
      });
      if(action==='paint')data.highlights.push({...clean,id:randomUUID(),createdAt:new Date().toISOString()});
      if(data.highlights.length>10000)throw fail('标记数量过多');
      const file=await safeFile(book,'highlights.json'),temp=file+'.'+randomUUID()+'.tmp';
      try {await writeFile(temp,JSON.stringify(data,null,2)+'\n',{flag:'wx'});await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
      return data;
    });
    queues.set(id,run);run.finally(()=>{if(queues.get(id)===run)queues.delete(id);}).catch(()=>{});return run;
  }
  function cleanReading(book,item) {
    if(!book.items.some(chapter=>chapter.file===item?.chapter))throw fail('朗读章节不正确');
    if(!Number.isInteger(item.block)||item.block<0||typeof item.text!=='string'||item.text.length>120000||!Number.isInteger(item.offset)||item.offset<0||item.offset>=item.text.length||typeof item.sentence!=='string'||!item.sentence.trim()||item.sentence.length>120000||!['en','zh'].includes(item.lang))throw fail('朗读位置不正确');
    return {chapter:item.chapter,block:item.block,text:item.text,offset:item.offset,sentence:item.sentence,lang:item.lang};
  }
  async function listReading(id) {
    const book=bookFor(id),file=await safeFile(book,'reading.json');
    await create(file,{version:1,book:id,position:null});
    const data=JSON.parse(await readFile(file,'utf8'));
    if(data.version!==1||data.book!==id||!Object.hasOwn(data,'position'))throw fail('reading.json 格式不正确；原文件未修改',409);
    if(data.position!==null)cleanReading(book,data.position);
    return data;
  }
  function saveReading(id,item) {
    if(isLocked())throw fail('正在同步，朗读位置稍后保存',409);
    const book=bookFor(id),clean=cleanReading(book,item);
    const run=(queues.get(id)||Promise.resolve()).catch(()=>{}).then(async()=>{
      const data=await listReading(id);
      data.position={...clean,updatedAt:new Date().toISOString()};
      const file=await safeFile(book,'reading.json'),temp=file+'.'+randomUUID()+'.tmp';
      try{await writeFile(temp,JSON.stringify(data,null,2)+'\n',{flag:'wx'});await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
      return data;
    });
    queues.set(id,run);run.finally(()=>{if(queues.get(id)===run)queues.delete(id);}).catch(()=>{});return run;
  }
  async function serve(req,res,url) {
    const send=(status,data)=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(data));
    try {
      const id=url.searchParams.get('book');bookFor(id);
      const highlights=url.pathname==='/highlights',reading=url.pathname==='/reading-position';
      if(req.method==='GET')return send(200,await (reading?listReading(id):highlights?listHighlights(id):list(id)));
      if(req.method!=='POST')return send(405,{error:'不支持此操作'});
      const origin=req.headers.origin;
      if(!origin || origin!=='http://'+req.headers.host || req.headers['sec-fetch-site']==='cross-site') return send(403,{error:'仅允许书架页面保存收藏'});
      if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'需要 JSON 数据'});
      const chunks=[];let size=0;
      for await(const chunk of req) {size+=chunk.length;if(size>4*1024*1024)return send(413,{error:'收藏数据过大'});chunks.push(Buffer.from(chunk));}
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail('JSON 格式不正确');}
      return send(200,await (reading?saveReading(id,data.position):highlights?mutateHighlights(id,data.action,data.entry):mutate(id,data.action,data.entries)));
    }catch(error){return send(error.status || 500,{error:error.status?error.message:'无法读取或保存单词本，请检查 JSON 文件与目录权限；原文件未覆盖。'});}
  }
  return {initialize,list,mutate,listHighlights,mutateHighlights,listReading,saveReading,serve,drain:()=>Promise.allSettled([...queues.values()])};
}
