import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {normalizeQuery} from './word.js';

let db;
export function lookup(text) {
  const word = normalizeQuery(text);
  if (!word) return null;
  db ??= new DatabaseSync(fileURLToPath(new URL('./data/ecdict.sqlite', import.meta.url)), {readOnly: true});
  const find = term => {
    const row = db.prepare('SELECT data FROM entries WHERE word = ?').get(term);
    return row ? JSON.parse(row.data) : null;
  };
  let entry = find(word);
  const forms = db.prepare('SELECT word FROM forms WHERE form = ? LIMIT 6').all(word);
  if (!entry && word.endsWith("'s")) entry = find(word.slice(0, -2));
  if (!entry && forms.length) entry = find(forms[0].word);
  const base = entry?.exchange.match(/(?:^|\/)0:([^/]+)/)?.[1];
  const roots = [...new Set([base, ...forms.map(f => f.word)])]
    .filter(w => w && w.toLowerCase() !== entry?.word.toLowerCase());
  return {query: word, entry, roots: roots.map(find).filter(Boolean), source: 'ECDICT'};
}

export async function serveDictionary(url, res) {
  const word = normalizeQuery(url.searchParams.get('word'));
  const send = (status, data) => res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(data));
  if (!word) return send(400, {error:'请选择完整的英文单词或短语'});
  try {
    return send(200, lookup(word));
  } catch {
    return send(503, {error: '本地词库尚未就绪，请运行 npm run setup:dictionary。'});
  }
}
