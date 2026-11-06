import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {normalizeWord,selectedWord} from './word.js';
import {lookup, serveDictionary} from './service.mjs';
import {allowedMedia,serveSource} from './sources.mjs';

test('selection rejects partial words but accepts quoted words',()=>{
  assert.equal(selectedWord('differences',1,11),null);
  assert.equal(selectedWord('differences',0,10),null);
  assert.equal(selectedWord("'income'",1,7),'income');
  assert.equal(selectedWord("don't",0,3),null);
  assert.equal(selectedWord('well-being',5,10),null);
  assert.equal(selectedWord('a well-being state',2,12),'well-being');
});

test('recording proxy accepts only known dictionary media routes',()=>{
  assert.equal(allowedMedia('https://dictionary.cambridge.org/media/english-chinese-simplified/us_pron/i/inc/incom/income.mp3'),true);
  assert.equal(allowedMedia('https://cn.bing.com/dict/mediamp3?blob=audio%2Ftom%2Fx.mp3'),true);
  for(const url of ['http://127.0.0.1/','https://evil.example/audio.mp3','https://dict.youdao.com:8443/dictvoice','https://dict.youdao.com@evil.example/dictvoice','https://dict.youdao.com/login','https://cn.bing.com/dict/mediamp3?blob=../../secret']) assert.equal(allowedMedia(url),false);
});

test('source proxy never follows a redirect into a private host',async()=>{
  const original=globalThis.fetch;let calls=0,status;
  globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}});};
  try {
    await serveSource(new URL('http://localhost/dictionary/source?provider=bing&word=redirecttest'),{writeHead(code){status=code;return this;},end(){}});
    assert.equal(status,502);assert.equal(calls,1);
  } finally {globalThis.fetch=original;}
});

test('single words, apostrophes and hyphens; rejects sentences and unsafe input', () => {
  for (const [input, expected] of [[" Don’t ", "don't"], ['Self‑immolation','self-immolation'], ['Prosperity','prosperity']]) assert.equal(normalizeWord(input), expected);
  for (const input of ['two words', '中文', '123', '<script>', "a' OR 1=1", 'a'.repeat(65), '']) assert.equal(normalizeWord(input), null);
});

test('installed corpus supplies bilingual definitions and irregular base forms', {skip:!existsSync(new URL('./data/ecdict.sqlite', import.meta.url))}, () => {
  assert.match(lookup('Prosperity').entry.translation, /繁荣/);
  assert.match(lookup('poverty').entry.definition, /money/);
  assert.ok(lookup('went').roots.some(entry => entry.word === 'go'));
  assert.ok(lookup('institutions').roots.some(entry => entry.word === 'institution'));
  assert.equal(lookup('zzzznotawordzzzz').entry, null);
  assert.equal(lookup('../secret'), null);
});

test('invalid lookup returns a clear 400 without a dictionary query', async () => {
  let status, body;
  const response = {writeHead(code) { status=code; return this; }, end(value) { body=JSON.parse(value); }};
  await serveDictionary(new URL('http://localhost/dictionary?word=two+words'), response);
  assert.equal(status, 400);
  assert.match(body.error, /完整/);
});
