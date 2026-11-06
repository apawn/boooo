import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mandarinPhrases} from './mandarin.mjs';

test('keeps a Chinese sentence together across commas',()=>{
  const text='我们今天讨论这个问题，然后一起寻找答案。';
  assert.deepEqual([...mandarinPhrases(text)],[text]);
});

test('bounds long requests without losing Chinese text or splitting surrogate pairs',()=>{
  for(const text of ['这个问题值得认真研究，'.repeat(25)+'我们继续。','𠮷野家的故事'.repeat(25)+'结束。']) {
    const parts=[...mandarinPhrases(text)];
    assert.equal(parts.join(''),text);
    assert.ok(parts.every(part=>part.length<=95 && part.isWellFormed()));
  }
});

test('keeps only Serena at the selected tempo',async()=>{
  const {defaultMandarin,mandarinVoices}=await import('./voices.mjs');
  assert.deepEqual([...mandarinVoices.keys()],['serena']);
  assert.equal(defaultMandarin,'serena');
  assert.equal(mandarinVoices.get('serena').tempo,1.24);
  assert.equal(mandarinVoices.get('serena').backend,'qwen');
});
