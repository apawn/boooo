import {test} from 'node:test';
import assert from 'node:assert/strict';
import {englishWordStart} from './reading-text.js';

test('starts at the complete word even when its initial is in a separate inline element',()=>{
  const text=['The ','r','evolutionary',' fervor'].join('');
  const clicked=text.indexOf('ution');
  const start=englishWordStart(text,clicked);
  assert.equal(text.slice(start),'revolutionary fervor');
  assert.equal(start,4); // Same paragraph offset is used for the reading underline.
});

test('keeps contractions, possessives and hyphenated words intact',()=>{
  for(const word of ["don't",'Egypt’s','self-immolation','North‑African','café']) {
    const text='Read '+word+' today.';
    for(let offset=6;offset<5+word.length;offset++) assert.equal(englishWordStart(text,offset),5);
  }
});

test('does not move Chinese, whitespace, punctuation or an existing word boundary',()=>{
  const text='中文阅读，English words. 中文';
  for(const offset of [0,1,2,4,5,12,13,18,19,20]) assert.equal(englishWordStart(text,offset),offset);
  assert.equal(englishWordStart(text,text.indexOf('glish')),5);
});
