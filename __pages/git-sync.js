const button=document.querySelector('#sync-button');
const status=document.querySelector('#sync-status');
const statusButton=document.querySelector('#sync-status-button');
const details=document.querySelector('#sync-details');
const repo=document.createElement('section'),logs=document.createElement('section');
details.append(repo,logs);
let timer,starting=false,wasRunning=false,checking=false;
function showDetails(open) {details.hidden=!open;statusButton.setAttribute('aria-expanded',String(open));}
function line(text,strong=false) {const el=document.createElement(strong?'strong':'div');el.textContent=text;return el;}
async function refreshStatus() {
  if(checking)return;
  checking=true;statusButton.classList.add('is-syncing');statusButton.setAttribute('aria-busy','true');
  repo.replaceChildren(line('正在检查本地文件和远端最新提交…'));
  try {
    const response=await fetch('/git-status',{cache:'no-store'}),data=await response.json();
    if(!response.ok)throw new Error(data.error || 'Git 状态读取失败');
    let comparison='';
    if(!data.remoteChecked)comparison=data.remoteError;
    else if(!data.ahead && !data.behind)comparison='本地 commit 与远端一致，已是最新';
    else if(!data.behind)comparison='已包含远端最新提交；本地还有 '+data.ahead+' 个 commit 未推送';
    else if(!data.ahead)comparison='本地落后远端 '+data.behind+' 个 commit，需要同步';
    else comparison='本地领先 '+data.ahead+' 个、落后 '+data.behind+' 个 commit，需要 rebase';
    repo.replaceChildren(line('Git Status',true),line(data.branch+' · '+data.commit),line(data.subject),
      line(data.changed?'有 '+data.changed+' 个文件未提交':'工作区干净，没有未提交文件',true),
      line('已暂存 '+data.staged+' · 未暂存 '+data.unstaged+' · 未跟踪 '+data.untracked),line(comparison),
      ...(data.remoteCommit?[line('远端 '+data.upstream+' · '+data.remoteCommit)]:[]),
      line('检查时间 '+new Date(data.checkedAt).toLocaleTimeString('zh-CN',{hour12:false})));
    if(data.files.length) {
      const list=document.createElement('details'),summary=document.createElement('summary');summary.textContent='查看文件（'+data.changed+'）';list.append(summary,...data.files.map(file=>line(file.code+'  '+file.path)));repo.append(list);
    }
  }catch(error){repo.replaceChildren(line(error.message));}
  finally{checking=false;statusButton.classList.remove('is-syncing');statusButton.removeAttribute('aria-busy');}
}
statusButton.addEventListener('click',()=>{showDetails(true);void refreshStatus();});
document.addEventListener('click',event=>{if(!event.target.closest('.sync-footer'))showDetails(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape' && !details.hidden){showDetails(false);statusButton.focus();}});
function render(state) {
  button.disabled=state.running || starting;
  button.classList.toggle('is-syncing',state.running);
  button.setAttribute('aria-label',state.running?'Sync 同步中':'Sync 同步');
  status.textContent=state.message;status.dataset.phase=state.phase;
  logs.replaceChildren(...(state.steps?.length?[line('同步记录',true),...state.steps.map(step=>line(new Date(step.time).toLocaleTimeString('zh-CN',{hour12:false})+' '+step.message))]:[]));
  if(wasRunning && !state.running){window.dispatchEvent(new Event('bookshelf-synced'));if(!details.hidden)void refreshStatus();}
  wasRunning=state.running;
}
async function poll() {
  clearTimeout(timer);
  try {const response=await fetch('/git-sync',{cache:'no-store'});if(!response.ok)throw new Error('无法读取同步状态');render(await response.json());}
  catch(error){status.textContent='无法连接服务，恢复连接后会继续显示同步状态';}
  timer=setTimeout(poll,wasRunning?600:4000);
}
button.addEventListener('click',async()=>{
  if(starting || wasRunning)return;
  if(checking){status.textContent='正在检查 Git 状态，请稍后再同步';return;}
  starting=true;button.disabled=true;status.textContent='准备同步…';
  try {
    const response=await fetch('/git-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const state=await response.json();
    if(!response.ok)throw new Error(state.error || '无法开始同步');
    render(state);
  }catch(error){status.textContent=error.message;status.dataset.phase='error';}
  finally{starting=false;button.disabled=wasRunning;clearTimeout(timer);timer=setTimeout(poll,wasRunning?600:4000);}
});
void poll();
