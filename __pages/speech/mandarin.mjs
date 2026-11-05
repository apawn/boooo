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

export function mandarinRequest(text, sid) {
  return {
    // sherpa-onnx 2.0.1 appends a second terminal punctuation token AFTER PAD
    // on its lexicon path. A closing quote is ignored by that tokenizer and
    // prevents the broken append. Separate it from the final word so mixed
    // English/Chinese text still gets its normal lexicon lookup.
    text: text+' ”',
    generationConfig: {
      sid, speed:.94, silenceScale:1,
      // Phrases are already bounded above. Keep commas inside one inference
      // instead of restarting the voice at every punctuation mark.
      extra: {min_words_in_sentence:200, max_words_in_sentence:200},
    },
  };
}
