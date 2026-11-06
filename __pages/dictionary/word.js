// Accept a single English word (including apostrophes and hyphens), never sentences.
export function normalizeWord(text) {
  const word = String(text ?? '').trim().replaceAll('’', "'").replace(/[‐‑]/g, '-');
  return word.length <= 64 && /^[a-z]+(?:['-][a-z]+)*$/i.test(word) ? word.toLowerCase() : null;
}

export function selectedWord(text, start, end) {
  const raw=text.slice(start,end), word=normalizeWord(raw);
  if(!word) return null;
  start+=raw.length-raw.trimStart().length;
  end-=raw.length-raw.trimEnd().length;
  const letter=character=>/[a-z]/i.test(character || '');
  const joiner=character=>/['’‐‑-]/.test(character || '');
  if(letter(text[start-1]) || joiner(text[start-1]) && letter(text[start-2])) return null;
  if(letter(text[end]) || joiner(text[end]) && letter(text[end+1])) return null;
  return word;
}
