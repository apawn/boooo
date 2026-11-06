import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here=fileURLToPath(new URL('.',import.meta.url));
const runtime=path.resolve(process.env.BOOKSHELF_VOICE_HOME || path.join(here,'../../__voice_trials'));
if(process.platform!=='darwin' || process.arch!=='arm64') {
  throw new Error('当前中文朗读后端需要 Apple Silicon Mac。');
}
execFileSync('bash',[path.join(runtime,'试听.command'),'--help'],{stdio:['ignore','ignore','inherit']});
execFileSync(path.join(runtime,'.venv/bin/python'),['-c',
  'from setup import prepare_qwen; prepare_qwen()'],
  {cwd:runtime,stdio:'inherit',env:{...process.env,HF_HUB_DISABLE_XET:'1'}});
console.log('中文朗读模型已就绪：Qwen Serena');
