import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = fileURLToPath(new URL('.', import.meta.url));
const models = path.join(dir,'models');
const releases = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';
const resources = [
  {name:'kokoro-multi-lang-v1_0', archive:true, bundled:true, sha:'60703707bc05ccd48d60e1eb723f38b07d6e474795a0b6a588d7220400e0f7a4'},
  {name:'matcha-icefall-zh-baker', archive:true, tag:'tts-models', sha:'8da2e113b85dfea37b11bcdc994506aa86b584ee3348c2065271fb6f75cb83b8'},
  {name:'vocos-22khz-univ.onnx', tag:'vocoder-models', sha:'0574a135aa1db2de6e181050db2ec528496cacd4a4701fc5d7faf9f9804c0081'}
];
await mkdir(models,{recursive:true});
for (const resource of resources) {
  const dest = path.join(models,resource.name);
  // Only verified resources are renamed into their final location.
  try { await access(dest); continue; } catch {}
  const temp = await mkdtemp(path.join(dir,'.unpack-'));
  try {
    const file = resource.name + (resource.archive ? '.tar.bz2' : '');
    const source = path.join(resource.bundled ? dir : temp,file);
    if (!resource.bundled) {
      console.log('下载朗读模型：'+file);
      execFileSync('curl',['--fail','--location','--silent','--show-error','--retry','2','--max-time','300','-o',source,releases+'/'+resource.tag+'/'+file],{stdio:'inherit'});
    }
    const hash = createHash('sha256');
    for await (const part of createReadStream(source)) hash.update(part);
    if (hash.digest('hex') !== resource.sha) throw new Error(file+' 校验失败。'+(resource.bundled?'请运行 git lfs pull。':'请重新启动以重试下载。'));
    if(resource.archive) execFileSync('tar',['-xjf',source,'-C',temp]);
    await rename(path.join(temp,resource.name),dest);
  } finally { await rm(temp,{recursive:true,force:true}); }
}
