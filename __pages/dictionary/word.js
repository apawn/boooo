// Accept a single English word (including apostrophes and hyphens), never sentences.
export function normalizeWord(text) {
  const word = String(text ?? '').trim().replaceAll('’', "'").replace(/[‐‑]/g, '-');
  return word.length <= 64 && /^[a-z]+(?:['-][a-z]+)*$/i.test(word) ? word.toLowerCase() : null;
}

export function selectedWord(text, start, end) {
  return selectedTerm(text,start,end,normalizeWord);
}

// Dictionary engines also accept English expressions; favorites remain single words.
export function normalizeQuery(text) {
  const query=String(text ?? '').trim().replace(/\s+/g,' ');
  const words=query.split(' ');
  if(query.length>160 || words.length>12 || words.some(word=>!normalizeWord(word)))return null;
  return words.map(normalizeWord).join(' ');
}

export function selectedQuery(text,start,end) {
  return selectedTerm(text,start,end,normalizeQuery);
}

function selectedTerm(text,start,end,normalize) {
  const raw=text.slice(start,end), word=normalize(raw);
  if(!word) return null;
  start+=raw.length-raw.trimStart().length;
  end-=raw.length-raw.trimEnd().length;
  const letter=character=>/[a-z]/i.test(character || '');
  const joiner=character=>/['’‐‑-]/.test(character || '');
  if(letter(text[start-1]) || joiner(text[start-1]) && letter(text[start-2])) return null;
  if(letter(text[end]) || joiner(text[end]) && letter(text[end+1])) return null;
  return word;
}
