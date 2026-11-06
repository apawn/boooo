import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createGitSync} from './git-sync.mjs';
const exec=promisify(execFile);
const git=async(cwd,...args)=>(await exec('git',args,{cwd,env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}})).stdout.trim();
async function fixture(t) {
  const dir=await mkdtemp(path.join(tmpdir(),'bookshelf-sync-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const remote=path.join(dir,'remote.git'),local=path.join(dir,'local'),other=path.join(dir,'other');
  await git(dir,'init','--bare','--initial-branch=main',remote);
  await git(dir,'clone',remote,local);
  for(const cwd of [local]) {await git(cwd,'config','user.name','test');await git(cwd,'config','user.email','test@example.com');}
  await writeFile(path.join(local,'book.txt'),'original\n');await git(local,'add','.');await git(local,'commit','-m','initial');await git(local,'push','-u','origin','main');
  await git(dir,'clone',remote,other);await git(other,'config','user.name','other');await git(other,'config','user.email','other@example.com');
  return {local,other,remote};
}
async function finish(sync) {
  const end=Date.now()+15000;
  while(sync.running && Date.now()<end)await new Promise(r=>setTimeout(r,20));
  assert.equal(sync.running,false,'sync finishes');return sync.snapshot();
}
test('date commit, fetch/rebase, push, author and duplicate-click protection',async t=>{
  const {local,other,remote}=await fixture(t);
  await writeFile(path.join(other,'remote.txt'),'remote addition');await git(other,'add','.');await git(other,'commit','-m','remote');await git(other,'push');
  await writeFile(path.join(local,'words.json'),'[]\n');
  const sync=createGitSync(local,{now:()=>new Date('2026-11-06T06:07:08Z')});
  assert.equal(sync.start(),true);assert.equal(sync.start(),false);
  const state=await finish(sync);assert.equal(state.phase,'done',state.message);
  assert.equal(await readFile(path.join(local,'remote.txt'),'utf8'),'remote addition');
  assert.equal(await git(local,'log','-1','--format=%s'),'同步书架 2026-11-06 14:07:08');
  assert.equal(await git(local,'log','-1','--format=%an <%ae>'),'apawn <13815338+apawn@users.noreply.github.com>');
  assert.equal(await git(local,'status','--porcelain'),'');
  assert.equal(await git(local,'rev-parse','HEAD'),await git(remote,'rev-parse','main'));
  for(const phase of ['committing','fetching','rebasing','pushing','done'])assert.ok(state.steps.some(s=>s.phase===phase));
  sync.start();assert.equal((await finish(sync)).phase,'done');
});
test('conflict aborts rebase, keeps local commit and does not push',async t=>{
  const {local,other,remote}=await fixture(t);
  await writeFile(path.join(other,'book.txt'),'remote edit\n');await git(other,'add','.');await git(other,'commit','-m','remote');await git(other,'push');
  const remoteHead=await git(remote,'rev-parse','main');
  await writeFile(path.join(local,'book.txt'),'local edit\n');
  const sync=createGitSync(local);sync.start();const state=await finish(sync);
  assert.equal(state.phase,'error');assert.match(state.message,/冲突/);assert.match(state.message,/已撤销/);
  assert.equal(await readFile(path.join(local,'book.txt'),'utf8'),'local edit\n');
  assert.equal(await git(local,'status','--porcelain'),'');assert.equal(await git(remote,'rev-parse','main'),remoteHead);
  assert.equal(await git(local,'symbolic-ref','--short','HEAD'),'main');
});
test('push failure retains local commit and a retry succeeds',async t=>{
  const {local,remote}=await fixture(t);
  const hook=path.join(remote,'hooks','pre-receive');await writeFile(hook,'#!/bin/sh\nexit 1\n',{mode:0o755});
  await writeFile(path.join(local,'words.json'),'[]');
  const sync=createGitSync(local);sync.start();assert.equal((await finish(sync)).phase,'error');
  assert.equal(await git(local,'status','--porcelain'),'');
  await rm(hook);sync.start();assert.equal((await finish(sync)).phase,'done');
});
test('HTTP sync cannot be triggered by GET or cross-origin/foreign hosts',async()=>{
  const sync=createGitSync('/missing');
  const request=async(method,headers)=>{let status,body;const res={writeHead(code){status=code;return this;},end(data){body=JSON.parse(data);}};await sync.serve({method,headers},res);return {status,body};};
  assert.equal((await request('GET',{host:'127.0.0.1:4317'})).body.running,false);
  assert.equal((await request('POST',{host:'127.0.0.1:4317',origin:'https://evil.example','content-type':'application/json'})).status,403);
  assert.equal((await request('POST',{host:'evil.example',origin:'http://evil.example','content-type':'application/json'})).status,403);
  assert.equal(sync.running,false);
});
test('status counts actual files including untracked directories and compares fresh remote commits',async t=>{
  const {local,other}=await fixture(t);
  const sync=createGitSync(local);
  let state=await sync.inspectRepository();
  assert.equal(state.remoteChecked,true);assert.equal(state.ahead,0);assert.equal(state.behind,0);assert.equal(state.changed,0);
  await writeFile(path.join(local,'book.txt'),'changed\n');
  await writeFile(path.join(local,'untracked.json'),'[]');
  await git(local,'mv','book.txt','renamed.txt');
  state=await sync.inspectRepository();
  assert.equal(state.changed,2);assert.equal(state.untracked,1);assert.equal(state.staged,1);assert.equal(state.unstaged,1);
  assert.ok(state.files.some(f=>f.path==='renamed.txt'));
  await writeFile(path.join(other,'remote-new.txt'),'remote\n');await git(other,'add','.');await git(other,'commit','-m','remote change');await git(other,'push');
  state=await sync.inspectRepository();assert.equal(state.behind,1);assert.equal(state.ahead,0);
  await git(local,'add','.');await git(local,'commit','-m','local change');
  state=await sync.inspectRepository();assert.equal(state.ahead,1);assert.equal(state.behind,1);
  assert.equal(await readFile(path.join(local,'renamed.txt'),'utf8'),'changed\n');
});
test('unreachable remote is unknown rather than falsely up to date',async t=>{
  const {local}=await fixture(t);await git(local,'remote','set-url','origin','/does-not-exist-bookshelf-test');
  const state=await createGitSync(local).inspectRepository();
  assert.equal(state.remoteChecked,false);assert.equal(state.behind,null);assert.match(state.remoteError,/无法确认/);
});
