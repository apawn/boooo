import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access,mkdir,rmdir} from 'node:fs/promises';
import path from 'node:path';
const exec=promisify(execFile);
const author={name:'apawn',email:'13815338+apawn@users.noreply.github.com'};
const redact=text=>String(text).replace(/https?:\/\/[^\s]+/g,'[远端地址]').slice(-2200);
export function createGitSync(root,{beforeSync=async()=>{},now=()=>new Date()}={}) {
  let state={running:false,phase:'idle',message:'尚未同步',steps:[]};
  const snapshot=()=>structuredClone(state);
  function step(phase,message) {state.phase=phase;state.message=message;state.steps.push({phase,message,time:now().toISOString()});}
  async function git(args,options={}) {
    try {const {stdout}=await exec('git',args,{cwd:root,timeout:120000,maxBuffer:2*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_EDITOR:'true',GIT_SEQUENCE_EDITOR:'true'},...options});return stdout.trim();}
    catch(error) {throw new Error(error.killed?'Git 操作超时，请检查网络后重试':redact(error.stderr || error.message));}
  }
  async function exists(p) {try{await access(p);return true;}catch{return false;}}
  async function run() {
    let lock,locked=false,rebaseStarted=false;
    try {
      step('checking','正在检查仓库…');
      await beforeSync();
      const gitDir=await git(['rev-parse','--absolute-git-dir']);
      lock=path.join(gitDir,'bookshelf-sync.lock');
      try {await mkdir(lock);locked=true;}catch {throw new Error('另一个同步任务正在运行；请等待它结束。');}
      for(const name of ['rebase-merge','rebase-apply','MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','index.lock']) {
        if(await exists(path.join(gitDir,name)))throw new Error('仓库有未完成的 Git 操作（'+name+'），请处理后再同步。');
      }
      const branch=await git(['symbolic-ref','--quiet','--short','HEAD']);
      const remote=await git(['config','--get','branch.'+branch+'.remote']);
      const ref=await git(['config','--get','branch.'+branch+'.merge']);
      if(remote!== 'origin' || !ref.startsWith('refs/heads/'))throw new Error('当前分支需要配置 origin 上游分支后才能同步。');
      const status=await git(['status','--porcelain=v1','--ignore-submodules=none']);
      // Git add does not save uncommitted files inside submodules.
      const submodules=await git(['submodule','foreach','--quiet','git status --porcelain']);
      if(submodules)throw new Error('子模块有未提交修改，请先在子模块中提交后再同步。');
      if(status) {
        step('committing','正在提交本地修改…');
        await git(['add','--all']);
        const staged=await git(['diff','--cached','--name-only']);
        if(staged) {
          const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(now());
          const message='同步书架 '+date;
          await git(['-c','user.name='+author.name,'-c','user.email='+author.email,'commit','-m',message],{env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_EDITOR:'true',GIT_AUTHOR_NAME:author.name,GIT_AUTHOR_EMAIL:author.email,GIT_COMMITTER_NAME:author.name,GIT_COMMITTER_EMAIL:author.email}});
          state.commit=await git(['rev-parse','--short','HEAD']);step('committed',message+' · '+state.commit);
        }
      } else step('committed','没有新的本地修改，继续检查远端');
      const remoteURL=await git(['remote','get-url',remote]);
      const auth=/^https:\/\/github\.com\//.test(remoteURL)?['-c','credential.helper=','-c','credential.helper=!gh auth git-credential']:[];
      step('fetching','正在拉取远端更新…');
      await git([...auth,'fetch','--no-tags',remote,ref]);
      step('rebasing','正在 rebase，合并远端更新…');
      rebaseStarted=true;
      try {await git(['-c','user.name='+author.name,'-c','user.email='+author.email,'rebase','FETCH_HEAD']);rebaseStarted=false;}
      catch(error) {
        const conflicts=await git(['diff','--name-only','--diff-filter=U']);
        if(await exists(path.join(gitDir,'rebase-merge')) || await exists(path.join(gitDir,'rebase-apply'))) {
          await git(['rebase','--abort']);rebaseStarted=false;
          throw new Error((conflicts?'发生合并冲突：\n'+conflicts:error.message)+'\n已撤销本次 rebase，本地提交已保留；请处理后重试。');
        }
        throw error;
      }
      step('pushing','正在推送到远端…');
      await git([...auth,'push',remote,'HEAD:'+ref]);
      state.commit=await git(['rev-parse','--short','HEAD']);
      step('done','同步完成 · '+state.commit);
    } catch(error) {step('error',redact(error.message)+(rebaseStarted?'\n请检查 Git 状态后重试。':''));}
    finally {if(locked)await rmdir(lock).catch(()=>{});state.running=false;state.finishedAt=now().toISOString();}
  }
  function start() {
    if(state.running)return false;
    state={running:true,phase:'checking',message:'准备同步…',startedAt:now().toISOString(),steps:[]};
    void run();return true;
  }
  async function serve(req,res) {
    const send=(code,data)=>res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(data));
    // Local-only UI action: reject cross-site requests and DNS-rebinding hosts.
    const host=req.headers.host || '';
    if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))return send(403,{error:'仅允许本机书架同步'});
    if(req.method==='GET')return send(200,snapshot());
    if(req.method!=='POST')return send(405,{error:'不支持此操作'});
    if(req.headers.origin!=='http://'+host || req.headers['sec-fetch-site']==='cross-site' || !req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'仅允许书架页面发起同步'});
    if(!start())return send(409,{error:'同步正在进行中',...snapshot()});
    return send(202,snapshot());
  }
  return {start,snapshot,serve,get running(){return state.running;}};
}
