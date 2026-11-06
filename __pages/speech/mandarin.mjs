const limit = 95;
const words = new Intl.Segmenter('zh', {granularity:'word'});

export function* mandarinPhrases(text) {
  let rest = text.trim();
  while (rest) {
    let end = rest.length;
    if (end > limit) {
      const prefix = rest.slice(0,limit);
      const punctuation = [...prefix.matchAll(/[，。！？；：、,!?;:]/gu)].at(-1);
      const boundary = [...words.segment(rest)].findLast(part=>part.index>0 && part.index<=limit);
      end = punctuation ? punctuation.index+1 : boundary?.index || limit;
    }
    const phrase = rest.slice(0,end).trim();
    rest = rest.slice(end).trim();
    if (/[\p{L}\p{N}]/u.test(phrase)) yield phrase;
  }
}
