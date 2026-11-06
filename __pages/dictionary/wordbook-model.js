import {normalizeWord,selectedWord} from './word.js';

// Old favorites were strings without a reading location; retain them as entries.
export function normalizeFavorites(items) {
  if(!Array.isArray(items)) return [];
  const seen=new Set();
  return items.flatMap(item=>{
    const word=normalizeWord(typeof item==='string'?item:item?.word);
    if(!word || seen.has(word)) return [];
    seen.add(word);
    const source=typeof item==='object' && item?.source;
    const safeSource=source && typeof source.url==='string' && /^\/\?/.test(source.url) &&
      typeof source.text==='string' && Number.isInteger(source.offset) && source.offset>=0;
    return [{word,source:safeSource?source:null}];
  });
}

export function findWordOffset(text,word,preferred=-1) {
  if(preferred>=0 && selectedWord(text,preferred,preferred+word.length)===word) return preferred;
  for(const match of text.matchAll(/[a-z]+(?:['’‐‑-][a-z]+)*/gi)) {
    if(normalizeWord(match[0])===word) return match.index;
  }
  return -1;
}

export function locateWord(texts,word,source) {
  // Match the saved paragraph before using its index: content may have been edited.
  if(source) {
    const exact=texts[source.block]===source.text?source.block:texts.indexOf(source.text);
    if(exact>=0) {
      const offset=findWordOffset(texts[exact],word,source.offset);
      if(offset>=0) return {block:exact,offset};
    }
  }
  for(let block=0;block<texts.length;block++) {
    const offset=findWordOffset(texts[block],word);
    if(offset>=0) return {block,offset};
  }
  return null;
}
