import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { englishPhones } from './english.mjs';
const asset = name => fileURLToPath(new URL('./models/'+name, import.meta.url));
const english = name => asset('kokoro-multi-lang-v1_0/'+name);
const chinese = name => asset('matcha-icefall-zh-baker/'+name);
const engines = new Map();
const cache = new Map();
let cacheBytes = 0;
const cacheLimit = 16 * 1024 * 1024;
let tail = Promise.resolve();
let pending = 0;

async function createEngine(lang) {
  const { default: sherpa } = await import('sherpa-onnx-node');
  const model = {numThreads:Math.min(6,availableParallelism()),provider:'cpu'};
  if (lang === 'en') {
    model.kokoro = {model:english('model.onnx'), voices:english('voices.bin'),
      tokens:english('tokens.txt'), lexicon:english('lexicon-us-en.txt')};
    return sherpa.OfflineTts.createAsync({model});
  }
  model.matcha = {acousticModel:chinese('model-steps-3.onnx'), vocoder:asset('vocos-22khz-univ.onnx'),
    tokens:chinese('tokens.txt'), lexicon:chinese('lexicon.txt'), dictDir:chinese('dict')};
  return sherpa.OfflineTts.createAsync({model,ruleFsts:['phone.fst','date.fst','number.fst'].map(chinese).join(',')});
}

function getEngine(lang) {
  if (!engines.has(lang)) engines.set(lang,createEngine(lang).catch(err=>{engines.delete(lang);throw err;}));
  return engines.get(lang);
}

export function warmSpeech() {
  Promise.all([getEngine('en'),getEngine('zh'),englishPhones('Ready.')]).catch(err=>console.error('朗读预加载失败',err.message));
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

function wav({samples,sampleRate}) {
  if (!samples.length) throw new Error('Empty speech output');
  const audio = Buffer.alloc(44 + 2*samples.length);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length-8,4); audio.write('WAVEfmt ',8);
  audio.writeUInt32LE(16,16); audio.writeUInt16LE(1,20); audio.writeUInt16LE(1,22);
  audio.writeUInt32LE(sampleRate,24); audio.writeUInt32LE(sampleRate*2,28);
  audio.writeUInt16LE(2,32); audio.writeUInt16LE(16,34); audio.write('data',36);
  audio.writeUInt32LE(audio.length-44,40);
  for(let i=0;i<samples.length;i++) audio.writeInt16LE(Math.round(Math.max(-1, Math.min(1,samples[i]))*32767),44+2*i);
  return audio;
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
  const key=data.lang+' '+data.text;
  const send=buffer=>res.writeHead(200,{'Content-Type':'audio/wav','Cache-Control':'no-store'}).end(buffer);
  if(cache.has(key)) return send(cache.get(key));
  if(pending>=6) return fail(429);
  pending++;
  const run=tail.then(async()=>{
    if(res.destroyed) return;
    if(cache.has(key)) return send(cache.get(key));
    const tts=await getEngine(data.lang);
    const generationConfig = data.lang === 'zh'
      ? {sid:0, speed:.91}
      : {sid:3, speed:.76, phonemeCodepoints:await englishPhones(data.text)};
    const audio=await tts.generateAsync({text:data.text,generationConfig});
    const buffer=wav(audio);
    remember(key,buffer);
    if(!res.destroyed) send(buffer);
  });
  tail=run.catch(()=>{});
  try {await run;} finally {pending--;}
}
