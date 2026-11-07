import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const here=fileURLToPath(new URL('.',import.meta.url));
const runtime=path.resolve(process.env.BOOKSHELF_VOICE_HOME || path.join(here,'../../__voice_trials'));
const profile=JSON.parse(readFileSync(path.join(here,'english-profile.json'),'utf8'));
if(process.platform!=='darwin' || process.arch!=='arm64') {
  throw new Error('当前英语朗读后端需要 Apple Silicon Mac。');
}
execFileSync('bash',[path.join(runtime,'试听.command'),'--help'],{stdio:['ignore','ignore','inherit']});
execFileSync(path.join(runtime,'.venv/bin/python'),['-c',
  'import sys; from setup import download, ENGINES; download(sys.argv[1], sys.argv[2], ENGINES / sys.argv[3], allow_patterns=["*.json", "*.safetensors", "*.txt", "*.model", "*.tiktoken"])',
  profile.model,profile.revision,profile.modelDirectory],
  {cwd:runtime,stdio:'inherit',env:{...process.env,HF_HUB_DISABLE_XET:'1'}});
console.log('英语朗读模型已就绪：Qwen 清晰讲解英音女声');
