import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdtemp, rename, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = fileURLToPath(new URL('.', import.meta.url));
const name = 'kokoro-int8-multi-lang-v1_1';
const model = path.join(dir, name);
try { await access(path.join(model,'tokens.txt')); await access(path.join(model,'model.int8.onnx')); }
catch {
  const archive = path.join(dir, name+'.tar.bz2');
  const hash = createHash('sha256');
  for await (const part of createReadStream(archive)) hash.update(part);
  if (hash.digest('hex') !== '259c9c8bc906d6078e4e0570421885dabb68b539c2f970fcbb890a58eeaf3e9c') {
    throw new Error('语音模型尚未完整下载。请在仓库运行 git lfs pull，然后重新启动。');
  }
  const temp = await mkdtemp(path.join(dir,'.unpack-'));
  try {
    execFileSync('tar',['-xjf',archive,'-C',temp]);
    await rename(path.join(temp,name),model);
  } finally { await rm(temp,{recursive:true,force:true}); }
}
