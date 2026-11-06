import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {lookupRoots,extractLesson,renderRootMarkdown,serveRoots} from './roots.mjs';
const installed=existsSync(new URL('./word_root/英语词根资料库/data/条目清单.json',import.meta.url));

test('lesson boundaries follow anchors rather than display numbering',()=>{
  const text='<a id="w-3"></a>\n### 2. institution\nOnly this word\n<a id="w-17"></a>\n### 3. institutions\nOther word';
  assert.match(extractLesson(text,3),/Only this word/);
  assert.doesNotMatch(extractLesson(text,3),/Other word|institutions/);
  assert.equal(extractLesson(text,99),'');
});
test('root Markdown removes executable content and rewrites relative assets and links',()=>{
  const html=renderRootMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n![diagram](../images/tree.svg)\n\n[family](#w-3)\n\n<a id="w-3"></a>','01_古典词根/example.md');
  assert.doesNotMatch(html,/<script|href="javascript:/);
  assert.match(html,/root-asset\?path=images%2Ftree.svg/);
  assert.match(html,/root-doc\?path=.*#w-3/);
  assert.match(html,/id="w-3"/);
});
test('local lookup returns all indexed families with classical roots first',{skip:!installed},async()=>{
  const data=await lookupRoots('institution');
  assert.equal(data.entries.length,2);
  assert.equal(data.entries[0].id,'C1409');
  assert.ok(data.entries.some(entry=>entry.root==='-ion'));
  assert.equal((await lookupRoots('zzzzmissingword')).entries.length,0);
  await assert.rejects(lookupRoots('../secret'),error=>error.status===400);
});
async function response(route) {
  let status,body,headers;
  await serveRoots(new URL('http://localhost'+route),{writeHead(s,h){status=s;headers=h;return this;},end(b){body=b;}});
  return {status,headers,body};
}
test('lesson endpoint validates family membership and returns only the selected explanation',{skip:!installed},async()=>{
  const result=await response('/dictionary/roots?word=institution&id=C1409');
  assert.equal(result.status,200);
  assert.match(JSON.parse(result.body).html,/怎么拆/);
  assert.doesNotMatch(JSON.parse(result.body).html,/### 3|id="w-17"/);
  assert.equal((await response('/dictionary/roots?word=poverty&id=C1409')).status,404);
});
test('full family page is readable and files cannot escape the library',{skip:!installed},async()=>{
  const result=await response('/dictionary/root-doc?id=C1409');
  assert.equal(result.status,200);assert.match(result.body,/id="w-3"/);
  assert.match(result.headers['Content-Security-Policy'],/default-src 'none'/);
  assert.equal((await response('/dictionary/root-doc?path=../../README.md')).status,404);
  assert.equal((await response('/dictionary/root-asset?path=data/统计.json')).status,404);
});
