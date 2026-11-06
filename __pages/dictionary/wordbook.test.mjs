import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFavorites,findWordOffset,locateWord} from './wordbook-model.js';

test('legacy favorites migrate without losing words or inventing locations',()=>{
  assert.deepEqual(normalizeFavorites(['Germany','germany','income','<script>']),[{word:'germany',source:null},{word:'income',source:null}]);
  assert.equal(normalizeFavorites([{word:'word',source:{url:'https://evil.example',text:'word',offset:0}}])[0].source,null);
});
test('saved position distinguishes repeated words and survives paragraph reordering',()=>{
  const text='The country is a country.';
  assert.equal(findWordOffset(text,'country',17),17);
  assert.deepEqual(locateWord(['Another paragraph.',text],'country',{block:0,text,offset:17}),{block:1,offset:17});
});
test('fallback matches complete words and apostrophes, never parts of other words',()=>{
  assert.equal(findWordOffset('income incomes','incomes'),7);
  assert.equal(findWordOffset('incomes','income'),-1);
  assert.equal(findWordOffset('We don’t agree',"don't"),3);
  assert.equal(locateWord(['other text'],'country'),null);
});
