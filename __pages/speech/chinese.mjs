import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mandarinVoices } from './voices.mjs';
import { mandarinPhrases } from './mandarin.mjs';

const here=fileURLToPath(new URL('.',import.meta.url));
const runtime=path.resolve(process.env.BOOKSHELF_VOICE_HOME || path.join(here,'../../__voice_trials'));
const workers=new Map();
let sequence=0;
let closing=false;

function getWorker(backend) {
  if(closing) throw new Error('朗读服务正在关闭');
  if(workers.has(backend)) return workers.get(backend);
  if(!['qwen','qwen-en'].includes(backend)) throw new Error('Unknown speech backend');
  const python=path.join(runtime,'.venv/bin/python');
  const script=backend==='qwen-en'?'english_worker.py':'chinese_worker.py';
  const child=spawn(python,['-u',path.join(here,script),backend],{
    cwd:here,stdio:['pipe','pipe','pipe'],
    env:{...process.env,BOOKSHELF_VOICE_HOME:runtime,HF_HUB_OFFLINE:'1'},
  });
  const pending=new Map();
  let settleReady, rejectReady, failed=false;
  const ready=new Promise((resolve,reject)=>{settleReady=resolve;rejectReady=reject;});
  const timer=setTimeout(()=>fail(new Error(`${backend} 模型加载超时`)),120000);
  const worker={ready,child,pending};
  workers.set(backend,worker);
  function fail(error) {
    if(failed) return;
    failed=true;clearTimeout(timer);rejectReady(error);
    for(const job of pending.values()) {clearTimeout(job.timer);job.reject(error);}
    pending.clear();
    if(workers.get(backend)===worker) workers.delete(backend);
    child.kill();
  }
  ready.catch(()=>{});
  child.on('error',error=>fail(new Error(`朗读启动失败，请运行 npm run setup:${backend==='qwen-en'?'english':'chinese'}：${error.message}`)));
  child.on('exit',(code,signal)=>fail(new Error(`${backend} 朗读进程退出 (${code ?? signal})`)));
  const logs=createInterface({input:child.stderr});
  logs.on('line',line=>{if(line.trim()) console.error(`[speech:${backend}] ${line.slice(0,2000)}`);});
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{
    let message;
    try {if(line.length>16*1024*1024) throw new Error('Speech output too large');message=JSON.parse(line);}
    catch(error) {fail(error);return;}
    if(message.ready) {clearTimeout(timer);settleReady();return;}
    const job=pending.get(message.id);
    if(!job) return;
    pending.delete(message.id);clearTimeout(job.timer);
    if(message.error) job.reject(new Error(message.error));
    else {
      const audio=Buffer.from(message.audio || '','base64');
      if(audio.length<44 || audio.toString('ascii',0,4)!=='RIFF') job.reject(new Error('Invalid speech WAV'));
      else job.resolve(audio);
    }
  });
  worker.request=async body=>{
    await ready;
    if(failed) throw new Error('Speech worker unavailable');
    const id=++sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>fail(new Error(`${backend} 朗读生成超时`)),180000);
      pending.set(id,{resolve,reject,timer});
      child.stdin.write(JSON.stringify({id,...body})+'\n',error=>{if(error) fail(error);});
    });
  };
  return worker;
}

export function warmMandarin() {
  return getWorker('qwen').ready;
}

export function warmEnglish() {
  return getWorker('qwen-en').ready;
}

export function synthesizeEnglish(text) {
  return getWorker('qwen-en').request({text});
}

export function synthesizeMandarin(text,voice) {
  const profile=mandarinVoices.get(voice);
  if(!profile) return Promise.reject(new Error('Unknown Mandarin voice'));
  return getWorker(profile.backend).request({voice,phrases:[...mandarinPhrases(text)]});
}

export function closeMandarin() {
  closing=true;
  for(const worker of workers.values()) worker.child.kill();
}
process.once('exit',closeMandarin);
