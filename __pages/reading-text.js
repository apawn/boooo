// Keep a continuous reading session in the first readable block's language.
// Classify the whole paragraph so English names inside Chinese stay in context.
export function* sameLanguageBlocks(blocks) {
  let language;
  for (const block of blocks) {
    const text=block.textContent || '';
    if (!/[\p{L}\p{N}]/u.test(text)) continue;
    const lang=/\p{Script=Han}/u.test(text)?'zh':'en';
    language ??= lang;
    if (lang===language) yield {block,lang};
  }
}

// Work on the whole paragraph so inline emphasis cannot split an English word.
export function englishWordStart(text, offset) {
  const words = /[\p{Script=Latin}\p{N}][\p{Script=Latin}\p{M}\p{N}]*(?:['’\-‐‑][\p{Script=Latin}\p{N}][\p{Script=Latin}\p{M}\p{N}]*)*/gu;
  for (const word of text.matchAll(words)) {
    if (word.index >= offset) break;
    if (offset < word.index + word[0].length) return word.index;
  }
  return offset;
}
