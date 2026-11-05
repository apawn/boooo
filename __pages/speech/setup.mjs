import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = fileURLToPath(new URL('.', import.meta.url));
const models = path.join(dir,'models');
const name = 'kokoro-multi-lang-v1_0';
const dest = path.join(models,name);
await mkdir(models,{recursive:true});
try { await access(path.join(dest,'model.onnx')); }
catch {
  const temp = await mkdtemp(path.join(dir,'.unpack-'));
  try {
    const archive = path.join(dir,name+'.tar.bz2');
    const hash = createHash('sha256');
    for await (const part of createReadStream(archive)) hash.update(part);
    if (hash.digest('hex') !== '60703707bc05ccd48d60e1eb723f38b07d6e474795a0b6a588d7220400e0f7a4') {
      throw new Error('模型校验失败，请运行 git lfs pull。');
    }
    execFileSync('tar',['-xjf',archive,'-C',temp]);
    await rename(path.join(temp,name),dest);
  } finally { await rm(temp,{recursive:true,force:true}); }
}
