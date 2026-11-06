import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access,mkdir,rmdir} from 'node:fs/promises';
import path from 'node:path';
const exec=promisify(execFile);
const author={name:'apawn',email:'13815338+apawn@users.noreply.github.com'};
const redact=text=>String(text).replace(/https?:\/\/[^\s]+/g,'[远端地址]').slice(-2200);
export function createGitSync(root,{beforeSync=async()=>{},now=()=>new Date()}={}) {
  let inspecting=null;
  let state={running:false,phase:'idle',message:'尚未同步',steps:[]};
  const snapshot=()=>structuredClone(state);
  function step(phase,message) {state.phase=phase;state.message=message;state.steps.push({phase,message,time:now().toISOString()});}
  async function git(args,options={}) {
    try {const {stdout}=await exec('git',args,{cwd:root,timeout:120000,maxBuffer:2*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_EDITOR:'true',GIT_SEQUENCE_EDITOR:'true'},...options});return stdout.trimEnd();}
    catch(error) {throw new Error(error.killed?'Git 操作超时，请检查网络后重试':redact(error.stderr || error.message));}
  }
  async function inspectRepository() {
    if(state.running)throw new Error('正在同步，请完成后刷新 Git 状态');
    if(inspecting)return inspecting;
    inspecting=(async()=>{
      const branch=await git(['symbolic-ref','--quiet','--short','HEAD']).catch(()=>'HEAD（游离）');
      const commit=await git(['rev-parse','--short','HEAD']);
      const subject=await git(['log','-1','--format=%s']);
      const raw=await git(['status','--porcelain=v1','-z','--untracked-files=all','--ignore-submodules=none']);
      const records=raw.split('\0'),files=[];
      for(let i=0;i<records.length;i++) {
        const entry=records[i];if(!entry)continue;
        const code=entry.slice(0,2),name=entry.slice(3);
        files.push({code,path:name});
        if(/[RC]/.test(code))i++;
      }
      const result={branch,commit,subject,files,changed:files.length,
        staged:files.filter(f=>f.code[0]!==' ' && f.code[0]!=='?').length,
        unstaged:files.filter(f=>f.code[1]!==' ' && f.code[1]!=='?').length,
        untracked:files.filter(f=>f.code==='??').length,
        ahead:null,behind:null,remoteChecked:false};
      try {
        const remote=await git(['config','--get','branch.'+branch+'.remote']);
        const ref=await git(['config','--get','branch.'+branch+'.merge']);
        if(remote!=='origin' || !ref.startsWith('refs/heads/'))throw new Error('当前分支未配置 origin 上游');
        const remoteURL=await git(['remote','get-url',remote]);
        const auth=/^https:\/\/github\.com\//.test(remoteURL)?['-c','credential.helper=','-c','credential.helper=!gh auth git-credential']:[];
        const tracking='refs/remotes/origin/'+ref.slice('refs/heads/'.length);
        await git([...auth,'fetch','--no-tags','--no-write-fetch-head',remote,'+'+ref+':'+tracking],{timeout:20000});
        const [ahead,behind]=(await git(['rev-list','--left-right','--count','HEAD...'+tracking])).split(/\s+/).map(Number);
        Object.assign(result,{ahead,behind,remoteChecked:true,upstream:'origin/'+ref.slice('refs/heads/'.length),remoteCommit:await git(['rev-parse','--short',tracking])});
      }catch(error){result.remoteError='无法确认远端最新状态：'+error.message;}
      result.checkedAt=now().toISOString();return result;
    })();
    try{return await inspecting;}finally{inspecting=null;}
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
    if(state.running || inspecting)return false;
    state={running:true,phase:'checking',message:'准备同步…',startedAt:now().toISOString(),steps:[]};
    void run();return true;
  }
  async function serve(req,res) {
    const send=(code,data)=>res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(data));
    // Local-only UI action: reject cross-site requests and DNS-rebinding hosts.
    const host=req.headers.host || '';
    if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))return send(403,{error:'仅允许本机书架同步'});
    if(req.url==='/git-status') {
      if(req.method!=='GET')return send(405,{error:'不支持此操作'});
      try{return send(200,await inspectRepository());}catch(error){return send(409,{error:error.message});}
    }
    if(req.method==='GET')return send(200,snapshot());
    if(req.method!=='POST')return send(405,{error:'不支持此操作'});
    if(req.headers.origin!=='http://'+host || req.headers['sec-fetch-site']==='cross-site' || !req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'仅允许书架页面发起同步'});
    if(!start())return send(409,{...snapshot(),error:inspecting?'正在检查 Git 状态，请稍后再同步':'同步正在进行中'});
    return send(202,snapshot());
  }
  return {start,snapshot,serve,inspectRepository,get running(){return state.running;}};
}
