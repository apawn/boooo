import { fileURLToPath } from 'node:url';
import { englishPhones } from './english.mjs';
const asset = name => fileURLToPath(new URL('./kokoro-int8-multi-lang-v1_1/'+name, import.meta.url));
let engine;
let tail = Promise.resolve();
let pending = 0;

async function getEngine() {
  const { default: sherpa } = await import('sherpa-onnx-node');
  return sherpa.OfflineTts.createAsync({
    model: { numThreads: 3, provider: 'cpu', kokoro: {
      model:asset('model.int8.onnx'), voices:asset('voices.bin'), tokens:asset('tokens.txt'),
      lexicon:[asset('lexicon-us-en.txt'),asset('lexicon-zh.txt')].join(','),
      dictDir:asset('dict')
    }},
    ruleFsts:['date-zh.fst','phone-zh.fst','number-zh.fst'].map(asset).join(',')
  });
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
  if(pending>=6) return fail(429);
  pending++;
  const run=tail.then(async()=>{
    if(res.destroyed) return;
    engine ??= getEngine().catch(err=>{ engine=undefined; throw err; });
    const tts=await engine;
    const generationConfig = data.lang === 'zh'
      ? {sid:6, speed:.91}
      : {sid:1, speed:.76, phonemeCodepoints:await englishPhones(data.text)};
    const audio=await tts.generateAsync({text:data.text,generationConfig});
    if(!res.destroyed) res.writeHead(200,{'Content-Type':'audio/wav','Cache-Control':'no-store'}).end(wav(audio));
  });
  tail=run.catch(()=>{});
  try {await run;} finally {pending--;}
}
