import { readFileSync } from 'node:fs';
import { defaultMandarin, mandarinVoices } from './voices.mjs';
import { synthesizeMandarin, warmMandarin, closeMandarin, synthesizeEnglish, warmEnglish } from './chinese.mjs';
export const closeSpeech = closeMandarin;
const englishProfile=JSON.parse(readFileSync(new URL('./english-profile.json',import.meta.url),'utf8'));

const cache = new Map();
let cacheBytes = 0;
const cacheLimit = 16 * 1024 * 1024;
let tail = Promise.resolve();
let pending = 0;

export function warmSpeech() {
  Promise.all([warmEnglish(),warmMandarin()]).catch(err=>console.error('朗读预加载失败',err.message));
}

function remember(key,buffer) {
  if(buffer.length>cacheLimit) return;
  while(cacheBytes+buffer.length>cacheLimit) {
    const oldest=cache.keys().next().value;
    cacheBytes-=cache.get(oldest).length;
    cache.delete(oldest);
  }
  cache.set(key,buffer);
  cacheBytes+=buffer.length;
}

export async function serveSpeech(req,res) {
  const fail = status => res.writeHead(status).end();
  if(req.method!=='POST') return fail(405);
  if(req.headers.origin && req.headers.origin!=='http://'+req.headers.host) return fail(403);
  if(req.headers['content-type']?.split(';')[0]!=='application/json') return fail(415);
  let size=0;const parts=[];
  for await(const chunk of req) {
    size+=chunk.length;
    if(size>4096) return fail(413);
    parts.push(chunk);
  }
  let data;
  try { data=JSON.parse(Buffer.concat(parts).toString()); } catch { return fail(400); }
  if(typeof data?.text!=='string'||!data.text.trim()||data.text.length>450||!['zh','en'].includes(data.lang)) return fail(400);
  const voice=data.lang==='zh' ? (data.voice ?? defaultMandarin) : englishProfile.id;
  if(data.lang==='zh' && !mandarinVoices.has(voice)) return fail(400);
  const key=JSON.stringify([data.lang,voice,data.text]);
  const send=buffer=>res.writeHead(200,{'Content-Type':'audio/wav','Cache-Control':'no-store'}).end(buffer);
  if(cache.has(key)) return send(cache.get(key));
  if(pending>=6) return fail(429);
  pending++;
  const run=tail.then(async()=>{
    if(res.destroyed) return;
    if(cache.has(key)) return send(cache.get(key));
    let buffer;
    if(data.lang==='zh') {
      buffer=await synthesizeMandarin(data.text,voice);
    } else {
      buffer=await synthesizeEnglish(data.text);
    }
    remember(key,buffer);
    if(!res.destroyed) send(buffer);
  });
  tail=run.catch(()=>{});
  try {await run;} finally {pending--;}
}
