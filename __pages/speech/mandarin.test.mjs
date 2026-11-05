import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mandarinPhrases,mandarinRequest} from './mandarin.mjs';

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

test('leaves punctuation and numeric pronunciation to the native normalizer',()=>{
  const text='2026年11月6日，数值是3.14；他说：“继续！”';
  const request=mandarinRequest(text,48);
  assert.equal(request.text,text+' ”');
  assert.equal(request.generationConfig.sid,48);
  assert.equal(request.generationConfig.silenceScale,1);
  // The ignored closing quote guards the native trailing-punctuation bug.
  assert.doesNotMatch(request.text.trim(),/[,.!?;:]$/);
  assert.ok(request.generationConfig.extra.min_words_in_sentence>95);
});
