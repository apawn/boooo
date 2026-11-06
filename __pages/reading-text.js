// Work on the whole paragraph so inline emphasis cannot split an English word.
export function englishWordStart(text, offset) {
  const words = /[\p{Script=Latin}\p{N}][\p{Script=Latin}\p{M}\p{N}]*(?:['’\-‐‑][\p{Script=Latin}\p{N}][\p{Script=Latin}\p{M}\p{N}]*)*/gu;
  for (const word of text.matchAll(words)) {
    if (word.index >= offset) break;
    if (offset < word.index + word[0].length) return word.index;
  }
  return offset;
}
