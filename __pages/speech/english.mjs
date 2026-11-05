// Kokoro's English token alphabet uses single symbols for several IPA sounds.
const symbols = {
  'aɪ':'I', 'aʊ':'W', 'eɪ':'A', 'oʊ':'O', 'ɔɪ':'Y', 'tʃ':'ʧ', 'dʒ':'ʤ',
  'ɚ':'əɹ', 'ɝ':'ɜɹ', 'g':'ɡ', 'r':'ɹ', 'ʲ':'j'
};
const sounds = new RegExp(Object.keys(symbols).join('|'), 'gu');

export async function englishPhones(text) {
  const { phonemize } = await import('phonemizer');
  // Keep decimal points and numeric separators with the number. Restore phrase
  // punctuation separately because the phonemizer only returns speech sounds.
  const phraseBreak = /(\s*(?:[!?;—…“”"()]|(?<!\d)[,.:]|[,.:](?!\d))+\s*)/u;
  const parts = text.replace(/[’‘]/g,"'").split(phraseBreak);
  const phones = [];
  for (const [i,part] of parts.entries()) {
    if (!part) continue;
    if (i%2) phones.push(part);
    else phones.push((await phonemize(part,'en-us')).join(' ').replace(sounds,s=>symbols[s]));
  }
  return [Array.from(phones.join('').trim(),ch=>ch.codePointAt(0))];
}
