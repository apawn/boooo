import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createWordbookStore} from './wordbook-store.mjs';
async function fixture(t) {
  const root=await mkdtemp(path.join(tmpdir(),'wordbook-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const books=new Map();
  for(const id of ['Book A','Book B']) {
    const dir=path.join(root,id);await mkdir(dir);
    books.set(id,{id,dir,title:id,edition:'测试版',items:[{file:'01.md',name:'第一章'}]});
  }
  const store=createWordbookStore(books);await store.initialize();return {root,books,store};
}
test('creates separate tracked metadata and word files for each book without overwriting edits',async t=>{
  const {root,store}=await fixture(t);
  const file=path.join(root,'Book A/meta_data/book.json');
  const info=JSON.parse(await readFile(file,'utf8'));assert.equal(info.title,'Book A');
  info.note='用户笔记';await writeFile(file,JSON.stringify(info));await store.initialize();
  assert.equal(JSON.parse(await readFile(file,'utf8')).note,'用户笔记');
  await store.mutate('Book A','add',[{word:'country'}]);
  assert.equal((await store.list('Book B')).words.length,0);
  assert.equal(JSON.parse(await readFile(path.join(root,'Book A/meta_data/words.json'),'utf8')).words[0].word,'country');
});
test('concurrent updates merge on disk; migration is idempotent and preserves locations',async t=>{
  const {store,books}=await fixture(t);
  const source={url:'/?book=Book+A&chapter=01.md',text:'A country.',block:2,offset:2};
  await Promise.all([store.mutate('Book A','add',[{word:'country',source}]),store.mutate('Book A','add',[{word:'poverty'}])]);
  await store.mutate('Book A','import',[{word:'country',source:null}]);
  const fresh=createWordbookStore(books),data=await fresh.list('Book A');
  assert.equal(data.words.length,2);assert.equal(data.words[0].source.offset,2);
  await fresh.mutate('Book A','remove',[{word:'poverty'}]);assert.equal((await store.list('Book A')).words.length,1);
  await assert.rejects(store.mutate('Book B','add',[{word:'country',source}]),/不属于/);
});
test('malformed JSON is preserved and unknown books cannot write arbitrary paths',async t=>{
  const {root,store}=await fixture(t);const file=path.join(root,'Book A/meta_data/words.json');
  await writeFile(file,'broken JSON');await assert.rejects(store.mutate('Book A','add',[{word:'country'}]));
  assert.equal(await readFile(file,'utf8'),'broken JSON');
  assert.throws(()=>store.mutate('../other','add',[{word:'country'}]),/没有找到/);
});
test('writes require same-origin JSON and preserve UTF-8 across request chunks',async t=>{
  const {store}=await fixture(t);
  async function send(origin) {
    const body=Buffer.from(JSON.stringify({action:'add',entries:[{word:'country',source:{url:'/?book=Book+A&chapter=01.md',block:0,offset:0,text:'country 国家'}}]}));
    const req=Readable.from([...body].map(byte=>Buffer.from([byte])));req.method='POST';req.headers={origin,host:'127.0.0.1:4317','content-type':'application/json'};
    let status;await store.serve(req,{writeHead(s){status=s;return this;},end(){}},new URL('http://127.0.0.1:4317/wordbook?book=Book+A'));return status;
  }
  assert.equal(await send('https://other.example'),403);
  assert.equal(await send('http://127.0.0.1:4317'),200);
  assert.equal((await store.list('Book A')).words[0].source.text,'country 国家');
});
test('highlights persist independently, repaint and erase only overlapping selected text',async t=>{
  const {store,books}=await fixture(t);
  const entry={chapter:'01.md',color:'yellow',segments:[{block:0,text:'abcdefghij',start:0,end:10}]};
  await store.mutateHighlights('Book A','paint',entry);
  await store.mutateHighlights('Book A','paint',{...entry,color:'blue',segments:[{...entry.segments[0],start:3,end:6}]});
  const fresh=createWordbookStore(books);
  let data=await fresh.listHighlights('Book A');
  assert.deepEqual(data.highlights[0].segments.map(s=>[s.start,s.end]),[[0,3],[6,10]]);
  assert.equal(data.highlights[1].color,'blue');assert.equal((await fresh.listHighlights('Book B')).highlights.length,0);
  await fresh.mutateHighlights('Book A','remove',{...entry,segments:[{...entry.segments[0],start:4,end:8}]});
  data=await fresh.listHighlights('Book A');
  assert.deepEqual(data.highlights[0].segments.map(s=>[s.start,s.end]),[[0,3],[8,10]]);
  assert.deepEqual(data.highlights[1].segments.map(s=>[s.start,s.end]),[[3,4]]);
  await assert.rejects(fresh.mutateHighlights('Book A','paint',{...entry,color:'invalid'}));
  assert.deepEqual(await fresh.listHighlights('Book A'),data);
});
test('reading position survives restart, stays per-book, and rejects invalid updates',async t=>{
  const {store,books,root}=await fixture(t);
  const position={chapter:'01.md',block:2,text:'First sentence. Second sentence.',offset:16,sentence:'Second sentence.',lang:'en'};
  await store.saveReading('Book A',position);
  const fresh=createWordbookStore(books);await fresh.initialize();
  const saved=(await fresh.listReading('Book A')).position;
  assert.deepEqual({...saved,updatedAt:undefined},{...position,updatedAt:undefined});
  assert.ok(saved.updatedAt);assert.equal((await fresh.listReading('Book B')).position,null);
  assert.throws(()=>fresh.saveReading('Book A',{...position,chapter:'../other.md'}));
  assert.throws(()=>fresh.saveReading('Book A',{...position,offset:999}));
  const locked=createWordbookStore(books,{isLocked:()=>true});
  assert.throws(()=>locked.saveReading('Book A',position),/正在同步/);
  assert.deepEqual((await fresh.listReading('Book A')).position,saved);
  const file=path.join(root,'Book A/meta_data/reading.json');
  await writeFile(file,'broken JSON');
  await assert.rejects(fresh.saveReading('Book A',position));
  assert.equal(await readFile(file,'utf8'),'broken JSON');
});
